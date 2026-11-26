/* Google shared-storage backend. No Cloudflare Worker, D1, API key in the browser. */
var SHARED_TYPES_=['communities','members','areas','programs','schedules','staff','caseAssignments','enrollments','scheduleOverrides','closures','banners','calendarNotes'];
var SHARED_META_='__CH_APP_META';
function sharedProps_(){return PropertiesService.getScriptProperties()}
function sharedToday_(){return Utilities.formatDate(new Date(),'Asia/Seoul','yyyy-MM-dd')}
function sharedHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2)}).join('')}
function sharedBook_(){var id=sharedProps_().getProperty('SPREADSHEET_ID');if(!id)throw Error('SPREADSHEET_ID를 설정해 주세요.');return SpreadsheetApp.openById(id)}
function sharedSheet_(book,name){var sheet=book.getSheetByName(name);if(!sheet){sheet=book.insertSheet(name);if(sheet.getMaxColumns&&sheet.getMaxColumns()>5)sheet.deleteColumns(6,sheet.getMaxColumns()-5);if(sheet.deleteRows&&sheet.getMaxRows()>100)sheet.deleteRows(101,sheet.getMaxRows()-100);sheet.hideSheet()}return sheet}
function sharedManifest_(book){var sheet=sharedSheet_(book,SHARED_META_),raw=sheet.getRange(1,1).getValue();return raw?JSON.parse(raw):{revision:0,initialized:false,config:null,months:{}}}
function sharedCommit_(book,manifest){manifest.revision++;var text=JSON.stringify(manifest);if(text.length>48000)throw Error('연도별 자료 보관을 점검해 주세요.');sharedSheet_(book,SHARED_META_).getRange(1,1).setValue(text);SpreadsheetApp.flush()}
// Cache immutable content, never the mutable manifest pointer. Every request still
// verifies the committed revision under the storage lock before choosing a key.
function sharedReadCacheKey_(descriptor){return 'read:v1:'+sharedHash_(sharedProps_().getProperty('SPREADSHEET_ID')+':'+descriptor.sheet+':'+descriptor.hash)}
function sharedCacheRead_(descriptor,encoded){try{if(encoded.length<80000)CacheService.getScriptCache().put(sharedReadCacheKey_(descriptor),encoded,300)}catch(error){/* Cache is optional. */}}
function sharedRead_(book,descriptor,fallback){
 if(!descriptor)return fallback;
 var encoded='';try{encoded=CacheService.getScriptCache().get(sharedReadCacheKey_(descriptor))||''}catch(error){}
 if(encoded&&sharedHash_(encoded)!==descriptor.hash)encoded='';
 if(!encoded){
  var sheet=book.getSheetByName(descriptor.sheet);if(!sheet)throw Error('공동 저장 자료가 없습니다. 백업을 확인해 주세요.');
  encoded=sheet.getRange(1,1,descriptor.parts,1).getValues().map(function(r){return r[0]}).join('');if(sharedHash_(encoded)!==descriptor.hash)throw Error('공동 저장 자료 검증 오류. 잠시 후 다시 확인해 주세요.');
  sharedCacheRead_(descriptor,encoded);
 }
 // Parse a new object on each read so a failed write cannot mutate cached data.
 return JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(encoded),'application/x-gzip','shared.json.gz')).getDataAsString('UTF-8'));
}
function sharedWrite_(book,key,old,value){
 var bank=old&&old.bank==='A'?'B':'A',sheet=sharedSheet_(book,'__CH_APP_'+key+'_'+bank),encoded=Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(JSON.stringify(value),'application/json')).getBytes()),parts=[];
 for(var i=0;i<encoded.length;i+=40000)parts.push([encoded.slice(i,i+40000)]);
 if(sheet.getMaxRows()<parts.length)sheet.insertRowsAfter(sheet.getMaxRows(),parts.length-sheet.getMaxRows());var priorRows=sheet.getLastRow();sheet.getRange(1,1,parts.length,1).setValues(parts);if(priorRows>parts.length)sheet.getRange(parts.length+1,1,priorRows-parts.length,1).clearContent();SpreadsheetApp.flush();
 var descriptor={sheet:sheet.getName(),bank,parts:parts.length,hash:sharedHash_(encoded)};
 sharedCacheRead_(descriptor,encoded);return descriptor;
}
function sharedReportsConfigured_(){try{return Object.keys(JSON.parse(sharedProps_().getProperty('SHEET_TAB_MAP')||'{}')).length>0}catch(error){return false}}
function sharedConfig_(book,manifest){return sharedRead_(book,manifest.config,null)}
function sharedMonth_(book,manifest,month){return sharedRead_(book,manifest.months[month],{records:{},days:{},entries:[],requests:{},reports:{},reconcile:[],audit:[]})}
function sharedMonthPending_(month){return !!((month.reconcile||[]).length||Object.keys(month.reports||{}).some(function(id){return month.reports[id].sync!=='synced'}))}
function sharedSaveMonth_(book,manifest,month,value){var descriptor=sharedWrite_(book,'M_'+month.replace('-','_'),manifest.months[month],value);descriptor.pending=sharedMonthPending_(value);manifest.months[month]=descriptor}
function sharedModel_(config,month){return new ManagementStore(Object.assign({},config,{days:month.days,entries:month.entries,audit:[]}))}
function sharedConfigOnly_(model){var data={version:1,timetableVersion:1};SHARED_TYPES_.forEach(function(k){data[k]=model.data[k]||[]});return data}
function sharedMemberFields_(model,member,today){
 return {name:member.name,communityId:member.communityId,caseManagerId:model.caseManagerAt(member.id,today),photo:member.photo||null};
}
function sharedComparable_(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(sharedComparable_).join(',')+']';
 return '{'+Object.keys(value).sort().map(function(key){return JSON.stringify(key)+':'+sharedComparable_(value[key])}).join(',')+'}';
}
function sharedOrigins_(){var raw=sharedProps_().getProperty('SITE_ORIGINS')||'[]';var origins=JSON.parse(raw);if(!Array.isArray(origins))throw Error('SITE_ORIGINS는 URL 배열이어야 합니다.');return origins}
function sharedOriginAllowed_(origin){return sharedOrigins_().indexOf(origin)>=0}
function sharedReply_(body,status){return {status:status||200,body:body}}
function sharedSession_(token){
 return typeof token==='string'&&token.length>=32?CacheService.getScriptCache().get('admin:'+sharedHash_(token))||'':'';
}
function sharedLogin_(password,channel,username){
 var props=sharedProps_(),expected=props.getProperty('STAFF_PASSWORD'),staffId='',valid=false;
 if(!username&&(!expected||expected.length<8))return sharedReply_({error:'8자 이상 STAFF_PASSWORD를 설정해 주세요.'},503);
 var cache=CacheService.getScriptCache(),key='attempt:'+sharedHash_(channel),count=Number(cache.get(key)||0);if(count>=10)return sharedReply_({error:'로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.'},429);
 if(typeof password==='string'&&password.length<=256){
  if(username){
   var accounts;try{accounts=JSON.parse(props.getProperty('STAFF_ACCOUNTS')||'{}')}catch(error){return sharedReply_({error:'STAFF_ACCOUNTS 설정을 확인해 주세요.'},503)}
   var account=typeof username==='string'&&accounts&&Object.prototype.hasOwnProperty.call(accounts,username)?accounts[username]:null;
   if(account&&typeof account.staffId==='string'&&account.staffId&&typeof account.salt==='string'&&account.salt.length>=16&&
     sharedHash_(account.salt+':'+password)===account.passwordHash){valid=true;staffId=account.staffId}
  }else valid=sharedHash_(password)===sharedHash_(expected);
 }
 if(!valid){cache.put(key,String(count+1),900);return sharedReply_({error:'직원 아이디와 비밀번호를 확인해 주세요.'},401)}
 cache.remove(key);var token=Utilities.getUuid()+Utilities.getUuid();
 cache.put('admin:'+sharedHash_(token),staffId?'staff:'+staffId:'1',14400);
 return sharedReply_({ok:true,token,staffId:staffId,expiresAt:Date.now()+14400000});
}
function doGet(e){
 var stage='허용 사이트 설정(SITE_ORIGINS)';
 try{
  var origin=e.parameter.origin||'',channel=e.parameter.channel||'';
  if(e.parameter.mode!=='bridge'||!sharedOriginAllowed_(origin)||!/^[-a-zA-Z0-9]{20,100}$/.test(channel))return HtmlService.createHtmlOutput('연결할 사이트 주소와 SITE_ORIGINS 설정을 확인해 주세요.');
  stage='Bridge.html 파일 불러오기';
  var page=HtmlService.createTemplateFromFile('Bridge');page.parentOriginJson=JSON.stringify(origin).replace(/</g,'\\u003c');page.channelJson=JSON.stringify(channel);
  // Public data only: never infer staff authentication from Google cookies.
  var preload=null;
  if(e.parameter.bootstrap==='1'){
   try{var initial=sharedRpc({path:'/api/team/bootstrap',method:'GET',input:{},token:''},origin,channel);if(initial.status===200)preload=initial}catch(ignored){}
  }
  page.bootstrapJson=JSON.stringify(preload).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
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
  var id=(report.reportMode==='program'?'program-':'area-')+sharedHash_(report.reportKey),old=month.reports[id],signature=JSON.stringify([report.name,report.date,PerformanceProjection.label(report),report.staff,report.communityId,report.community,report.checked,report.reportStaff||null]);
  if(!report.checked&&!old)return;if(old&&old.signature===signature)return;
  month.reports[id]={signature,sync:'pending',error:'',entry:Object.assign({},report,{id,version:old?old.entry.version+1:1})};
 });
}
function sharedApplyReportSync_(month,reports){
 var bySource=new Map(),legacy=new Map();
 reports.forEach(function(report){
  if(Array.isArray(report.entry.allSourceIds))report.entry.allSourceIds.forEach(function(id){bySource.set(id,report)});
  else legacy.set(report.entry.id,report);
 });
 if(!bySource.size&&!legacy.size)return;
 month.entries.forEach(function(entry){
  var report=bySource.get(entry.id);
  if(!report&&legacy.size)report=legacy.get((entry.reportMode==='program'?'program-':'area-')+sharedHash_(PerformanceProjection.key(entry)));
  if(report){entry.sync=report.sync;entry.error=report.error||''}
 });
}
function sharedFlushMonth_(month,limit,deadline,book){
 var reports=Object.values(month.reports).filter(function(report){return report.sync!=='synced'});
 if(!reports.length)return 0;
 if(!sharedReportsConfigured_()&&!Object.values(month.reports).some(function(report){return Array.isArray(report.entry.reportStaff)}))return 0;
 var count=0,props=sharedProps_(),context=performanceWriteContext_(book||sharedBook_());
 reports.sort(function(a,b){return Number(a.sync==='error')-Number(b.sync==='error')});
 for(var report of reports){
  if(count>=limit||deadline&&Date.now()>=deadline)break;
  count++;
  try{writeProjectedPerformance_(report.entry,props,context);report.sync='synced';report.error=''}catch(error){report.sync='error';report.error=error.message}
 }
 sharedApplyReportSync_(month,reports);return count;
}
function sharedCanDeferReports_(){
 var cache=CacheService.getScriptCache(),key='report-maintenance-installed',cached=cache.get(key);
 if(cached)return cached==='yes';
 try{
  var installed=ScriptApp.getProjectTriggers().some(function(trigger){return trigger.getHandlerFunction()==='flushSharedReportQueue_'});
  cache.put(key,installed?'yes':'no',60);return installed;
 }catch(error){return false}
}
function sharedProgramCheckins_(month,date){
 var groups=Object.create(null);
 month.entries.forEach(function(entry){
  if(entry.date!==date||!entry.checked||month.records[date+':'+entry.memberId]!=='출석')return;
  var key=ManagementStore.programAttendanceKey(entry.scheduleId,entry.programId);
  if(!groups[key])groups[key]=[];
  if(!groups[key].includes(entry.memberId))groups[key].push(entry.memberId);
 });
 return groups;
}
function sharedReportReceipt_(month,memberId,date){
 var reports=Object.keys(month.reports).map(function(id){return month.reports[id]}).filter(function(r){return r.entry.memberId===memberId&&r.entry.date===date});
 var active=reports.filter(function(r){return r.entry.checked}),map={};try{map=JSON.parse(sharedProps_().getProperty('SHEET_TAB_MAP')||'{}')}catch(error){}
 return {areaCount:active.length,synced:active.filter(function(r){return r.sync==='synced'}).length,pending:reports.filter(function(r){return r.sync==='pending'}).length,failed:reports.filter(function(r){return r.sync==='error'}).length,mappingMissing:reports.some(function(r){return Array.isArray(r.entry.reportStaff)?!r.entry.reportStaff.length:!map[r.entry.communityId]}),noSchedule:month.records[date+':'+memberId]==='출석'&&!month.entries.some(function(e){return e.memberId===memberId&&e.date===date})};
}
function sharedApply_(config,month,memberId,date,status,recalculate,actor,preparedModel,participation,locked){
 var model=preparedModel||sharedModel_(config,month);
 if(!preparedModel)model.holidays=sharedHolidays_(date.slice(0,4)).dates;
 var result=model.applyAttendance(month.records,memberId,date,status,recalculate,participation,locked);sharedSaveAttendanceModel_(month,model,actor);sharedQueueReports_(month,memberId,date);return result;
}
function sharedSaveAttendanceModel_(month,model,actor){
 month.days=model.data.days;month.entries=model.data.entries;month.audit=(month.audit||[]).concat(model.data.audit.map(function(item){return Object.assign(item,{actor:actor||'일정 변경 재집계'})})).slice(-1000);
}
function sharedReconcile_(config,month,limit){
 var processed=0;while(month.reconcile.length&&processed<limit){var key=month.reconcile[0],date=key.slice(0,10),memberId=key.slice(11);if(month.records[key]==='출석')sharedApply_(config,month,memberId,date,'출석',true);month.reconcile.shift();processed++}return processed;
}
function sharedChangedDates_(changes){
 var today=sharedToday_(),dates=new Set(),ranges=[];
 changes.forEach(function(c){if(c.type==='closures'){[c.before,c.after].filter(Boolean).forEach(function(v){ranges.push([v.date,v.endDate||v.date])})}
  if(c.type==='scheduleOverrides'&&c.after.active!==false&&c.after.recalculateAttendance===true&&c.after.date<=today)dates.add(c.after.date);
 });var match=function(date){return date<=today&&(dates.has(date)||ranges.some(function(r){return r[0]<=date&&date<=r[1]}))};match.active=dates.size>0||ranges.length>0;return match;
}
function sharedSyncReportTabNames_(book,changes){
 if(!sharedReportsConfigured_())return;
 var props=sharedProps_(),map=JSON.parse(props.getProperty('SHEET_TAB_MAP')||'{}'),registry=JSON.parse(props.getProperty('REPORT_TAB_REGISTRY')||'{}'),planned={};
 var plans=changes.filter(function(c){return c.type==='communities'&&c.after.active!==false&&(!c.before||c.before.name!==c.after.name)}).map(function(c){
  var target=String(c.after.name||'').trim()+' 실적 기록';if(!String(c.after.name||'').trim()||target.length>100||/[\[\]:*?\/\\]/.test(target)||target.indexOf('__CH_')===0)throw Error('실적 탭에 사용할 수 없는 소속 이름입니다. 특수문자 [ ] : * ? / \\ 를 빼고 94자 이내로 입력해 주세요.');
  var registered=registry[c.id],sheet=registered?book.getSheets().find(function(s){return s.getSheetId()===registered.sheetId}):map[c.id]?book.getSheetByName(map[c.id]):null;
  if(!sheet){var ledger=book.getSheetByName('__CH_PERFORMANCE_V1'),recorded=ledger&&ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,7).getValues().some(function(r){return r[2]===map[c.id]}):false;if(registered||recorded)throw Error('기존 소속 실적 탭을 찾을 수 없습니다. 탭을 복구한 뒤 소속 이름을 바꿔 주세요.');}
  var collision=book.getSheets().find(function(s){return s.getName().toLowerCase()===target.toLowerCase()&&(!sheet||s.getSheetId()!==sheet.getSheetId())});
  if(collision||planned[target.toLowerCase()])throw Error('같은 이름의 실적 탭이 이미 있습니다. 다른 소속 이름을 입력해 주세요.');planned[target.toLowerCase()]=true;
  return {id:c.id,target:target,sheet:sheet};
 });
 // All names are checked before changing any tab. The stable ID journal survives retries.
 plans.forEach(function(plan){
  var sheet=plan.sheet||book.insertSheet(plan.target),old=registry[plan.id],names=(old?old.names:[]).concat([map[plan.id],sheet.getName(),plan.target]).filter(Boolean);
  registry[plan.id]={sheetId:sheet.getSheetId(),names:names.filter(function(n,i){return names.indexOf(n)===i})};props.setProperty('REPORT_TAB_REGISTRY',JSON.stringify(registry));
  if(sheet.getName()!==plan.target)sheet.setName(plan.target);
  map[plan.id]=plan.target;props.setProperty('SHEET_TAB_MAP',JSON.stringify(map));
 });
}
function sharedHasDriveApi_(){return typeof Drive!=='undefined'&&Drive.Files&&typeof Drive.Files.create==='function'}
function sharedCreatePhotoFile_(folderId,bytes,mime,name){
 var blob=Utilities.newBlob(bytes,mime,name);
 if(sharedHasDriveApi_()){
  var file=Drive.Files.create({name:name,mimeType:mime,parents:[folderId]},blob,{supportsAllDrives:true,fields:'id'});
  if(!file||!file.id)throw Error('공용 사진 폴더에 파일을 저장하지 못했습니다. Drive API와 폴더 편집 권한을 확인해 주세요.');
  return file.id;
 }
 return DriveApp.getFolderById(folderId).createFile(blob).getId();
}
function sharedReadPhotoBlob_(fileId){
 if(!sharedHasDriveApi_())return DriveApp.getFileById(fileId).getBlob();
 // The OAuth token is used only for the fixed Google Drive API endpoint.
 var response=UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(fileId)+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true,followRedirects:false});
 if(response.getResponseCode()!==200)throw Error('공용 사진을 읽지 못했습니다. 실행 계정의 Drive 접근 권한을 확인해 주세요. (HTTP '+response.getResponseCode()+')');
 return response.getBlob();
}
function sharedPhoto_(book,request,admin){
 var table=request.method==='GET'?book.getSheetByName('__CH_APP_PHOTOS'):sharedSheet_(book,'__CH_APP_PHOTOS');
 var rowCount=table?table.getLastRow():0,rows=rowCount?table.getRange(1,1,rowCount,5).getValues():[];
 if(request.method==='GET'){
  var match=request.path.match(/^\/api\/team\/photos\/([-a-zA-Z0-9]+)\/([a-f0-9]+)$/);
  var row=match&&rows.find(function(r){return r[0]===match[1]&&r[1]===match[2]});if(!row)return sharedReply_({error:'사진 없음'},404);
  return {status:200,mime:row[3],binary:Utilities.base64Encode(sharedReadPhotoBlob_(row[2]).getBytes())};
 }
 if(!admin)return sharedReply_({error:'사진 저장은 관리자 인증이 필요합니다.'},401);
 var input=request.input,parts=/^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');if(!parts||!/^[-a-zA-Z0-9]{1,100}$/.test(input.id))throw Error('사진 형식 오류');
 var bytes=Utilities.base64Decode(parts[2]);if(bytes.length>131072)throw Error('사진은 128KB 이하로 축소해 주세요.');
 var unsigned=bytes.slice(0,12).map(function(v){return (v+256)%256}),valid=parts[1]==='image/jpeg'?unsigned[0]===255&&unsigned[1]===216:parts[1]==='image/png'?unsigned[0]===137&&unsigned[1]===80:String.fromCharCode.apply(null,unsigned.slice(0,4))==='RIFF'&&String.fromCharCode.apply(null,unsigned.slice(8,12))==='WEBP';if(!valid)throw Error('사진 내용과 형식이 다릅니다.');
 var version=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).slice(0,12).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2)}).join(''),index=rows.findIndex(function(r){return r[0]===input.id});
 if(index>=0&&rows[index][1]===version)return sharedReply_({ok:true,id:input.id,bytes:bytes.length,url:'/api/team/photos/'+input.id+'/'+version});
 var folderId=sharedProps_().getProperty('PHOTOS_FOLDER_ID');if(!folderId)throw Error('setupSharedStorage_를 먼저 실행해 주세요.');
 var fileId=sharedCreatePhotoFile_(folderId,bytes,parts[1],input.id+'-'+version);table.getRange(index>=0?index+1:rows.length+1,1,1,5).setValues([[input.id,version,fileId,parts[1],bytes.length]]);
 return sharedReply_({ok:true,id:input.id,bytes:bytes.length,url:'/api/team/photos/'+input.id+'/'+version});
}
/* Permanent programme removal is a resumable administrative job, never a public action. */
function sharedPurgeJobs_(config){return config.purgeJobs||(config.purgeJobs=[])}
function sharedPurgeReply_(job){return {programId:job.programId,name:job.name,index:job.index,total:job.months.length,error:job.error||'',phase:job.phase||(job.prepared?'sheet':'month'),done:false}}
function sharedSavePurgeConfig_(book,manifest,config){manifest.config=sharedWrite_(book,'CONFIG',manifest.config,config);sharedCommit_(book,manifest)}
function sharedPurgeBlocked_(config,type,item){
 if((config.purgedEntities||{})[type+':'+item.id]||(config.purgedEntities||{})['programs:'+item.programId]||(config.purgedEntities||{})['schedules:'+item.scheduleId])return true;
 return (config.purgeJobs||[]).some(function(job){return item.programId===job.programId||type==='programs'&&item.id===job.programId||job.scheduleIds.includes(type==='schedules'?item.id:item.scheduleId)});
}
function sharedPurgeProgram_(book,manifest,config,input,token,today,actor){
 var cache=CacheService.getScriptCache(),action=input.action,program=(config.programs||[]).find(function(p){return p.id===input.programId}),jobs=sharedPurgeJobs_(config);
 if(action==='status')return sharedReply_({ok:true,jobs:jobs.map(sharedPurgeReply_)});
 if(action==='step'){
  var job=jobs.find(function(j){return j.programId===input.programId});
  if(!job)return sharedReply_({ok:true,done:!!(config.purgedEntities||{})['programs:'+input.programId]});
  return sharedReply_(sharedAdvanceProgramPurge_(book,manifest,config,job));
 }
 if(!program)return sharedReply_({error:'프로그램이 없거나 이미 완전 삭제되었습니다.'},404);
 if(!new ManagementStore(Object.assign({},config,{days:{},entries:[],audit:[]})).programArchived(program.id,today))return sharedReply_({error:'종료·보관 프로그램만 완전 삭제할 수 있습니다. 먼저 운영 종료를 확인해 주세요.'},409);
 if(jobs.some(function(j){return j.programId===program.id}))return sharedReply_({error:'이미 완전 삭제 중입니다. 진행 확인에서 이어서 처리해 주세요.'},409);
 if(action==='preview'){
  var schedules=(config.schedules||[]).filter(function(s){return s.programId===program.id}),ids=schedules.map(function(s){return s.id}),months=Object.keys(manifest.months).sort();
  var ticket=Utilities.getUuid(),plan={programId:program.id,name:program.name,revision:manifest.revision,owner:sharedHash_(token),months:months,backed:[],affected:[],entries:0};cache.put('purge:'+ticket,JSON.stringify(plan),600);
  return sharedReply_({ok:true,ticket:ticket,revision:manifest.revision,months:months,program:program,backup:{program:program,schedules:schedules,enrollments:(config.enrollments||[]).filter(function(e){return ids.includes(e.scheduleId)}),scheduleOverrides:(config.scheduleOverrides||[]).filter(function(e){return ids.includes(e.scheduleId)||e.programId===program.id})}});
 }
 var raw=typeof input.ticket==='string'?cache.get('purge:'+input.ticket):null,plan=raw?JSON.parse(raw):null;
 if(!plan||plan.owner!==sharedHash_(token)||plan.programId!==program.id)return sharedReply_({error:'삭제 미리보기가 만료되었습니다. 처음부터 다시 확인해 주세요.'},409);
 if(plan.revision!==manifest.revision)return sharedReply_({error:'다른 변경이 저장되었습니다. 최신 자료로 삭제 대상을 다시 확인해 주세요.'},409);
 if(action==='backup'){
  if(!plan.months.includes(input.month))return sharedReply_({error:'백업 조회 월을 확인해 주세요.'},400);
  var month=sharedMonth_(book,manifest,input.month),entries=month.entries.filter(function(e){return e.programId===program.id}),reports=Object.keys(month.reports).filter(function(id){return month.reports[id].entry.programId===program.id}).map(function(id){return {id:id,report:month.reports[id]}});
  if(!plan.backed.includes(input.month)){plan.backed.push(input.month);plan.entries+=entries.length;if(entries.length||reports.length)plan.affected.push(input.month)}cache.put('purge:'+input.ticket,JSON.stringify(plan),600);
  return sharedReply_({ok:true,month:input.month,entries:entries,reports:reports,totalEntries:plan.entries});
 }
 if(action!=='start'||input.confirmName!==program.name||input.backupAcknowledged!==true||plan.backed.length!==plan.months.length)return sharedReply_({error:'백업과 프로그램명 확인을 완료해 주세요.'},400);
 var ids=(config.schedules||[]).filter(function(s){return s.programId===program.id}).map(function(s){return s.id});
 program.active=false;program.purgeStartedAt=new Date().toISOString();
 var job={programId:program.id,name:program.name,scheduleIds:ids,months:plan.affected,index:0,prepared:false,reportIds:[],error:'',actor:actor};jobs.push(job);
 sharedSavePurgeConfig_(book,manifest,config);cache.remove('purge:'+input.ticket);return sharedReply_(Object.assign({ok:true},sharedPurgeReply_(job)));
}
function sharedAdvanceProgramPurge_(book,manifest,config,job){
 job.error='';
 if((job.scrubs||[]).length){
  var scrub=job.scrubs[0],live=scrub.month?manifest.months[scrub.month]:manifest.config,sheet=book.getSheetByName(scrub.sheet);
  if(sheet){var start=live&&live.sheet===scrub.sheet?live.parts+1:1;if(scrub.parts>=start)sheet.getRange(start,1,scrub.parts-start+1,1).clearContent()}
  job.scrubs.shift();sharedSavePurgeConfig_(book,manifest,config);return Object.assign({ok:true},sharedPurgeReply_(job));
 }
 if(job.phase==='cleanup'){config.purgeJobs=config.purgeJobs.filter(function(row){return row.programId!==job.programId});sharedSavePurgeConfig_(book,manifest,config);return {ok:true,done:true,programId:job.programId}}

 if(job.index<job.months.length){
  var key=job.months[job.index],month=sharedMonth_(book,manifest,key),sources=month.entries.filter(function(e){return e.programId===job.programId}),pairs={};
  sources.forEach(function(e){pairs[e.date+':'+e.memberId]={date:e.date,memberId:e.memberId}});
  if(!job.prepared){
   sources.forEach(function(e){e.checked=false;e.participationOverride='exclude';e.version=(e.version||0)+1});
   Object.keys(month.reports).forEach(function(id){var e=month.reports[id].entry;if(e.programId===job.programId)pairs[e.date+':'+e.memberId]={date:e.date,memberId:e.memberId}});
   Object.keys(pairs).forEach(function(pair){sharedQueueReports_(month,pairs[pair].memberId,pairs[pair].date)});
   job.reportIds=Object.keys(month.reports).filter(function(id){var report=month.reports[id],e=report.entry;if(e.programId===job.programId&&!sources.some(function(s){return s.memberId===e.memberId&&s.date===e.date})){report.entry=Object.assign({},e,{checked:false,version:e.version+1});report.sync='pending'}return !!pairs[e.date+':'+e.memberId]});
   job.prepared=true;sharedSaveMonth_(book,manifest,key,month);sharedSavePurgeConfig_(book,manifest,config);return Object.assign({ok:true},sharedPurgeReply_(job));
  }
  var context=performanceWriteContext_(book),count=0,deadline=Date.now()+3500,ledger=book.getSheetByName('__CH_PERFORMANCE_V1'),journal=ledger&&ledger.getLastRow()>1?ledger.getRange(2,1,ledger.getLastRow()-1,1).getValues().map(function(row){return row[0]}):[];
  for(var id of job.reportIds){var report=month.reports[id];if(!report||report.sync==='synced')continue;if(count>=8||Date.now()>=deadline)break;count++;
   var projectionIds=[report.entry.id].concat((report.entry.reportStaff||[]).map(function(staff){return 'staff-'+sharedHash_(JSON.stringify([report.entry.id,staff.id]))}));
   if(!report.entry.checked&&!projectionIds.some(function(id){return journal.includes(id)})){report.sync='synced';report.error='';continue}
   try{writeProjectedPerformance_(report.entry,sharedProps_(),context);report.sync='synced';report.error=''}catch(error){report.sync='error';report.error=error.message;job.error='시트 정리 확인 필요 · '+error.message}
  }
  sharedApplyReportSync_(month,job.reportIds.map(function(id){return month.reports[id]}).filter(Boolean));
  if(job.reportIds.some(function(id){return month.reports[id]&&month.reports[id].sync!=='synced'})){sharedSaveMonth_(book,manifest,key,month);sharedSavePurgeConfig_(book,manifest,config);return Object.assign({ok:true},sharedPurgeReply_(job))}
  var removedIds=sources.map(function(e){return e.id});month.entries=month.entries.filter(function(e){return e.programId!==job.programId});
  Object.keys(month.requests||{}).forEach(function(id){var signature;try{signature=JSON.parse(month.requests[id].signature)}catch(error){return}if(signature.slice(3).some(function(value){return value===job.programId||job.scheduleIds.includes(value)}))delete month.requests[id]});
  Object.keys(month.reports).forEach(function(id){var report=month.reports[id];if(report.entry.programId===job.programId&&!report.entry.checked){delete month.reports[id];return}for(var field of ['sourceIds','allSourceIds'])if(report.entry[field])report.entry[field]=report.entry[field].filter(function(id){return !removedIds.includes(id)})});
  month.audit=(month.audit||[]).filter(function(row){return !removedIds.includes(row.entityId)});
  var oldBank=manifest.months[key];job.scrubs=[{sheet:oldBank.sheet,parts:oldBank.parts,month:key}];job.index++;job.prepared=false;job.reportIds=[];sharedSaveMonth_(book,manifest,key,month);sharedSavePurgeConfig_(book,manifest,config);return Object.assign({ok:true},sharedPurgeReply_(job));
 }
 var tombstones=config.purgedEntities||(config.purgedEntities={});
 for(var type of ['programs','schedules','enrollments','scheduleOverrides'])config[type]=(config[type]||[]).filter(function(row){var remove=type==='programs'?row.id===job.programId:type==='schedules'?row.programId===job.programId:job.scheduleIds.includes(row.scheduleId)||row.programId===job.programId;if(remove)tombstones[type+':'+row.id]=true;return !remove});
 config.configAudit=(config.configAudit||[]).filter(function(row){return !tombstones[row.type+':'+row.entityId]});
 var oldConfig=manifest.config;job.phase='cleanup';job.scrubs=[{sheet:oldConfig.sheet,parts:oldConfig.parts}];
 sharedSavePurgeConfig_(book,manifest,config);return Object.assign({ok:true},sharedPurgeReply_(job));
}

