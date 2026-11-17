/* One attendance command drives daily records and automatic programme achievements. */
const team={configured:false,initialized:false,active:false,authenticated:false,googleConfigured:false,local:false,loading:true,error:'',saving:false};
let applyingTeam=false,configBaseline=null,configPending=false,configTimer,configSaving=false;
let configConflict=null;
let configRetryable=false;
const monthRevisions=new Map(),attendanceRequests=new Map();
const configSaveWaiters=[];
const CONFIG_TYPES=['communities','members','areas','programs','schedules','staff','caseAssignments','enrollments','scheduleOverrides','closures','banners'];
const originalPersist=persist,previousOperationsRender=render,previousOperationsBind=bindManagement,previousPhotoEditor=openEditor;
let lastScheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])]);
function currentConfig(){return Object.fromEntries(CONFIG_TYPES.map(type=>[type,JSON.parse(JSON.stringify(management.data[type]||[]))]))}
async function teamRequest(path,input){const response=await fetch('/api/team/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});let result;try{result=await response.json()}catch{throw Error('서버 응답을 확인하지 못했습니다.')}if(!response.ok||result.ok===false)throw Object.assign(Error(result.error||'서버 저장 실패'),{status:response.status,conflict:result.conflict||response.status===409,currentStatus:result.currentStatus,retryable:result.busy===true||response.status===503});return result}
async function loadTeamMonth(month=date.slice(0,7),full=false){
  await ensureHolidayYear(month.slice(0,4)).catch(()=>{});
  const since=full?0:monthRevisions.get(month)||0,response=await fetch(`/api/team/state?month=${month}&since=${since}`,{credentials:'same-origin'});if(!response.ok)throw Error('공유 자료를 읽지 못했습니다.');const data=await response.json();if(!data.initialized)return false;
  if(data.revision<Math.max(0,...monthRevisions.values()))return true;
  if(!data.unchanged){applyingTeam=true;try{if(data.config&&!configPending&&!configSaving){for(const type of CONFIG_TYPES)management.data[type]=data.config[type]||[];management.data.timetableVersion=1;configBaseline=currentConfig();management.upgradeTimetable()}Object.assign(records,data.records);Object.assign(management.data.days,data.days);for(const entry of data.entries||[]){const index=management.data.entries.findIndex(e=>e.id===entry.id);if(index<0)management.data.entries.push(entry);else management.data.entries[index]=entry}if(adminSession||team.authenticated)management.data.audit=(data.audit||[]).slice().sort((a,b)=>a.time.localeCompare(b.time));originalPersist();refreshCollections();lastScheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])])}finally{applyingTeam=false}}
  if(!configPending&&!configSaving)monthRevisions.set(month,data.revision);team.active=true;team.initialized=true;return true;
}
function configChanges(snapshot){const changes=[];for(const type of CONFIG_TYPES){const before=new Map((configBaseline?.[type]||[]).map(x=>[x.id,x]));for(const after of snapshot[type])if(JSON.stringify(before.get(after.id)||null)!==JSON.stringify(after))changes.push({type,id:after.id,before:before.get(after.id)||null,after})}return changes}
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
  try{while(configPending){configPending=false;const snapshot=currentConfig(),changes=configChanges(snapshot);if(changes.length){const result=await teamRequest('config',{changes});configBaseline=snapshot;if(result.reconcile){for(let n=0;n<10;n++){const next=await teamRequest('maintenance',{});if(!next.remaining)break}await loadTeamMonth(date.slice(0,7))}}team.error=''}}
  catch(error){team.error=error.message;configConflict=error.conflict?.type?error.conflict:null;configRetryable=!!error.retryable;configPending=true}
  finally{team.saving=false;configSaving=false;for(const resolve of configSaveWaiters.splice(0))resolve();showTeamStatus()}
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
async function commitAttendance(memberId,d,value,publicCheckin=false){if(!team.active)throw Error('Google 공동 저장 연결 후 출석할 수 있습니다.');
  await ensureHolidayYear(d.slice(0,4));if(publicCheckin&&management.holidayName(d))throw Error(management.holidayName(d)+' · 오늘은 쉬는 날입니다.');
  if(team.active){
    const key=memberId+':'+d+':'+value,requestId=attendanceRequests.get(key)||crypto.randomUUID();attendanceRequests.set(key,requestId);
    const expectedStatus=records[d+':'+memberId]||'';
    let result;for(let n=0;n<3;n++){try{result=await teamRequest(publicCheckin?'checkin':'attendance',{memberId,date:d,status:value,requestId,expectedStatus});break}catch(error){
      if(error.currentStatus!==undefined){attendanceRequests.delete(key);records[d+':'+memberId]=error.currentStatus;render();throw error}
      if(n===2||error.status>=400&&error.status<500&&error.status!==409)throw error;
      await new Promise(resolve=>setTimeout(resolve,250*(n+1)+Math.random()*250));
    }}
    attendanceRequests.delete(key);
    records[d+':'+memberId]=result.status??value;
    try{await loadTeamMonth(d.slice(0,7))}catch{team.error='출결 저장 완료 · 최신 자료를 다시 확인해 주세요.'}
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
  const labels={name:'이름',start:'시작 시간',end:'종료 시간',location:'장소',facilitatorIds:'진행 직원',weekdays:'요일',reason:'변경 이유'};
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
  document.querySelector('#teamStatus')?.remove();if(!$('#main'))return;
  const text=team.loading?'Google 공동 저장 확인 중…':team.error?'저장 확인 필요 · '+team.error:team.saving?'공유 서버에 저장 중…':team.active?`Google 공동 저장 연결됨 · 영역 실적 ${team.googleConfigured?'자동 전송 설정됨':'소속별 탭 매핑 대기'}`:team.configured?'공유 저장소가 비어 있습니다. 관리자 로그인 후 현재 자료로 시작해 주세요.':'브라우저 저장 모드 · 다른 기기 공유는 배포 서버 연결 후 가능합니다.';
  const node=document.createElement('section');node.id='teamStatus';node.className='team-status'+(team.error?' error':'');node.setAttribute('role','status');node.innerHTML=`<span>${esc(text)}</span>${team.configured&&!team.initialized&&adminSession?'<button class="secondary" id="initializeTeam">현재 자료로 공유 저장소 시작</button>':''}${team.error?'<button class="secondary" id="reloadTeam">서버 자료 다시 불러오기</button>':''}`;$('#main').prepend(node);
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
  return `<details class="ledger-panel"><summary>출석에 연결된 영역 실적 · ${entries.filter(e=>e.checked).length}건 / 취소 ${entries.filter(e=>!e.checked).length}건</summary><p class="notice">출석은 참여자별·날짜별·영역별 1건의 실적을 만듭니다. 같은 영역은 가장 빠른 시간의 진행 직원을 표시합니다. 결석·미입력 변경 시 그날 연결된 실적을 모두 취소합니다. 결석은 실적 행을 만들지 않습니다.</p><div class="tablewrap"><table class="admin-table"><thead><tr><th>참여자</th><th>소속</th><th>영역</th><th>담당자</th><th>실적 상태</th><th>Google</th></tr></thead><tbody>${entries.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.community)}</td><td>${esc(e.area)}</td><td>${esc(e.staff)}</td><td>${e.checked?'출석 연동':'취소'}</td><td>${e.sync==='synced'?'반영 확인':team.googleConfigured?'전송 대기':'미연결 · 대기'}</td></tr>`).join('')||'<tr><td colspan="6">연결된 실적이 없습니다.</td></tr>'}</tbody></table></div><button class="secondary" id="exportLinkedEntries">이 날짜 실적 CSV</button></details>`;
}
function patchPhotos(){
  for(const button of document.querySelectorAll('[data-checkin]')){const member=management.find('members',button.dataset.checkin);if(member?.photo)button.querySelector('.avatar')?.replaceWith(document.createRange().createContextualFragment(photoMarkup(member)))}
  for(const row of document.querySelectorAll('tr[data-catalog-type="members"]')){const member=management.find('members',row.dataset.catalogId);if(member)row.cells[0].insertAdjacentHTML('afterbegin',photoMarkup(member,'small-portrait'))}
  void hydratePhotos();
}
render=function(){if(location.hash==='#performance')history.replaceState(null,'','#attendance');previousOperationsRender();showTeamStatus();patchPhotos();holidayNotice();if(location.hash.split('/')[0]==='#attendance'&&$('#main .panel')){$('#main .panel').insertAdjacentHTML('beforeend',automaticLedger(selectedDate));$('#main .panel').insertAdjacentHTML('beforebegin',programAttendancePanel());bindProgramAttendance();if($('#exportLinkedEntries'))$('#exportLinkedEntries').onclick=()=>exportEntries(management.data.entries.filter(e=>e.date===selectedDate),'출석연동_실적_'+selectedDate+'.csv')}};
openEditor=function(type,id=''){if(type==='closures')return openClosureEditor(id);if(type==='members')return openMemberPhotoEditor(id);return previousPhotoEditor(type,id)};
editDay=function(key){const d=key.slice(0,10),id=key.slice(11),member=management.find('members',id);if(d>date){toast('미래 출결을 입력할 수 없습니다.');return}modal(`<h2>${esc(member.name)} · ${d}</h2><form id="linkedDayForm" class="entityform"><label>출결 상태<select name="status">${['출석','결석',''].map(s=>`<option value="${s}" ${(records[key]||'')===s?'selected':''}>${s||'미입력 · 연결 실적 취소'}</option>`).join('')}</select></label><p class="formhint">출석 이외 상태로 바꾸면 그날 연결된 실적을 모두 취소합니다. 결석은 월별 출석부에 O로만 표시합니다.</p><p id="linkedDayError" role="alert"></p><button class="primary" type="submit">출결과 연결 실적 저장</button></form>`);$('#linkedDayForm').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const result=await commitAttendance(id,d,new FormData(e.target).get('status'));$('#dialog').close();toast(staffAttendanceMessage(result))}catch(error){$('#linkedDayError').textContent=error.message;e.submitter.disabled=false}}};
function staffAttendanceMessage(result){
  const receipt=result?.reportReceipt;
  if(!receipt)return '출결을 저장했습니다.';
  if(receipt.mappingMissing||receipt.failed)return '출결 저장 완료 · 실적 시트 연결 또는 전송 오류를 확인해 주세요.';
  if(receipt.pending)return '출결 저장 완료 · 실적 시트 반영 대기';
  if(receipt.noSchedule)return '출결 저장 완료 · 배정 프로그램을 확인해 주세요.';
  return '출결과 실적 시트 반영을 확인했습니다.';
}
function attendanceReportMessage(result){
  const receipt=result?.reportReceipt;
  if(!receipt)return '출석은 저장됐어요. 프로그램 기록은 직원이 확인해 주세요.';
  if(receipt.noSchedule)return '출석은 저장됐어요. 오늘 참여할 프로그램 등록을 직원에게 요청해 주세요.';
  if(receipt.mappingMissing||receipt.failed)return '출석은 저장됐어요. 프로그램 기록을 시트에 옮기지 못했어요. 직원에게 알려 주세요.';
  if(receipt.pending)return '출석은 저장됐어요. 프로그램 기록을 시트에 옮기는 중이에요.';
  return `출석과 영역 실적 ${receipt.synced}건의 시트 저장을 확인했어요.`;
}
function bindPublicCheckins(){if(!team.active){document.querySelectorAll('[data-checkin]').forEach(button=>{button.disabled=true;button.title='Google 공동 저장을 연결한 뒤 출석할 수 있습니다.'});return;}document.querySelectorAll('[data-checkin]').forEach(button=>button.onclick=()=>{
  const member=management.find('members',button.dataset.checkin);if(status(member)==='출석'){modal(`<h2>${esc(member.name)} 님,<br>오늘 출석했어요.</h2><p>다시 누르지 않아도 괜찮아요.</p>`);return}
  modal(`${photoMarkup(member,'confirm-portrait')}<h2>${esc(member.name)} 님이 맞나요?</h2><p>이름이 맞으면 출석 버튼을 눌러 주세요.</p>${personalDaySummary(member)}<button id="autoConfirmCheckin" class="primary">네, 출석할게요</button>`);void hydratePhotos();$('#closeDialog').textContent='아니요, 다시 고를게요';
  $('#autoConfirmCheckin').onclick=async()=>{const nonce=crypto.randomUUID();$('#dialog').dataset.operation=nonce;$('#dialogcontent').innerHTML=`<span class="saving-spinner" aria-hidden="true"></span><h2>출석을 기록하고 있어요</h2><p>${esc(member.name)} 님, 잠시만 기다려 주세요.</p>`;$('#closeDialog').textContent='창 닫기';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));try{const result=await commitAttendance(member.id,date,'출석',true);if($('#dialog').open&&$('#dialog').dataset.operation===nonce){$('#dialogcontent').innerHTML=`<span class="successmark">✓</span><h2>${esc(member.name)} 님,<br>출석했어요.</h2><p>${prettyDate}</p><p class="completion-meta">${esc(attendanceReportMessage(result))}</p>`;$('#closeDialog').textContent='확인했어요';say(member.name+' 님 출석했어요.')}}catch(error){if($('#dialog').open&&$('#dialog').dataset.operation===nonce){$('#dialogcontent').innerHTML=`<h2>기록을 확인하지 못했어요</h2><p>${esc(error.message)}</p><p>창을 닫고 이름을 다시 눌러 주세요. 같은 요청으로 중복 없이 확인합니다.</p>`;$('#closeDialog').textContent='이름으로 돌아가기'}}};
})}
bindManagement=function(page){
  previousOperationsBind(page);bindClosureManagement();if(page==='appearance')bindBannerSettings();if(page==='kiosk')bindPublicCheckins();
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
        $('#loginError').textContent=error.message;
        button.disabled=false;
      }
    };
  }
  if(page==='dashboard')showStaffDesk();
  if(page==='attendance'){document.querySelectorAll('[data-status]').forEach(select=>select.onchange=async()=>{const previous=status(management.find('members',select.dataset.status),selectedDate);select.disabled=true;try{const result=await commitAttendance(select.dataset.status,selectedDate,select.value);toast(staffAttendanceMessage(result))}catch(error){select.value=previous;select.disabled=false;toast(error.message)}})}
  if(page==='workspace'){if($('#backupTeamData'))$('#backupTeamData').onclick=downloadTeamBackup;if($('#refreshTeamData'))$('#refreshTeamData').onclick=async()=>{await loadTeamMonth(date.slice(0,7),true);render()}}
  if(page==='reports'&&$('#reportMonth')){const original=$('#reportMonth').onchange;$('#reportMonth').onchange=async e=>{try{await ensureHolidayYear(e.target.value.slice(0,4));if(team.active){await loadTeamMonth(e.target.value);reportMonth=e.target.value;render()}else original(e)}catch(error){toast(error.message)}}}
};
managementPages.workspace=function(){return heading('Google 공동 저장','공동 자료와 출결은 Google Sheets에, 사진 축소본은 Drive에 보관합니다.')+`<section class="panel"><h2>${team.active?'Google 공동 저장 연결됨':'Google 연결 설정 필요'}</h2><p>영역 실적: <b>${team.googleConfigured?'소속별 탭 자동 반영 설정됨':'SHEET_TAB_MAP 설정 대기'}</b></p><p class="notice">사진은 Drive 비공개 폴더에 저장하며, 같은 참여자·날짜·영역은 한 번만 실적으로 입력합니다.</p><div class="actions"><button class="secondary" id="backupTeamData">운영 자료 백업</button><button class="secondary" id="refreshTeamData">공동 자료 새로 확인</button></div><p><a class="textbutton" href="연결설명서.html" target="_blank" rel="noopener">Google 연결 설명서 ↗</a></p></section>`};
managementPages.settings=function(){return heading('환경 설정','운영 환경과 자료 보관 상태를 확인합니다. 배너 문구·사진·글자 크기는 화면 설정에서 변경합니다.')+`<section class="panel"><h2>운영 환경</h2><p>업무 시간대: Asia/Seoul</p><p>Google 공동 저장: ${team.active?'연결됨':'연결 확인 필요'}</p><p>Google Sheets: ${team.googleConfigured?'서버 전송 설정됨':'미연결'}</p><a href="#appearance" class="primary">화면 설정 열기 ↗</a></section>`};
managementPages.performance=attendance;
const initialHash=location.hash;
async function bootTeam(){try{const response=await fetch('/api/team/status',{credentials:'same-origin'});if(!response.ok)throw Error();const status=await response.json();if(status.service!=='ch-team-api')throw Error();Object.assign(team,status);team.active=false;if(team.initialized){adminSession=!!team.authenticated;await loadTeamMonth(date.slice(0,7),true);if(adminSession&&initialHash!=='#login')history.replaceState(null,'',initialHash||'#kiosk')}}catch{team.configured=true;team.error='Google 공동 저장 연결 설정을 확인해 주세요. google-config.js의 웹앱 주소와 Apps Script 배포를 확인하세요.';adminSession=false}finally{team.loading=false;render()}}
const teamBoot=bootTeam();
render();
setInterval(async()=>{if(!team.active||document.hidden||configPending||configSaving||location.hash==='#appearance')return;try{await loadTeamMonth(location.hash==='#reports'?reportMonth:date.slice(0,7));if(!$('#dialog').open&&!document.activeElement?.closest('#summaryAttendanceForm'))render()}catch{team.error='공유 자료 확인 실패 · 기기의 현재 자료는 유지됩니다.';showTeamStatus()}},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&team.active&&!configPending&&location.hash!=='#appearance')void loadTeamMonth().then(()=>{if(!$('#dialog').open)render()}).catch(()=>{})});
