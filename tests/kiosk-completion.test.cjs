const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../site/usability.js'),'utf8');
function setup({failure=false,closeWhileSaving=false}={}){
 const member={id:'m',name:'테스트 이용인',active:true},schedule={id:'s',program:{id:'p',name:'테스트 프로그램'},start:'10:00',end:'11:30',location:'활동실'};
 const dialog={open:true,contains:node=>node===spinner&&kind==='saving'},spinner={},close={textContent:'닫기'},heading={focus(){}},nodes={};
 let kind='',html='',status='',settle;
 const pending=new Promise((resolve,reject)=>{settle=()=>{if(closeWhileSaving)dialog.open=false;if(failure)reject(Error('통신 오류'));else{status='출석';resolve({ok:true})}}});
 const $=selector=>selector==='#dialog'?dialog:selector==='#dialogcontent .saving-spinner'?(kind==='saving'?spinner:null):selector==='#closeDialog'?close:selector==='#kioskCheckinComplete'?heading:selector==='#dialogcontent'?{querySelectorAll:()=>[]}:selector==='#confirmProgramCheckin'?(html.includes('confirmProgramCheckin')?(nodes.confirm||(nodes.confirm={})):null):selector==='#kioskReadConfirm'||selector==='#kioskBackToPhotos'||selector==='#kioskRetry'?(nodes[selector]||(nodes[selector]={})):null;
 const context=vm.createContext({team:{active:true,programCheckin:true},management:{find:()=>member,personalSchedules:()=>[schedule]},date:'2026-11-24',prettyDate:'2026년 11월 24일',status:()=>status,kioskProgramKey:()=>JSON.stringify(['s','p']),kioskProgramCheckins:{},esc:String,photoMarkup:()=>'',hydratePhotos:async()=>{},say(){},replaceKioskDialog:markup=>{html=markup;kind=markup.includes('saving-spinner')?'saving':markup.includes('kiosk-checkin-success')?'success':'other'},refreshKioskAfterDialog(){},showAbsenceNotice(){},commitAttendance:()=>pending,showKioskPhotoPicker(){},$});
 vm.runInContext(source.slice(source.indexOf('function openPublicCheckin('),source.indexOf('function bindParticipantSearch(')),context);
 context.openPublicCheckin('m',schedule);return {context,schedule,settle,confirm:()=>nodes.confirm.onclick(),html:()=>html,kind:()=>kind,close};
}
test('서버 저장 응답 전에는 기록 중이고 응답 뒤에는 이름·프로그램·확인 버튼이 있는 완료창을 표시한다',async()=>{
 const e=setup(),work=e.confirm();assert.equal(e.kind(),'saving');assert.doesNotMatch(e.html(),/출석이 완료/);e.settle();await work;
 assert.equal(e.kind(),'success');assert.match(e.html(),/테스트 이용인/);assert.match(e.html(),/테스트 프로그램/);assert.match(e.html(),/출석이 완료됐어요/);assert.equal(e.close.textContent,'확인했어요');
});
test('저장 실패는 완료로 표시하지 않고 재시도 안내를 보여준다',async()=>{
 const e=setup({failure:true}),work=e.confirm();e.settle();await work;assert.doesNotMatch(e.html(),/출석이 완료됐어요/);assert.match(e.html(),/통신 오류/);assert.match(e.html(),/다시 확인/);
});
test('저장 중 창을 닫으면 완료 응답이 다른 사람 화면을 덮어쓰지 않는다',async()=>{
 const e=setup({closeWhileSaving:true}),work=e.confirm();e.settle();await work;assert.notEqual(e.kind(),'success');
});
test('사진 카드의 완료 표시는 해당 프로그램의 출석을 구분한다',()=>{
 const ctx=vm.createContext({status:()=> '출석',kioskProgramKey:s=>s.id,kioskProgramCheckins:{done:['m']}});
 vm.runInContext(source.slice(source.indexOf('function kioskPhotoCheckinLabel('),source.indexOf('function showKioskPhotoPicker(')),ctx);
 assert.equal(ctx.kioskPhotoCheckinLabel({id:'m'},{id:'done'}),'✓ 출석 완료');assert.equal(ctx.kioskPhotoCheckinLabel({id:'m'},{id:'other'}),'');assert.equal(ctx.kioskPhotoCheckinLabel({id:'m'},null),'✓ 출석 기록 있음');
});