/* Compact, verified public snapshot. Derived from the same rules as server check-in. */
function sharedPublicToday_(config,month,today,holidays,revision){
 var model=sharedModel_(config,{days:{},entries:[]});model.holidays=holidays.dates;
 var resolved=model.schedulesOn(today),ids=new Set(resolved.map(function(s){return s.id})),programIds=new Set(resolved.map(function(s){return s.program.id}));
 var bases=(config.schedules||[]).filter(function(s){return ids.has(s.id)});bases.forEach(function(s){programIds.add(s.programId)});
 function pick(row,keys){var out={};keys.forEach(function(key){if(row[key]!==undefined)out[key]=row[key]});return out}
 var programs=(config.programs||[]).filter(function(p){return programIds.has(p.id)}).map(function(p){return {id:p.id,name:p.name,areaId:p.areaId,active:true,facilitatorIds:[],staff:'',enabledHistory:[{from:today,enabled:true}]}}),areaIds=new Set(programs.map(function(p){return p.areaId}));
 var visible={version:1,timetableVersion:1,communities:config.communities||[],members:(config.members||[]).filter(function(m){return m.active!==false}).map(function(m){var group=model.memberGroupAt(m,today);return {id:m.id,name:m.name,communityId:group,active:true,history:[{from:'1900-01-01',communityId:group}],photo:m.photo||null}}),programs:programs,
  areas:(config.areas||[]).filter(function(a){return areaIds.has(a.id)}).map(function(a){return pick(a,['id','name','communityId','active'])}),
  schedules:bases.map(function(s){return Object.assign(pick(s,['id','programId','date','weekdays','validFrom','validTo','start','end','location','communityId','slotId','audienceMode','active']),{facilitatorIds:[],reportStaffByWeekday:{},reportStaffId:''})}),
  enrollments:(config.enrollments||[]).filter(function(e){return ids.has(e.scheduleId)&&e.active!==false&&e.from<=today&&(!e.to||e.to>=today)}).map(function(e){return {id:e.id,scheduleId:e.scheduleId,memberId:e.memberId,from:today,to:today,active:true}}),
  scheduleOverrides:(config.scheduleOverrides||[]).filter(function(o){return o.active!==false&&o.date===today&&ids.has(o.scheduleId)}).map(function(o){return pick(o,['id','scheduleId','date','kind','programId','start','end','location','displayName','reason','audienceMode','active'])}),
  closures:(config.closures||[]).filter(function(c){return c.active!==false&&ManagementStore.closureContains(c,today)}),banners:(config.banners||[]).filter(function(b){return b.id==='kiosk'}),staff:[],caseAssignments:[]};
 var records={},days={};Object.keys(month.records).forEach(function(key){if(!key.startsWith(today+':'))return;records[key]=month.records[key];if(month.days[key])days[key]=pick(month.days[key],['memberId','date','participation','participationLocked'])});
 return {initialized:true,scope:'today',date:today,revision:revision,config:visible,records:records,days:days,programCheckins:sharedProgramCheckins_(month,today),entries:[],audit:[]};
}
function sharedAdminSnapshot_(config,month,today,revision){
 var visible=JSON.parse(JSON.stringify(config));delete visible.configAudit;delete visible.purgeJobs;delete visible.purgedEntities;
 return {initialized:true,scope:'admin',date:today,revision:revision,config:visible,records:month.records,days:month.days,programCheckins:sharedProgramCheckins_(month,today),entries:month.entries,audit:(config.configAudit||[]).concat(month.audit||[]),purgedProgramIds:Object.keys(config.purgedEntities||{}).filter(function(key){return key.indexOf('programs:')===0}).map(function(key){return key.slice(9)})};
}
function sharedTodayCacheKey_(today,revision,holidays){return 'kiosk:v1:'+sharedHash_(sharedProps_().getProperty('SPREADSHEET_ID'))+':'+today+':'+revision+':'+holidays.fetchedAt}
function sharedCacheToday_(key,data){try{var text=JSON.stringify(data);if(Utilities.newBlob(text,'application/json').getBytes().length<80000)CacheService.getScriptCache().put(key,text,300)}catch(error){/* A cache miss or capacity limit never prevents a verified response. */}}

