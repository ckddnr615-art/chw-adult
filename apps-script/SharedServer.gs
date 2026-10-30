/* Google shared-storage backend. No Cloudflare Worker, D1, API key in the browser. */
var SHARED_TYPES_=['communities','members','areas','programs','schedules','staff','caseAssignments','enrollments','scheduleOverrides','closures','banners'];
var SHARED_META_='__CH_APP_META';
function sharedProps_(){return PropertiesService.getScriptProperties()}
function sharedToday_(){return Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd')}
function sharedHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2)}).join('')}
function sharedBook_(){var id=sharedProps_().getProperty('SPREADSHEET_ID');if(!id)throw Error('SPREADSHEET_ID를 설정해 주세요.');return SpreadsheetApp.openById(id)}
function sharedSheet_(book,name){var sheet=book.getSheetByName(name);if(!sheet){sheet=book.insertSheet(name);if(sheet.getMaxColumns&&sheet.getMaxColumns()>5)sheet.deleteColumns(6,sheet.getMaxColumns()-5);if(sheet.deleteRows&&sheet.getMaxRows()>100)sheet.deleteRows(101,sheet.getMaxRows()-100);sheet.hideSheet()}return sheet}
function sharedManifest_(book){var sheet=sharedSheet_(book,SHARED_META_),raw=sheet.getRange(1,1).getValue();return raw?JSON.parse(raw):{revision:0,initialized:false,config:null,months:{}}}
function sharedCommit_(book,manifest){manifest.revision++;var text=JSON.stringify(manifest);if(text.length>48000)throw Error('연도별 자료 보관을 점검해 주세요.');sharedSheet_(book,SHARED_META_).getRange(1,1).setValue(text);SpreadsheetApp.flush()}
function sharedRead_(book,descriptor,fallback){
 if(!descriptor)return fallback;var sheet=book.getSheetByName(descriptor.sheet);if(!sheet)throw Error('공동 저장 자료가 없습니다. 백업을 확인해 주세요.');
 var encoded=sheet.getRange(1,1,descriptor.parts,1).getValues().map(function(r){return r[0]}).join('');if(sharedHash_(encoded)!==descriptor.hash)throw Error('공동 저장 자료 검증 오류. 잠시 후 다시 확인해 주세요.');
 return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded))).getDataAsString('UTF-8'));
}
function sharedWrite_(book,key,old,value){
 var bank=old&&old.bank==='A'?'B':'A',sheet=sharedSheet_(book,'__CH_APP_'+key+'_'+bank),encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(value),'application/json')).getBytes()),parts=[];
 for(var i=0;i<encoded.length;i+=40000)parts.push([encoded.slice(i,i+40000)]);
 if(sheet.getMaxRows()<parts.length)sheet.insertRowsAfter(sheet.getMaxRows(),parts.length-sheet.getMaxRows());sheet.getRange(1,1,parts.length,1).setValues(parts);SpreadsheetApp.flush();
 return {sheet:sheet.getName(),bank,parts:parts.length,hash:sharedHash_(encoded)};
}
function sharedReportsConfigured_(){try{return Object.keys(JSON.parse(sharedProps_().getProperty('SHEET_TAB_MAP')||'{}')).length>0}catch(error){return false}}
function sharedConfig_(book,manifest){return sharedRead_(book,manifest.config,null)}
function sharedMonth_(book,manifest,month){return sharedRead_(book,manifest.months[month],{records:{},days:{},entries:[],requests:{},reports:{},reconcile:[],audit:[]})}
function sharedSaveMonth_(book,manifest,month,value){manifest.months[month]=sharedWrite_(book,'M_'+month.replace('-','_'),manifest.months[month],value)}
function sharedModel_(config,month){return new ManagementStore(Object.assign({},config,{days:month.days,entries:month.entries,audit:[]}))}
function sharedConfigOnly_(model){var data={version:1,timetableVersion:1};SHARED_TYPES_.forEach(function(k){data[k]=model.data[k]||[]});return data}
function sharedOrigins_(){var raw=sharedProps_().getProperty('SITE_ORIGINS')||'[]';var origins=JSON.parse(raw);if(!Array.isArray(origins))throw Error('SITE_ORIGINS는 URL 배열이어야 합니다.');return origins}
function sharedOriginAllowed_(origin){return sharedOrigins_().indexOf(origin)>=0}
function sharedReply_(body,status){return {status:status||200,body:body}}
function sharedAdmin_(token){return typeof token==='string'&&token.length>=32&&CacheService.getScriptCache().get('admin:'+sharedHash_(token))==='1'}
function sharedLogin_(password,channel){
 var expected=sharedProps_().getProperty('STAFF_PASSWORD');if(!expected||expected.length<8)return sharedReply_({error:'8자 이상 STAFF_PASSWORD를 설정해 주세요.'},503);
 var cache=CacheService.getScriptCache(),key='attempt:'+sharedHash_(channel),count=Number(cache.get(key)||0);if(count>=10)return sharedReply_({error:'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'},429);
 if(typeof password!=='string'||sharedHash_(password)!==sharedHash_(expected)){cache.put(key,String(count+1),900);return sharedReply_({error:'직원 비밀번호를 확인해 주세요.'},401)}
 cache.remove(key);var token=Utilities.getUuid()+Utilities.getUuid();cache.put('admin:'+sharedHash_(token),'1',14400);return sharedReply_({ok:true,token});
}
function doGet(e){
 var stage='허용 사이트 설정(SITE_ORIGINS)';
 try{
  var origin=e.parameter.origin||'',channel=e.parameter.channel||'';
  if(e.parameter.mode!=='bridge'||!sharedOriginAllowed_(origin)||!/^[-a-zA-Z0-9]{20,100}$/.test(channel))return HtmlService.createHtmlOutput('연결할 사이트 주소와 SITE_ORIGINS 설정을 확인해 주세요.');
  stage='Bridge.html 파일 불러오기';
  var page=HtmlService.createTemplateFromFile('Bridge');page.parentOriginJson=JSON.stringify(origin).replace(/</g,'\\u003c');page.channelJson=JSON.stringify(channel);
  stage='Bridge.html 코드 실행';
  return page.evaluate().setTitle('충현 Google 공동 저장 연결').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
 }catch(error){
  var detail=String(error&&error.message||'알 수 없는 오류').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return HtmlService.createHtmlOutput('<html lang="ko"><meta charset="utf-8"><body style="font:18px/1.7 sans-serif;padding:24px"><h2>Google 연결 설정 오류</h2><p>오류 위치: '+stage+'</p><pre style="white-space:pre-wrap">'+detail+'</pre><p>SITE_ORIGINS에는 Cloudflare 주소를 JSON 배열로 입력하고, Bridge.html에는 제공한 HTML 코드만 넣어 주세요.</p></body></html>');
 }
}
function sharedHolidays_(year){
 if(!/^20\d{2}$/.test(year))throw Error('조회 연도 오류');var cache=CacheService.getScriptCache(),key='holiday:'+year,cached=cache.get(key);if(cached)return JSON.parse(cached);
 var serviceKey=sharedProps_().getProperty('HOLIDAY_API_KEY');if(!serviceKey)throw Error('HOLIDAY_API_KEY를 설정해 주세요.');
 var url='https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?ServiceKey='+encodeURIComponent(decodeURIComponent(serviceKey))+'&solYear='+year+'&numOfRows=100&pageNo=1&_type=json',response;
 try{response=UrlFetchApp.fetch(url,{muteHttpExceptions:true})}catch(error){throw Error('공휴일 API 연결 실패. 서비스 승인과 키를 확인해 주세요.')}
 if(response.getResponseCode()!==200)throw Error('공휴일 API 응답 오류');var result={ok:true,year,dates:parseHolidays(response.getContentText(),year),fetchedAt:Date.now(),source:'한국천문연구원_특일 정보'};cache.put(key,JSON.stringify(result),21600);return result;
}
function sharedQueueReports_(month,memberId,date){
 var sources=month.entries.filter(function(e){return e.memberId===memberId&&e.date===date});
 PerformanceProjection.aggregate(sources).forEach(function(report){
  var id='area-'+sharedHash_(report.reportKey),old=month.reports[id],signature=JSON.stringify([report.name,report.date,report.area,report.staff,report.communityId,report.community,report.checked]);
  if(!report.checked&&!old)return;if(old&&old.signature===signature)return;
  month.reports[id]={signature,sync:'pending',error:'',entry:Object.assign({},report,{id,version:old?old.entry.version+1:1})};
 });
}
function sharedFlushMonth_(month,limit){
 if(!sharedReportsConfigured_())return 0;var count=0;Object.keys(month.reports).forEach(function(id){var report=month.reports[id];if(report.sync==='synced'||count>=limit)return;count++;
  try{writeProjectedPerformance_(report.entry,sharedProps_());report.sync='synced';report.error=''}catch(error){report.sync='error';report.error=error.message}
 });
 month.entries.forEach(function(entry){var report=month.reports['area-'+sharedHash_(PerformanceProjection.key(entry))];entry.sync=report?.sync||'pending';entry.error=report?.error||''});return count;
}
function sharedApply_(config,month,memberId,date,status){
 var model=sharedModel_(config,month);model.holidays=sharedHolidays_(date.slice(0,4)).dates;
 var result=model.applyAttendance(month.records,memberId,date,status);month.days=model.data.days;month.entries=model.data.entries;month.audit=(month.audit||[]).concat(model.data.audit).slice(-1000);sharedQueueReports_(month,memberId,date);return result;
}
function sharedReconcile_(config,month,limit){
 var processed=0;while(month.reconcile.length&&processed<limit){var key=month.reconcile[0],date=key.slice(0,10),memberId=key.slice(11);if(month.records[key]==='출석')sharedApply_(config,month,memberId,date,'출석');month.reconcile.shift();processed++}return processed;
}
function sharedChangedDates_(changes){
 var today=sharedToday_(),dates=new Set(),ranges=[];
 changes.forEach(function(c){if(c.type==='closures'){[c.before,c.after].filter(Boolean).forEach(function(v){ranges.push([v.date,v.endDate||v.date])})}
  if(c.type==='schedules'||c.type==='scheduleOverrides')[c.before,c.after].filter(Boolean).forEach(function(v){if(v.date&&v.date<=today)dates.add(v.date);else if(!v.date&&(!v.validFrom||v.validFrom<=today)&&(!v.validTo||v.validTo>=today))dates.add(today)});
  if(c.type==='programs'&&JSON.stringify(c.before?.enabledHistory||[])!==JSON.stringify(c.after?.enabledHistory||[]))dates.add(today);
 });var match=function(date){return date<=today&&(dates.has(date)||ranges.some(function(r){return r[0]<=date&&date<=r[1]}))};match.active=dates.size>0||ranges.length>0;return match;
}
function sharedPhoto_(book,request,admin){
 var table=sharedSheet_(book,'__CH_APP_PHOTOS'),rows=table.getLastRow()?table.getRange(1,1,table.getLastRow(),5).getValues():[],match=request.path.match(/^\/api\/team\/photos\/([-a-zA-Z0-9]+)\/([a-f0-9]+)$/);
 if(request.method==='GET'){
  var row=match&&rows.find(function(r){return r[0]===match[1]&&r[1]===match[2]});if(!row)return sharedReply_({error:'사진 없음'},404);
  return {status:200,mime:row[3],binary:Utilities.base64Encode(DriveApp.getFileById(row[2]).getBlob().getBytes())};
 }
 if(!admin)return sharedReply_({error:'사진 저장은 관리자 인증이 필요합니다.'},401);
 var input=request.input,parts=/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');if(!parts||!/^[-a-zA-Z0-9]{1,100}$/.test(input.id))throw Error('사진 형식 오류');
 var bytes=Utilities.base64Decode(parts[2]);if(bytes.length>131072)throw Error('사진은 128KB 이하로 축소해 주세요.');
 var unsigned=bytes.slice(0,12).map(function(v){return (v+256)%256}),valid=parts[1]==='image/jpeg'?unsigned[0]===255&&unsigned[1]===216:parts[1]==='image/png'?unsigned[0]===137&&unsigned[1]===80:String.fromCharCode.apply(null,unsigned.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,unsigned.slice(8,12))==='WEBP';if(!valid)throw Error('사진 내용과 형식이 다릅니다.');
 var version=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).slice(0,12).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2)}).join(''),index=rows.findIndex(function(r){return r[0]===input.id});
 if(index>=0&&rows[index][1]===version)return sharedReply_({ok:true,id:input.id,bytes:bytes.length,url:'/api/team/photos/'+input.id+'/'+version});
 var folderId=sharedProps_().getProperty('PHOTOS_FOLDER_ID');if(!folderId)throw Error('setupSharedStorage_를 먼저 실행해 주세요.');
 var file=DriveApp.getFolderById(folderId).createFile(Utilities.newBlob(bytes,parts[1],input.id+'-'+version));table.getRange(index>=0?index+1:rows.length+1,1,1,5).setValues([[input.id,version,file.getId(),parts[1],bytes.length]]);
 return sharedReply_({ok:true,id:input.id,bytes:bytes.length,url:'/api/team/photos/'+input.id+'/'+version});
}
function sharedRpc(request,origin,channel){
 if(!sharedOriginAllowed_(origin)||!/^[-a-zA-Z0-9]{20,100}$/.test(channel||''))return sharedReply_({error:'허용되지 않은 연결입니다.'},403);
 if(!request||typeof request.path!=='string'||!['GET','POST'].includes(request.method)||JSON.stringify(request).length>1500000)return sharedReply_({error:'요청 형식 또는 크기 오류'},400);
 var path=request.path.split('?')[0],query=request.path.split('?')[1]||'',params={};query.split('&').filter(Boolean).forEach(function(part){var i=part.indexOf('=');params[decodeURIComponent(part.slice(0,i))]=decodeURIComponent(part.slice(i+1))});
 if(path==='/api/integration-login')return sharedLogin_(request.input?.password,channel);
 if(path==='/api/integration-logout'){if(request.token)CacheService.getScriptCache().remove('admin:'+sharedHash_(request.token));return sharedReply_({ok:true})}
 var admin=sharedAdmin_(request.token);
 if(path==='/api/holidays'){try{return sharedReply_(sharedHolidays_(params.year))}catch(error){return sharedReply_({ok:false,error:error.message},503)}}
 var lock=LockService.getScriptLock();if(!lock.tryLock(25000))return sharedReply_({error:'다른 출석을 저장 중입니다. 같은 요청으로 다시 확인해 주세요.'},409);
 try{
  var book=sharedBook_(),manifest=sharedManifest_(book),config=sharedConfig_(book,manifest),today=sharedToday_(),input=request.input||{};
  if(path==='/api/team/status')return sharedReply_({service:'ch-team-api',configured:true,initialized:manifest.initialized,authenticated:admin,googleConfigured:sharedReportsConfigured_(),local:false,backend:'google'});
  if(path==='/api/integration-status')return sharedReply_({service:'ch-performance-api',configured:sharedReportsConfigured_(),authenticated:admin});
  if(path.startsWith('/api/team/photos/')||path==='/api/team/photo')return sharedPhoto_(book,request,admin);
  if(path==='/api/team/state'){
   if(!manifest.initialized)return sharedReply_({initialized:false});var monthKey=admin?(params.month||today.slice(0,7)):today.slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))throw Error('조회 월 오류');
   if(Number(params.since||0)===manifest.revision)return sharedReply_({initialized:true,unchanged:true,revision:manifest.revision});
   var month=sharedMonth_(book,manifest,monthKey),visibleConfig=JSON.parse(JSON.stringify(config));
   if(!admin){visibleConfig.members=visibleConfig.members.filter(function(m){return m.active!==false}).map(function(m){return {id:m.id,name:m.name,communityId:m.communityId,active:true,history:[{from:'1900-01-01',communityId:m.communityId}],photo:m.photo||null}});visibleConfig.staff=[];visibleConfig.caseAssignments=[]}
   var publicRecords={},publicDays={};Object.keys(month.records).forEach(function(key){if(admin||key.startsWith(today+':')){publicRecords[key]=month.records[key];publicDays[key]=month.days[key]}});
   return sharedReply_({initialized:true,revision:manifest.revision,config:visibleConfig,records:publicRecords,days:publicDays,entries:admin?month.entries:[],audit:admin?month.audit:[]});
  }
  if(path==='/api/team/checkin'||path==='/api/team/attendance'){
   var publicCheckin=path==='/api/team/checkin';if(!publicCheckin&&!admin)return sharedReply_({error:'관리자 인증이 필요합니다.'},401);
   if(!manifest.initialized)return sharedReply_({error:'운영 자료를 먼저 초기화해 주세요.'},409);
   var date=publicCheckin?today:input.date,status=publicCheckin?'출석':input.status,member=config.members.find(function(m){return m.id===input.memberId&&m.active!==false});
   if(!member||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||!['출석','결석',''].includes(status)||!/^[-a-zA-Z0-9]{8,100}$/.test(input.requestId||''))return sharedReply_({error:'출결 요청 오류'},400);
   var key=date.slice(0,7),month=sharedMonth_(book,manifest,key),signature=JSON.stringify([member.id,date,status]),prior=month.requests[input.requestId];if(prior)return prior.signature===signature?sharedReply_(Object.assign({},prior.result,{replayed:true})):sharedReply_({error:'요청 ID 충돌'},409);
   var holidays=sharedHolidays_(date.slice(0,4)),model=sharedModel_(config,month);model.holidays=holidays.dates;if(publicCheckin&&model.holidayName(date))return sharedReply_({error:model.holidayName(date)+' · 오늘은 쉬는 날입니다.'},422);
   var result=Object.assign({ok:true},sharedApply_(config,month,member.id,date,status));month.requests[input.requestId]={signature,result};var requestKeys=Object.keys(month.requests);while(requestKeys.length>2000)delete month.requests[requestKeys.shift()];
   sharedSaveMonth_(book,manifest,key,month);sharedCommit_(book,manifest); // Commit attendance before attempting report projection.
   if(sharedFlushMonth_(month,4)){sharedSaveMonth_(book,manifest,key,month);sharedCommit_(book,manifest)}return sharedReply_(result);
  }
  if(!admin)return sharedReply_({error:'관리자 인증이 필요합니다.'},401);
  if(path==='/api/team/initialize'){
   if(manifest.initialized)return sharedReply_({error:'이미 운영 자료가 있습니다. 덮어쓰지 않습니다.'},409);
   if(!input.management||!Array.isArray(input.management.members))throw Error('초기 자료 오류');var model=new ManagementStore(input.management),recordKeys=Object.keys(input.records||{});
   if(recordKeys.length||model.data.entries?.length)throw Error('첫 초기화는 출결 없는 기초 자료로 진행하세요. 기존 실적 이관은 별도 대조가 필요합니다.');
   var clean=sharedConfigOnly_(model);if(JSON.stringify(clean).length>950000)throw Error('기초 자료 용량 초과');manifest.config=sharedWrite_(book,'CONFIG',manifest.config,clean);manifest.initialized=true;sharedCommit_(book,manifest);return sharedReply_({ok:true});
  }
  if(path==='/api/team/config'){
   if(!config)throw Error('운영 자료를 먼저 초기화해 주세요.');if(!Array.isArray(input.changes)||input.changes.length>2000)throw Error('변경 자료 오류');var next=JSON.parse(JSON.stringify(config));
   for(var change of input.changes){if(!SHARED_TYPES_.includes(change.type)||!change.after||change.after.id!==change.id)throw Error('항목 형식 오류');var rows=next[change.type],index=rows.findIndex(function(r){return r.id===change.id}),actual=index>=0?rows[index]:null;if(JSON.stringify(actual)!==JSON.stringify(change.before||null))return sharedReply_({error:'다른 직원이 먼저 수정했습니다. 새 자료를 불러와 주세요.'},409);if(index>=0)rows[index]=change.after;else rows.push(change.after)}
   next.closures.forEach(ManagementStore.validateClosure);next.banners.forEach(ManagementStore.validateBanner);if(JSON.stringify(next).length>950000)throw Error('기초 자료 용량 초과');manifest.config=sharedWrite_(book,'CONFIG',manifest.config,next);
   var affected=sharedChangedDates_(input.changes),remaining=0;
   if(affected.active)Object.keys(manifest.months).forEach(function(key){var month=sharedMonth_(book,manifest,key),queue=new Set(month.reconcile);Object.keys(month.records).forEach(function(day){if(month.records[day]==='출석'&&affected(day.slice(0,10)))queue.add(day)});month.reconcile=[...queue];remaining+=month.reconcile.length;sharedSaveMonth_(book,manifest,key,month)});
   sharedCommit_(book,manifest);return sharedReply_({ok:true,reconcile:remaining>0});
  }
  if(path==='/api/team/maintenance'||path==='/api/team/sync'){
   var budget=3,reportBudget=6,remaining=0,anyChanged=false;Object.keys(manifest.months).forEach(function(key){var month=sharedMonth_(book,manifest,key),changed=false;if(budget>0){var done=sharedReconcile_(config,month,budget);budget-=done;changed=done>0;}if(reportBudget>0){var flushed=sharedFlushMonth_(month,reportBudget);reportBudget-=flushed;if(flushed)changed=true}remaining+=month.reconcile.length;if(changed){sharedSaveMonth_(book,manifest,key,month);anyChanged=true}});if(anyChanged)sharedCommit_(book,manifest);return sharedReply_({ok:true,remaining});
  }
  return sharedReply_({error:'지원하지 않는 API 경로'},404);
 }catch(error){return sharedReply_({error:error.message||'Google 저장 오류'},500)}finally{lock.releaseLock()}
}
/* Run these private helpers from the Apps Script editor, not from the browser. */
function setupSharedStorage_(){
 var props=sharedProps_();if(!sharedOrigins_().length)throw Error('SITE_ORIGINS를 먼저 설정하세요.');if((props.getProperty('STAFF_PASSWORD')||'').length<8)throw Error('8자 이상 STAFF_PASSWORD를 설정하세요.');
 var book=sharedBook_();sharedManifest_(book);if(!props.getProperty('PHOTOS_FOLDER_ID'))props.setProperty('PHOTOS_FOLDER_ID',DriveApp.createFolder('충현 출석 사이트 사진 축소본').getId());
 if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='flushSharedReportQueue_'}))ScriptApp.newTrigger('flushSharedReportQueue_').timeBased().everyMinutes(5).create();
 console.log('공동 저장 준비 완료. 웹앱 배포 후 사이트에서 기초 자료를 초기화하세요.');
}
function flushSharedReportQueue_(){var origin=sharedOrigins_()[0];if(!origin)return;var token=Utilities.getUuid()+Utilities.getUuid();CacheService.getScriptCache().put('admin:'+sharedHash_(token),'1',60);try{sharedRpc({path:'/api/team/maintenance',method:'POST',input:{},token},origin,Utilities.getUuid())}finally{CacheService.getScriptCache().remove('admin:'+sharedHash_(token))}}
