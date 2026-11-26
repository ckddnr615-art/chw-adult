/* One attendance command drives daily records and automatic programme achievements. */
const team={configured:false,initialized:false,active:false,authenticated:false,googleConfigured:false,local:false,loading:true,error:'',saving:false};
let applyingTeam=false,configBaseline=null,configPending=false,configTimer,configSaving=false;
let configConflict=null;
let configRetryable=false;
const monthRevisions=new Map(),attendanceRequests=new Map();
const attendanceRecordRevisions=new Map();
let latestAttendanceRevision=0;
let kioskProgramCheckins={},kioskProgramSnapshotRevision=0;
const configSaveWaiters=[];
const CONFIG_TYPES=['communities','members','areas','programs','schedules','staff','caseAssignments','enrollments','scheduleOverrides','closures','banners','calendarNotes'];
const originalPersist=persist,previousOperationsRender=render,previousOperationsBind=bindManagement,previousPhotoEditor=openEditor;
let lastScheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])]);
function currentConfig(){return Object.fromEntries(CONFIG_TYPES.map(type=>[type,JSON.parse(JSON.stringify(management.data[type]||[]))]))}
async function teamRequest(path,input){
  const response=await fetch('/api/team/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  let result;
  try{result=await response.json()}catch{throw Error('서버 응답을 확인하지 못했습니다.')}
  if(!response.ok||result.ok===false)throw Object.assign(Error(result.error||'서버 저장 실패'),{
    status:response.status,conflict:result.conflict||response.status===409,currentStatus:result.currentStatus,participation:result.participation,
    code:result.code,date:result.date,revision:result.revision,currentFields:result.currentFields,retryable:result.busy===true||response.status===503
  });
  return result;
}
async function loadTeamMonth(month=date.slice(0,7),full=false){
 const pending=loadTeamMonth.pending||(loadTeamMonth.pending=new Map()),existing=pending.get(month);
 if(existing){
  if(!full||existing.full)return existing.promise;
  await existing.promise.catch(()=>{});
  return loadTeamMonth(month,true);
 }
 const entry={full,promise:readTeamMonth(month,full)};pending.set(month,entry);
 try{return await entry.promise}finally{if(pending.get(month)===entry)pending.delete(month)}
}
async function readTeamMonth(month,full){
  const holiday=ensureHolidayYear(month.slice(0,4)).catch(()=>{}),since=full||!team.authenticated&&team.dataDate!==date?0:monthRevisions.get(month)||0;
  const [response]=await Promise.all([fetch(`/api/team/state?month=${month}&since=${since}`,{credentials:'same-origin'}),holiday]);
  if(!response.ok)throw Error('공유 자료를 읽지 못했습니다.');const data=await response.json();return applyTeamSnapshot(month,data);
}
function applyTeamSnapshot(month,data){
  if(!data.initialized)return false;
  if(data.revision<Math.max(latestAttendanceRevision,...monthRevisions.values()))return true;
  if(data.scope==='today'){
   management.data.entries=[];management.data.audit=[];
   for(const key of Object.keys(records))if(!key.startsWith(data.date+':'))delete records[key];
   for(const key of Object.keys(management.data.days))if(!key.startsWith(data.date+':'))delete management.data.days[key];
  }
  if(data.purgedProgramIds?.length){
   management.data.entries=management.data.entries.filter(entry=>!data.purgedProgramIds.includes(entry.programId));
   if(typeof programReportState!=='undefined'&&programReportState.result&&(programReportState.result.kind==='all'&&programReportState.result.rows.some(row=>data.purgedProgramIds.includes(row.id))||data.purgedProgramIds.includes(programReportState.result.programId)))programReportState.result=null;
  }
  if(data.programCheckins){kioskProgramCheckins=data.programCheckins;kioskProgramSnapshotRevision=data.revision}
  if(!data.unchanged){applyingTeam=true;try{if(data.config&&!configPending&&!configSaving){for(const type of CONFIG_TYPES)management.data[type]=data.config[type]||[];management.data.timetableVersion=1;configBaseline=currentConfig();management.upgradeTimetable()}Object.assign(records,data.records);Object.assign(management.data.days,data.days);for(const entry of data.entries||[]){const index=management.data.entries.findIndex(e=>e.id===entry.id);if(index<0)management.data.entries.push(entry);else management.data.entries[index]=entry}if(adminSession||team.authenticated)management.data.audit=(data.audit||[]).slice().sort((a,b)=>a.time.localeCompare(b.time));originalPersist();refreshCollections();lastScheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])])}finally{applyingTeam=false}}
  if(!configPending&&!configSaving)monthRevisions.set(month,data.revision);team.active=true;team.initialized=true;team.dataDate=data.date||date;team.lastCheckedAt=Date.now();
  if(!data.unchanged&&data.scope==='today'&&typeof window!=='undefined')window.KioskStartupPreview?.save(data);
  return true;
}
function configChanges(snapshot){const changes=[];for(const type of CONFIG_TYPES){const before=new Map((configBaseline?.[type]||[]).map(x=>[x.id,x]));for(const after of snapshot[type])if(JSON.stringify(before.get(after.id)||null)!==JSON.stringify(after))changes.push({type,id:after.id,before:before.get(after.id)||null,after})}return changes}
function memberEditFields(member){
 return JSON.parse(JSON.stringify({name:member.name,communityId:member.communityId,caseManagerId:management.caseManagerAt(member.id,date),photo:member.photo||null}));
}
async function saveMemberDetails(id,before,after){
 clearTimeout(configTimer);
 if(configSaving)await saveTeamConfig();
 const result=await teamRequest('member',{memberId:id,before,after});
 const replaceMember=rows=>rows.map(member=>member.id===id?JSON.parse(JSON.stringify(result.member)):member);
 const replaceAssignments=rows=>(rows||[]).filter(row=>row.memberId!==id).concat(result.caseAssignments);
 management.data.members=replaceMember(management.data.members);
 management.data.caseAssignments=replaceAssignments(management.data.caseAssignments);
 if(configBaseline){
  configBaseline.members=replaceMember(configBaseline.members);
  configBaseline.caseAssignments=replaceAssignments(configBaseline.caseAssignments);
 }
 if(!configConflict||configConflict.type==='members'&&configConflict.id===id){team.error='';configConflict=null;configRetryable=false}
 configPending=configChanges(currentConfig()).length>0;
 originalPersist();refreshCollections();
 return result;
}
async function saveCaseManagerBatch(members,staffId){
 clearTimeout(configTimer);if(configSaving)await saveTeamConfig();
 const result=await teamRequest('case-managers',{members,staffId}),ids=new Set(result.memberIds);
 latestAttendanceRevision=Math.max(latestAttendanceRevision,result.revision||0);
 const merge=rows=>(rows||[]).filter(row=>!ids.has(row.memberId)).concat(result.caseAssignments);
 management.data.caseAssignments=merge(management.data.caseAssignments);
 if(configBaseline)configBaseline.caseAssignments=merge(configBaseline.caseAssignments);
 configPending=configChanges(currentConfig()).length>0;originalPersist();refreshCollections();return result;
}
async function requireSharedWriteAccess(){
  await teamBoot;
  const response=await fetch('/api/team/status',{credentials:'same-origin'});
  let state;try{state=await response.json()}catch{throw Error('Google 공동 저장 응답을 읽지 못했습니다. 연결 설정을 확인해 주세요.')}
  if(!response.ok||state.service!=='ch-team-api')throw Error(state.error||'Google 공동 저장 연결을 확인해 주세요. 새 사이트 주소는 Apps Script의 SITE_ORIGINS에 등록해야 합니다.');
  Object.assign(team,state);
  if(!team.authenticated)throw Error('Google 관리자 인증이 없거나 만료되었습니다. 관리자 로그인을 다시 해 주세요. 선택한 사진은 이 화면에 유지됩니다.');
  if(!team.initialized)throw Error('관리자 로그인은 완료됐지만 공동 저장소의 최초 준비가 필요합니다. 화면 맨 위의 ‘현재 자료로 공유 저장소 시작’을 먼저 실행한 뒤 사진을 등록해 주세요.');
  if(!team.active){const loaded=await loadTeamMonth(date.slice(0,7),true);if(!loaded)throw Error('공동 운영 자료를 불러오지 못했습니다. 사진을 저장하지 않았습니다.')}
  team.error='';
}
async function saveTeamConfig(){
  if(configSaving)return new Promise(resolve=>configSaveWaiters.push(resolve));
  if(!configPending||!team.active||!team.authenticated||team.error)return;
  configSaving=true;team.saving=true;showTeamStatus();
  try{while(configPending){configPending=false;const snapshot=currentConfig(),changes=configChanges(snapshot);if(changes.length){const result=await teamRequest('config',{changes});configBaseline=snapshot;if(typeof programReportState!=='undefined'&&changes.some(change=>['programs','schedules','enrollments','scheduleOverrides','closures'].includes(change.type)))programReportState.result=null;if(result.reconcile)scheduleSharedMaintenance()}team.error=''}}
  catch(error){team.error=error.message;configConflict=error.conflict?.type?error.conflict:null;configRetryable=!!error.retryable;configPending=true}
  finally{team.saving=false;configSaving=false;for(const resolve of configSaveWaiters.splice(0))resolve();showTeamStatus()}
}
function scheduleSharedMaintenance(delay=1500){
 team.reportsPending=true;clearTimeout(scheduleSharedMaintenance.timer);
 scheduleSharedMaintenance.timer=setTimeout(runSharedMaintenance,delay);
}
async function runSharedMaintenance(){
 if(runSharedMaintenance.busy)return;
 if(!team.authenticated)return;
 if(configPending||configSaving||document.hidden||commitAttendance.pending?.size){scheduleSharedMaintenance(30000);return}
 runSharedMaintenance.busy=true;
 try{
  const result=await teamRequest('maintenance',{});
  team.reportsPending=!!(result.remaining||result.remainingReports);team.reportError='';
  if(team.reportsPending)scheduleSharedMaintenance(30000);
 }catch(error){
  team.reportError='저장 완료 · 실적 반영은 재확인 중입니다.';
  if(error.status!==401)scheduleSharedMaintenance(30000);
 }finally{runSharedMaintenance.busy=false;showTeamStatus()}
}
persist=function(){
  // A date-specific schedule re-evaluates existing arrival-linked achievements for that date.
  const scheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])]);
  if(!applyingTeam&&!team.active&&scheduleJSON!==lastScheduleJSON){
    const old=JSON.parse(lastScheduleJSON),next=JSON.parse(scheduleJSON);
    const changed=i=>next[i].filter(item=>!old[i].some(previous=>previous.id===item.id&&JSON.stringify(previous)===JSON.stringify(item)));
    const overrides=changed(1).filter(item=>item.active!==false&&item.recalculateAttendance);
    const closures=changed(2).flatMap(item=>[item,old[2].find(previous=>previous.id===item.id)].filter(Boolean));
    for(const [key,status] of Object.entries(records)){
      const d=key.slice(0,10);
      if(status==='출석'&&d<=date&&(overrides.some(item=>item.date===d)||closures.some(item=>ManagementStore.closureContains(item,d))))management.applyAttendance(records,key.slice(11),d,'출석',true);
    }
  }
  lastScheduleJSON=scheduleJSON;
  const result=originalPersist();if(result&&!applyingTeam&&team.active&&team.authenticated){configPending=true;clearTimeout(configTimer);configTimer=setTimeout(saveTeamConfig,180)}return result;
};
function applyAttendanceReceipt(memberId,day,value,revision,participation){
  const key=day+':'+memberId;
  if(revision&&revision<Math.max(attendanceRecordRevisions.get(key)||0,...monthRevisions.values()))return;
  if(revision){
    latestAttendanceRevision=Math.max(latestAttendanceRevision,revision);
    attendanceRecordRevisions.set(key,revision);
  }
  records[key]=value;
  if(participation!==undefined){
    const dayRecord=management.data.days[key]||(management.data.days[key]={});
    dayRecord.participation=participation;
  }
}
async function commitAttendance(memberId,d,value,publicCheckin=false,participation,schedule){
 const pending=commitAttendance.pending||(commitAttendance.pending=new Map());
 const key=JSON.stringify([memberId,d,value,publicCheckin,participation||'',schedule?.id||'',schedule?.program.id||'']);
 if(pending.has(key))return pending.get(key);
 const request=writeAttendance(memberId,d,value,publicCheckin,participation,schedule);pending.set(key,request);
 try{return await request}finally{if(pending.get(key)===request)pending.delete(key)}
}
function applyStaffAttendanceState(result,memberId,day){
 const state=result.attendanceState,key=day+':'+memberId,revision=result.revision;
 if(!state||state.memberId!==memberId||state.date!==day||!Array.isArray(state.entries)||state.entries.some(e=>e.memberId!==memberId||e.date!==day))return false;
 if(revision<Math.max(attendanceRecordRevisions.get(key)||0,...monthRevisions.values()))return true;
 if(state.day)management.data.days[key]=state.day;else delete management.data.days[key];
 management.data.entries=management.data.entries.filter(e=>e.memberId!==memberId||e.date!==day).concat(state.entries);
 if(typeof programReportState!=='undefined')programReportState.result=null;
 originalPersist();return true;
}
async function writeAttendance(memberId,d,value,publicCheckin=false,participation,schedule){if(!team.active)throw Error('Google 공동 저장 연결 후 출석할 수 있습니다.');
  if(schedule&&!team.programCheckin)throw Error('프로그램 출석을 사용하려면 서버를 먼저 업데이트해 주세요.');
  if(participation&&!team.participationPeriods)throw Error('오전·오후 출석을 사용하려면 관리자에게 서버 업데이트를 요청해 주세요.');
  if(!publicCheckin)await ensureHolidayYear(d.slice(0,4));
  if(team.active){
    const key=memberId+':'+d+':'+value+':'+(schedule?ManagementStore.programAttendanceKey(schedule.id,schedule.program.id):participation||''),requestId=attendanceRequests.get(key)||crypto.randomUUID();attendanceRequests.set(key,requestId);
    const expectedStatus=records[d+':'+memberId]||'';
    let result;for(let n=0;n<3;n++){try{result=await teamRequest(publicCheckin?'checkin':'attendance',{memberId,date:d,status:value,requestId,expectedStatus,participation,scheduleId:schedule?.id,programId:schedule?.program.id,expectedParticipation:attendancePeriod(memberId,d),deferReports:publicCheckin||team.attendanceReceipt===true,refreshPrograms:!publicCheckin&&team.attendanceReceipt===true});break}catch(error){
      if(error.currentStatus!==undefined){
        attendanceRequests.delete(key);
        applyAttendanceReceipt(memberId,error.date||d,error.currentStatus,error.revision,error.participation);
        if(!publicCheckin)render();
        throw error;
      }
      if(n===2||error.status>=400&&error.status<500&&error.status!==409)throw error;
      await new Promise(resolve=>setTimeout(resolve,250*(n+1)+Math.random()*250));
    }}
    attendanceRequests.delete(key);
    applyAttendanceReceipt(memberId,result.date||d,result.status??value,result.revision,result.participation);
    if(result.scheduleKey&&result.revision>=kioskProgramSnapshotRevision){
      const checked=kioskProgramCheckins[result.scheduleKey]||=[];
      if(!checked.includes(memberId))checked.push(memberId);
    }
    if(publicCheckin)return result;
    if(!applyStaffAttendanceState(result,memberId,result.date||d)){
     try{await loadTeamMonth(d.slice(0,7))}catch{team.refreshError='출결 저장 완료 · 최신 자료를 다시 확인해 주세요.'}
    }
    if(result.reportReceipt?.pending)scheduleSharedMaintenance(5000);
    render();return result;
  }
  let result;if(!transaction(()=>{result=management.applyAttendance(records,memberId,d,value)}))throw Error('기기 저장에 실패했습니다.');render();return result;
}
function openConfigConflict(){
  const {type,id,current}=configConflict;
  const original=configBaseline?.[type]?.find(row=>row.id===id);
  const draft=management.data[type]?.find(row=>row.id===id);
  if(!draft||!current||!original){toast('현재 자료를 백업한 뒤 서버 자료를 확인해 주세요.');return}
  const fields=[...new Set([...Object.keys(original),...Object.keys(draft)])].filter(key=>
    key!=='id'&&JSON.stringify(draft[key])!==JSON.stringify(original[key]));
  const labels={name:'이름',selectionHidden:'목록에서 제외',start:'시작 시간',end:'종료 시간',location:'장소',facilitatorIds:'진행 직원',weekdays:'요일',reason:'변경 이유'};
  const value=(key,item)=>key==='facilitatorIds'&&Array.isArray(item)?management.staffNames(item):typeof item==='string'?item:JSON.stringify(item)??'—';
  const rows=fields.map((key,i)=>'<tr><td><input type="checkbox" name="field" value="'+i+'" aria-label="'+esc(labels[key]||key)+' 적용" '+(JSON.stringify(original[key])===JSON.stringify(current[key])?'checked':'')+'></td><td>'+esc(labels[key]||key)+'</td><td>'+esc(value(key,current[key]))+'</td><td>'+esc(value(key,draft[key]))+'</td></tr>').join('');
  modal('<h2>저장 내용 비교</h2><p>적용할 항목을 선택해 주세요.</p><form id="compareConfig" class="entityform"><div class="tablewrap"><table class="admin-table"><thead><tr><th>적용</th><th>항목</th><th>먼저 저장된 내용</th><th>내 입력</th></tr></thead><tbody>'+rows+'</tbody></table></div><button type="submit" class="primary">선택한 수정 적용</button></form>');
  $('#compareConfig').onsubmit=async event=>{
    event.preventDefault();
    const merged={...current};
    for(const index of new FormData(event.target).getAll('field')){
      const key=fields[Number(index)];
      if(draft[key]===undefined)delete merged[key];else merged[key]=draft[key];
    }
    configBaseline[type]=configBaseline[type].map(row=>row.id===id?current:row);
    management.data[type]=management.data[type].map(row=>row.id===id?merged:row);
    team.error='';configConflict=null;configPending=true;
    $('#dialog').close();
    await saveTeamConfig();
    if(!team.error){await loadTeamMonth(date.slice(0,7),true).catch(()=>{});render()}
  };
}
function showTeamStatus(){
  syncSharedRefreshControl();
  document.querySelector('#teamStatus')?.remove();if(!$('#main'))return;
  const text=team.loading?'Google 공동 저장 확인 중…':team.error?'저장 확인 필요 · '+team.error:team.saving?'공유 서버에 저장 중…':team.refreshError?team.refreshError:team.active?`Google 공동 저장 연결됨 · 프로그램 실적 ${team.googleConfigured?'자동 전송 설정됨':'프로그램 담당 직원 지정 대기'}`:team.configured?'공유 저장소가 비어 있습니다. 관리자 로그인 후 현재 자료로 시작해 주세요.':'브라우저 저장 모드 · 다른 기기 공유는 배포 서버 연결 후 가능합니다.';
  const node=document.createElement('section');node.id='teamStatus';node.className='team-status'+(team.error?' error':'');node.setAttribute('role','status');node.innerHTML=`<span>${esc(text)}</span>${team.configured&&!team.initialized&&adminSession?'<button class="secondary" id="initializeTeam">현재 자료로 공유 저장소 시작</button>':''}${team.error?'<button class="secondary" id="reloadTeam">서버 자료 다시 불러오기</button>':''}`;$('#main').prepend(node);
  if(team.reportError||team.reportsPending){const report=document.createElement('small');report.textContent=team.reportError||'운영 정보 저장 완료 · 관련 실적은 순서대로 반영 중입니다.';node.append(report)}
  if(configConflict&&team.error){
    node.insertAdjacentHTML('beforeend','<button class="secondary" id="compareTeamConfig">저장 내용 비교</button>');
    $('#compareTeamConfig').onclick=openConfigConflict;
  }
  if(configPending&&configRetryable&&team.error){
    node.insertAdjacentHTML('beforeend','<button class="secondary" id="retryTeamConfig">저장 다시 시도</button>');
    $('#retryTeamConfig').onclick=async()=>{team.error='';configRetryable=false;await saveTeamConfig();if(!team.error)render()};
  }
  if($('#initializeTeam'))$('#initializeTeam').onclick=async()=>{const button=$('#initializeTeam');button.disabled=true;try{await teamRequest('initialize',{management:management.data,records});team.error='';await loadTeamMonth(date.slice(0,7),true);render();toast('공유 저장소에 기존 자료를 보관했습니다.')}catch(error){team.error=error.message;showTeamStatus()}};
  if($('#reloadTeam'))$('#reloadTeam').onclick=()=>{modal('<h2>서버 자료를 불러올까요?</h2><p>현재 기기의 미반영 변경은 아래 백업 버튼으로 먼저 저장할 수 있습니다. 서버 자료를 불러오면 같은 항목의 미반영 변경은 대신 적용하지 않습니다.</p><button class="secondary" id="backupTeam">현재 자료 백업</button><button class="primary" id="confirmReloadTeam">서버 자료 불러오기</button>');$('#backupTeam').onclick=downloadTeamBackup;$('#confirmReloadTeam').onclick=async()=>{team.error='';configConflict=null;configPending=false;await loadTeamMonth(date.slice(0,7),true);$('#dialog').close();render()}};
  $('.localstate').textContent=team.active?'Google 공동 저장':'Google 연결 대기';
  const environment=$('.mode');if(environment)environment.innerHTML=team.active?'공동 저장 <span>GOOGLE</span><p>Google Sheets · Drive 연결</p>':'연결 설정 <span>대기</span><p>Google 공동 저장 연결 전입니다.</p>';
  const profile=$('.profile small');if(profile)profile.textContent=adminSession?(team.authenticated?'성인지원팀 · 서버 인증':'성인지원팀 · 프리뷰 로그인'):'성인지원팀 · 미로그인';
  if($('.demofoot'))$('.demofoot').textContent=team.active?'출석은 공유 서버에 기록되고 프로그램 실적은 자동으로 연결됩니다. Google 반영 상태는 관리자 화면에서 확인할 수 있습니다.':'이 브라우저에 저장합니다. 배포 DB와 Google 연결 후 공유 및 자동 전송이 작동합니다.';
}
function downloadTeamBackup(){const blob=new Blob([JSON.stringify({records,management:management.data},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='충현_운영자료_백업_'+date+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function automaticLedger(d,memberId=''){
  const rawEntries=management.data.entries.filter(e=>e.date===d&&(!memberId||e.memberId===memberId)),entries=PerformanceProjection.aggregate(rawEntries).map(e=>({...e,sync:e.allSourceIds.length&&e.allSourceIds.every(id=>rawEntries.find(s=>s.id===id)?.sync==='synced')?'synced':'pending'}));
  return `<details class="ledger-panel"><summary>출석에 연결된 실적 · ${entries.filter(e=>e.checked).length}건 / 취소 ${entries.filter(e=>!e.checked).length}건</summary><p class="notice">새 실적은 참여자별·날짜별·프로그램별로 집계합니다. 기존 실적은 기록 당시 기준으로 표시합니다. 결석·미입력 변경 시 그날 연결된 실적을 모두 취소합니다. 결석은 실적 행을 만들지 않습니다.</p><div class="tablewrap"><table class="admin-table"><thead><tr><th>참여자</th><th>소속</th><th>실적명</th><th>담당자</th><th>실적 상태</th><th>Google</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.community)}</td><td>${esc(PerformanceProjection.label(e))}</td><td>${esc(e.staff)}</td><td>${e.checked?'출석 연동':'취소'}</td><td>${e.sync==='synced'?'반영 확인':team.googleConfigured?'전송 대기':'미연결 · 대기'}</td></tr>`).join('')||'<tr><td colspan="6">연결된 실적이 없습니다.</td></tr>'}</tbody></table></div><button class="secondary" id="exportLinkedEntries">이 날짜 실적 CSV</button></details>`;
}
function patchPhotos(){
  for(const button of document.querySelectorAll('[data-checkin]')){const member=management.find('members',button.dataset.checkin);if(member?.photo)button.querySelector('.avatar')?.replaceWith(document.createRange().createContextualFragment(photoMarkup(member)))}
  for(const row of document.querySelectorAll('tr[data-catalog-type="members"]')){const member=management.find('members',row.dataset.catalogId);if(member)(row.querySelector('.member-name-cell')||row.cells[0]).insertAdjacentHTML('afterbegin',photoMarkup(member,'small-portrait'))}
  void hydratePhotos();
}
render=function(){if(location.hash.split('/')[0]==='#attendance')programAttendanceDate=selectedDate;if(location.hash==='#performance')history.replaceState(null,'','#attendance');previousOperationsRender();showTeamStatus();patchPhotos();holidayNotice();if(location.hash.split('/')[0]==='#attendance'&&$('#main .panel')){$('#main .panel').insertAdjacentHTML('beforeend',automaticLedger(selectedDate));$('#main .panel').insertAdjacentHTML('beforebegin',programAttendancePanel());bindProgramAttendance();if($('#exportLinkedEntries'))$('#exportLinkedEntries').onclick=()=>exportEntries(management.data.entries.filter(e=>e.date===selectedDate),'출석연동_실적_'+selectedDate+'.csv')}};
openEditor=function(type,id=''){if(type==='closures')return openClosureEditor(id);if(type==='members')return openMemberPhotoEditor(id);return previousPhotoEditor(type,id)};
editDay=function(key){const d=key.slice(0,10),id=key.slice(11),member=management.find('members',id);if(d>date){toast('미래 출결을 입력할 수 없습니다.');return}modal(`<h2>${esc(member.name)} · ${d}</h2><form id="linkedDayForm" class="entityform"><label>출결 상태<select name="status">${attendanceOptionMarkup(id,d)}</select></label><p class="formhint">출석 이외 상태로 바꾸면 그날 연결된 실적을 모두 취소합니다. 결석은 월별 출석부에 O로만 표시합니다.</p><p id="linkedDayError" role="alert"></p><button class="primary" type="submit">출결과 연결 실적 저장</button></form>`);$('#linkedDayForm').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const result=await saveAttendanceOption(id,d,new FormData(e.target).get('status'));$('#dialog').close();toast(staffAttendanceMessage(result))}catch(error){$('#linkedDayError').textContent=error.message;e.submitter.disabled=false}}};
function staffAttendanceMessage(result){
  const receipt=result?.reportReceipt;
  if(!receipt)return '출결을 저장했습니다.';
  if(receipt.mappingMissing||receipt.failed)return '출결 저장 완료 · 실적 시트 연결 또는 전송 오류를 확인해 주세요.';
  if(receipt.pending)return '출결 저장 완료 · 실적 시트 반영 대기';
  if(receipt.noSchedule)return '출결 저장 완료 · 해당 날짜의 운영 요일과 참여자 배정 적용일을 확인해 주세요.';
  return '출결과 실적 시트 반영을 확인했습니다.';
}
const absenceMessage='오늘 못 와요로 기록되어 있어요. 출석하려면 직원에게 알려 주세요.';
let kioskRefreshQueued=false;
function refreshKioskAfterDialog(){
  const dialog=$('#dialog');
  if(!dialog.open){
    render();
    return;
  }
  if(kioskRefreshQueued)return;
  kioskRefreshQueued=true;
  dialog.addEventListener('close',()=>{
    kioskRefreshQueued=false;
    if(location.hash==='#kiosk'||!location.hash)refreshKioskAfterDialog();
  },{once:true});
}
function showAbsenceNotice(){
  const content='<h2>오늘 못 와요</h2><p>'+absenceMessage+'</p>';
  if($('#dialog').open)$('#dialogcontent').innerHTML=content;
  else modal(content);
  $('#closeDialog').textContent='알겠어요';
  say(absenceMessage);
}
function attendancePeriod(id,day){
  const key=day+':'+id;
  return records[key]==='출석'?management.data.days[key]?.participation||'both':'';
}
function attendanceOption(id,day){
  const current=records[day+':'+id]||'';
  return current==='출석'?attendancePeriod(id,day):current;
}
const ATTENDANCE_OPTIONS=[['','미입력'],['am','오전만 참여'],['pm','오후만 참여'],['both','하루 참여'],['결석','오늘 못 와요 (결석)']];
function attendanceOptionMarkup(id,day){
  const current=attendanceOption(id,day);
  return ATTENDANCE_OPTIONS.map(([value,label])=>'<option value="'+value+'" '+(value===current?'selected':'')+'>'+label+'</option>').join('');
}
async function saveAttendanceOption(id,day,value){
  const select=[...document.querySelectorAll('[data-status]')].find(node=>node.dataset.status===id),cell=select?.closest('tr')?.querySelector('td:last-child'),oldText=cell?.textContent;
  if(cell)cell.textContent='저장 중…';
  const participation=['am','pm','both'].includes(value)?value:undefined;
  try{return await commitAttendance(id,day,participation?'출석':value,false,participation)}
  catch(error){if(cell?.isConnected)cell.textContent=oldText;throw error}
}
async function changeAttendanceDate(day,force=false){
 const previous=selectedDate,inputs=[$('#filterDate'),$('#programAttendanceDate')].filter(Boolean);
 const valid=/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day&&day<=date;
 if(changeAttendanceDate.busy){for(const input of inputs)input.value=changeAttendanceDate.pendingDay;return}
 if(!valid||commitAttendance.pending?.size){
  for(const input of inputs)input.value=previous;
  if(commitAttendance.pending?.size)toast('출결 저장이 끝난 뒤 날짜를 바꿔 주세요.');return;
 }
 changeAttendanceDate.busy=true;
 changeAttendanceDate.pendingDay=day;
 const main=$('#main'),focusId=document.activeElement?.id;
 for(const input of inputs){input.value=day;input.disabled=true}
 if(main){main.dataset.attendanceDateLoading=day;main.setAttribute('aria-busy','true');main.inert=true}
 const feedback=$('#programAttendanceFeedback');if(feedback)feedback.textContent=day+' 자료를 확인하고 있습니다.';
 try{
  if(team.active&&!await loadTeamMonth(day.slice(0,7),force))throw Error('해당 날짜의 공유 자료를 읽지 못했습니다.');
  selectedDate=day;programAttendanceDate=day;render();
 }catch(error){selectedDate=previous;programAttendanceDate=previous;render();toast(error.message)}
 finally{
  changeAttendanceDate.busy=false;
  delete changeAttendanceDate.pendingDay;
  if(main){delete main.dataset.attendanceDateLoading;main.removeAttribute('aria-busy');main.inert=false}
  for(const id of ['#filterDate','#programAttendanceDate']){const input=$(id);if(input){input.value=selectedDate;input.disabled=false}}
  if(focusId==='filterDate'||focusId==='programAttendanceDate')$('#'+focusId)?.focus({preventScroll:true});
 }
}
bindManagement=function(page){
  previousOperationsBind(page);bindClosureManagement();if(page==='appearance')bindBannerSettings();
  if(page==='kiosk')document.querySelectorAll('[data-checkin]').forEach(button=>{button.disabled=true});
  if(page==='operations'){
    const controls=document.querySelectorAll('[data-kiosk-move]');
    controls.forEach(button=>button.onclick=async()=>{
      if(team.error){toast(team.error);return}
      const id=button.dataset.kioskAffiliation,direction=Number(button.dataset.kioskMove);
      if(!transaction(()=>management.moveKioskAffiliation(id,direction)))return;
      controls.forEach(control=>{control.disabled=true});
      if(team.active)await saveTeamConfig();
      render();
      const options=[...document.querySelectorAll('[data-kiosk-move]')].filter(control=>control.dataset.kioskAffiliation===id&&!control.disabled);
      (options.find(control=>Number(control.dataset.kioskMove)===direction)||options[0])?.focus();
      toast(team.error||'출석 화면 소속 순서를 저장했습니다.');
    });
  }
  if(page==='login'){
    $('#loginHint').textContent=team.local||!team.loading&&!team.configured?'로컬 미리보기 비밀번호는 demo1234입니다.':'기존 관리자 비밀번호를 입력해 주세요.';
    $('#loginForm').onsubmit=async event=>{
      event.preventDefault();
      const button=event.submitter;
      const password=$('#loginCode').value;
      button.disabled=true;
      $('#loginError').textContent='';
      try{
        await teamBoot;
        if(team.configured){
          const response=await fetch('/api/integration-login',{
            method:'POST',credentials:'same-origin',
            headers:{'Content-Type':'application/json'},body:JSON.stringify({password})
          });
          if(!response.ok){
            if(response.status===401)throw Error('관리자 비밀번호를 확인해 주세요.');
            const failure=await response.json();
            throw Error(failure.error||'관리자 로그인에 실패했습니다.');
          }
          team.staffId='';
          team.authenticated=true;
          monthRevisions.clear();
          await loadTeamMonth(date.slice(0,7),true);
        }else if(password!=='demo1234')throw Error('관리자 비밀번호를 확인해 주세요.');
        adminSession=true;
        location.hash='dashboard';
      }catch(error){
        if($('#loginError'))$('#loginError').textContent=error.message;
        const activeButton=$('#loginForm button[type="submit"]');if(activeButton)activeButton.disabled=false;
      }
    };
  }
  if(page==='dashboard')showStaffDesk();
  if(page==='attendance'){
   if($('#filterDate'))$('#filterDate').onchange=event=>{void changeAttendanceDate(event.target.value)};
   document.querySelectorAll('[data-attendance-recheck]').forEach(button=>button.onclick=async()=>{const id=button.dataset.attendanceRecheck,day=selectedDate;button.disabled=true;try{const result=await saveAttendanceOption(id,day,attendanceOption(id,day));toast(staffAttendanceMessage(result))}catch(error){button.disabled=false;toast(error.message)}});
   document.querySelectorAll('[data-status]').forEach(select=>select.onchange=async()=>{const previous=attendanceOption(select.dataset.status,selectedDate);select.disabled=true;try{const result=await saveAttendanceOption(select.dataset.status,selectedDate,select.value);toast(staffAttendanceMessage(result))}catch(error){select.value=previous;select.disabled=false;toast(error.message)}})}
  if(page==='workspace'){if($('#backupTeamData'))$('#backupTeamData').onclick=downloadTeamBackup;if($('#refreshTeamData'))$('#refreshTeamData').onclick=async()=>{await loadTeamMonth(date.slice(0,7),true);render()}}
  if(page==='reports'&&$('#reportMonth')){
    const picker=$('#reportMonth'),original=picker.onchange;
    picker.onchange=async()=>{
      const month=picker.value;
      if(!month)return;
      picker.disabled=true;
      try{
        await ensureHolidayYear(month.slice(0,4));
        if(team.active)await loadTeamMonth(month);
        original({target:picker});
      }catch(error){picker.value=reportMonth;toast(error.message)}
      finally{picker.disabled=false}
    };
  }
};
managementPages.workspace=function(){return heading('Google 공동 저장','공동 자료와 출결은 Google Sheets에, 사진 축소본은 Drive에 보관합니다.')+`<section class="panel"><h2>${team.active?'Google 공동 저장 연결됨':'Google 연결 설정 필요'}</h2><p>프로그램 실적: <b>${team.googleConfigured?'프로그램 담당 직원별 탭 자동 반영':'프로그램 담당 직원 지정 필요'}</b></p><p class="notice">사진은 Drive 비공개 폴더에 저장하며, 프로그램 담당 직원의 실적 탭을 자동 생성합니다. 운영 요일에 지정한 실적 담당자 한 명의 탭에 기록합니다.</p><div class="actions"><button class="secondary" id="backupTeamData">운영 자료 백업</button><button class="secondary" id="refreshTeamData">공동 자료 새로 확인</button></div><p><a class="textbutton" href="연결설명서.html" target="_blank" rel="noopener">Google 연결 설명서 ↗</a></p></section>`};
managementPages.settings=function(){return heading('환경 설정','운영 환경과 자료 보관 상태를 확인합니다. 배너 문구·사진·글자 크기는 화면 설정에서 변경합니다.')+`<section class="panel"><h2>운영 환경</h2><p>업무 시간대: Asia/Seoul</p><p>Google 공동 저장: ${team.active?'연결됨':'연결 확인 필요'}</p><p>Google Sheets: ${team.googleConfigured?'서버 전송 설정됨':'미연결'}</p><a href="#appearance" class="primary">화면 설정 열기 ↗</a></section>`};
managementPages.performance=attendance;
let sharedRefreshBusy=false;
function sharedRefreshBlocked(){
 return (typeof changeAttendanceDate!=='undefined'&&changeAttendanceDate.busy)||!sharedScreenCanRefresh()||(typeof caseBulkSelected!=='undefined'&&caseBulkSelected.size>0)||(typeof memberRowDrafts!=='undefined'&&memberRowDrafts.size>0)||(typeof programStaffDrafts!=='undefined'&&programStaffDrafts.size>0);
}
function syncSharedRefreshControl(){
 const header=document.querySelector('.headeractions');if(!header)return;
 let button=$('#refreshSharedChanges');
 if(!adminSession||document.body.classList.contains('participant-mode')){button?.remove();return}
 if(!button){button=document.createElement('button');button.id='refreshSharedChanges';button.type='button';button.className='secondary';button.onclick=refreshSharedChanges;header.prepend(button)}
 button.disabled=sharedRefreshBusy||team.loading;button.textContent=sharedRefreshBusy?'최신화 중…':'↻ 변경 최신화';button.title='다른 직원이 저장한 최신 일정·출결·운영 정보를 불러옵니다.'+(team.lastCheckedAt?' 마지막 확인 '+new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(new Date(team.lastCheckedAt)):'');
}
async function refreshSharedChanges(){
 if(sharedRefreshBusy)return;
 if(configPending||configSaving||team.saving){toast(team.error||'저장 중인 변경이 있습니다. 저장을 완료한 뒤 최신화해 주세요.');return}
 if(sharedRefreshBlocked()){toast('입력 중인 내용을 저장하거나 취소한 뒤 최신화해 주세요.');return}
 if(location.hash.split('/')[0]==='#program-reports'){await queryProgramReports();return}
 sharedRefreshBusy=true;syncSharedRefreshControl();
 try{
  const response=await fetch('/api/team/status',{credentials:'same-origin'}),state=await response.json();
  if(!response.ok||state.service!=='ch-team-api')throw Error(state.error||'공동 저장 연결을 확인해 주세요.');
  if(!state.authenticated)throw Error('관리자 로그인 시간이 만료되었습니다. 다시 로그인해 주세요.');
  if(!state.initialized)throw Error('공동 저장소 최초 준비가 필요합니다.');
  Object.assign(team,state);
  // An edit can start while the network request is in flight.
  if(configPending||configSaving||sharedRefreshBlocked())throw Error('입력 중인 내용을 유지했습니다. 저장하거나 취소한 뒤 최신화해 주세요.');
  const page=location.hash.split('/')[0],month=page==='#reports'?reportMonth:page==='#attendance'?selectedDate.slice(0,7):date.slice(0,7);
  const loaded=await loadTeamMonth(month,true);if(!loaded)throw Error('최신 자료를 확인하지 못했습니다.');
  if(sharedRefreshBlocked()){toast('최신 자료를 확인했습니다. 입력 중인 화면은 유지합니다.');return}
  team.error='';render();toast('다른 직원이 저장한 최신 변경을 반영했습니다.');
 }catch(error){toast(error.message)}finally{sharedRefreshBusy=false;syncSharedRefreshControl()}
}
const initialHash=location.hash;
async function bootTeam(){
 const started=Date.now();
 try{
  const response=await fetch('/api/team/bootstrap',{credentials:'same-origin'});
  if([401,404].includes(response.status)){
   const legacy=await fetch('/api/team/status',{credentials:'same-origin'});if(!legacy.ok)throw Error('Google 연결 상태 확인 실패');const status=await legacy.json();if(status.service!=='ch-team-api')throw Error('공동 저장 응답 오류');
   Object.assign(team,status);adminSession=!!team.authenticated;team.active=false;
   if(team.initialized)await loadTeamMonth(date.slice(0,7),true);team.startupMode='legacy';
  }else{
   const data=await response.json();if(!response.ok||data.team?.service!=='ch-team-api')throw Error(data.error||'Google 초기 자료를 읽지 못했습니다.');
   Object.assign(team,data.team);adminSession=!!team.authenticated;team.active=false;
   if(data.date!==date){date=data.date;selectedDate=date;prettyDate=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date(date+'T12:00:00+09:00'))}
   acceptHolidayYear(date.slice(0,4),data.holidays,false);
   if(data.initialized&&!applyTeamSnapshot(date.slice(0,7),data))throw Error('초기 자료 반영 실패');
   team.startupMode='bootstrap';team.startupServerTiming=data.timing||{};
  }
  apiState={available:true,configured:!!team.googleConfigured,authenticated:!!team.authenticated};
  if(adminSession&&initialHash!=='#login')history.replaceState(null,'',initialHash||'#kiosk');
 }catch(error){team.configured=true;team.error=error.message||'Google 공동 저장 연결 설정을 확인해 주세요.';adminSession=false}
 finally{
  team.loading=false;team.startupMs=Date.now()-started;render();
  const main=$('#main');if(main){
   const transport=typeof window!=='undefined'?window.googleLoadTiming?.():null,request=transport?.requests?.filter(r=>r.path==='/api/team/bootstrap').slice(-1)[0];
   main.dataset.startupMode=team.startupMode||'error';main.dataset.startupMs=String(team.startupMs);main.dataset.startupServerMs=String(team.startupServerTiming?.totalMs||0);
   main.dataset.startupConnectionMs=String(transport?.connectionMs||0);main.dataset.startupRequestMs=String(request?.durationMs||0);
   main.dataset.startupSource=request?.source||'rpc';
  }
 }
}
const teamBoot=bootTeam();
render();
function sharedScreenCanRefresh(){
 if($('#dialog')?.open||document.activeElement?.closest('#summaryAttendanceForm,#participantSearch,#calendarNoteForm,[data-quick-schedule]'))return false;
 const calendar=$('#calendarNoteForm');
 if(calendar&&(calendar.dataset.editing||[...calendar.querySelectorAll('input,textarea')].some(input=>input.value.trim())))return false;
 return true;
}
async function refreshSharedInBackground(){
 if(refreshSharedInBackground.busy||!team.active||document.hidden||configPending||configSaving||['#appearance','#program-reports'].includes(location.hash)||sharedRefreshBlocked())return;
 refreshSharedInBackground.busy=true;
 const month=location.hash==='#reports'?reportMonth:location.hash==='#attendance'?selectedDate.slice(0,7):date.slice(0,7),before=monthRevisions.get(month),hadRefreshError=!!team.refreshError;
 try{
  await loadTeamMonth(month);team.refreshError='';
  if(before!==monthRevisions.get(month)&&!sharedRefreshBlocked())render();
  else if(hadRefreshError)showTeamStatus();
  else syncSharedRefreshControl();
 }catch{team.refreshError='최신 자료 확인이 지연되고 있습니다. 현재 자료는 유지되며 다음에 다시 확인합니다.';showTeamStatus()}
 finally{refreshSharedInBackground.busy=false}
}
setInterval(async()=>{await refreshSharedInBackground()},30000+Math.floor(Math.random()*5000));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshSharedInBackground()});
