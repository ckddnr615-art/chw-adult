const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),zlib=require('node:zlib');
test('Apps Script 서버 파일은 논리 대입 문법과 최신 내장 메서드에 의존하지 않는다',()=>{
 const dir=require('node:path').join(__dirname,'../apps-script');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.gs'))){const source=fs.readFileSync(require('node:path').join(dir,name),'utf8');assert.doesNotMatch(source,/\|\|=|&&=|\?\?=|Object\.hasOwn\(|\.at\(/,name);new vm.Script(source,{filename:name})}
 const e=environment();vm.runInContext('Object.hasOwn=undefined;Array.prototype.at=undefined;',e.context);
 const model=e.model();assert.equal(model.memberGroupAt(model.data.members[0],'2026-10-29'),'community-1');assert.equal(model.caseManagerAt(model.data.members[0].id,'2026-10-29'),'');assert.equal(model.programEnabled('program-1','2026-10-29'),true);
});
function environment(){
 const sheets=new Map(),cache=new Map(),files=new Map(),props=new Map([['SPREADSHEET_ID','test-book'],['STAFF_PASSWORD','test-password-123'],['SITE_ORIGINS','["https://test.pages.dev"]'],['HOLIDAY_API_KEY','test-only-holiday-key'],['SHEET_TAB_MAP','{"community-1":"검증 실적"}'],['PHOTOS_FOLDER_ID','private-test-folder']]);let failNext=false;
 class Sheet{
  constructor(name){this.name=name;this.rows=[];this.id=sheets.size+1}
  getSheetId(){return this.id}setName(name){if(sheets.has(name)&&sheets.get(name)!==this)throw Error('Duplicate sheet');sheets.delete(this.name);this.name=name;sheets.set(name,this);return this}
  getName(){return this.name}getLastRow(){return this.rows.length}getMaxRows(){return 10000}hideSheet(){}appendRow(row){this.rows.push(row)}insertRowsAfter(){}
  getRange(row,col,height=1,width=1){const sheet=this;return {getValue(){return sheet.rows[row-1]?.[col-1]||''},getValues(){return Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>sheet.rows[row+i-1]?.[col+j-1]??''))},getDisplayValues(){return this.getValues().map(r=>r.map(String))},setNumberFormat(){return this},setValue(v){return this.setValues([[v]])},setValues(values){if(failNext&&sheet.name.includes('_M_')){failNext=false;throw Error('모의 저장 실패')}values.forEach((r,i)=>r.forEach((v,j)=>{sheet.rows[row+i-1]??=[];sheet.rows[row+i-1][col+j-1]=v}));return this},clearContent(){return this.setValues(Array.from({length:height},()=>Array(width).fill('')))}}}
 }
 const book={getSheetByName:n=>sheets.get(n),getSheets:()=>[...sheets.values()],insertSheet:n=>{const sheet=new Sheet(n);sheets.set(n,sheet);return sheet}};
 function blob(data,type){const buffer=typeof data==='string'?Buffer.from(data):Buffer.from(data);return {getBytes:()=>[...buffer],getDataAsString:()=>buffer.toString('utf8'),getContentType:()=>type}}
 const context=vm.createContext({console,SpreadsheetApp:{openById:()=>book,flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:n=>props.get(n)||null,setProperty:(n,v)=>props.set(n,v)})},CacheService:{getScriptCache:()=>({get:n=>cache.get(n)||null,put:(n,v)=>cache.set(n,v),remove:n=>cache.delete(n)})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),formatDate:()=> '2026-10-29',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,v)=>[...crypto.createHash('sha256').update(typeof v==='string'?v:Buffer.from(v)).digest()],base64Encode:b=>Buffer.from(b).toString('base64'),base64Decode:s=>[...Buffer.from(s,'base64')],newBlob:blob,gzip:b=>{if(!b.getContentType())throw Error('Blob content type must not be null');return blob(zlib.gzipSync(Buffer.from(b.getBytes())),'application/x-gzip')},ungzip:b=>{if(!b.getContentType())throw Error('Blob content type must not be null');assert.equal(b.getContentType(),'application/x-gzip');return blob(zlib.gunzipSync(Buffer.from(b.getBytes())),'application/json')}},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({response:{header:{resultCode:'00'},body:{totalCount:1,items:{item:{locdate:20260101,isHoliday:'Y',dateName:'신정'}}}}})})},DriveApp:{getFolderById:()=>({createFile:b=>{const id=crypto.randomUUID();files.set(id,b);return {getId:()=>id}}}),getFileById:id=>({getBlob:()=>files.get(id)})}});
 for(const name of ['Domain.gs','ReportProjection.gs','Holidays.gs','ReportWriter.gs','SharedServer.gs'])vm.runInContext(fs.readFileSync(require.resolve('../apps-script/'+name),'utf8'),context,{filename:name});
 const channel=crypto.randomUUID();let token='';const call=(path,input={},method='POST',origin='https://test.pages.dev')=>JSON.parse(JSON.stringify(context.sharedRpc({path,input,method,token},origin,channel)));
 const login=()=>{const r=call('/api/integration-login',{password:'test-password-123'});assert.equal(r.status,200);token=r.body.token};
 const model=()=>{const Store=context.ManagementStore;return new Store(Store.seed(['검증 소속'],[{id:'person-1',name:'검증 이용인',group:'검증 소속'}],[['10:00','11:30','첫 활동','검증 소속','실','직원1']],{}))};
 return {call,login,model,sheets,files,props,context,fail:()=>{failNext=true},logout:()=>{call('/api/integration-logout');token=''}};
}
test('저장 자료를 복원할 때 gzip 콘텐츠 유형을 지정하고 기존 한글 자료를 그대로 읽는다',()=>{
 const e=environment(),book=e.context.SpreadsheetApp.openById('test-book'),data={name:'충현복지관',count:0,active:false,labels:['출석','결석']};
 const descriptor=e.context.sharedWrite_(book,'TEST',null,data);
 assert.deepEqual(JSON.parse(JSON.stringify(e.context.sharedRead_(book,descriptor,null))),data);
 assert.equal(e.sheets.size,1);
});
test('웹앱 초기 설정 오류는 주소 설정과 HTML 파일 오류를 구분하고 HTML을 이스케이프한다',()=>{
 const e=environment();e.context.HtmlService={createHtmlOutput:text=>({text}),createTemplateFromFile:()=>{throw Error('Missing <Bridge>')}};
 const input={parameter:{mode:'bridge',origin:'https://test.pages.dev',channel:'diagnostic-valid-channel-20261030'}};
 e.props.set('SITE_ORIGINS','https://test.pages.dev');assert.match(e.context.doGet(input).text,/오류 위치: 허용 사이트 설정/);
 e.props.set('SITE_ORIGINS','["https://test.pages.dev"]');const result=e.context.doGet(input).text;assert.match(result,/Bridge.html 파일 불러오기/);assert.match(result,/Missing &lt;Bridge&gt;/);assert.doesNotMatch(result,/<Bridge>/);
});
test('Google 공동 저장은 허용 사이트와 직원 인증을 검사한다',()=>{const e=environment();assert.equal(e.call('/api/team/status',{},'GET','https://evil.test').status,403);assert.equal(e.call('/api/team/config',{changes:[]}).status,401);assert.equal(e.call('/api/integration-login',{password:'wrong'}).status,401);e.login();assert.equal(e.call('/api/team/status',{},'GET').body.authenticated,true);e.logout();assert.equal(e.call('/api/team/status',{},'GET').body.authenticated,false)});
test('정적 사이트 출석은 공유 저장·영역 중복 제거·담당자·취소까지 이어진다',()=>{const e=environment();e.login();const model=e.model(),staff=model.save('staff','',{name:'오후직원'},'2026-10-29'),program=model.save('programs','',{name:'두번째 활동',areaId:'area-1',facilitatorIds:[staff.id]},'2026-10-29');model.save('schedules','',{programId:program.id,communityId:'community-1',start:'13:00',end:'14:30',location:'실',weekdays:[1,2,3,4,5],facilitatorIds:[staff.id],audienceMode:'community'},'2026-10-29');assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);
 const command={memberId:'person-1',requestId:crypto.randomUUID()};assert.equal(e.call('/api/team/checkin',command).status,200);assert.equal(e.call('/api/team/checkin',command).body.replayed,true);let state=e.call('/api/team/state?month=2026-10&since=0',{},'GET').body;assert.equal(state.records['2026-10-29:person-1'],'출석');assert.equal(state.entries.filter(r=>r.checked).length,2);let sheet=e.sheets.get('검증 실적');assert.equal(sheet.getLastRow(),2);assert.equal(sheet.rows[1][11],'직원1');assert.equal(sheet.rows[1][7],'신체적 건강');assert.equal(e.call('/api/team/attendance',{memberId:'person-1',date:'2026-10-29',status:'결석',requestId:crypto.randomUUID()}).status,200);assert.equal(sheet.rows[1][0],'');state=e.call('/api/team/state?month=2026-10',{},'GET').body;assert.equal(state.entries.some(r=>r.checked),false);
});
test('저장 중 실패하면 이전 월 자료 포인터가 유지되고 같은 요청 재시도로 복구한다',()=>{const e=environment();e.login();e.call('/api/team/initialize',{management:e.model().data,records:{}});const command={memberId:'person-1',requestId:crypto.randomUUID()};e.fail();assert.equal(e.call('/api/team/checkin',command).status,500);assert.equal(e.call('/api/team/state?month=2026-10',{},'GET').body.records['2026-10-29:person-1'],undefined);assert.equal(e.call('/api/team/checkin',command).status,200);assert.equal(e.call('/api/team/state?month=2026-10',{},'GET').body.records['2026-10-29:person-1'],'출석')});
test('같은 항목 동시 수정은 덮어쓰지 않고 충돌로 반환한다',()=>{const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});const before=JSON.parse(JSON.stringify(model.data.communities[0])),after={...before,name:'새 소속'};assert.equal(e.call('/api/team/config',{changes:[{type:'communities',id:before.id,before,after}]}).status,200);assert.equal(e.call('/api/team/config',{changes:[{type:'communities',id:before.id,before,after:{...before,name:'다른 변경'}}]}).status,409)});
test('사진 저장 기준의 속성 순서가 바뀌어도 같은 참여자 자료를 다른 직원 수정으로 판정하지 않는다',()=>{
 const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});
 function reorder(value){if(Array.isArray(value))return value.map(reorder);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).reverse().map(k=>[k,reorder(value[k])]));return value}
 const before=reorder(model.data.members[0]),after={...before,photo:{id:'test-photo',url:'/api/team/photos/test-photo/v1',bytes:12000,x:50,y:50,zoom:1,cropVersion:2}};
 assert.equal(e.call('/api/team/config',{changes:[{type:'members',id:before.id,before,after}]}).status,200);
 const state=e.call('/api/team/state?month=2026-10',{},'GET').body;assert.equal(state.config.members[0].photo.id,'test-photo');
});
test('설정 저장 응답을 놓쳐 같은 요청을 반복해도 자기 수정 충돌이나 추가 쓰기가 생기지 않는다',()=>{
 const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});
 const before=JSON.parse(JSON.stringify(model.data.communities[0])),after={...before,name:'재전송 검증 소속'},request={changes:[{type:'communities',id:before.id,before,after}]};
 assert.equal(e.call('/api/team/config',request).status,200);const revision=e.call('/api/team/state?month=2026-10',{},'GET').body.revision;
 assert.equal(e.call('/api/team/config',request).status,200);assert.equal(e.call('/api/team/state?month=2026-10',{},'GET').body.revision,revision);
});
test('Drive 사진은 공개 파일 URL 대신 저장 API로 전달하며 반복 업로드는 재사용한다',()=>{const e=environment();e.login();const id=crypto.randomUUID(),dataUrl='data:image/jpeg;base64,'+Buffer.from([255,216,255,217]).toString('base64'),first=e.call('/api/team/photo',{id,dataUrl});assert.equal(first.status,200);const second=e.call('/api/team/photo',{id,dataUrl});assert.equal(second.body.url,first.body.url);assert.equal(e.files.size,1);const get=e.call(first.body.url,{},'GET');assert.equal(get.mime,'image/jpeg');assert.equal(get.binary,dataUrl.split(',')[1])});
function enableSharedDrive(e){
 const created=[],reads=[];let status=200;
 e.context.Drive={Files:{create(metadata,blob,options){assert.equal(options.supportsAllDrives,true);assert.equal(options.fields,'id');const id=crypto.randomUUID();created.push({metadata,options,id});e.files.set(id,blob);return {id}}}};
 e.context.ScriptApp={getOAuthToken:()=> 'private-test-only-token'};
 e.context.UrlFetchApp.fetch=(url,options)=>{
  const match=/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?alt=media&supportsAllDrives=true$/.exec(url);assert.ok(match);assert.equal(options.headers.Authorization,'Bearer private-test-only-token');assert.equal(options.followRedirects,false);
  const id=decodeURIComponent(match[1]);reads.push(id);return {getResponseCode:()=>status,getBlob:()=>e.files.get(id),getContentText:()=> 'private failure body'};
 };
 e.context.DriveApp={getFolderById(){throw Error('Must use shared-drive API')},getFileById(){throw Error('Must use shared-drive API')}};
 return {created,reads,setStatus:v=>{status=v}};
}
test('공유 드라이브 지정 폴더에 비공개 축소본을 저장하고 중복 전송을 재사용한다',()=>{
 const e=environment(),drive=enableSharedDrive(e),id=crypto.randomUUID(),dataUrl='data:image/jpeg;base64,/9j/2Q==';e.props.set('PHOTOS_FOLDER_ID','institution-shared-folder');
 assert.equal(e.call('/api/team/photo',{id,dataUrl}).status,401);assert.equal(drive.created.length,0);
 e.login();const first=e.call('/api/team/photo',{id,dataUrl});assert.equal(first.status,200);assert.equal(drive.created.length,1);assert.deepEqual(Array.from(drive.created[0].metadata.parents),['institution-shared-folder']);assert.equal(drive.created[0].metadata.mimeType,'image/jpeg');assert.equal(drive.created[0].metadata.permissions,undefined);
 assert.equal(e.call('/api/team/photo',{id,dataUrl}).body.url,first.body.url);assert.equal(drive.created.length,1);assert.equal(e.call(first.body.url,{},'GET').binary,'/9j/2Q==');
});
test('공유 드라이브 전환 뒤에도 기존 사진 파일 ID를 유지하고 새 사진만 새 폴더에 저장한다',()=>{
 const e=environment();e.login();const old=e.call('/api/team/photo',{id:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,/9j/2Q=='}),oldId=[...e.files.keys()][0];
 const drive=enableSharedDrive(e);e.props.set('PHOTOS_FOLDER_ID','new-shared-folder');assert.equal(e.call(old.body.url,{},'GET').binary,'/9j/2Q==');assert.equal(drive.reads[0],oldId);
 assert.equal(e.call('/api/team/photo',{id:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,/9j/2Q=='}).status,200);assert.equal(drive.created.length,1);assert.equal(drive.created[0].metadata.parents[0],'new-shared-folder');assert.equal(e.files.has(oldId),true);assert.equal(e.files.size,2);
});
test('공유 사진 접근 권한 오류는 OAuth 토큰과 응답 본문을 노출하지 않는다',()=>{
 const e=environment(),drive=enableSharedDrive(e);e.login();const photo=e.call('/api/team/photo',{id:crypto.randomUUID(),dataUrl:'data:image/jpeg;base64,/9j/2Q=='});drive.setStatus(403);
 const response=e.call(photo.body.url,{},'GET');assert.equal(response.status,500);assert.match(response.body.error,/접근 권한.*HTTP 403/);assert.doesNotMatch(JSON.stringify(response),/private-test-only-token|private failure body/);
});
test('기존 자료 초기화 덮어쓰기와 관리자 미인증 출결 정정을 차단한다',()=>{const e=environment();e.login();e.call('/api/team/initialize',{management:e.model().data,records:{}});assert.equal(e.call('/api/team/initialize',{management:e.model().data,records:{}}).status,409);e.logout();assert.equal(e.call('/api/team/attendance',{memberId:'person-1',date:'2026-10-29',status:'결석',requestId:crypto.randomUUID()}).status,401)});
test('공개 출석 응답은 숨긴 상세 실적 대신 실제 시트 저장 건수를 반환한다',()=>{
 const e=environment();e.login();e.call('/api/team/initialize',{management:e.model().data,records:{}});e.logout();
 const request={memberId:'person-1',requestId:crypto.randomUUID()},result=e.call('/api/team/checkin',request);
 assert.deepEqual(result.body.reportReceipt,{areaCount:1,synced:1,pending:0,failed:0,mappingMissing:false,noSchedule:false});
 assert.deepEqual(e.call('/api/team/state?month=2026-10',{},'GET').body.entries,[]);
 assert.deepEqual(e.call('/api/team/checkin',request).body.reportReceipt,result.body.reportReceipt);
});
test('실적 탭 미설정은 출석을 보존하고 연결 복구 뒤 재전송으로 기존 실적을 저장한다',()=>{
 const e=environment();e.props.delete('SHEET_TAB_MAP');e.login();e.call('/api/team/initialize',{management:e.model().data,records:{}});
 const request={memberId:'person-1',requestId:crypto.randomUUID()},result=e.call('/api/team/checkin',request);
 assert.equal(result.body.reportReceipt.mappingMissing,true);assert.equal(result.body.reportReceipt.pending,1);assert.equal(result.body.reportReceipt.synced,0);
 assert.equal(e.call('/api/team/state?month=2026-10',{},'GET').body.records['2026-10-29:person-1'],'출석');
 e.props.set('SHEET_TAB_MAP','{"community-1":"검증 실적"}');assert.equal(e.call('/api/team/sync').status,200);
 assert.equal(e.sheets.get('검증 실적').rows[1][0],'검증 이용인');assert.equal(e.call('/api/team/checkin',request).body.reportReceipt.synced,1);
});
test('프로그램 미배정과 시트 쓰기 실패를 출석 성공 뒤 별도로 구분한다',()=>{
 const e=environment();e.login();const model=e.model();model.data.schedules=[];e.call('/api/team/initialize',{management:model.data,records:{}});
 const result=e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});assert.equal(result.body.reportReceipt.noSchedule,true);assert.equal(result.body.reportReceipt.synced,0);
 const other=environment();other.login();other.call('/api/team/initialize',{management:other.model().data,records:{}});other.context.writeProjectedPerformance_=()=>{throw Error('모의 시트 쓰기 실패')};
 const failed=other.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});assert.equal(failed.body.reportReceipt.failed,1);assert.equal(failed.body.reportReceipt.synced,0);
});
test('실적 연결 준비는 실제 소속 ID로 탭을 생성하고 보관된 대기 실적을 전송할 수 있다',()=>{
 const e=environment();e.props.delete('SHEET_TAB_MAP');e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});
 const result=e.context.configurePerformanceSheets_('test-book');assert.equal(result.queued,1);assert.equal(result.mapping[0].tab,'검증 소속 실적 기록');assert.equal(JSON.parse(e.props.get('SHEET_TAB_MAP'))['community-1'],'검증 소속 실적 기록');
 assert.equal(e.sheets.get('검증 소속 실적 기록').rows[0][11],'담당자');e.call('/api/team/sync');assert.equal(e.sheets.get('검증 소속 실적 기록').rows[1][0],'검증 이용인');
 assert.equal(e.context.configurePerformanceSheets_('test-book').queued,0);assert.equal(e.sheets.get('검증 소속 실적 기록').getLastRow(),2);
});
test('실적 연결 준비는 다른 시트와 미초기화 자료 또는 기존 열이 다른 탭을 변경하지 않는다',()=>{
 const e=environment();assert.throws(()=>e.context.configurePerformanceSheets_('wrong-book'),/SPREADSHEET_ID/);assert.throws(()=>e.context.configurePerformanceSheets_('test-book'),/공동 자료가 없습니다/);
 e.login();const model=e.model();model.save('communities','',{name:'두번째 소속'},'2026-10-29');e.call('/api/team/initialize',{management:model.data,records:{}});e.props.set('SHEET_TAB_MAP','{"community-1":"정상 탭"}');
 const book=e.context.SpreadsheetApp.openById('test-book'),bad=book.insertSheet('두번째 소속 실적 기록');bad.appendRow(['수기 자료']);
 assert.throws(()=>e.context.configurePerformanceSheets_('test-book'),/기존 열 배치/);assert.equal(e.sheets.has('정상 탭'),false);assert.equal(bad.rows[0][0],'수기 자료');assert.equal(e.props.get('SHEET_TAB_MAP'),'{"community-1":"정상 탭"}');
});
test('소속 이름 변경은 같은 시트 탭을 바꾸고 기존 행·수기 자료·취소 연결을 유지한다',()=>{
 const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});
 const sheet=e.sheets.get('검증 실적'),sheetId=sheet.getSheetId();sheet.getRange(2,2).setValue('수기 내용');const before=JSON.parse(JSON.stringify(model.data.communities[0])),after={...before,name:'새 이름'};
 const request={changes:[{type:'communities',id:before.id,before,after}]};assert.equal(e.call('/api/team/config',request).status,200);
 assert.equal(e.sheets.has('검증 실적'),false);assert.equal(e.sheets.get('새 이름 실적 기록').getSheetId(),sheetId);assert.equal(sheet.rows[1][1],'수기 내용');assert.equal(sheet.rows[1][0],'검증 이용인');
 assert.equal(e.call('/api/team/config',request).body.replayed,true);
 assert.equal(e.call('/api/team/attendance',{memberId:'person-1',date:'2026-10-29',status:'결석',requestId:crypto.randomUUID()}).body.reportReceipt.failed,0);assert.equal(sheet.rows[1][0],'');assert.equal(sheet.rows[1][1],'수기 내용');
});
test('중복 탭 이름은 기존 소속과 실적을 변경하지 않고 거절한다',()=>{
 const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});e.context.SpreadsheetApp.openById('test-book').insertSheet('이미 있는 소속 실적 기록');
 const before=JSON.parse(JSON.stringify(model.data.communities[0]));const response=e.call('/api/team/config',{changes:[{type:'communities',id:before.id,before,after:{...before,name:'이미 있는 소속'}}]});assert.equal(response.status,500);assert.match(response.body.error,/이미 있습니다/);
 assert.equal(e.sheets.get('검증 실적').rows[1][0],'검증 이용인');assert.equal(e.call('/api/team/state?month=2026-10',{},'GET').body.config.communities[0].name,before.name);
});
test('탭 변경 중 응답 오류가 나도 안정된 시트 ID로 재시도하고 중복 탭 없이 복구한다',()=>{
 const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});
 const sheet=e.sheets.get('검증 실적'),rename=sheet.setName.bind(sheet);let once=true;sheet.setName=name=>{rename(name);if(once){once=false;throw Error('모의 응답 유실')}return sheet};
 const before=JSON.parse(JSON.stringify(model.data.communities[0])),request={changes:[{type:'communities',id:before.id,before,after:{...before,name:'복구된 소속'}}]};
 assert.equal(e.call('/api/team/config',request).status,500);assert.equal(e.call('/api/team/config',request).status,200);assert.equal(e.sheets.get('복구된 소속 실적 기록'),sheet);assert.equal(sheet.getLastRow(),2);
 assert.equal(e.call('/api/team/attendance',{memberId:'person-1',date:'2026-10-29',status:'결석',requestId:crypto.randomUUID()}).body.reportReceipt.failed,0);
});
test('참여자 소속 이동 뒤 새 출석은 새 탭으로 가고 이전 출석 취소는 이전 탭에만 적용한다',()=>{
 const e=environment();e.login();const Store=e.context.ManagementStore,model=new Store(Store.seed(['첫 소속','둘째 소속'],[{id:'person-1',name:'이동 이용인',group:'첫 소속'}],[['10:00','11:30','첫 활동','첫 소속','실','직원1'],['10:00','11:30','다른 활동','둘째 소속','실','직원2']],{}));
 e.props.set('SHEET_TAB_MAP','{"community-1":"첫 실적","community-2":"둘째 실적"}');e.call('/api/team/initialize',{management:model.data,records:{}});assert.equal(e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()}).body.reportReceipt.synced,1);
 const before=JSON.parse(JSON.stringify(model.data.members[0]));model.save('members','person-1',{name:before.name,communityId:'community-2'},'2026-10-30');const after=JSON.parse(JSON.stringify(model.data.members[0]));assert.equal(e.call('/api/team/config',{changes:[{type:'members',id:before.id,before,after}]}).status,200);
 e.context.Utilities.formatDate=()=> '2026-10-30';assert.equal(e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()}).body.reportReceipt.synced,1);
 assert.equal(e.sheets.get('첫 실적').rows[1][6],'2026-10-29');assert.equal(e.sheets.get('둘째 실적').rows[1][6],'2026-10-30');
 assert.equal(e.call('/api/team/attendance',{memberId:'person-1',date:'2026-10-29',status:'결석',requestId:crypto.randomUUID()}).body.reportReceipt.failed,0);assert.equal(e.sheets.get('첫 실적').rows[1][0],'');assert.equal(e.sheets.get('둘째 실적').rows[1][0],'이동 이용인');
});
test('74명 출석도 원본·월 저장·소속별 영역 출력이 누락 없이 유지된다',()=>{const e=environment();e.login();const model=e.model();for(let i=2;i<=74;i++)model.save('members','',{name:'검증 이용인 '+i,communityId:'community-1'},'2026-01-01');assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);for(const member of model.data.members)assert.equal(e.call('/api/team/checkin',{memberId:member.id,requestId:crypto.randomUUID()}).status,200);const state=e.call('/api/team/state?month=2026-10',{},'GET').body;assert.equal(Object.values(state.records).filter(v=>v==='출석').length,74);assert.equal(state.entries.filter(e=>e.checked).length,74);assert.equal(e.sheets.get('검증 실적').getLastRow(),75)});

