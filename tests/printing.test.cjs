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
