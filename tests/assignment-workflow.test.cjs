const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),Store=require('../site/domain.js');
const source=fs.readFileSync(require.resolve('../site/assignment-picker.js'),'utf8');
const save=vm.runInNewContext(source.slice(source.indexOf('function saveAssignmentSelection('),source.indexOf('function openAssignmentPicker('))+';saveAssignmentSelection');
test('전체 64명 중 검색된 8명만 담당을 지정해 저장하고 나머지 배정은 유지한다',()=>{
 const people=Array.from({length:64},(_,n)=>({id:'m'+n,name:'참여자'+n,group:'소속'}));
 const store=new Store(Store.seed(['소속'],people,[['10:00','11:30','프로그램','소속','실','직원 가']],{})),first=store.list('staff')[0].id;
 const second=store.save('staff','',{name:'직원 나'},'2026-11-23').id;
 store.save('programs','program-1',{facilitatorIds:[first,second]},'2026-11-23');
 store.save('schedules','schedule-1',{facilitatorIds:[first,second],validFrom:'2027-01-11',audienceMode:'individual'},'2026-11-23');
 const ids=people.map(p=>p.id);store.assignParticipants('schedule-1',ids,'2027-01-11','individual');
 const owners=Object.fromEntries(ids.slice(0,8).map(id=>[id,first]));
 const schedule=save(store,'schedule-1',ids,'2027-01-11','individual','participant',owners);
 const enroll=()=>store.data.enrollments.filter(row=>row.scheduleId===schedule.id&&row.active!==false);
 assert.equal(enroll().length,64);assert.equal(enroll().filter(row=>row.reportStaffId===first).length,8);assert.equal(enroll().filter(row=>!row.reportStaffId).length,56);
 ids.slice(8,16).forEach(id=>owners[id]=second);save(store,schedule.id,ids,'2027-01-11','individual','participant',owners);
 assert.equal(enroll().filter(row=>row.reportStaffId===first).length,8);assert.equal(enroll().filter(row=>row.reportStaffId===second).length,8);assert.equal(enroll().length,64);
 assert.equal(store.reportOwnerFor(schedule,ids[20],'2027-01-12'),'');
});
