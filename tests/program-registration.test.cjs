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

test('시작일과 같은 날 담당자를 반복 수정해도 종료일이 뒤집히거나 일정이 중복되지 않는다',()=>{
 const f=fixture(),created=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');
 const staff=f.store.save('staff','',{name:'새 담당자'},'2026-10-29');
 const count=f.store.data.schedules.length;
 const revised=context.updateProgramWithSchedule(f.store,created.program.id,created.schedule.id,f.program,{...f.schedule,facilitatorIds:[staff.id],reportStaffByWeekday:{1:staff.id,3:staff.id,5:staff.id}},'2026-10-29');
 assert.equal(revised.schedule.id,created.schedule.id);assert.equal(revised.schedule.validTo,'2026-12-31');assert.equal(f.store.data.schedules.length,count);
 const second=context.updateProgramWithSchedule(f.store,created.program.id,created.schedule.id,f.program,{...f.schedule,facilitatorIds:f.program.facilitatorIds,reportStaffByWeekday:{1:f.program.facilitatorIds[0],3:f.program.facilitatorIds[0],5:f.program.facilitatorIds[0]}},'2026-10-29');
 assert.equal(second.schedule.id,created.schedule.id);assert.equal(second.schedule.validFrom,'2026-11-02');assert.equal(second.schedule.validTo,'2026-12-31');
});

test('담당자 빠른 수정은 요일마다 한 직원에게만 배정하고 이전 실적과 참여자를 보존한다',()=>{
 const f=fixture(),created=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');
 const partner=f.store.save('staff','',{name:'다른 담당자'},'2026-10-29'),first=f.program.facilitatorIds[0];
 f.store.data.enrollments.push({id:'quick-e',scheduleId:created.schedule.id,memberId:'m1',from:'2026-11-02',to:'',active:true});
 const ui=fs.readFileSync(require.resolve('../site/usability.js'),'utf8');
 const update=vm.runInNewContext(ui.slice(ui.indexOf('function updateScheduleStaff('),ui.indexOf('function bindProgramStaffQuickEditors('))+';updateScheduleStaff');
 const next=update(f.store,created.schedule.id,{1:first,3:partner.id,5:first},'2026-11-09');
 assert.notEqual(next.id,created.schedule.id);assert.equal(f.store.find('schedules',created.schedule.id).validTo,'2026-11-08');
 assert.equal(next.validTo,'2026-12-31');assert.equal(next.reportStaffByWeekday[3],partner.id);assert.equal(new Set(next.facilitatorIds).size,2);
 assert.ok(f.store.data.enrollments.some(e=>e.scheduleId===next.id&&e.memberId==='m1'));
 assert.throws(()=>update(f.store,next.id,{1:first,3:'',5:first},'2026-11-09'),/담당 직원/);
});

test('로그인 시계는 남은 시간과 5분 전 경고를 표시한다',()=>{
 const ui=fs.readFileSync(require.resolve('../site/usability.js'),'utf8');
 const clock=vm.runInNewContext(ui.slice(ui.indexOf('function adminSessionClock('),ui.indexOf('function updateAdminSessionClock('))+';adminSessionClock');
 assert.equal(clock(1000,{authenticated:true,expiresAt:14401000}).text,'로그인 남은 시간 04:00:00');
 assert.equal(clock(1000,{authenticated:true,expiresAt:301000}).warning,true);
 assert.equal(clock(1000,{authenticated:true,expiresAt:1000}).warning,true);
 assert.match(clock(1000,{authenticated:true,expiresAt:0}).text,/확인 필요/);
 assert.match(clock(1000,{authenticated:false}).text,/로그인 만료/);
});

