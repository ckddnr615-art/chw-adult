const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../site/app.js'),'utf8'),ops=fs.readFileSync(require.resolve('../site/operations.js'),'utf8');
test('초기 필터 상태에서 출결 관리 경로를 열면 필터와 명단이 실제로 렌더링된다',()=>{
 const main={innerHTML:''},node={classList:{toggle(){},remove(){}},hidden:false},member={id:'m',name:'참여자',group:'401호'};
 const ctx=vm.createContext({date:'2026-11-23',people:[member],records:{},adminSession:true,participantGroup:'',location:{hash:'#attendance'},history:{replaceState(){}},document:{body:{classList:{toggle(){}}},querySelectorAll:()=>[]},$:selector=>selector==='#main'?main:node,management:{list:type=>type==='communities'?[{id:'c',name:'401호'}]:[],data:{staff:[]},find:()=>member,caseManagerAt:()=>''},esc:String,team:{active:true},photoMarkup:()=>'',attendanceOptionMarkup:()=>'<option>미입력</option>',status:()=>'',heading:title=>'<h1>'+title+'</h1>',refreshCollections(){},bind(){},bindManagement(){},updateClock(){},dashboard(){},reports(){},workspace(){},kiosk(){},login(){},managementPages:{}});
 const declarations=app.split('\n').find(line=>line.startsWith('let selectedGroup='));
 vm.runInContext(declarations+'\n'+app.split('\n').filter(line=>/^function (filterBar|filtered|attendance|attendanceRows|render)\(/.test(line)).join('\n'),ctx);
 ctx.render();assert.match(main.innerHTML,/<h1>출결 관리<\/h1>/);assert.match(main.innerHTML,/id="attendanceStaffFilter"/);assert.match(main.innerHTML,/참여자/);
});
function setup(options={}){
 const calls=[],messages=[];let renders=0;
 const ctx=vm.createContext({adminSession:true,team:{loading:false,saving:false},configPending:false,configSaving:false,memberRowDrafts:new Map(),programStaffDrafts:new Map(),sharedScreenCanRefresh:()=>!options.draft,syncSharedRefreshControl(){},toast:message=>messages.push(message),fetch:async()=>({ok:true,json:async()=>({service:'ch-team-api',authenticated:!options.expired,initialized:true})}),location:{hash:options.route||'#attendance'},reportMonth:'2026-10',selectedDate:'2026-11-19',date:'2026-11-23',loadTeamMonth:async(month,full)=>{calls.push({month,full});return true},render:()=>{renders++}});
 vm.runInContext(ops.slice(ops.indexOf('let sharedRefreshBusy='),ops.indexOf('const initialHash=')),ctx);
 // The DOM control is tested separately by normal rendering; isolate read/write behavior here.
 vm.runInContext('syncSharedRefreshControl=function(){}',ctx);
 return {ctx,calls,messages,renders:()=>renders};
}
test('변경 최신화는 조회 중인 출결 월을 전체 조회하고 완료 화면을 갱신한다',async()=>{const e=setup();await e.ctx.refreshSharedChanges();assert.deepEqual(e.calls,[{month:'2026-11',full:true}]);assert.equal(e.renders(),1);assert.match(e.messages[0],/최신 변경/)});
test('최신화는 미저장 입력·담당자 변경·인증 만료를 덮어쓰지 않는다',async()=>{
 const draft=setup({draft:true});await draft.ctx.refreshSharedChanges();assert.equal(draft.calls.length,0);
 const member=setup();member.ctx.memberRowDrafts.set('m',{});await member.ctx.refreshSharedChanges();assert.equal(member.calls.length,0);
 const saving=setup();saving.ctx.configPending=true;await saving.ctx.refreshSharedChanges();assert.equal(saving.calls.length,0);
 const expired=setup({expired:true});await expired.ctx.refreshSharedChanges();assert.equal(expired.renders(),0);assert.match(expired.messages[0],/만료/);
});
