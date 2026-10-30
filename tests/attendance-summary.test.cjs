const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),Store=require('../site/domain.js');
test('기간·전체 인원·소속별 출석률은 당시 소속과 개인별 운영일로 계산한다',()=>{
 const model=new Store(Store.seed(['소속A','소속B'],[{id:'one',name:'한명',group:'소속A'},{id:'two',name:'두명',group:'소속B'}],[['10:00','11:30','A활동','소속A','실','직원'],['10:00','11:30','B활동','소속B','실','직원']],{}));
 const records={'2026-10-26:one':'출석','2026-10-26:two':'결석','2026-10-27:one':'출석','2026-10-27:two':'출석'};model.captureDays(records);model.save('members','one',{name:'한명',communityId:'community-2'},'2026-10-27');model.save('closures','',{date:'2026-10-28',name:'휴무'},'2026-10-28');
 const context=vm.createContext({date:'2026-10-28',management:model,records,holidayYears:new Map([['2026',{}]]),dateSpan:(a,b)=>{const dates=[];for(let d=a;d<=b;d=Store.addDays(d,1))dates.push(d);return dates}});
 vm.runInContext(fs.readFileSync(require.resolve('../site/attendance-summary.js'),'utf8'),context);
 const all=JSON.parse(vm.runInContext("JSON.stringify(periodAttendanceData('2026-10-26','2026-10-28'))",context));assert.equal(all.expected,4);assert.equal(all.present,3);assert.equal(all.people,2);assert.equal(all.rate,75);
 const a=JSON.parse(vm.runInContext("JSON.stringify(periodAttendanceData('2026-10-26','2026-10-28','community-1'))",context));assert.equal(a.expected,2);assert.equal(a.present,2);
 const single=JSON.parse(vm.runInContext("JSON.stringify(periodAttendanceData('2026-10-26','2026-10-26'))",context));assert.equal(single.rate,50);
});
test('같은 날 여러 프로그램을 참여해도 일자별 출석은 1회이며 주말은 제외한다',()=>{
 const model=new Store(Store.seed(['소속'],[{id:'one',name:'한명',group:'소속'}],[['10:00','11:30','오전','소속','실','직원']],{}));
 const base=model.list('schedules')[0];model.save('schedules','',{...base,start:'13:00',end:'14:30',programId:base.programId},'2026-10-26');model.save('schedules','',{...base,start:'14:30',end:'15:40',programId:base.programId},'2026-10-26');
 const records={'2026-10-26:one':'출석','2026-10-31:one':'출석'};
 const context=vm.createContext({date:'2026-10-31',management:model,records,holidayYears:new Map([['2026',{}]]),dateSpan:(a,b)=>{const dates=[];for(let d=a;d<=b;d=Store.addDays(d,1))dates.push(d);return dates}});vm.runInContext(fs.readFileSync(require.resolve('../site/attendance-summary.js'),'utf8'),context);
 const data=context.periodAttendanceData('2026-10-26','2026-10-31');assert.equal(data.expected,5);assert.equal(data.present,1);assert.equal(data.days.length,5);assert.equal(data.days[0].present,1);assert.equal(data.days[0].expected,1);assert.equal(data.rate,20);const today=context.periodAttendanceData('2026-10-26','2026-10-26');assert.equal(today.rate,100);
});
