/* Static hosting transport: private credentials never appear in a URL. */
(function(){
 const config=window.GOOGLE_SHARED_CONFIG;if(!config)return;
 const originalFetch=window.fetch.bind(window),channel=crypto.randomUUID(),pending=new Map();
 let peer=null,peerOrigin='',frame,readyPromise,token='';
 const loadTiming={connectionMs:0,requests:[]};window.googleLoadTiming=()=>JSON.parse(JSON.stringify(loadTiming));
 const tokenKey='ch-google-session:'+config.webAppUrl,expiryKey=tokenKey+':expires';
 let expiresAt=0;
 try{expiresAt=Number(sessionStorage.getItem(expiryKey))||0}catch{}
 window.googleSessionInfo=()=>({authenticated:!!token,expiresAt});
 function announceSession(){window.dispatchEvent?.(new Event('ch-session-change'))}
 try{token=sessionStorage.getItem(tokenKey)||''}catch{}
 function saveToken(value,expiry=0){token=value||'';expiresAt=token?expiry:0;try{if(token){sessionStorage.setItem(tokenKey,token);sessionStorage.setItem(expiryKey,String(expiresAt))}else{sessionStorage.removeItem(tokenKey);sessionStorage.removeItem(expiryKey)}}catch{}announceSession()}
 function allowedGoogleOrigin(origin){try{const u=new URL(origin);return u.protocol==='https:'&&(u.hostname==='script.google.com'||u.hostname==='script.googleusercontent.com'||u.hostname.endsWith('.googleusercontent.com'))}catch{return false}}
 function connect(){
  if(readyPromise)return readyPromise;
  const connectionStarted=Date.now();
  readyPromise=new Promise((resolve,reject)=>{
   let url;try{url=new URL(config.webAppUrl);if(url.protocol!=='https:'||url.hostname!=='script.google.com'||!url.pathname.endsWith('/exec'))throw Error()}catch{reject(Error('google-config.js에 Apps Script 웹앱 /exec 주소를 입력해 주세요.'));return}
   const timeout=setTimeout(()=>{window.removeEventListener('message',onReady);reject(Error('Google 연결 시간이 초과되었습니다. 웹앱 배포 권한·SITE_ORIGINS·브라우저 쿠키 설정을 확인해 주세요.'))},config.connectionTimeoutMs||60000);
   function onReady(event){if(event.data?.type!=='ch-google-ready'||event.data.channel!==channel||!allowedGoogleOrigin(event.origin)||!event.source)return;peer=event.source;peerOrigin=event.origin;clearTimeout(timeout);window.removeEventListener('message',onReady);loadTiming.connectionMs=Date.now()-connectionStarted;resolve()}
   window.addEventListener('message',onReady);
   url.search=new URLSearchParams({mode:'bridge',origin:location.origin,channel}).toString();frame=document.createElement('iframe');frame.title='Google 공동 저장 연결';frame.hidden=true;frame.src=url.href;document.body.append(frame);
  }).catch(error=>{
   // A failed handshake must not leave every later retry attached to a rejected promise.
   readyPromise=null;peer=null;peerOrigin='';frame?.remove?.();frame=null;
   throw error;
  });return readyPromise;
 }
 window.addEventListener('message',event=>{
  if(event.source!==peer||event.origin!==peerOrigin||event.data?.type!=='ch-google-response'||event.data.channel!==channel)return;
  const item=pending.get(event.data.id);if(!item)return;pending.delete(event.data.id);clearTimeout(item.timer);
  loadTiming.requests.push({path:item.path,durationMs:Date.now()-item.started});if(loadTiming.requests.length>30)loadTiming.requests.shift();
  if(event.data.error)item.reject(Error(event.data.error));else item.resolve(event.data.response);
 });
 async function rpc(path,method,input,session=token){
  await connect();const id=crypto.randomUUID();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Google 저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.'))},config.requestTimeoutMs||90000);pending.set(id,{resolve,reject,timer,path:path.split('?')[0],started:Date.now()});peer.postMessage({type:'ch-google-request',channel,id,request:{path,method,input,token:session}},peerOrigin)});
 }
 window.fetch=async function(input,options={}){
  const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return originalFetch(input,options);
  let body={};try{if(options.body)body=JSON.parse(options.body)}catch{return new Response(JSON.stringify({error:'요청 형식 오류'}),{status:400,headers:{'Content-Type':'application/json'}})}
  try{
   const result=await rpc(url.pathname+url.search,options.method||'GET',body);
   if(result.body?.token){saveToken(result.body.token,Number(result.body.expiresAt)||Date.now()+14400000);delete result.body.token}if(result.status===401)saveToken('');
   if(result.binary){const bytes=Uint8Array.from(atob(result.binary),c=>c.charCodeAt(0));return new Response(bytes,{status:result.status||200,headers:{'Content-Type':result.mime}})}
   return new Response(JSON.stringify(result.body),{status:result.status||200,headers:{'Content-Type':'application/json;charset=utf-8'}});
  }catch(error){return new Response(JSON.stringify({ok:false,error:error.message}),{status:503,headers:{'Content-Type':'application/json'}})}
 };
 // Prepare the Google frame while the remaining application scripts are loading.
 void connect().catch(()=>{});
 document.addEventListener('click',event=>{if(event.target.closest?.('#logout')){const current=token;saveToken('');if(current)void rpc('/api/integration-logout','POST',{},current).catch(()=>{})}},true);
})();
