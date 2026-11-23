const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const analytics=fs.readFileSync(require.resolve('../site/analytics.js'),'utf8'),operations=fs.readFileSync(require.resolve('../site/operations.js'),'utf8');
test('월간 달력에는 건수만 표시하고 이름과 내용은 선택 날짜의 상세 영역에 표시한다',()=>{
 const ctx=vm.createContext({management:{data:{calendarNotes:[{id:'one',date:'2026-11-23',staffName:'직원 가',time:'10:00',text:'외부회의',active:true},{id:'two',date:'2026-11-23',staffName:'직원 나',text:'활동준비',active:true},{id:'deleted',date:'2026-11-23',text:'삭제 일정',active:false}]}},dashboardMonth:'2026-11',calendarDay:'2026-11-23',date:'2026-11-23',prettyDate:'2026년 11월 23일',monthDays:()=>30,esc:String});
 vm.runInContext(analytics.slice(analytics.indexOf('function calendarEntries('),analytics.indexOf('function bindDashboardCalendar(')),ctx);
 const html=ctx.dashboardCalendar(),grid=html.slice(html.indexOf('<div class="calendar-days">'),html.indexOf('<div class="calendar-day-detail">'));
 assert.match(grid,/일정 2건/);assert.match(grid,/일정 0건/);assert.doesNotMatch(grid,/외부회의|직원 가|활동준비/);assert.match(html.slice(html.indexOf('calendar-day-detail')),/외부회의/);assert.match(html,/id="calendarNoteForm"/);
});
function syncContext(pending=false){
 const calendar={id:'new',date:'2026-11-23',text:'다른 직원 일정',active:true};
 const ctx=vm.createContext({date:'2026-11-23',ensureHolidayYear:async()=>{},monthRevisions:new Map(),latestAttendanceRevision:0,fetch:async()=>({ok:true,json:async()=>({initialized:true,revision:3,config:{staff:[{id:'s2',name:'수정 직원'}],calendarNotes:[calendar],programs:[]},records:{'2026-11-23:m1':'출석'},days:{},entries:[],audit:[]})}),management:{data:{staff:[{id:'s1'}],calendarNotes:[],programs:[],days:{},entries:[]},upgradeTimetable(){}},CONFIG_TYPES:['staff','calendarNotes','programs'],configPending:pending,configSaving:false,configBaseline:null,currentConfig:()=>({}),records:{},adminSession:true,team:{},originalPersist(){},refreshCollections(){}});
 vm.runInContext(operations.slice(operations.indexOf('async function loadTeamMonth('),operations.indexOf('function configChanges(')),ctx);return ctx;
}
test('다른 직원이 저장한 일정·직원정보·출석을 다음 조회에서 함께 반영한다',async()=>{
 const ctx=syncContext();await ctx.loadTeamMonth();assert.equal(ctx.management.data.calendarNotes[0].text,'다른 직원 일정');assert.equal(ctx.management.data.staff[0].name,'수정 직원');assert.equal(ctx.records['2026-11-23:m1'],'출석');assert.equal(ctx.monthRevisions.get('2026-11'),3);
});
test('내 미저장 변경이 있으면 다른 직원 조회가 덮어쓰지 않으며 저장 후 다시 읽는다',async()=>{
 const ctx=syncContext(true);await ctx.loadTeamMonth();assert.equal(ctx.management.data.staff[0].id,'s1');assert.equal(ctx.monthRevisions.has('2026-11'),false);ctx.configPending=false;await ctx.loadTeamMonth();assert.equal(ctx.management.data.staff[0].id,'s2');
});
test('자동 갱신과 창 복귀 시 작성 중인 일정과 열린 수정창을 보호한다',()=>{
 let values=[],editing='',opened=false,focused=false;
 const form={dataset:{get editing(){return editing}},querySelectorAll:()=>values.map(value=>({value}))};
 const ctx=vm.createContext({$:selector=>selector==='#dialog'?{open:opened}:form,document:{activeElement:{closest:()=>focused}}});
 vm.runInContext(operations.slice(operations.indexOf('function sharedScreenCanRefresh('),operations.indexOf('setInterval(async()=>')),ctx);
 assert.equal(ctx.sharedScreenCanRefresh(),true);values=['작성 중'];assert.equal(ctx.sharedScreenCanRefresh(),false);values=[];editing='entry';assert.equal(ctx.sharedScreenCanRefresh(),false);editing='';opened=true;assert.equal(ctx.sharedScreenCanRefresh(),false);opened=false;focused=true;assert.equal(ctx.sharedScreenCanRefresh(),false);
});