function sharedTeamStatus_(manifest,admin,staffId){return sharedReply_({service:'ch-team-api',configured:true,initialized:manifest.initialized,authenticated:admin,staffId:staffId,googleConfigured:!!sharedProps_().getProperty('SPREADSHEET_ID'),staffReportTabs:true,weekdayReportTabs:true,participantReportOwners:true,memberPatch:true,caseManagerBatch:true,participationPeriods:true,programCheckin:true,programPurge:true,calendarNotes:true,calendarEntries:true,local:false,backend:'google'})}
function sharedRpc(request,origin,channel){
 if(!sharedOriginAllowed_(origin)||!/^[-a-zA-Z0-9]{20,100}$/.test(channel||''))return sharedReply_({error:'허용되지 않은 연결입니다.'},403);
 if(!request||typeof request.path!=='string'||!['GET','POST'].includes(request.method)||JSON.stringify(request).length>1500000)return sharedReply_({error:'요청 형식 또는 크기 오류'},400);
 var path=request.path.split('?')[0],query=request.path.split('?')[1]||'',params={};query.split('&').filter(Boolean).forEach(function(part){var i=part.indexOf('=');params[decodeURIComponent(part.slice(0,i))]=decodeURIComponent(part.slice(i+1))});
 if(path==='/api/integration-login')return sharedLogin_(request.input?.password,channel,request.input?.username);
 if(path==='/api/integration-logout'){if(request.token)CacheService.getScriptCache().remove('admin:'+sharedHash_(request.token));return sharedReply_({ok:true})}
 var session=sharedSession_(request.token),staffId=session.indexOf('staff:')===0?session.slice(6):'',admin=session==='1'||!!staffId;
 if(path==='/api/holidays'){try{return sharedReply_(sharedHolidays_(params.year))}catch(error){return sharedReply_({ok:false,error:error.message},503)}}
 // Photo reads use the versioned index and never write to the workbook.
 if(request.method==='GET'&&path.startsWith('/api/team/photos/')){
  try{return sharedPhoto_(sharedBook_(),request,false)}catch(error){return sharedReply_({error:error.message||'사진을 불러오지 못했습니다.'},500)}
 }
 var checkin=path==='/api/team/checkin',bootstrap=path==='/api/team/bootstrap',measured=checkin||bootstrap,started=Date.now(),phase=started,timing={},startupHolidays=null;
 if(bootstrap||path==='/api/team/state'&&!admin){try{startupHolidays=sharedHolidays_(sharedToday_().slice(0,4))}catch(error){return sharedReply_({ok:false,error:error.message},503)}}
 function mark(name){if(measured){var now=Date.now();timing[name]=now-phase;phase=now}}
 if(bootstrap)mark('holidayMs');
 var lock=LockService.getScriptLock();
 if(!lock.tryLock(25000)){
  if(checkin)console.log('checkin_timing '+JSON.stringify({lockMs:Date.now()-started,result:'busy'}));
  return sharedReply_({error:'다른 기기의 변경을 저장 중입니다. 잠시 후 다시 확인해 주세요.',busy:true},409);
 }
 mark('lockMs');
 try{
  var book=sharedBook_(),manifest=sharedManifest_(book),today=sharedToday_(),input=request.input||{};mark('manifestReadMs');
  if(bootstrap&&!manifest.initialized)return sharedReply_({initialized:false,team:sharedTeamStatus_(manifest,admin&&!staffId,'').body,holidays:startupHolidays,date:today,timing:timing});
  var todayCacheKey=startupHolidays?sharedTodayCacheKey_(today,manifest.revision,startupHolidays):'';
  if(!admin&&!staffId&&(bootstrap||path==='/api/team/state')&&manifest.initialized){
   if(!bootstrap&&Number(params.since||0)===manifest.revision)return sharedReply_({initialized:true,unchanged:true,date:today,revision:manifest.revision});
   var cached=CacheService.getScriptCache().get(todayCacheKey);
   if(cached){var cachedState;try{cachedState=JSON.parse(cached)}catch(error){}
    if(cachedState&&cachedState.initialized&&cachedState.scope==='today'&&cachedState.date===today&&cachedState.revision===manifest.revision&&Array.isArray(cachedState.config?.members)&&Array.isArray(cachedState.config?.schedules)){timing.cacheHit=true;mark('snapshotMs');return sharedReply_(bootstrap?Object.assign({},cachedState,{team:sharedTeamStatus_(manifest,false,'').body,holidays:startupHolidays,timing:timing}):cachedState)}
   }
  }
  // Under the same lock, an unchanged snapshot needs neither config nor monthly JSON reads.
  if(path==='/api/team/state'&&manifest.initialized){
   var requestedMonth=admin?(params.month||today.slice(0,7)):today.slice(0,7);
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth))throw Error('조회 월 오류');
   if(Number(params.since||0)===manifest.revision)return sharedReply_({initialized:true,unchanged:true,revision:manifest.revision});
  }
  if(!staffId&&path==='/api/team/status')return sharedTeamStatus_(manifest,admin,'');
  if(!staffId&&path==='/api/integration-status')return sharedReply_({service:'ch-performance-api',configured:sharedReportsConfigured_(),authenticated:admin});
  var config=sharedConfig_(book,manifest);
  mark('configReadMs');
  var staff=staffId&&config?(config.staff||[]).find(function(person){return person.id===staffId&&person.active!==false}):null;
  if(staffId&&!staff)admin=false;
  var actor=staff?staff.name:admin?'공용 관리자':'참여자 출석';
  if(path==='/api/team/status')return sharedTeamStatus_(manifest,admin,staff?staff.id:'');
  if(path==='/api/integration-status')return sharedReply_({service:'ch-performance-api',configured:sharedReportsConfigured_(),authenticated:admin});
  if(bootstrap){
   var month=sharedMonth_(book,manifest,today.slice(0,7));mark('monthReadMs');
   var snapshot=admin?sharedAdminSnapshot_(config,month,today,manifest.revision):sharedPublicToday_(config,month,today,startupHolidays,manifest.revision);mark('snapshotMs');
   if(!admin)sharedCacheToday_(todayCacheKey,snapshot);
   return sharedReply_(Object.assign({},snapshot,{team:sharedTeamStatus_(manifest,admin,staff?staff.id:'').body,holidays:startupHolidays,timing:timing}));
  }
  if(path.startsWith('/api/team/photos/')||path==='/api/team/photo')return sharedPhoto_(book,request,admin);
  if(path==='/api/team/state'){
   if(!manifest.initialized)return sharedReply_({initialized:false});var monthKey=admin?(params.month||today.slice(0,7)):today.slice(0,7);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey))throw Error('조회 월 오류');
   if(Number(params.since||0)===manifest.revision)return sharedReply_({initialized:true,unchanged:true,revision:manifest.revision});
   var month=sharedMonth_(book,manifest,monthKey);
   if(!admin){var snapshot=sharedPublicToday_(config,month,today,startupHolidays||sharedHolidays_(today.slice(0,4)),manifest.revision);sharedCacheToday_(todayCacheKey,snapshot);return sharedReply_(snapshot)}
   var visibleConfig=JSON.parse(JSON.stringify(config));
   delete visibleConfig.configAudit;delete visibleConfig.purgeJobs;delete visibleConfig.purgedEntities;
   if(!admin){visibleConfig.members=visibleConfig.members.filter(function(m){return m.active!==false}).map(function(m){return {id:m.id,name:m.name,communityId:m.communityId,active:true,history:[{from:'1900-01-01',communityId:m.communityId}],photo:m.photo||null}});visibleConfig.staff=[];visibleConfig.caseAssignments=[];delete visibleConfig.calendarNotes}
   var publicRecords={},publicDays={};Object.keys(month.records).forEach(function(key){if(admin||key.startsWith(today+':')){publicRecords[key]=month.records[key];publicDays[key]=month.days[key]}});
   return sharedReply_({initialized:true,revision:manifest.revision,config:visibleConfig,purgedProgramIds:admin?Object.keys(config.purgedEntities||{}).filter(function(key){return key.indexOf('programs:')===0}).map(function(key){return key.slice(9)}):[],records:publicRecords,days:publicDays,programCheckins:monthKey===today.slice(0,7)?sharedProgramCheckins_(month,today):undefined,entries:admin?month.entries:[],audit:admin?(config.configAudit||[]).concat(month.audit||[]):[]});
  }
  if(path==='/api/team/checkin'||path==='/api/team/attendance'){
   var publicCheckin=path==='/api/team/checkin';if(!publicCheckin&&!admin)return sharedReply_({error:'관리자 인증이 필요합니다.'},401);
   if(!manifest.initialized)return sharedReply_({error:'운영 자료를 먼저 초기화해 주세요.'},409);
   var date=publicCheckin?today:input.date,status=publicCheckin?'출석':input.status,member=config.members.find(function(m){return m.id===input.memberId&&m.active!==false});
   if(!member||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||!['출석','결석',''].includes(status)||!/^[-a-zA-Z0-9]{8,100}$/.test(input.requestId||''))return sharedReply_({error:'출결 요청 오류'},400);
   var key=date.slice(0,7),month=sharedMonth_(book,manifest,key);
   mark('monthReadMs');
   var currentStatus=month.records[date+':'+member.id]||'';
   var day=month.days[date+':'+member.id],currentPeriod=currentStatus==='출석'?day?.participation||'both':'';
   var exact=publicCheckin&&input.scheduleId!==undefined;
   if(exact&&(typeof input.scheduleId!=='string'||!input.scheduleId||typeof input.programId!=='string'||!input.programId||date!==input.date))return sharedReply_({error:'오늘 프로그램을 다시 확인해 주세요.'},422);
   var requestedPeriod=exact?undefined:input.participation;
   if(requestedPeriod!==undefined&&(!['am','pm','both'].includes(requestedPeriod)||status!=='출석'))return sharedReply_({error:'오전 또는 오후 참여를 선택해 주세요.'},400);
   if(publicCheckin&&currentStatus==='결석'){
    return sharedReply_({error:'오늘 못 와요로 기록되어 있어요. 출석하려면 직원에게 알려 주세요.',
     code:'ABSENCE_LOCKED',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
   }
   var period=requestedPeriod;
   if(publicCheckin&&period&&currentPeriod&&currentPeriod!==period)period='both';
   if(publicCheckin&&day?.participationLocked&&period&&period!==currentPeriod)return sharedReply_({error:'직원이 참여 시간을 지정했어요. 시간을 바꾸려면 직원에게 알려 주세요.',code:'PERIOD_LOCKED',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
   var signature=JSON.stringify(exact?[member.id,date,status,input.scheduleId,input.programId]:requestedPeriod?[member.id,date,status,requestedPeriod]:[member.id,date,status]),prior=month.requests[input.requestId];if(prior&&prior.signature!==signature)return sharedReply_({error:'요청 ID 충돌'},409);
   if(prior&&!exact){
    if(currentStatus!==status)return sharedReply_({error:'저장 후 최신 출결이 변경되었습니다. 현재 출결을 확인해 주세요.',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
    return sharedReply_(Object.assign({},prior.result,{participation:currentPeriod,replayed:true,revision:manifest.revision,reportReceipt:sharedReportReceipt_(month,member.id,date)}));
   }
   if(!publicCheckin&&input.expectedStatus!==undefined&&input.expectedStatus!==currentStatus&&status!==currentStatus)return sharedReply_({error:'다른 직원이 출결을 먼저 바꿨습니다. 현재 출결을 확인한 뒤 다시 선택해 주세요.',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
   if(!publicCheckin&&input.expectedParticipation!==undefined&&input.expectedParticipation!==currentPeriod&&period!==currentPeriod)return sharedReply_({error:'다른 직원이 참여 시간을 먼저 바꿨습니다. 현재 기록을 확인해 주세요.',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
   if(!exact&&currentStatus===status&&(!period||period===currentPeriod&&(publicCheckin||day?.participationLocked)))return sharedReply_({ok:true,date:date,status:status,participation:currentPeriod,replayed:true,revision:manifest.revision,reportReceipt:sharedReportReceipt_(month,member.id,date)});
   var holidays=sharedHolidays_(date.slice(0,4)),model=sharedModel_(config,month);model.holidays=holidays.dates;if(publicCheckin&&model.holidayName(date))return sharedReply_({error:model.holidayName(date)+' · 오늘은 쉬는 날입니다.'},422);
   if(publicCheckin&&['am','pm'].includes(requestedPeriod)&&!model.personalSchedules(member.id,date).some(function(schedule){return ManagementStore.inParticipationPeriod(schedule,requestedPeriod)}))return sharedReply_({error:'선택한 시간의 프로그램이 변경되었습니다. 일정을 다시 확인해 주세요.'},422);
   var result;
   if(exact){
    var item=model.personalSchedules(member.id,date).find(function(schedule){return schedule.id===input.scheduleId&&schedule.program.id===input.programId});
    if(!item)return sharedReply_({error:'오늘 배정된 프로그램을 다시 확인해 주세요.'},422);
    var programKey=ManagementStore.programAttendanceKey(item.id,item.program.id);
    if(day?.participationLocked&&!ManagementStore.inParticipationPeriod(item,currentPeriod))return sharedReply_({error:'직원이 정한 참여 시간입니다. 직원에게 알려 주세요.',code:'PERIOD_LOCKED',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
    var matches=month.entries.filter(function(entry){return entry.date===date&&entry.memberId===member.id&&entry.scheduleId===item.id&&entry.programId===item.program.id});
    if(currentStatus==='출석'&&matches.some(function(entry){return entry.checked&&(item.reportAssignmentMode!=='participant'||model.entryMatchesSchedule(entry,item))}))return sharedReply_({ok:true,date:date,status:status,participation:currentPeriod,scheduleKey:programKey,replayed:true,revision:manifest.revision});
    if(prior||matches.some(function(entry){return entry.participationOverride==='exclude'}))return sharedReply_({error:'직원이 정정한 프로그램 출석입니다. 직원에게 알려 주세요.',code:'PROGRAM_LOCKED',currentStatus:currentStatus,participation:currentPeriod,date:date,revision:manifest.revision},409);
    result=Object.assign({ok:true},model.checkInProgram(month.records,member,date,item));
    sharedSaveAttendanceModel_(month,model,actor);
    sharedQueueReports_(month,member.id,date);
   }else{
    result=Object.assign({ok:true,participation:status==='출석'?period||currentPeriod||'both':''},sharedApply_(config,month,member.id,date,status,!!period,publicCheckin?'참여자 출석':actor,model,period,!publicCheckin));
   }
   month.requests[input.requestId]={signature,result};var requestKeys=Object.keys(month.requests);while(requestKeys.length>2000)delete month.requests[requestKeys.shift()];
   mark('prepareMs');
   sharedSaveMonth_(book,manifest,key,month);sharedCommit_(book,manifest); // Commit attendance before attempting report projection.
   mark('attendanceWriteMs');
   // The committed month already contains the report queue. The installed maintenance trigger drains it.
   if(!(publicCheckin&&input.deferReports===true&&sharedCanDeferReports_())&&sharedFlushMonth_(month,4,undefined,book)){
    sharedSaveMonth_(book,manifest,key,month);sharedCommit_(book,manifest);
   }
   mark('reportStepMs');
   return sharedReply_(Object.assign({},result,{revision:manifest.revision,reportReceipt:sharedReportReceipt_(month,member.id,date)}));
  }
  if(!admin)return sharedReply_({error:'관리자 인증이 필요합니다.'},401);
  if(path==='/api/team/program-purge'&&request.method==='POST')return sharedPurgeProgram_(book,manifest,config,input,request.token,today,actor);
  if(path==='/api/team/case-managers'&&request.method==='POST'){
   if(!manifest.initialized||!config)return sharedReply_({error:'공동 저장소를 먼저 준비해 주세요.'},409);
   if(!Array.isArray(input.members)||!input.members.length||input.members.length>200||typeof input.staffId!=='string')return sharedReply_({error:'변경할 참여자와 사례관리 담당을 확인해 주세요.'},400);
   var model=sharedModel_(config,{days:{},entries:[]}),ids=[],conflicts=[];
   if(input.staffId&&!model.list('staff').some(function(staff){return staff.id===input.staffId}))return sharedReply_({error:'사용 중인 사례관리 담당 직원을 선택해 주세요.'},400);
   for(var choice of input.members){
    if(!choice||typeof choice.memberId!=='string'||typeof choice.beforeStaffId!=='string'||ids.includes(choice.memberId))return sharedReply_({error:'참여자 선택을 다시 확인해 주세요.'},400);
    var member=model.find('members',choice.memberId),current=model.caseManagerAt(choice.memberId,today);ids.push(choice.memberId);
    if(!member||member.active===false||current!==choice.beforeStaffId&&current!==input.staffId)conflicts.push({memberId:choice.memberId,name:member?member.name:'삭제된 참여자',currentStaffId:current});
   }
   if(conflicts.length)return sharedReply_({error:'선택한 참여자의 담당이 다른 직원에 의해 변경되었습니다. 최신 자료를 확인한 뒤 다시 선택해 주세요.',conflicts:conflicts},409);
   var changed=false;
   ids.forEach(function(id){var before=model.caseManagerAt(id,today);if(before===input.staffId)return;model.assignCaseManager(id,input.staffId,today);model.audit('사례관리 담당 일괄 변경','caseAssignments',id,{staffId:before},{staffId:input.staffId,from:today});changed=true});
   if(changed){var next=JSON.parse(JSON.stringify(config));next.caseAssignments=model.data.caseAssignments;next.configAudit=(next.configAudit||[]).concat(model.data.audit.map(function(row){return Object.assign({},row,{actor:actor})})).slice(-150);if(JSON.stringify(next).length>950000)throw Error('기초 자료 용량 초과');manifest.config=sharedWrite_(book,'CONFIG',manifest.config,next);sharedCommit_(book,manifest)}
   return sharedReply_({ok:true,memberIds:ids,staffId:input.staffId,from:today,caseAssignments:model.data.caseAssignments.filter(function(row){return ids.includes(row.memberId)}),revision:manifest.revision,unchanged:!changed});
  }
  if(path==='/api/team/member'&&request.method==='POST'){
   if(!manifest.initialized||!config)return sharedReply_({error:'공동 저장소를 먼저 준비해 주세요.'},409);
   var model=sharedModel_(config,{days:{},entries:[]}),member=model.find('members',input.memberId);
   if(!member||member.active===false)return sharedReply_({error:'참여자가 삭제되었거나 변경되었습니다. 명단을 확인해 주세요.'},409);
   var before=input.before,after=input.after,allowed=['name','communityId','caseManagerId','photo'];
   if(!before||!after||typeof before!=='object'||typeof after!=='object'||allowed.some(function(field){return !Object.prototype.hasOwnProperty.call(before,field)||!Object.prototype.hasOwnProperty.call(after,field)}))return sharedReply_({error:'참여자 수정 요청을 확인해 주세요.'},400);
   if(typeof after.name!=='string'||typeof after.communityId!=='string'||typeof after.caseManagerId!=='string')return sharedReply_({error:'참여자 이름과 담당을 확인해 주세요.'},400);
   var current=sharedMemberFields_(model,member,today),fields={},conflicts=[];
   allowed.forEach(function(field){
    if(sharedComparable_(before[field])===sharedComparable_(after[field]))return;
    if(sharedComparable_(current[field])!==sharedComparable_(before[field])&&sharedComparable_(current[field])!==sharedComparable_(after[field]))conflicts.push(field);
    if(sharedComparable_(current[field])!==sharedComparable_(after[field]))fields[field]=after[field];
   });
   if(conflicts.length)return sharedReply_({error:'이 참여자의 같은 항목이 변경되었습니다. 최신 값과 입력 내용을 확인해 주세요.',conflict:{type:'members',id:member.id,current:member,fields:conflicts},currentFields:current},409);
   if(Object.prototype.hasOwnProperty.call(fields,'photo')&&fields.photo!==null){
    var photo=fields.photo;
    if(typeof photo!=='object'||Array.isArray(photo)||typeof photo.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(photo.id)||typeof photo.url!=='string'||!/^\/api\/team\/photos\/[-a-zA-Z0-9]+\/[a-f0-9]+$/.test(photo.url)||JSON.stringify(photo).length>2500)return sharedReply_({error:'사진 정보를 확인해 주세요.'},400);
   }
   var changed=Object.keys(fields).length>0;
   if(changed){
    member=model.save('members',member.id,fields,today);
    var next=JSON.parse(JSON.stringify(config));
    next.members=model.data.members;next.caseAssignments=model.data.caseAssignments;
    next.configAudit=(next.configAudit||[]).concat(model.data.audit.map(function(item){return Object.assign({},item,{actor:actor})})).slice(-150);
    if(JSON.stringify(next).length>950000)throw Error('기초 자료 용량 초과');
    manifest.config=sharedWrite_(book,'CONFIG',manifest.config,next);sharedCommit_(book,manifest);
   }
   return sharedReply_({ok:true,member:member,memberFields:sharedMemberFields_(model,member,today),caseAssignments:model.data.caseAssignments.filter(function(row){return row.memberId===member.id}),revision:manifest.revision,unchanged:!changed});
  }
  if(path==='/api/team/program-attendance'&&request.method==='POST'){
   var d=input.date,monthKey=String(d||'').slice(0,7);
   if(!config||!/^\d{4}-\d{2}-\d{2}$/.test(d)||d>today||typeof input.checked!=='boolean'||!Number.isInteger(input.expectedVersion)||input.expectedVersion<0)return sharedReply_({error:'참여 실적 정정 요청을 확인해 주세요.'},400);
   var month=sharedMonth_(book,manifest,monthKey),model=sharedModel_(config,month);
   if((config.purgeJobs||[]).some(function(job){return job.scheduleIds.includes(input.scheduleId)||month.entries.some(function(e){return e.id===input.entryId&&e.programId===job.programId})}))return sharedReply_({error:'완전 삭제 중인 프로그램은 정정할 수 없습니다.'},409);
   model.holidays=sharedHolidays_(d.slice(0,4)).dates;
   model.setProgramAttendance(month.records,input,actor);
   month.entries=model.data.entries;
   month.audit=(month.audit||[]).concat(model.data.audit.map(function(item){return Object.assign(item,{actor:actor})})).slice(-1000);
   sharedQueueReports_(month,input.memberId,d);
   sharedSaveMonth_(book,manifest,monthKey,month);sharedCommit_(book,manifest);
   if(sharedFlushMonth_(month,4,undefined,book)){sharedSaveMonth_(book,manifest,monthKey,month);sharedCommit_(book,manifest)}
   return sharedReply_({ok:true,reportReceipt:sharedReportReceipt_(month,input.memberId,d)});
  }
  if(path==='/api/team/initialize'){
   if(manifest.initialized)return sharedReply_({error:'이미 운영 자료가 있습니다. 덮어쓰지 않습니다.'},409);
   if(!input.management||!Array.isArray(input.management.members))throw Error('초기 자료 오류');var model=new ManagementStore(input.management),recordKeys=Object.keys(input.records||{});
   if(recordKeys.length||model.data.entries?.length)throw Error('첫 초기화는 출결 없는 기초 자료로 진행하세요. 기존 실적 이관은 별도 대조가 필요합니다.');
   var clean=sharedConfigOnly_(model);if(JSON.stringify(clean).length>950000)throw Error('기초 자료 용량 초과');manifest.config=sharedWrite_(book,'CONFIG',manifest.config,clean);manifest.initialized=true;sharedCommit_(book,manifest);return sharedReply_({ok:true});
  }
  if(path==='/api/team/config'&&request.method==='POST'){
   if(!config)throw Error('운영 자료를 먼저 초기화해 주세요.');if(!Array.isArray(input.changes)||input.changes.length>2000)throw Error('변경 자료 오류');var next=JSON.parse(JSON.stringify(config)),appliedChanges=[];
   for(var change of input.changes){if(change.after&&sharedPurgeBlocked_(config,change.type,change.after))return sharedReply_({error:'완전 삭제 중이거나 삭제된 프로그램입니다. 최신 자료를 불러오세요.'},409);if(!SHARED_TYPES_.includes(change.type)||!change.after||change.after.id!==change.id)throw Error('항목 형식 오류');var rows=next[change.type]||(next[change.type]=[]),index=rows.findIndex(function(r){return r.id===change.id}),actual=index>=0?rows[index]:null;
    if(sharedComparable_(actual)===sharedComparable_(change.after))continue;
    if(sharedComparable_(actual)!==sharedComparable_(change.before||null))return sharedReply_({error:'다른 직원이 이 항목을 먼저 수정했습니다. 변경 내용을 비교해 주세요.',conflict:{type:change.type,id:change.id,current:actual}},409);
    if(index>=0)rows[index]=change.after;else rows.push(change.after);appliedChanges.push(change);
   }
   if(!appliedChanges.length)return sharedReply_({ok:true,replayed:true,reconcile:false});
   for(var assignment of appliedChanges.filter(function(change){return change.type==='enrollments'&&change.after.active!==false&&change.after.reportStaffId})){
    var target=assignment.after,base=next.schedules.find(function(schedule){return schedule.id===target.scheduleId});
    if(!base||!(base.facilitatorIds||[]).includes(target.reportStaffId)||!next.staff.some(function(staff){return staff.id===target.reportStaffId&&staff.active!==false}))throw Error('참여자의 실적 담당 직원을 확인해 주세요.');
   }
   for(var applied of appliedChanges){
    if(applied.type!=='scheduleOverrides'&&applied.type!=='schedules')continue;
    var item=applied.after;ManagementStore.validateReportAssignments(item);
    if(item.active===false)continue;
    if(item.kind!=='cancel'&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.end)||item.start>=item.end))return sharedReply_({error:'일정 시작과 종료 시간을 확인해 주세요.'},400);
    if(applied.type==='scheduleOverrides'&&next.scheduleOverrides.some(function(row){return row.active!==false&&row.id!==item.id&&row.scheduleId===item.scheduleId&&row.date===item.date}))return sharedReply_({error:'같은 날짜의 일정 변경이 먼저 저장됐습니다. 최신 시간표에서 해당 날짜를 열어 주세요.'},409);
   }
   next.configAudit=(next.configAudit||[]).concat(appliedChanges.map(function(change){
    return {id:Utilities.getUuid(),time:new Date().toISOString(),actor:actor,action:change.before?'수정':'등록',type:change.type,entityId:change.id,
     before:change.before?{name:change.before.name||change.before.reason||'',date:change.before.date||'',start:change.before.start||'',end:change.before.end||''}:null,
     after:{name:change.after.name||change.after.reason||'',date:change.after.date||'',start:change.after.start||'',end:change.after.end||''}};
   })).slice(-150);
   (next.calendarNotes||[]).forEach(ManagementStore.validateCalendarNote);next.closures.forEach(ManagementStore.validateClosure);next.banners.forEach(ManagementStore.validateBanner);if(JSON.stringify(next).length>950000)throw Error('기초 자료 용량 초과');sharedSyncReportTabNames_(book,appliedChanges);manifest.config=sharedWrite_(book,'CONFIG',manifest.config,next);
   var affected=sharedChangedDates_(appliedChanges),remaining=0;
   if(affected.active)Object.keys(manifest.months).forEach(function(key){var month=sharedMonth_(book,manifest,key),queue=new Set(month.reconcile);Object.keys(month.records).forEach(function(day){if(month.records[day]==='출석'&&affected(day.slice(0,10)))queue.add(day)});month.reconcile=[...queue];remaining+=month.reconcile.length;sharedSaveMonth_(book,manifest,key,month)});
   sharedCommit_(book,manifest);return sharedReply_({ok:true,reconcile:remaining>0});
  }
  if(path==='/api/team/maintenance'||path==='/api/team/sync'){
   if((config.purgeJobs||[]).length){sharedAdvanceProgramPurge_(book,manifest,config,config.purgeJobs[0]);config=sharedConfig_(book,manifest)}
   var budget=3,reportBudget=12,deadline=Date.now()+4000,remaining=0,remainingReports=0,anyChanged=false,metadataChanged=false;
   Object.keys(manifest.months).reverse().forEach(function(key){
    if(manifest.months[key].pending===false)return;
    var month=sharedMonth_(book,manifest,key),changed=false;
    if(budget>0&&Date.now()<deadline){var done=sharedReconcile_(config,month,budget);budget-=done;changed=done>0}
    if(reportBudget>0){var flushed=sharedFlushMonth_(month,reportBudget,deadline,book);reportBudget-=flushed;if(flushed)changed=true}
    remaining+=month.reconcile.length;
    remainingReports+=Object.keys(month.reports).filter(function(id){return month.reports[id].sync!=='synced'}).length;
    if(changed){sharedSaveMonth_(book,manifest,key,month);anyChanged=true}
    else if(manifest.months[key].pending!==sharedMonthPending_(month)){manifest.months[key].pending=sharedMonthPending_(month);metadataChanged=true}
   });
   if(anyChanged||metadataChanged)sharedCommit_(book,manifest);return sharedReply_({ok:true,remaining:remaining+(config.purgeJobs||[]).length,remainingReports});
  }
  return sharedReply_({error:'지원하지 않는 API 경로'},404);
 }catch(error){return sharedReply_({error:error.message||'Google 저장 오류'},error.conflict?409:500)}finally{
  lock.releaseLock();
  if(measured){
   timing.totalMs=Date.now()-started;
   console.log((bootstrap?'bootstrap_timing ':'checkin_timing ')+JSON.stringify(timing));
  }
 }
}
/* Run these private helpers from the Apps Script editor, not from the browser. */
function configurePerformanceSheets_(expectedSpreadsheetId){
 var lock=LockService.getScriptLock();if(!lock.tryLock(20000))throw Error('다른 저장 작업이 진행 중입니다. 잠시 후 다시 실행해 주세요.');
 try{
  var props=sharedProps_();if(!expectedSpreadsheetId||props.getProperty('SPREADSHEET_ID')!==expectedSpreadsheetId)throw Error('SPREADSHEET_ID가 지정한 실적 시트와 다릅니다. 기존 자료를 옮기거나 초기화하지 말고 연결된 시트를 확인해 주세요.');
  var book=sharedBook_(),manifest=sharedManifest_(book),config=sharedConfig_(book,manifest);
  if(!manifest.initialized||!config)throw Error('이 프로젝트에 연결된 시트에는 홈페이지 공동 자료가 없습니다. 실제 운영 중인 웹앱의 Apps Script 프로젝트에서 실행해 주세요.');
  var map;try{map=JSON.parse(props.getProperty('SHEET_TAB_MAP')||'{}')}catch(error){throw Error('기존 SHEET_TAB_MAP이 올바른 JSON이 아닙니다. 기존 값을 확인해 주세요.')}
  if(!map||Array.isArray(map)||typeof map!=='object')throw Error('SHEET_TAB_MAP은 소속 ID와 탭 이름으로 구성된 JSON 객체여야 합니다.');
  var communities=config.communities||[];if(!communities.length)throw Error('등록된 소속이 없습니다. 홈페이지 운영 관리에서 소속을 먼저 확인해 주세요.');
  var used={},plans=communities.map(function(community){
   var tab=map[community.id]||String(community.name||'').trim()+' 실적 기록';
   if(!community.id||typeof tab!=='string'||!tab.trim()||tab.length>100||/[\[\]:*?\/\\]/.test(tab)||tab.indexOf('__CH_')===0)throw Error('소속 또는 실적 탭 이름을 확인해 주세요.');
   if(used[tab])throw Error('여러 소속이 같은 실적 탭을 사용하도록 설정되어 있습니다. 소속별 탭 이름을 확인해 주세요.');used[tab]=true;
   var sheet=book.getSheetByName(tab);if(sheet&&sheet.getLastRow()>0){var h=sheet.getRange(1,1,1,14).getDisplayValues()[0],staffColumn=h[11]==='담당자'?12:9;if(h[0]!=='이름'||h[6]!=='사업날짜'||!['영역명','프로그램명','프로그램명 (기존 영역명 포함)'].includes(h[7])||h[staffColumn-1]!=='담당자'||staffColumn===12&&h[13]!=='출석고유키(자동)')throw Error(tab+' 탭의 기존 열 배치가 다릅니다. 자료를 덮어쓰지 않고 중단합니다.');}
   return {id:community.id,name:community.name,tab:tab};
  });
  // Validate every destination before creating any tab or changing the mapping.
  plans.forEach(function(plan){var sheet=book.getSheetByName(plan.tab)||book.insertSheet(plan.tab);if(sheet.getLastRow()===0)sheet.getRange(1,1,1,14).setValues([['이름','','','','','','사업날짜','영역명','','','','담당자','','출석고유키(자동)']]);map[plan.id]=plan.tab});
  SpreadsheetApp.flush();props.setProperty('SHEET_TAB_MAP',JSON.stringify(map));
  var queued=0,unassignedDays=0;Object.keys(manifest.months).forEach(function(key){var month=sharedMonth_(book,manifest,key);Object.keys(month.reports).forEach(function(id){if(month.reports[id].sync!=='synced')queued++});Object.keys(month.records).forEach(function(day){if(month.records[day]==='출석'&&!month.entries.some(function(e){return e.memberId===day.slice(11)&&e.date===day.slice(0,10)&&e.checked}))unassignedDays++})});
  return {ok:true,spreadsheetId:expectedSpreadsheetId,mapping:plans,queued:queued,attendanceWithoutProgram:unassignedDays};
 }finally{lock.releaseLock()}
}
function setupSharedStorage_(){
 var props=sharedProps_();if(!sharedOrigins_().length)throw Error('SITE_ORIGINS를 먼저 설정하세요.');if((props.getProperty('STAFF_PASSWORD')||'').length<8)throw Error('8자 이상 STAFF_PASSWORD를 설정하세요.');
 var book=sharedBook_();sharedManifest_(book);if(!props.getProperty('PHOTOS_FOLDER_ID'))props.setProperty('PHOTOS_FOLDER_ID',DriveApp.createFolder('충현 출석 사이트 사진 축소본').getId());
 if(!ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='flushSharedReportQueue_'}))ScriptApp.newTrigger('flushSharedReportQueue_').timeBased().everyMinutes(5).create();
 console.log('공동 저장 준비 완료. 웹앱 배포 후 사이트에서 기초 자료를 초기화하세요.');
}
function flushSharedReportQueue_(){var origin=sharedOrigins_()[0];if(!origin)return;var token=Utilities.getUuid()+Utilities.getUuid();CacheService.getScriptCache().put('admin:'+sharedHash_(token),'1',60);try{sharedRpc({path:'/api/team/maintenance',method:'POST',input:{},token},origin,Utilities.getUuid())}finally{CacheService.getScriptCache().remove('admin:'+sharedHash_(token))}}
