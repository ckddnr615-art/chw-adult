const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../site/operations.js'),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
test('같은 월의 동시 조회 10개는 서버 조회 한 번을 공유한다',async()=>{
 const gate=deferred();let reads=0;
 const ctx=vm.createContext({date:'2026-11-26',readTeamMonth:()=>{reads++;return gate.promise}});
 vm.runInContext(source.slice(source.indexOf('async function loadTeamMonth('),source.indexOf('async function readTeamMonth(')),ctx);
 const calls=Array.from({length:10},()=>ctx.loadTeamMonth());assert.equal(reads,1);gate.resolve(true);assert.deepEqual(await Promise.all(calls),Array(10).fill(true));
 await ctx.loadTeamMonth();assert.equal(reads,2);
});
test('전체 최신화는 먼저 진행 중인 일반 조회 뒤에 별도의 전체 조회로 실행된다',async()=>{
 const gate=deferred(),calls=[];
 const ctx=vm.createContext({date:'2026-11-26',readTeamMonth:(month,full)=>{calls.push(full);return calls.length===1?gate.promise:Promise.resolve(true)}});
 vm.runInContext(source.slice(source.indexOf('async function loadTeamMonth('),source.indexOf('async function readTeamMonth(')),ctx);
 const normal=ctx.loadTeamMonth(),full=ctx.loadTeamMonth('2026-11',true);assert.deepEqual(calls,[false]);gate.resolve(true);await Promise.all([normal,full]);assert.deepEqual(calls,[false,true]);
});
test('중복 출석 클릭은 한 번만 전송하고 실패 후에는 재시도할 수 있다',async()=>{
 let gate=deferred(),writes=0;const ctx=vm.createContext({writeAttendance:()=>{writes++;return gate.promise}});
 vm.runInContext(source.slice(source.indexOf('async function commitAttendance('),source.indexOf('async function writeAttendance(')),ctx);
 const a=ctx.commitAttendance('m','2026-11-26','출석',true),b=ctx.commitAttendance('m','2026-11-26','출석',true);
 assert.equal(writes,1);const caught=Promise.allSettled([a,b]);gate.reject(Error('일시 장애'));assert.equal((await caught).filter(r=>r.status==='rejected').length,2);
 gate=deferred();const retry=ctx.commitAttendance('m','2026-11-26','출석',true);assert.equal(writes,2);gate.resolve({ok:true});assert.equal((await retry).ok,true);
});
test('설정 저장은 실적 재계산 응답을 기다리지 않고 완료하며 재계산은 별도로 예약한다',async()=>{
 const timers=[];let writes=0;
 const ctx=vm.createContext({configSaving:false,configPending:true,configSaveWaiters:[],configBaseline:{},team:{active:true,authenticated:true,error:''},showTeamStatus(){},currentConfig:()=>({members:[]}),configChanges:()=>[{}],teamRequest:async path=>{assert.equal(path,'config');writes++;return {reconcile:true}},setTimeout:(fn,delay)=>{timers.push({fn,delay});return 1},clearTimeout(){}});
 vm.runInContext(source.slice(source.indexOf('async function saveTeamConfig('),source.indexOf('persist=function(')),ctx);
 await ctx.saveTeamConfig();assert.equal(writes,1);assert.equal(ctx.team.saving,false);assert.equal(ctx.team.reportsPending,true);assert.equal(timers.length,1);assert.equal(timers[0].delay,1500);
});
test('백그라운드 갱신은 변경 없는 화면을 다시 그리지 않고 조회 중인 출결 월을 따른다',async()=>{
 let renders=0,blocked=false,reads=0;const revisions=new Map([['2026-10',3]]),calls=[];
 const ctx=vm.createContext({team:{active:true},document:{hidden:false},configPending:false,configSaving:false,location:{hash:'#attendance'},selectedDate:'2026-10-29',date:'2026-11-26',monthRevisions:revisions,sharedRefreshBlocked:()=>blocked,loadTeamMonth:async month=>{calls.push(month);reads++},render(){renders++},syncSharedRefreshControl(){},showTeamStatus(){}});
 vm.runInContext(source.slice(source.indexOf('async function refreshSharedInBackground('),source.indexOf('setInterval(async()=>')),ctx);
 await ctx.refreshSharedInBackground();assert.deepEqual(calls,['2026-10']);assert.equal(renders,0);
 ctx.loadTeamMonth=async month=>{reads++;revisions.set(month,4)};await ctx.refreshSharedInBackground();assert.equal(renders,1);
 blocked=true;await ctx.refreshSharedInBackground();assert.equal(reads,2);
});

test('일시적인 자동 조회 실패가 설정 저장을 막는 오류로 남지 않으며 다음 조회에서 회복된다',async()=>{
 const team={active:true,error:''};let fail=true,statusUpdates=0;
 const ctx=vm.createContext({team,document:{hidden:false},configPending:false,configSaving:false,location:{hash:'#attendance'},selectedDate:'2026-11-26',date:'2026-11-26',monthRevisions:new Map(),sharedRefreshBlocked:()=>false,loadTeamMonth:async()=>{if(fail)throw Error('일시 장애')},render(){},syncSharedRefreshControl(){},showTeamStatus(){statusUpdates++}});
 vm.runInContext(source.slice(source.indexOf('async function refreshSharedInBackground('),source.indexOf('setInterval(async()=>')),ctx);
 await ctx.refreshSharedInBackground();assert.equal(team.error,'');assert.match(team.refreshError,/지연/);
 fail=false;await ctx.refreshSharedInBackground();assert.equal(team.refreshError,'');assert.equal(statusUpdates,2);
});
