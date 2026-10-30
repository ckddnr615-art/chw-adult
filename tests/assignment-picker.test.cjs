const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Store=require('../site/domain.js');
const context=vm.createContext({ManagementStore:Store});vm.runInContext(fs.readFileSync(require.resolve('../site/assignment-picker.js'),'utf8'),context);
function fixture(){return new Store(Store.seed(['건강','스마트'],[{id:'member-1',name:'참여자1',group:'건강'},{id:'member-2',name:'참여자2',group:'스마트'}],[['10:00','11:30','건강활동','건강','강의실','직원1'],['10:00','11:30','스마트활동','스마트','정보실','직원2']],{}))}
test('배정 후보는 현재 소속 밖 참여자와 적용일의 사례관리자·겹치는 프로그램을 표시한다',()=>{
 const store=fixture(),staff=store.list('staff')[0];store.assignCaseManager('member-2',staff.id,'2026-10-26');
 const before=JSON.stringify(store.data),result=context.assignmentCandidates(store,'schedule-1','2026-10-26');
 assert.equal(result.length,2);const other=result.find(c=>c.member.id==='member-2');assert.equal(other.staffId,staff.id);assert.equal(other.conflicts[0].name,'스마트활동');assert.equal(JSON.stringify(store.data),before);
});
test('종료·시작이 맞닿은 일정은 겹치지 않으며 날짜 지정 배정은 기존 반복을 대체한다',()=>{
 const store=fixture();store.find('schedules','schedule-2').start='11:30';store.find('schedules','schedule-2').end='12:30';
 assert.equal(context.assignmentCandidates(store,'schedule-1','2026-10-26').find(c=>c.member.id==='member-2').conflicts.length,0);
 const once=store.save('schedules','',{...store.find('schedules','schedule-1'),id:undefined,date:'2026-10-26',start:'08:00',end:'16:00',weekdays:[],audienceMode:'individual'},'2026-10-26');
 assert.equal(context.assignmentCandidates(store,once.id,'2026-10-26').find(c=>c.member.id==='member-2').conflicts.length,0);
});

test('74명 후보도 가나다순이며 동명이인과 기존 선택 자료를 유지한다',()=>{
 const store=fixture();store.data.members=[];
 const names=['최도윤','박지우','강예린','김하늘','이서준','정수빈','김하늘'];
 for(let i=0;i<74;i++)store.data.members.push({id:'person-'+String(i).padStart(3,'0'),name:names[i%names.length],communityId:'community-1',active:true,history:[{from:'2026-01-01',communityId:'community-1'}]});
 store.data.members.reverse();const before=JSON.stringify(store.data),rows=context.assignmentCandidates(store,'schedule-1','2026-10-26');
 assert.equal(rows.length,74);assert.equal(new Set(rows.map(x=>x.member.id)).size,74);
 for(let i=1;i<rows.length;i++)assert.ok(rows[i-1].member.name.localeCompare(rows[i].member.name,'ko',{numeric:true})<=0);
 assert.equal(JSON.stringify(store.data),before);
});