function variableScheduleFixture(e){
 const model=e.model(),d='2026-11-04';
 const first=model.data.schedules[0];
 const staff=model.data.staff[0];
 const other=model.save('programs','',{name:'오후 활동',areaId:model.data.areas[0].id,facilitatorIds:[staff.id]},d);
 const afternoon=model.save('schedules','',{programId:other.id,weekdays:[3],start:'13:00',end:'14:30',
  location:'활동실',communityId:'community-1',audienceMode:'community',facilitatorIds:[staff.id]},d);
 return {model,first,other,afternoon,staff};
}

test('첫째 수요일 오후 일정은 시간표와 자동 시트 실적에서 함께 제외된다',()=>{
 const e=environment();e.login();
 const {model,first,afternoon}=variableScheduleFixture(e);
 assert.equal(model.schedulesOn('2026-11-04').some(s=>s.id===afternoon.id),false);
 assert.equal(model.schedulesOn('2026-11-11').some(s=>s.id===afternoon.id),true);
 assert.equal(model.schedulesOn('2026-11-04').some(s=>s.id===first.id),true);
 e.context.Utilities.formatDate=()=> '2026-11-04';
 assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);
 assert.equal(e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()}).body.reportReceipt.synced,1);
 const state=e.call('/api/team/state?month=2026-11',{},'GET').body;
 assert.deepEqual(state.entries.map(x=>x.scheduleId),[first.id]);
 assert.equal(e.sheets.get('검증 실적').getLastRow(),2);
});

