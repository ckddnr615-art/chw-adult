const {test}=require('node:test'),assert=require('node:assert/strict'),Store=require('../site/domain.js'),Reports=require('../site/program-report-model.js'),fs=require('node:fs'),vm=require('node:vm');
function fixture(count=2){
 const people=Array.from({length:count},(_,i)=>({id:'m'+i,name:i===0?'가 참여자':'나 참여자 '+i,group:'대기실'}));
 const store=new Store(Store.seed(['대기실'],people,[['10:00','11:30','건강 활동','대기실','체육실','오전 직원']],{}));
 store.data.schedules[0].validFrom='2026-01-01';store.data.schedules[0].validTo='2027-12-31';
 const entry=(fields={})=>({id:'entry-1',programId:'program-1',scheduleId:'schedule-1',memberId:'m0',name:'기록 당시 이름',date:'2026-11-23',start:'10:00',end:'11:30',checked:true,staff:'기록 당시 직원',sync:'synced',...fields});
 return {store,entry};
}
test('프로그램 월간 출석·실적은 날짜별로 중복을 제거하고 센터 출석만으로 실적을 만들지 않는다',()=>{
 const {store,entry}=fixture();store.data.entries=[entry(),entry({id:'duplicate'})];const records={'2026-11-23:m0':'출석','2026-11-23:m1':'출석'};
 const before=JSON.stringify({data:store.data,records});const r=Reports.build(store,records,{programId:'program-1',from:'2026-11-23',to:'2026-11-24',today:'2026-11-24'});
 assert.equal(r.totals.present,1);assert.equal(r.totals.unique,1);assert.equal(r.members[0].cells['2026-11-23'].mark,'/');assert.equal(r.members[1].cells['2026-11-23'].mark,'O');assert.equal(r.members[0].cells['2026-11-24'].mark,'?');assert.equal(r.actual[0].staff,'기록 당시 직원');assert.equal(JSON.stringify({data:store.data,records}),before);
});
test('같은 프로그램 오전·오후 중 일부만 참여하면 △이며 실적은 하루 한 건이다',()=>{
 const {store,entry}=fixture();store.data.schedules.push({...store.data.schedules[0],id:'pm',start:'13:00',end:'15:40',slotId:'afternoon'});store.data.entries=[entry()];
 const options={programId:'program-1',from:'2026-11-23',to:'2026-11-23',today:'2026-11-24'};
 let r=Reports.build(store,{},options);assert.equal(r.members[0].cells['2026-11-23'].mark,'△');assert.equal(r.totals.present,1);
 store.data.entries.push(entry({id:'afternoon',scheduleId:'pm',start:'13:00'}));r=Reports.build(store,{},options);assert.equal(r.members[0].cells['2026-11-23'].mark,'/');assert.equal(r.totals.present,1);assert.equal(r.actual[0].sessions,2);
});
test('주차는 월요일 기준이고 월 경계·윤년·기간 상한을 정확히 처리한다',()=>{
 assert.equal(Reports.dates('2024-02-01','2024-02-29').length,29);assert.deepEqual(Reports.months('2026-12-25','2027-01-10'),['2026-12','2027-01']);
 assert.throws(()=>Reports.dates('2026-02-30','2026-03-01'),/확인/);assert.throws(()=>Reports.dates('2025-01-01','2026-01-02'),/366/);
 const {store}=fixture(),r=Reports.build(store,{}, {programId:'program-1',from:'2026-11-01',to:'2026-11-09',today:'2026-11-09'});assert.deepEqual(r.weeks.map(w=>[w.from,w.to]),[['2026-11-01','2026-11-01'],['2026-11-02','2026-11-08'],['2026-11-09','2026-11-09']]);
});
test('미래 배정과 주말은 결석 실적에 포함하지 않고 첫 수요일 오후 휴무도 반영한다',()=>{
 const {store}=fixture();const r=Reports.build(store,{}, {programId:'program-1',from:'2026-11-27',to:'2026-11-30',today:'2026-11-26'});assert.equal(r.totals.absent,0);assert.equal(r.totals.present,0);assert.equal(r.totals.future,4);assert.equal(r.totals.operating,2);
 const closed=fixture();closed.store.data.schedules[0].start='13:00';closed.store.data.schedules[0].end='15:40';closed.store.data.schedules[0].slotId='afternoon';const w=Reports.build(closed.store,{}, {programId:'program-1',from:'2026-11-04',to:'2026-11-04',today:'2026-11-05'});assert.equal(w.totals.operating,0);
});
test('프로그램이 종료되고 참여자가 삭제돼도 저장 당시 실적과 프로그램 실적 담당을 유지한다',()=>{
 const {store,entry}=fixture();store.data.programs[0].active=false;store.data.members[0].active=false;store.data.entries=[entry({reportStaff:[{id:'actual',name:'프로그램 담당',checked:true},{id:'old',name:'이전 담당',checked:false}]})];
 const r=Reports.build(store,{}, {programId:'program-1',from:'2026-11-23',to:'2026-11-23',today:'2026-11-26'});assert.equal(r.actual.length,1);assert.equal(r.actual[0].name,'기록 당시 이름');assert.equal(r.actual[0].staff,'프로그램 담당');
});
test('70명 1년 조회는 원본 변경 없이 저장된 실적을 한 번만 순회한다',()=>{
 const {store,entry}=fixture(70);store.data.entries=Array.from({length:70},(_,i)=>entry({id:'e'+i,memberId:'m'+i}));const entries=store.data.entries;let scans=0;entries[Symbol.iterator]=function*(){scans++;yield* Array.from({length:70},(_,i)=>entries[i])};
 const r=Reports.build(store,{}, {programId:'program-1',from:'2026-01-01',to:'2026-12-31',today:'2026-11-26'});assert.equal(r.days.length,365);assert.equal(r.members.length,70);assert.equal(r.totals.present,70);assert.equal(scans,1);
});
test('조회 로더는 월별 GET 자료만 순차 확인하고 쓰기나 실적 재계산을 요청하지 않는다',async()=>{
 const source=fs.readFileSync(require.resolve('../site/program-reports.js'),'utf8'),{store}=fixture(),calls=[];let renders=0;
 const state={busy:false,mode:'range',from:'2026-10-30',to:'2026-11-02',programId:'program-1'};
 const ctx=vm.createContext({programReportState:state,adminSession:true,team:{active:true},configPending:false,configSaving:false,ProgramReports:Reports,management:store,records:{},date:'2026-11-26',location:{hash:'#program-reports'},render(){renders++},fetch:async(path,options)=>{calls.push(path);assert.equal(options.method,undefined);return {ok:true,json:async()=>({authenticated:true})}},ensureHolidayYear:async year=>calls.push('year:'+year),loadTeamMonth:async month=>{calls.push('month:'+month);return true},$:()=>null,Intl,Date});
 vm.runInContext(source.slice(source.indexOf('async function queryProgramReports('),source.indexOf('function exportProgramReport(')),ctx);await ctx.queryProgramReports();assert.equal(state.busy,false);assert.equal(state.error,'');assert.ok(state.result);assert.deepEqual(calls.filter(c=>c.startsWith('month:')),['month:2026-10','month:2026-11']);assert.equal(renders,2);
});

