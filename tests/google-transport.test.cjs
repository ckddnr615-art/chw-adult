const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function transport(url='https://script.google.com/macros/s/test/exec',options={}){
 const listeners=new Map(),storage=new Map(options.storage||[]),sent=[];let frameUrl='',frames=0;
 const window={GOOGLE_SHARED_CONFIG:{webAppUrl:url,connectionTimeoutMs:100,requestTimeoutMs:100},fetch:async()=>new Response('static'),addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},removeEventListener:(type,fn)=>listeners.set(type,(listeners.get(type)||[]).filter(f=>f!==fn))};
 const fire=event=>(listeners.get('message')||[]).forEach(fn=>fn(event));
 const peer={postMessage(message,targetOrigin){sent.push({message,targetOrigin});queueMicrotask(()=>fire({source:peer,origin:'https://script.googleusercontent.com',data:{type:'ch-google-response',channel:message.channel,id:message.id,response:{status:200,body:message.request.path==='/api/integration-login'?{ok:true,token:'test-session-token-32-characters-long'}:{ok:true,authenticated:!!message.request.token}}}}))}};
 const document={createElement:()=>({}),body:{append(frame){frames++;frameUrl=frame.src;if(options.firstHandshakeFails&&frames===1)return;const channel=new URL(frame.src).searchParams.get('channel');queueMicrotask(()=>fire({source:peer,origin:'https://script.googleusercontent.com',data:{type:'ch-google-ready',channel,bootstrap:options.bootstrap}}))}},addEventListener(){}};
 const context=vm.createContext({window,document,URL,URLSearchParams,location:{href:'https://test.pages.dev/',origin:'https://test.pages.dev'},crypto,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Response,Uint8Array,atob,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(require.resolve('../site/google-transport.js'),'utf8'),context);return {window,sent,storage,getFrameUrl:()=>frameUrl};
}
test('정적 Google 전송은 비밀번호·세션을 URL에 넣지 않고 응답 후 세션을 전달한다',async()=>{const e=transport(),login=await e.window.fetch('/api/integration-login',{method:'POST',body:JSON.stringify({password:'private-test-password'})});assert.equal(login.status,200);assert.deepEqual(await login.json(),{ok:true});assert.equal(e.getFrameUrl().includes('private-test-password'),false);assert.equal(e.getFrameUrl().includes('test-session-token'),false);const status=await e.window.fetch('/api/team/status');assert.equal((await status.json()).authenticated,true);assert.equal(e.sent[1].message.request.token,'test-session-token-32-characters-long');assert.equal(e.sent[0].targetOrigin,'https://script.googleusercontent.com')});
test('Google 웹앱 주소 미설정은 로컬 성공으로 가장하지 않고 연결 오류를 반환한다',async()=>{const e=transport(''),response=await e.window.fetch('/api/team/status');assert.equal(response.status,503);assert.match((await response.json()).error,/주소/);assert.equal(e.sent.length,0)});
test('정적 파일 요청은 Google로 보내지 않는다',async()=>{const e=transport(),response=await e.window.fetch('/styles.css');assert.equal(await response.text(),'static');assert.equal(e.sent.length,0)});

test('로그인 후 4시간 제한 시각을 기록하고 후속 요청이 시간을 임의로 연장하지 않는다',async()=>{
 const e=transport(),before=Date.now();await e.window.fetch('/api/integration-login',{method:'POST',body:'{}'});
 const first=e.window.googleSessionInfo();assert.equal(first.authenticated,true);assert.ok(first.expiresAt>=before+14400000&&first.expiresAt<=Date.now()+14400000);
 assert.ok([...e.storage.keys()].some(key=>key.endsWith(':expires')));
 await e.window.fetch('/api/team/status');assert.equal(e.window.googleSessionInfo().expiresAt,first.expiresAt);
});

test('최초 연결 시간 초과 후 페이지 새로고침 없이 Google 연결을 다시 시도한다',async()=>{
 const e=transport(undefined,{firstHandshakeFails:true});const first=await e.window.fetch('/api/team/status');assert.equal(first.status,503);const retry=await e.window.fetch('/api/team/status');assert.equal(retry.status,200);assert.equal(e.sent.length,1);
});

test('공개 초기 자료를 연결 응답에서 한 번만 받아 별도 RPC를 생략한다',async()=>{
 const bootstrap={status:200,body:{team:{service:'ch-team-api',authenticated:false},scope:'today',date:'2026-11-26'}};
 const e=transport(undefined,{bootstrap});
 assert.equal((await (await e.window.fetch('/api/team/bootstrap')).json()).scope,'today');assert.equal(e.sent.length,0);
 assert.equal(new URL(e.getFrameUrl()).searchParams.get('bootstrap'),'1');
 assert.equal(e.window.googleLoadTiming().requests[0].source,'bridge');
 await e.window.fetch('/api/team/bootstrap');assert.equal(e.sent.length,1);
});

test('이전 서버나 잘못된 선조회 응답은 기존 RPC로 조회하며 관리자 세션은 공개 자료로 대체하지 않는다',async()=>{
 for(const bootstrap of [null,{status:503,body:{}},{status:200,body:{team:{service:'ch-team-api',authenticated:true}}}]){
  const e=transport(undefined,{bootstrap});await e.window.fetch('/api/team/bootstrap');assert.equal(e.sent.length,1);
 }
 const url='https://script.google.com/macros/s/test/exec',token='existing-admin-session-token-32-characters';
 const e=transport(url,{storage:[['ch-google-session:'+url,token]],bootstrap:{status:200,body:{team:{service:'ch-team-api',authenticated:false}}}});
 await e.window.fetch('/api/team/bootstrap');assert.equal(new URL(e.getFrameUrl()).searchParams.has('bootstrap'),false);assert.equal(e.sent[0].message.request.token,token);
});