test('프로그램별 회차 모아보기와 오후 불참 정정은 같은 영역의 오전 실적을 보존한다',()=>{
 const groups=require('../site/program-attendance.js'),e=environment();e.login();
 const {model,first,afternoon,staff}=variableScheduleFixture(e),d='2026-11-11';
 const second=model.save('schedules','',{programId:first.programId,weekdays:[3],start:'14:30',end:'15:40',location:'활동실',
  communityId:'community-1',audienceMode:'community',facilitatorIds:[staff.id]},d);
 e.context.Utilities.formatDate=()=>d;
 assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);
 const check=()=>e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()});
 assert.equal(check().body.reportReceipt.synced,1);
 const read=()=>e.call('/api/team/state?month=2026-11',{},'GET').body;
 const before=read();
 const view=groups(new e.context.ManagementStore({...before.config,entries:before.entries}),before.records,d,staff.id);
 const grouped=view.find(g=>g.id===first.programId);
 assert.equal(grouped.count,1);assert.equal(grouped.sessions.map(item=>item.scheduleId).join(','),[first.id,second.id].join(','));
 for(const schedule of [afternoon,second]){
  const entry=read().entries.find(x=>x.scheduleId===schedule.id);
  const update={memberId:'person-1',date:d,scheduleId:schedule.id,entryId:entry.id,expectedVersion:entry.version,checked:false};
  assert.equal(e.call('/api/team/program-attendance',update).body.reportReceipt.synced,1);
  assert.equal(e.call('/api/team/program-attendance',{...update,checked:true}).status,409);
 }
 assert.equal(check().body.replayed,true);
 const after=read();assert.equal(after.records[d+':person-1'],'출석');
 assert.deepEqual(after.entries.filter(x=>x.checked).map(x=>x.scheduleId),[first.id]);
 const sheet=e.sheets.get('검증 실적'); assert.equal(sheet.getLastRow(),2);assert.equal(sheet.rows[1][0],'검증 이용인');
});

