const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({document:{addEventListener(){}}});vm.runInContext(fs.readFileSync(require.resolve('../site/printing.js'),'utf8'),context);
const plan=rows=>JSON.parse(JSON.stringify(context.weeklyPrintPlan(rows)));
test('오후 전체 프로그램은 두 시간 칸을 합쳐 한 번만 인쇄한다',()=>{
 const rows=plan([[['오전']],[['오후 전체']],[['오후 전체']]]);assert.equal(rows[1][0].rowSpan,2);assert.equal(rows[2][0].omit,true);assert.equal(rows.flatMap(r=>r.flatMap(c=>c.ids)).filter(id=>id==='오후 전체').length,1);
});
test('다른 프로그램 두 개와 같은 날의 서로 다른 프로그램은 합치지 않는다',()=>{
 const rows=plan([[['a'],['a']],[['b'],['c']],[['c'],['d']]]);assert.equal(rows.flat().every(c=>!c.omit&&c.rowSpan===1),true);assert.deepEqual(rows[0].map(c=>c.ids),[['a'],['a']]);
});
test('겹치는 복수 일정 중 이어지는 일정만 중복 제거하고 다른 일정은 유지한다',()=>{
 const rows=plan([[['a','b']],[['a','c']],[['a']]]);assert.deepEqual(rows.map(r=>r[0].ids),[['a','b'],['c'],[]]);assert.equal(rows[2][0].continuation,true);assert.equal(rows[1][0].omit,false);
});
test('직원 일정이 많아도 모든 내용을 유지하는 배율로 한 페이지 높이에 맞춘다',()=>{
 let last=1;const scale=context.singlePagePrintScale(s=>{last=s;return {width:1046,height:1400*s}},1047,710);
 assert.ok(scale>.5&&scale<.51);assert.ok(1400*scale<=710.5);assert.equal(last,scale);
});
test('이미 한 장에 들어가면 불필요하게 축소하지 않는다',()=>{
 assert.equal(context.singlePagePrintScale(()=>({width:1046,height:600}),1047,710),1);
});

test('담당자 변경 전후의 출석부가 날짜 기준으로 나뉘고 미지정 참여자도 포함된다',()=>{
 const Store=require('../site/domain.js');
 const adminSource=fs.readFileSync(require.resolve('../site/admin.js'),'utf8');
 const register=vm.runInNewContext(adminSource.slice(adminSource.indexOf('function caseRegisterGroups('),adminSource.indexOf('function visibleRegisterGroups('))+'\ncaseRegisterGroups',{monthDays:()=>30});
 const store=new Store(Store.seed(['소속'],[{id:'a',name:'참여자1',group:'소속'},{id:'b',name:'참여자2',group:'소속'}],[['10:00','11:30','프로그램','소속','활동실','첫 담당자']],{}));
 const previous=store.data.staff[0],next=store.save('staff','',{name:'새 담당자'},'2026-11-10');
 store.assignCaseManager('a',previous.id,'2026-10-01');store.assignCaseManager('a',next.id,'2026-11-10');
 const attendance={'2026-11-09:a':'출석','2026-11-10:a':'결석'};
 const groups=register(store,attendance,'2026-11','2026-11-18');
 const before=groups.find(g=>g.id===previous.id).rows[0].cells,after=groups.find(g=>g.id===next.id).rows[0].cells;
 assert.equal(before[8].mark,'/');assert.equal(before[9],null);
 assert.equal(after[8],null);assert.equal(after[9].mark,'O');
 assert.equal(groups.find(g=>g.id==='unassigned').rows[0].member.id,'b');
});

test('월중 신규 등록자도 등록 월 전체의 주말과 공휴일을 표시하고 등록 전 결석을 만들지 않는다',()=>{
 const Store=require('../site/domain.js'),source=fs.readFileSync(require.resolve('../site/admin.js'),'utf8');
 const register=vm.runInNewContext(source.slice(source.indexOf('function caseRegisterGroups('),source.indexOf('function visibleRegisterGroups('))+';caseRegisterGroups',{monthDays:()=>30});
 const store=new Store(Store.seed(['소속'],[],[['10:00','11:30','프로그램','소속','활동실','담당자']],{}));
 const member=store.save('members','',{name:'신규 참여자',communityId:store.list('communities')[0].id},'2026-11-20');
 const staff=store.data.staff[0];store.assignCaseManager(member.id,staff.id,'2026-11-20');
 const originalHoliday=store.holidayName.bind(store);store.holidayName=day=>day==='2026-11-02'?'휴무일':originalHoliday(day);
 const attendance={['2026-11-20:'+member.id]:'출석'};
 const snapshot=JSON.stringify(store.data),records=JSON.stringify(attendance),groups=register(store,attendance,'2026-11','2026-11-23');
 const cells=groups.find(g=>g.id===staff.id).rows[0].cells;
 assert.equal(cells.length,30);assert.equal(cells[0].mark,'휴');assert.equal(cells[1].mark,'휴');assert.equal(cells[6].mark,'휴');assert.equal(cells[7].mark,'휴');
 assert.equal(cells[2].mark,'');assert.equal(cells[2].readOnly,true);assert.equal(cells[19].mark,'/');assert.equal(cells[20].mark,'휴');
 assert.equal(JSON.stringify(store.data),snapshot);assert.equal(JSON.stringify(attendance),records);
 assert.equal(register(store,attendance,'2026-10','2026-11-23').length,0);
});