test('프로그램 목록은 일정마다 삭제 버튼을 만들고 하나를 삭제해도 다른 일정은 남는다',()=>{
 const f=fixture(),r=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29');
 const second=f.store.save('schedules','',{...f.schedule,programId:r.program.id,weekdays:[2]},'2026-10-29');
 const admin=fs.readFileSync(require.resolve('../site/admin.js'),'utf8');
 const catalog=vm.runInNewContext(admin.slice(admin.indexOf('function integratedProgramCatalog('),admin.indexOf('function programCatalogPage('))+';integratedProgramCatalog',{
  management:f.store,showArchived:false,programAreaFilter:'',programStaffFilter:'',programStatusFilter:'',date:'2026-10-29',heading:()=>'',esc:String,opts:()=>'',programStaffQuickEditor:()=>'<div>요일별 담당자</div>'
 });
 const html=catalog();assert.ok(html.includes('data-delete="schedules:'+r.schedule.id+'"'));assert.ok(html.includes('data-delete="schedules:'+second.id+'"'));assert.match(html,/이 일정 삭제/);assert.match(html,/프로그램 전체 관리/);
 f.store.remove('schedules',r.schedule.id);assert.equal(f.store.find('programs',r.program.id).active,true);assert.equal(f.store.find('schedules',second.id).active,true);
 assert.ok(f.store.schedulesOn('2026-11-03').some(s=>s.id===second.id));
});

test('화수 반복을 요일별로 분리하면 직원과 참여자를 독립적으로 배정할 수 있다',()=>{
 const f=fixture(),staffA=f.program.facilitatorIds[0],staffB=f.store.save('staff','',{name:'수요일 직원'},'2026-10-29').id;
 const members=['화요일 이용인','수요일 이용인'].map(name=>f.store.save('members','',{name,communityId:f.store.list('communities')[0].id},'2026-10-29'));
 const base=context.saveProgramWithSchedule(f.store,{...f.program,facilitatorIds:[staffA,staffB]},{...f.schedule,weekdays:[2,3],facilitatorIds:[staffA,staffB],reportStaffByWeekday:{2:staffA,3:staffB}},'2026-10-29').schedule;
 f.store.assignParticipants(base.id,members.map(m=>m.id),'2026-11-02','individual');
 const rows=f.store.splitScheduleWeekdays(base.id,'2026-11-02');assert.equal(rows.length,2);assert.equal(new Set(rows.map(s=>s.id)).size,2);
 const tue=rows.find(s=>s.weekdays[0]===2),wed=rows.find(s=>s.weekdays[0]===3);
 assert.deepEqual(tue.facilitatorIds,[staffA]);assert.deepEqual(wed.facilitatorIds,[staffB]);
 f.store.assignParticipants(tue.id,[members[0].id],'2026-11-02','individual');f.store.assignParticipants(wed.id,[members[1].id],'2026-11-02','individual');
 const onTue=f.store.schedulesOn('2026-11-03').find(s=>s.id===tue.id),onWed=f.store.schedulesOn('2026-11-11').find(s=>s.id===wed.id);
 assert.deepEqual(f.store.eligibleMembers(onTue,'2026-11-03').map(m=>m.id),[members[0].id]);assert.deepEqual(f.store.eligibleMembers(onWed,'2026-11-11').map(m=>m.id),[members[1].id]);
 f.store.remove('schedules',tue.id);assert.ok(f.store.schedulesOn('2026-11-11').some(s=>s.id===wed.id));
});

test('운영 중인 반복 일정을 요일별로 나눠도 적용일 전 일정과 기록은 유지된다',()=>{
 const f=fixture(),base=context.saveProgramWithSchedule(f.store,f.program,f.schedule,'2026-10-29').schedule;
 const count=f.store.schedulesOn('2026-11-11').length,rows=f.store.splitScheduleWeekdays(base.id,'2026-11-09');
 assert.equal(rows.length,3);assert.equal(f.store.find('schedules',base.id).validTo,'2026-11-08');assert.equal(f.store.schedulesOn('2026-11-11').length,count);assert.ok(rows.every(s=>s.validTo==='2026-12-31'));
});