test('일정 변경과 출석 요청이 교차해도 기본 보존과 선택 재계산이 구분되고 동시 변경이 감지된다',()=>{
 const e=environment();e.login();
 const {model,first,other,staff}=variableScheduleFixture(e),d='2026-11-11';
 e.context.Utilities.formatDate=()=>d;
 e.call('/api/team/initialize',{management:model.data,records:{}});
 const request={memberId:'person-1',requestId:crypto.randomUUID()};
 const check=()=>e.call('/api/team/checkin',request);
 assert.equal(check().status,200);
 let lockBusy=true;
 e.context.LockService.getScriptLock=()=>({tryLock:()=>!lockBusy,releaseLock(){}});
 assert.equal(check().body.busy,true);lockBusy=false;
 const state=()=>e.call('/api/team/state?month=2026-11',{},'GET').body;
 const schedule={kind:'replace',programId:other.id,start:'10:40',end:'11:30',location:'새 장소',facilitatorIds:[staff.id],reason:'장소 변경'};
 const original=JSON.parse(JSON.stringify(model.setDayOverride(first.id,d,schedule)));
 const change=(before,after)=>e.call('/api/team/config',{changes:[{type:'scheduleOverrides',id:after.id,before,after}]});
 assert.equal(change(null,original).body.reconcile,false);
 assert.equal(change(null,{...original,reason:'다른 직원 변경'}).status,409);
 assert.equal(check().body.replayed,true);
 assert.equal(state().entries.find(x=>x.checked&&x.scheduleId===first.id).start,'10:00');
 assert.equal(change(original,{...original,recalculateAttendance:true}).body.reconcile,true);
 e.call('/api/team/maintenance');
 const current=state().entries.filter(x=>x.checked&&x.scheduleId===first.id);
 assert.equal(current.length,1);assert.equal(current[0].start,'10:40');assert.equal(current[0].programId,other.id);
 const edit={memberId:'person-1',date:d,status:'결석',expectedStatus:'출석',requestId:crypto.randomUUID()};
 assert.equal(e.call('/api/team/attendance',edit).status,200);
 assert.equal(check().body.currentStatus,'결석');
 assert.equal(e.call('/api/team/attendance',{...edit,status:'',requestId:crypto.randomUUID()}).status,409);
});

