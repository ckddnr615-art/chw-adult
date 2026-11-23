const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../site/app.js'),'utf8'),ops=fs.readFileSync(require.resolve('../site/operations.js'),'utf8');
const helpers=app.slice(app.indexOf('function loginInputSnapshot('),app.indexOf('function render(){'));
test('로그인 화면이 다시 그려져도 입력값·커서·오류·제출 중 상태를 메모리에서만 이어받는다',()=>{
 let focused=false,selection=[];let input={value:'test-only-input',selectionStart:4,selectionEnd:8},error={textContent:'이전 안내'},button={disabled:true};
 const document={activeElement:input};const ctx=vm.createContext({document,$:selector=>selector==='#loginCode'?input:selector==='#loginError'?error:button});vm.runInContext(helpers,ctx);
 const snapshot=ctx.loginInputSnapshot();input={value:'',focus(){focused=true},setSelectionRange(...args){selection=args}};error={textContent:''};button={disabled:false};ctx.restoreLoginInput(snapshot);
 assert.equal(input.value,'test-only-input');assert.equal(focused,true);assert.deepEqual(selection,[4,8]);assert.equal(error.textContent,'이전 안내');assert.equal(button.disabled,true);
});
test('로그인 화면을 벗어났거나 새로 진입하면 이전 비밀번호를 복구하지 않는다',()=>{
 const ctx=vm.createContext({document:{},$:()=>null});vm.runInContext(helpers,ctx);assert.equal(ctx.loginInputSnapshot(),null);assert.doesNotThrow(()=>ctx.restoreLoginInput({value:'test-only-input'}));
});
test('초기 연결 중 로그인 화면이 교체돼도 실패 후 현재 로그인 버튼을 다시 활성화한다',async()=>{
 const form={},oldButton={disabled:false},newButton={disabled:true},error={textContent:''},hint={textContent:''},input={value:'test-only-input'};let currentButton=oldButton;
 const ctx=vm.createContext({page:'login',team:{configured:true,loading:false},teamBoot:Promise.resolve(),$:selector=>selector==='#loginForm'?form:selector==='#loginHint'?hint:selector==='#loginCode'?input:selector==='#loginError'?error:currentButton,fetch:async()=>{currentButton=newButton;return {ok:false,status:401}}});
 vm.runInContext(ops.slice(ops.indexOf("  if(page==='login'){"),ops.indexOf("  if(page==='dashboard')")),ctx);
 await form.onsubmit({preventDefault(){},submitter:oldButton});assert.equal(newButton.disabled,false);assert.match(error.textContent,/비밀번호/);
});
