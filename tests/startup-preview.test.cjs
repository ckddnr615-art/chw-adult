const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function environment(){
 const storage=new Map(),context=vm.createContext({window:{GOOGLE_SHARED_CONFIG:{webAppUrl:'public-test-url'}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},Date,Intl,Set,esc:s=>String(s).replace(/</g,'&lt;'),ManagementStore:{programAttendanceKey:()=> 'schedule:program',scheduleSlot:()=> 'morning'},management:{schedulesOn:()=>[{id:'s',program:{id:'p',name:'<활동>'},start:'10:00',end:'11:30',location:'401호'}],eligibleMembers:()=>[{id:'private-id',name:'비공개 이용인'}]}});
 vm.runInContext(fs.readFileSync(require.resolve('../site/startup-preview.js'),'utf8'),context);return {api:context.window.KioskStartupPreview,storage};
}
test('오늘의 공개 프로그램 미리보기는 개인정보 없이 저장하고 출석 버튼을 만들지 않는다',()=>{
 const e=environment();e.api.save({scope:'today',initialized:true,date:'2026-11-26',config:{},records:{'2026-11-26:private-id':'출석'},programCheckins:{'schedule:program':['private-id']}});
 const value=e.api.read('2026-11-26');assert.equal(value.programs[0].present,1);assert.equal(value.programs[0].total,1);
 assert.doesNotMatch([...e.storage.values()][0],/private-id|비공개 이용인|token|photo/);
 const html=e.api.markup('2026-11-26');assert.match(html,/이전 확인 자료/);assert.doesNotMatch(html,/<button|data-checkin|data-kiosk-program/);assert.doesNotMatch(html,/<활동>/);
 assert.equal(e.api.read('2026-11-27'),null);
});
test('관리자 응답·만료 자료·잘못된 미리보기는 사용하지 않는다',()=>{
 const e=environment();e.api.save({scope:'admin',initialized:true,config:{}});assert.equal(e.storage.size,0);
 const key='ch-kiosk-preview:v1:public-test-url';e.storage.set(key,JSON.stringify({version:1,date:'2026-11-26',savedAt:Date.now()-43200001,programs:[]}));assert.equal(e.api.read('2026-11-26'),null);
 e.storage.set(key,'{invalid');assert.equal(e.api.read('2026-11-26'),null);
 e.storage.set(key,JSON.stringify({version:1,date:'2026-11-26',savedAt:Date.now(),programs:[{name:'x'}]}));assert.equal(e.api.read('2026-11-26'),null);
});