test('직원 9명의 개별 세션이 서로 구분되고 변경 이력에 수정자가 기록된다',()=>{
 const e=environment(),model=e.model();e.login();
 const accounts={},password='test-only-personal-password';
 for(let i=1;i<=9;i++){
  const staff=model.save('staff','',{name:'검증 직원 '+i},'2026-10-29');
  const salt=crypto.randomUUID();
  accounts['staff'+i]={staffId:staff.id,salt,passwordHash:crypto.createHash('sha256').update(salt+':'+password).digest('hex')};
 }
 e.props.set('STAFF_ACCOUNTS',JSON.stringify(accounts));
 e.call('/api/team/initialize',{management:model.data,records:{}});
 const client=(username)=>{
  const channel=crypto.randomUUID(),origin='https://test.pages.dev';
  const rpc=(path,input,token,method='POST')=>e.context.sharedRpc({path,input,token,method},origin,channel);
  const login=rpc('/api/integration-login',{username,password});
  assert.equal(login.status,200);
  assert.equal(rpc('/api/team/status',{},login.body.token,'GET').body.staffId,accounts[username].staffId);
  return (path,input,method)=>rpc(path,input,login.body.token,method);
 };
 const clients=Object.keys(accounts).map(client);
 const member=JSON.parse(JSON.stringify(model.data.members[0]));
 assert.equal(clients[8]('/api/team/config',{changes:[{type:'members',id:member.id,before:member,after:{...member,name:'수정된 이름'}}]}).status,200);
 assert.equal(clients[0]('/api/team/state?month=2026-10',{},'GET').body.audit.slice(-1)[0].actor,'검증 직원 9');
});
test('서로 다른 개인 배정과 대체 참여를 프로그램별로 모아 별도 영역을 기록한다',()=>{
 const e=environment();e.login();
 const {model,first,staff}=variableScheduleFixture(e),day='2026-11-11';
 const second=model.save('members','',{name:'오후 참여자',communityId:'community-1'},day);
 const area=model.save('areas','',{name:'창작 활동'},day);
 const program=model.save('programs','',{name:'오후 창작',areaId:area.id,facilitatorIds:[staff.id]},day);
 const session=model.save('schedules','',{date:day,programId:program.id,start:'14:30',end:'15:40',
  location:'활동실',audienceMode:'individual',facilitatorIds:[staff.id]},day);
 model.assignParticipants(first.id,['person-1'],day,'individual');
 model.assignParticipants(session.id,[second.id],day,'individual');
 e.context.Utilities.formatDate=()=>day;
 assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);
 for(const memberId of ['person-1',second.id])assert.equal(e.call('/api/team/checkin',{memberId,requestId:crypto.randomUUID()}).status,200);
 const state=()=>e.call('/api/team/state?month=2026-11',{},'GET').body;
 const secondReport=state().entries.find(r=>r.memberId===second.id&&r.scheduleId===session.id);
 assert.ok(secondReport);
 const add={memberId:'person-1',date:day,scheduleId:session.id,expectedVersion:0,checked:true};
 assert.equal(e.call('/api/team/program-attendance',add).body.reportReceipt.synced,2);
 assert.equal(e.call('/api/team/program-attendance',add).status,409);
 const current=state();
 const groups=require('../site/program-attendance.js')(new e.context.ManagementStore({...current.config,entries:current.entries}),current.records,day);
 assert.equal(groups.find(group=>group.id===program.id).count,2);
 assert.equal(groups.find(group=>group.id===program.id).sessions[0].rows.map(row=>row.memberId).sort().join(','),['person-1',second.id].sort().join(','));
 const rows=e.sheets.get('검증 실적').rows.slice(1);
 assert.equal(rows.filter(row=>row[7]==='창작 활동').length,2);
});

