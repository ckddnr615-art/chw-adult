const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../site/operations.js'),'utf8'),boot=source.slice(source.indexOf('async function bootTeam(){'),source.indexOf('const teamBoot=bootTeam();'));
function environment({legacy=false,failed=false}={}){
 const calls=[],data={initialized:true,date:'2026-11-26',team:{service:'ch-team-api',authenticated:false,initialized:true,googleConfigured:true},holidays:{ok:true,year:'2026',dates:{}},timing:{totalMs:20}},team={loading:true,active:false};let applies=0,months=0,renders=0,holidays=0;
 const ctx=vm.createContext({team,date:'2026-11-26',selectedDate:'2026-11-26',prettyDate:'',initialHash:'',adminSession:false,apiState:{},history:{replaceState(){}},fetch:async path=>{calls.push(path);return path==='/api/team/bootstrap'&&legacy?{status:legacy===401?401:404,ok:false}:failed?{status:503,ok:false,json:async()=>({error:'연결 실패'})}:{status:200,ok:true,json:async()=>path.endsWith('/status')?data.team:data}},acceptHolidayYear:()=>{holidays++},applyTeamSnapshot:()=>{applies++;team.active=true;return true},loadTeamMonth:async()=>{months++;return true},render(){renders++},$:()=>({dataset:{}}),Intl,Date});vm.runInContext(boot,ctx);return {ctx,calls,team,counts:()=>({applies,months,renders,holidays})};
}
test('신규 초기화는 요청 하나로 화면 자료와 공휴일을 함께 반영한다',async()=>{const e=environment();await e.ctx.bootTeam();assert.deepEqual(e.calls,['/api/team/bootstrap']);assert.deepEqual(e.counts(),{applies:1,months:0,renders:1,holidays:1});assert.equal(e.team.active,true);assert.equal(e.team.loading,false);assert.equal(e.team.startupMode,'bootstrap')});
test('이전 서버의 미지원 401/404는 구 초기화 경로로 호환하며 연결 실패는 성공으로 표시하지 않는다',async()=>{
 const old=environment({legacy:true});await old.ctx.bootTeam();assert.deepEqual(old.calls,['/api/team/bootstrap','/api/team/status']);assert.equal(old.counts().months,1);const oldPublic=environment({legacy:401});await oldPublic.ctx.bootTeam();assert.equal(oldPublic.team.startupMode,'legacy');
 const failure=environment({failed:true});await failure.ctx.bootTeam();assert.equal(failure.calls.length,1);assert.equal(failure.team.active,false);assert.equal(failure.team.error,'연결 실패');
});
test('일반 월 조회도 공휴일 응답을 기다리기 전에 자료 요청을 시작한다',async()=>{
 let finish;const holiday=new Promise(resolve=>finish=resolve);let fetched=false,applied=false;
 const ctx=vm.createContext({team:{authenticated:true},monthRevisions:new Map(),date:'2026-11-26',ensureHolidayYear:()=>holiday,fetch:async()=>{fetched=true;return {ok:true,json:async()=>({initialized:true})}},applyTeamSnapshot:()=>{applied=true;return true}});
 vm.runInContext(source.slice(source.indexOf('async function readTeamMonth('),source.indexOf('function applyTeamSnapshot(')),ctx);const work=ctx.readTeamMonth('2026-11',true);assert.equal(fetched,true);assert.equal(applied,false);finish();await work;assert.equal(applied,true);
});
