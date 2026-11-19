const {test}=require('node:test'),assert=require('node:assert/strict'),Projection=require('../site/report-projection.js');
const entry={id:'a',memberId:'member-a',name:'가나다',date:'2026-10-26',area:'동일 영역',areaId:'area-a',program:'프로그램 A',communityId:'group-a',community:'소속 A',staff:'오전 직원',start:'10:00',end:'11:30',checked:true};
test('내보내기는 같은 영역을 한 행으로 묶고 원본 프로그램 기록은 그대로 둔다',()=>{const later={...entry,id:'b',areaId:'area-b',program:'프로그램 B',staff:'오후 직원',start:'13:00',end:'15:40'},source=[later,entry],before=JSON.stringify(source),reports=Projection.aggregate(source);assert.equal(reports.length,1);assert.equal(reports[0].staff,'오전 직원');assert.equal(reports[0].program,'동일 영역');const row=Projection.columns(reports[0]);assert.equal(row.length,14);assert.equal(row[7],'동일 영역');assert.equal(row[11],'오전 직원');assert.equal(JSON.stringify(source),before)});
test('같은 날짜 다른 영역은 각각 집계하고 모든 원본 취소 시 영역 실적을 취소한다',()=>{const reports=Projection.aggregate([{...entry,checked:false},{...entry,id:'b',start:'13:00',checked:false},{...entry,id:'c',area:'다른 영역'}]);assert.equal(reports.filter(r=>r.checked).length,1);assert.equal(reports.find(r=>r.area==='동일 영역').checked,false)});

test('같은 프로그램의 직원별 탭은 실적 한 건에 연결되고 취소된 직원 보기만 해제한다',()=>{
 const first={...entry,reportMode:'program',programId:'p1',reportStaff:[{id:'s1',name:'직원1'},{id:'s2',name:'직원2'}]};
 const later={...first,id:'b',start:'13:00',checked:false,reportStaff:[{id:'s3',name:'직원3'}]};
 const before=JSON.stringify([first,later]),reports=Projection.aggregate([first,later]);
 assert.equal(reports.length,1);
 assert.deepEqual(reports[0].reportStaff,[{id:'s1',name:'직원1',checked:true},{id:'s2',name:'직원2',checked:true},{id:'s3',name:'직원3',checked:false}]);
 assert.equal(JSON.stringify([first,later]),before);
});