test('출석 확정이 실적 전송보다 먼저 반환되고 자동 작업이 대기 실적을 한 번만 입력한다',()=>{
 const e=environment();e.login();
 assert.equal(e.call('/api/team/initialize',{management:e.model().data,records:{}}).status,200);
 e.context.ScriptApp={getProjectTriggers:()=>[{getHandlerFunction:()=>'flushSharedReportQueue_'}]};
 const request={memberId:'person-1',requestId:crypto.randomUUID(),deferReports:true};
 const saved=e.call('/api/team/checkin',request);
 assert.equal(saved.status,200);
 assert.equal(saved.body.reportReceipt.pending,1);
 assert.equal(saved.body.reportReceipt.synced,0);
 assert.equal(e.sheets.has('검증 실적'),false);
 const state=e.call('/api/team/state?month=2026-10',{},'GET').body;
 assert.equal(saved.body.revision,state.revision);
 assert.equal(state.records['2026-10-29:person-1'],'출석');
 e.context.flushSharedReportQueue_();
 e.context.flushSharedReportQueue_();
 const replay=e.call('/api/team/checkin',request);
 assert.equal(replay.body.replayed,true);
 assert.equal(replay.body.reportReceipt.synced,1);
 assert.equal(e.sheets.get('검증 실적').getLastRow(),2);
});

test('자동 작업이 없으면 출석 중 실적 전송으로 돌아간다',()=>{
 const e=environment();e.login();e.context.ScriptApp={getProjectTriggers:()=>[]};
 e.call('/api/team/initialize',{management:e.model().data,records:{}});
 assert.equal(e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID(),deferReports:true}).body.reportReceipt.synced,1);
});

test('관리자가 기록한 결석은 오래된 출석 버튼과 이전 요청 재전송으로 바뀌지 않는다',()=>{
 const e=environment(),day='2026-10-29',memberId='person-1';
 e.login();
 assert.equal(e.call('/api/team/initialize',{management:e.model().data,records:{}}).status,200);
 const oldRequest={memberId,requestId:crypto.randomUUID()};
 assert.equal(e.call('/api/team/checkin',oldRequest).body.reportReceipt.synced,1);
 assert.equal(e.call('/api/team/attendance',{memberId,date:day,status:'결석',expectedStatus:'출석',requestId:crypto.randomUUID()}).status,200);
 const read=()=>e.call('/api/team/state?month=2026-10',{},'GET').body;
 const revision=read().revision;
 e.logout();
 for(const request of [oldRequest,{memberId,expectedStatus:'',deferReports:true,requestId:crypto.randomUUID()}]){
  const denied=e.call('/api/team/checkin',request);
  assert.equal(denied.status,409);
  assert.equal(denied.body.code,'ABSENCE_LOCKED');
  assert.equal(denied.body.currentStatus,'결석');
  assert.equal(denied.body.revision,revision);
 }
 assert.equal(read().records[day+':'+memberId],'결석');
 assert.equal(read().revision,revision);
 assert.equal(e.sheets.get('검증 실적').rows[1][0],'');
 assert.equal(e.call('/api/team/attendance',{memberId,date:day,status:'출석',requestId:crypto.randomUUID()}).status,401);
 e.login();
 assert.equal(e.call('/api/team/attendance',{memberId,date:day,status:'출석',expectedStatus:'결석',requestId:crypto.randomUUID()}).body.reportReceipt.synced,1);
 assert.equal(read().records[day+':'+memberId],'출석');
 assert.equal(e.sheets.get('검증 실적').getLastRow(),2);
 assert.equal(e.sheets.get('검증 실적').rows[1][0],'검증 이용인');
});

test('사진 조회는 출석 저장 잠금과 운영 자료를 기다리지 않는다',()=>{
 const e=environment(),dataUrl='data:image/jpeg;base64,/9j/2Q==';
 assert.equal(e.call('/api/team/photos/missing/abcdef',{},'GET').status,404);
 assert.equal(e.sheets.has('__CH_APP_PHOTOS'),false);
 e.login();
 const photo=e.call('/api/team/photo',{id:crypto.randomUUID(),dataUrl}).body;
 e.logout();
 e.context.LockService.getScriptLock=()=>({tryLock:()=>false});
 assert.equal(e.call(photo.url,{},'GET').binary,'/9j/2Q==');
 assert.equal(e.call(photo.url,{},'GET','https://evil.test').status,403);
 assert.equal(e.call('/api/team/checkin',{memberId:'person-1',requestId:crypto.randomUUID()}).body.busy,true);
});