test('월간 출석부는 35명씩 표시하며 기간 조회는 주차 칸으로 축약한다',()=>{
 const source=fs.readFileSync(require.resolve('../site/program-reports.js'),'utf8'),{store}=fixture(70),ctx=vm.createContext({date:'2026-11-26',management:store,heading:t=>'<h1>'+t+'</h1>',esc:v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))});
 vm.runInContext(source.slice(0,source.indexOf('async function queryProgramReports(')),ctx);
 const r=Reports.build(store,{}, {programId:'program-1',from:'2026-11-01',to:'2026-11-30',today:'2026-11-26'});ctx.report=r;vm.runInContext('programReportState.result=report',ctx);
 let html=ctx.programReportsPage();assert.match(html,/월별 조회/);assert.match(html,/기간별 조회/);assert.match(html,/주차별 요약/);assert.match(html,/전체 70명/);assert.match(html,/가 참여자/);assert.doesNotMatch(html,/나 참여자 69<\/th>/);
 vm.runInContext('programReportState.page=1',ctx);html=ctx.programReportsPage();assert.match(html,/나 참여자 69<\/th>/);
 const longer=Reports.build(store,{}, {programId:'program-1',from:'2026-10-01',to:'2026-11-30',today:'2026-11-26'});assert.equal(ctx.programReportColumns(longer).length,longer.weeks.length);
});
test('기간 조회 실패는 부분 결과로 기존 보고서를 바꾸지 않고 다시 조회할 수 있다',async()=>{
 const source=fs.readFileSync(require.resolve('../site/program-reports.js'),'utf8'),state={busy:false,mode:'range',from:'2026-10-30',to:'2026-11-02',programId:'program-1',result:{name:'이전 보고서'}};
 let calls=0;const ctx=vm.createContext({programReportState:state,adminSession:true,team:{active:true},configPending:false,configSaving:false,ProgramReports:Reports,date:'2026-11-26',location:{hash:'#program-reports'},render(){},fetch:async()=>({ok:true,json:async()=>({authenticated:true})}),ensureHolidayYear:async()=>{},loadTeamMonth:async()=>{calls++;if(calls===2)throw Error('연결 일시 오류');return true},$:()=>null});
 vm.runInContext(source.slice(source.indexOf('async function queryProgramReports('),source.indexOf('function exportProgramReport(')),ctx);await ctx.queryProgramReports();assert.equal(state.busy,false);assert.equal(state.result.name,'이전 보고서');assert.match(state.error,/연결 일시 오류/);
});
test('요일별 담당·인원이 다르면 해당 날짜 배정과 기록 당시 담당을 따라 집계한다',()=>{
 const {store,entry}=fixture();const first=store.data.schedules[0];first.weekdays=[2];first.audienceMode='individual';store.data.enrollments=[{id:'a',scheduleId:first.id,memberId:'m0',from:'2026-01-01',active:true}];
 store.data.schedules.push({...first,id:'wednesday',weekdays:[3]});store.data.enrollments.push({id:'b',scheduleId:'wednesday',memberId:'m1',from:'2026-01-01',active:true});
 store.data.entries=[entry({date:'2026-11-24',reportStaff:[{id:'tue',name:'화요일 담당'}]}),entry({id:'wed-entry',date:'2026-11-25',memberId:'m1',scheduleId:'wednesday',reportStaff:[{id:'wed',name:'수요일 담당'}]})];
 const r=Reports.build(store,{}, {programId:'program-1',from:'2026-11-24',to:'2026-11-25',today:'2026-11-26'});assert.equal(r.totals.present,2);assert.equal(r.members[0].cells['2026-11-25'],undefined);assert.equal(r.members[1].cells['2026-11-24'],undefined);assert.deepEqual(r.actual.map(e=>e.staff),['화요일 담당','수요일 담당']);
});
