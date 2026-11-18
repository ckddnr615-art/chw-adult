const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Store=require('../site/domain.js');
const source=fs.readFileSync(require.resolve('../site/timetable.js'),'utf8'),context=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function saveProgramWithSchedule('),source.indexOf('function openProgramRegistration(')),context);
function fixture(){const store=new Store(Store.seed(['소속'],[],[['10:00','11:30','기존 활동','소속','활동실','직원']],{}));return {store,program:{name:'새 활동',areaId:store.list('areas')[0].id,facilitatorIds:[store.list('staff')[0].id]},schedule:{date:'',weekdays:[1,3,5],validFrom:'2026-11-02',validTo:'2026-12-31',start:'13:00',end:'15:40',location:'다목적실',audienceMode:'individual',communityId:''}}}
test('프로그램과 오후 전체 반복 일정을 함께 등록한다',()=>{const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');assert.equal(r.schedule.programId,r.program.id);assert.deepEqual([...r.schedule.weekdays],[1,3,5]);assert.equal(r.schedule.end,'15:40');assert.equal(r.schedule.validTo,'2026-12-31')});
test('일정 오류 시 프로그램도 남기지 않는다',()=>{const f=fixture(),before=JSON.stringify(f.store.data);assert.throws(()=>context.saveProgramWithSchedule(f.store,f.program,{...f.schedule,end:'12:00'},'2026-10-29'));assert.equal(JSON.stringify(f.store.data),before)});
test('특정 날짜는 반복 요일 없이 등록할 수 있다',()=>{const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,{...f.schedule,date:'2026-11-03',weekdays:[],validFrom:'',validTo:''},'2026-10-29');assert.equal(r.schedule.date,'2026-11-03');assert.equal(r.schedule.weekdays.length,0)});
test('반복 일정 수정은 적용일 이전과 배정을 보관하고 종료일을 유지한다',()=>{const f=fixture(),created=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');f.store.data.enrollments.push({id:'e1',scheduleId:created.schedule.id,memberId:'m1',from:'2026-11-02',to:'',active:true});const r=context.updateProgramWithSchedule(f.store,created.program.id,created.schedule.id,{...f.program,name:'수정 활동'},{...f.schedule,validFrom:'2026-11-09',start:'10:00',end:'11:30'},'2026-10-29');assert.notEqual(r.schedule.id,created.schedule.id);assert.equal(f.store.find('schedules',created.schedule.id).validTo,'2026-11-08');assert.equal(r.schedule.validTo,'2026-12-31');assert.ok(f.store.data.enrollments.some(e=>e.scheduleId===r.schedule.id&&e.from==='2026-11-09'));});
test('기본 정보만 수정하면 반복 일정을 불필요하게 분리하지 않는다',()=>{const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29'),count=f.store.data.schedules.length;const edited=context.updateProgramWithSchedule(f.store,r.program.id,r.schedule.id,{...f.program,name:'이름만 변경'},f.schedule,'2026-10-29');assert.equal(edited.schedule.id,r.schedule.id);assert.equal(f.store.data.schedules.length,count)});
test('수정 일정에 오류가 있으면 프로그램 이름도 되돌린다',()=>{const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29'),before=JSON.stringify(f.store.data);assert.throws(()=>context.updateProgramWithSchedule(f.store,r.program.id,r.schedule.id,{...f.program,name:'실패 이름'},{...f.schedule,start:'17:00'},'2026-10-29'));assert.equal(JSON.stringify(f.store.data),before)});
test('프로그램 비활성화·재활성화는 날짜별 이력을 유지한다',()=>{const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');f.store.setProgramEnabled(r.program.id,false,'2026-11-04');assert.equal(f.store.schedulesOn('2026-11-02').some(s=>s.id===r.schedule.id),true);assert.equal(f.store.schedulesOn('2026-11-04').some(s=>s.id===r.schedule.id),false);f.store.setProgramEnabled(r.program.id,true,'2026-11-06');assert.equal(f.store.schedulesOn('2026-11-04').some(s=>s.id===r.schedule.id),false);assert.equal(f.store.schedulesOn('2026-11-06').some(s=>s.id===r.schedule.id),true)});
test('프로그램 삭제는 연결 일정을 지우지 않고 복구할 수 있다',()=>{const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');f.store.remove('programs',r.program.id);assert.ok(f.store.find('schedules',r.schedule.id));assert.equal(f.store.schedulesOn('2026-11-02').some(s=>s.id===r.schedule.id),false);f.store.find('programs',r.program.id).active=true;assert.equal(f.store.schedulesOn('2026-11-02').some(s=>s.id===r.schedule.id),true)});


test('오늘 담당자 표는 당일 대체 담당자와 장소를 표시하고 취소된 일정은 제외한다',()=>{
 const {store,program,schedule}=fixture(),day='2026-11-11',base='schedule-1';
 const caseStaff=store.save('staff','',{name:'사례관리 직원'},day);
 const substitute=store.save('staff','',{name:'대체 담당자'},day);
 const partner=store.save('staff','',{name:'공동 담당자'},day);
 store.setDayOverride(base,day,{kind:'replace',programId:'program-1',displayName:'당일 활동',start:'10:00',end:'15:40',location:'다목적실',facilitatorIds:[substitute.id,partner.id],reason:'담당자 변경'});
 const pm=context.saveProgramWithSchedule(store,{...program,name:'취소된 활동'},
   {...schedule,date:day,weekdays:[]},day).schedule;
 store.setDayOverride(pm.id,day,{kind:'cancel',reason:'당일 휴강'});
 const source=fs.readFileSync(require.resolve('../site/program-attendance.js'),'utf8');
 const table=vm.runInNewContext(source+'\nstaffScheduleTable',{ManagementStore:Store,esc:String});
 const html=table(store,day,substitute.id);
 assert.match(html,/전담 담당자/);
 assert.match(html,/당일 활동/);
 assert.match(html,/다목적실 · 오늘 변경/);
 assert.match(html,/종일/);
 assert.match(html,/대체 담당자 · 공동 담당자/);
 assert.match(html,/staff-desk-assigned/);
 assert.doesNotMatch(html,/사례관리 직원|취소된 활동/);
 assert.match(table(store,day,caseStaff.id),/대체 담당자 · 공동 담당자/);
 assert.match(table(store,'2026-11-15',''),/오늘 운영하는 프로그램이 없습니다/);
});