test('오전·오후 출석을 합산하고 같은 영역의 다른 프로그램을 별도 실적으로 기록한다',()=>{
 const e=environment(),day='2026-11-11',memberId='person-1',key=day+':'+memberId;
 const {model,first,other,staff}=variableScheduleFixture(e);
 const programId=first.programId;
 model.save('schedules','',{programId,date:day,start:'11:35',end:'12:00',location:'활동실',communityId:'community-1',facilitatorIds:[staff.id]},day);
 e.context.Utilities.formatDate=()=>day;
 e.login();assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);
 const check=participation=>({memberId,participation,requestId:crypto.randomUUID()});
 const am=check('am'),pm=check('pm');
 const firstCheck=e.call('/api/team/checkin',am);
 assert.equal(firstCheck.status,200);assert.equal(firstCheck.body.participation,'am');assert.equal(firstCheck.body.reportReceipt.synced,1);
 const secondCheck=e.call('/api/team/checkin',pm);
 assert.equal(secondCheck.status,200);assert.equal(secondCheck.body.participation,'both');assert.equal(secondCheck.body.reportReceipt.synced,2);
 assert.equal(e.call('/api/team/checkin',am).body.participation,'both');
 const sheet=e.sheets.get(staff.name+' 실적');
 assert.equal(sheet.rows[0][7],'프로그램명');
 assert.equal(sheet.rows.slice(1).filter(r=>r[0]).map(r=>r[7]).sort().join('|'),[model.find('programs',programId).name,other.name].sort().join('|'));
 const state=()=>e.call('/api/team/state?month=2026-11',{},'GET').body;
 assert.equal(state().days[key].participation,'both');
 const change=(status,expectedStatus,participation,expectedParticipation)=>e.call('/api/team/attendance',{memberId,date:day,status,expectedStatus,participation,expectedParticipation,requestId:crypto.randomUUID()});
 assert.equal(change('출석','출석','am','both').body.reportReceipt.synced,1);
 assert.equal(change('출석','출석','pm','both').status,409);
 assert.equal(e.call('/api/team/checkin',check('pm')).body.code,'PERIOD_LOCKED');
 assert.equal(change('결석','출석',undefined,'am').status,200);
 assert.equal(e.call('/api/team/checkin',check('am')).body.code,'ABSENCE_LOCKED');
 assert.equal(state().records[key],'결석');
 assert.equal(sheet.rows.slice(1).filter(r=>r[0]).length,0);
});

test('공개 프로그램 출석은 배정된 일정 한 건만 저장하고 해당 프로그램 명단에만 반영한다',()=>{
 const e=environment(),day='2026-11-11',memberId='person-1';
 const {model,first,other,afternoon,staff}=variableScheduleFixture(e);
 const parallel=model.save('schedules','',{programId:other.id,start:'10:30',end:'11:25',location:'공간',weekdays:[3],communityId:'community-1',facilitatorIds:[staff.id]},day);
 const excluded=model.save('schedules','',{programId:other.id,start:'11:35',end:'12:00',location:'공간',weekdays:[3],audienceMode:'individual',communityId:'',facilitatorIds:[staff.id]},day);
 e.context.Utilities.formatDate=()=>day;
 e.login();assert.equal(e.call('/api/team/initialize',{management:model.data,records:{}}).status,200);
 e.logout();
 const input=schedule=>({date:day,memberId,scheduleId:schedule.id,programId:schedule.programId,requestId:crypto.randomUUID()});
 const post=command=>e.call('/api/team/checkin',command);
 assert.equal(post(input(excluded)).status,422);
 assert.equal(post({...input(first),programId:other.id}).status,422);
 const checkin=input(first),firstResult=post(checkin);
 assert.equal(firstResult.status,200);assert.equal(firstResult.body.reportReceipt.synced,1);
 assert.equal(post(checkin).body.replayed,true);
 const key=schedule=>JSON.stringify([schedule.id,schedule.programId]);
 const state=()=>e.call('/api/team/state?month=2026-11',{},'GET').body;
 const publicState=state();
 assert.deepEqual(publicState.programCheckins,{[key(first)]:[memberId]});
 assert.deepEqual(publicState.entries,[]);
 assert.equal(publicState.records[day+':'+memberId],'출석');
 assert.equal(post(input(afternoon)).status,200);
 assert.deepEqual(state().programCheckins,{[key(first)]:[memberId],[key(afternoon)]:[memberId]});
 e.login();
 const before=state().entries.find(entry=>entry.scheduleId===first.id);
 const cancelled=e.call('/api/team/program-attendance',{date:day,memberId,scheduleId:first.id,entryId:before.id,expectedVersion:before.version,checked:false});
 assert.equal(cancelled.status,200);
 assert.equal(post(checkin).body.code,'PROGRAM_LOCKED');
 assert.equal(post(input(first)).body.code,'PROGRAM_LOCKED');
 assert.equal(state().programCheckins[key(first)],undefined);
 assert.equal(state().programCheckins[key(parallel)],undefined);
 const absence=e.call('/api/team/attendance',{date:day,memberId,status:'결석',requestId:crypto.randomUUID()});
 assert.equal(absence.status,200);
 assert.equal(post(input(parallel)).body.code,'ABSENCE_LOCKED');
 assert.deepEqual(state().programCheckins,{});
});

test('월간 메모는 기존 자료에 추가되며 관리자 간 충돌을 검사하고 공개 화면에서 숨긴다',()=>{
 const e=environment();e.login();
 e.call('/api/team/initialize',{management:e.model().data,records:{}});
 const saved={id:'2026-11-19',text:'오후 회의\n준비물 확인'};
 assert.equal(e.call('/api/team/config',{changes:[{type:'calendarNotes',id:saved.id,before:null,after:saved}]}).status,200);
 assert.equal(e.call('/api/team/state',{},'GET').body.config.calendarNotes[0].text,saved.text);
 const conflict=e.call('/api/team/config',{changes:[{type:'calendarNotes',id:saved.id,before:null,after:{...saved,text:'동시 수정'}}]});
 assert.equal(conflict.status,409);
 e.logout();e.login();
 const shared=e.call('/api/team/state',{},'GET').body.config.calendarNotes[0];
 assert.equal(shared.text,saved.text);
 const edited={...shared,text:shared.text+'\n다른 직원이 추가한 일정'};
 assert.equal(e.call('/api/team/config',{changes:[{type:'calendarNotes',id:shared.id,before:shared,after:edited}]}).status,200);
 assert.equal(e.call('/api/team/state',{},'GET').body.config.calendarNotes[0].text,edited.text);
 assert.equal(e.call('/api/team/config',{changes:[{type:'calendarNotes',id:'2026-02-30',before:null,after:{id:'2026-02-30',text:'잘못된 날짜'}}]}).status,500);
 e.logout();
 assert.equal(e.call('/api/team/state',{},'GET').body.config.calendarNotes,undefined);
 assert.equal(e.call('/api/team/config',{changes:[]}).status,401);
});

test('여러 직원이 같은 날짜에 일정을 각각 추가하고 개별 수정·삭제한다',()=>{
 const e=environment();e.login();e.call('/api/team/initialize',{management:e.model().data,records:{}});
 const first={id:crypto.randomUUID(),date:'2026-11-19',staffName:'직원 가',time:'10:00',text:'회의',active:true};
 const second={id:crypto.randomUUID(),date:'2026-11-19',staffName:'직원 나',time:'14:00',text:'외부 방문',active:true};
 const write=(after,before=null)=>e.call('/api/team/config',{changes:[{type:'calendarNotes',id:after.id,before,after}]});
 assert.equal(write(first).status,200);e.logout();e.login();assert.equal(write(second).status,200);
 const changed={...first,text:'회의 장소 변경'};
 assert.equal(write(changed,first).status,200);
 assert.equal(write({...first,text:'오래된 수정'},first).status,409);
 assert.equal(write({...second,active:false},second).status,200);
 const notes=e.call('/api/team/state',{},'GET').body.config.calendarNotes;
 assert.equal(notes.length,2);assert.equal(notes.find(row=>row.id===first.id).text,changed.text);
 assert.equal(notes.find(row=>row.id===second.id).active,false);
});

test('같은 프로그램도 요일별 담당 한 직원의 탭에만 기록하고 미지정이면 대기한다',()=>{
 const e=environment(),model=e.model(),first=model.data.staff[0];
 const second=model.save('staff','',{name:'금요일 담당 직원'},'2026-11-19'),caseManager=model.save('staff','',{name:'사례관리 전용 직원'},'2026-11-19');
 model.save('programs','program-1',{facilitatorIds:[first.id,second.id]},'2026-11-19');
 model.save('schedules','schedule-1',{facilitatorIds:[first.id,second.id],reportStaffByWeekday:{4:first.id,5:second.id}},'2026-11-19');
 model.assignCaseManager('person-1',caseManager.id,'2026-11-19');
 e.props.set('SHEET_TAB_MAP','{}');e.login();e.call('/api/team/initialize',{management:model.data,records:{}});
 const input=day=>({date:day,memberId:'person-1',scheduleId:'schedule-1',programId:'program-1',requestId:crypto.randomUUID()});
 e.context.Utilities.formatDate=()=> '2026-11-19';
 const firstCheck=input('2026-11-19');
 assert.equal(e.call('/api/team/checkin',firstCheck).body.reportReceipt.synced,1);
 assert.equal(e.call('/api/team/checkin',firstCheck).body.replayed,true);
 assert.equal(e.sheets.has(second.name+' 실적'),false);
 e.context.Utilities.formatDate=()=> '2026-11-20';
 assert.equal(e.call('/api/team/checkin',input('2026-11-20')).body.reportReceipt.synced,1);
 const a=e.sheets.get(first.name+' 실적'),b=e.sheets.get(second.name+' 실적');
 assert.equal(a.getLastRow(),2);assert.equal(b.getLastRow(),2);
 assert.equal(a.rows[1][6],'2026-11-19');assert.equal(b.rows[1][6],'2026-11-20');
 assert.equal(a.rows[1][11],first.name);assert.equal(b.rows[1][11],second.name);
 assert.equal(e.sheets.has(caseManager.name+' 실적'),false);
 assert.equal(e.sheets.has('검증 실적'),false);
 e.context.Utilities.formatDate=()=> '2026-11-23';
 const pending=e.call('/api/team/checkin',input('2026-11-23'));
 assert.equal(pending.body.reportReceipt.failed,1);assert.equal(pending.body.reportReceipt.mappingMissing,true);
 assert.equal(a.getLastRow(),2);assert.equal(b.getLastRow(),2);
 const cancel=e.call('/api/team/attendance',{date:'2026-11-19',memberId:'person-1',status:'결석',requestId:crypto.randomUUID()});
 assert.equal(cancel.body.reportReceipt.failed,0);assert.equal(a.rows[1][0],'');assert.equal(b.rows[1][0],'검증 이용인');
});

test('참여자 이름 수정은 변경 필드만 병합하며 월 자료·공휴일 조회 없이 저장한다',()=>{
 const e=environment();e.login();const model=e.model();e.call('/api/team/initialize',{management:model.data,records:{}});
 const member=model.data.members[0];
 const before={name:member.name,communityId:member.communityId,caseManagerId:'',photo:null};
 const updatedPhoto={id:'test-photo',url:'/api/team/photos/test-photo/abcdef',bytes:500,zoom:1,x:50,y:50};
 const serverMember={...member,photo:updatedPhoto,serverOnlyField:'보존'};
 assert.equal(e.call('/api/team/config',{changes:[{type:'members',id:member.id,before:member,after:serverMember}]}).status,200);
 e.context.sharedMonth_=()=>{throw Error('참여자 수정 중 월 자료를 읽으면 안 됨')};
 e.context.sharedHolidays_=()=>{throw Error('참여자 수정 중 공휴일을 읽으면 안 됨')};
 const after={...before,name:'수정한 이름'};
 const command={memberId:member.id,before,after};
 const saved=e.call('/api/team/member',command);
 assert.equal(saved.status,200);assert.equal(saved.body.member.name,after.name);
 assert.deepEqual(saved.body.member.photo,updatedPhoto);assert.equal(saved.body.member.serverOnlyField,'보존');
 const replay=e.call('/api/team/member',command);
 assert.equal(replay.status,200);assert.equal(replay.body.unchanged,true);assert.equal(replay.body.revision,saved.body.revision);
 const conflict=e.call('/api/team/member',{...command,after:{...after,name:'오래된 화면의 이름'}});
 assert.equal(conflict.status,409);assert.deepEqual(conflict.body.conflict.fields,['name']);assert.equal(conflict.body.currentFields.name,after.name);
 const confirmed=e.call('/api/team/member',{...command,before:conflict.body.currentFields,after:{...conflict.body.currentFields,name:'확인 후 수정'}});
 assert.equal(confirmed.status,200);assert.equal(confirmed.body.member.name,'확인 후 수정');
 assert.deepEqual(confirmed.body.member.photo,updatedPhoto);
 e.logout();assert.equal(e.call('/api/team/member',command).status,401);
});

test('참여자의 소속·사례관리 담당 변경은 원래 이력을 보존하고 누락된 필드 요청을 차단한다',()=>{
 const e=environment();e.login();const model=e.model(),day='2026-10-29';
 const staff=model.save('staff','',{name:'새 사례 담당'},day),community=model.save('communities','',{name:'새 소속'},day);
 e.call('/api/team/initialize',{management:model.data,records:{}});
 const before={name:'검증 이용인',communityId:'community-1',caseManagerId:'',photo:null};
 const result=e.call('/api/team/member',{memberId:'person-1',before,after:{...before,communityId:community.id,caseManagerId:staff.id}});
 assert.equal(result.status,200);assert.equal(result.body.member.history.length,2);assert.equal(result.body.caseAssignments[0].staffId,staff.id);
 assert.equal(e.call('/api/team/member',{memberId:'person-1',before:{name:before.name},after:{name:'불완전'}}).status,400);
});
