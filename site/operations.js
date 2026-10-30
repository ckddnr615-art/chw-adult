/* One attendance command drives daily records and automatic programme achievements. */
const team={configured:false,initialized:false,active:false,authenticated:false,googleConfigured:false,local:false,loading:true,error:'',saving:false};
let applyingTeam=false,configBaseline=null,configPending=false,configTimer,configSaving=false;
const monthRevisions=new Map(),attendanceRequests=new Map();
const configSaveWaiters=[];
const CONFIG_TYPES=['communities','members','areas','programs','schedules','staff','caseAssignments','enrollments','scheduleOverrides','closures','banners'];
const originalPersist=persist,previousOperationsRender=render,previousOperationsBind=bindManagement,previousPhotoEditor=openEditor;
let lastScheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])]);
function currentConfig(){return Object.fromEntries(CONFIG_TYPES.map(type=>[type,JSON.parse(JSON.stringify(management.data[type]||[]))]))}
async function teamRequest(path,input){const response=await fetch('/api/team/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});let result;try{result=await response.json()}catch{throw Error('서버 응답을 확인하지 못했습니다.')}if(!response.ok||result.ok===false)throw Object.assign(Error(result.error||'서버 저장 실패'),{conflict:response.status===409});return result}
async function loadTeamMonth(month=date.slice(0,7),full=false){
  await ensureHolidayYear(month.slice(0,4)).catch(()=>{});
  const since=full?0:monthRevisions.get(month)||0,response=await fetch(`/api/team/state?month=${month}&since=${since}`,{credentials:'same-origin'});if(!response.ok)throw Error('공유 자료를 읽지 못했습니다.');const data=await response.json();if(!data.initialized)return false;
  if(!data.unchanged){applyingTeam=true;try{if(data.config){for(const type of CONFIG_TYPES)management.data[type]=data.config[type]||[];management.data.timetableVersion=1;configBaseline=currentConfig();management.upgradeTimetable()}Object.assign(records,data.records);Object.assign(management.data.days,data.days);for(const entry of data.entries||[]){const index=management.data.entries.findIndex(e=>e.id===entry.id);if(index<0)management.data.entries.push(entry);else management.data.entries[index]=entry}originalPersist();refreshCollections();lastScheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])])}finally{applyingTeam=false}}
  monthRevisions.set(month,data.revision);team.active=true;team.initialized=true;return true;
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
  catch(error){team.error=error.message;configPending=true}
  finally{team.saving=false;configSaving=false;for(const resolve of configSaveWaiters.splice(0))resolve();showTeamStatus()}
}
persist=function(){
  // A date-specific schedule re-evaluates existing arrival-linked achievements for that date.
  const scheduleJSON=JSON.stringify([management.data.schedules,management.data.scheduleOverrides,management.data.closures,management.data.programs.map(p=>[p.id,p.enabledHistory||[]])]);
  if(!applyingTeam&&scheduleJSON!==lastScheduleJSON){const closureRanges=[...(JSON.parse(lastScheduleJSON)[2]||[]),...(management.data.closures||[])];const dates=new Set([...(JSON.stringify(JSON.parse(lastScheduleJSON)[3])!==JSON.stringify(JSON.parse(scheduleJSON)[3])?[date]:[]),...Object.keys(records).map(k=>k.slice(0,10)).filter(d=>d<=date&&closureRanges.some(c=>ManagementStore.closureContains(c,d))),...management.data.schedules.filter(s=>s.active!==false&&s.date&&s.date<=date).map(s=>s.date),...management.data.scheduleOverrides.filter(s=>s.active!==false&&s.date<=date).map(s=>s.date)]);for(const d of dates)for(const member of management.list('members'))if(records[d+':'+member.id]==='출석')management.applyAttendance(records,member.id,d,'출석');lastScheduleJSON=scheduleJSON}
  const result=originalPersist();if(result&&!applyingTeam&&team.active&&team.authenticated){configPending=true;clearTimeout(configTimer);configTimer=setTimeout(saveTeamConfig,180)}return result;
};
async function commitAttendance(memberId,d,value,publicCheckin=false){if(!team.active)throw Error('Google 공동 저장 연결 후 출석할 수 있습니다.');
  await ensureHolidayYear(d.slice(0,4));if(publicCheckin&&management.holidayName(d))throw Error(management.holidayName(d)+' · 오늘은 쉬는 날입니다.');
  if(team.active){
    const key=memberId+':'+d+':'+value,requestId=attendanceRequests.get(key)||crypto.randomUUID();attendanceRequests.set(key,requestId);
    let result;for(let n=0;n<3;n++){try{result=await teamRequest(publicCheckin?'checkin':'attendance',{memberId,date:d,status:value,requestId});break}catch(error){if(n===2)throw error;await new Promise(resolve=>setTimeout(resolve,200*(n+1)))}}
    attendanceRequests.delete(key);await loadTeamMonth(d.slice(0,7));render();return result;
  }
  let result;if(!transaction(()=>{result=management.applyAttendance(records,memberId,d,value)}))throw Error('기기 저장에 실패했습니다.');render();return result;
}
function showTeamStatus(){
  document.querySelector('#teamStatus')?.remove();if(!$('#main'))return;
  const text=team.loading?'Google 공동 저장 확인 중…':team.error?'저장 확인 필요 · '+team.error:team.saving?'공유 서버에 저장 중…':team.active?`Google 공동 저장 연결됨 · 영역 실적 ${team.googleConfigured?'자동 반영':'소속별 탭 매핑 대기'}`:team.configured?'공유 저장소가 비어 있습니다. 관리자 로그인 후 현재 자료로 시작해 주세요.':'브라우저 저장 모드 · 다른 기기 공유는 배포 서버 연결 후 가능합니다.';
  const node=document.createElement('section');node.id='teamStatus';node.className='team-status'+(team.error?' error':'');node.setAttribute('role','status');node.innerHTML=`<span>${esc(text)}</span>${team.configured&&!team.initialized&&adminSession?'<button class="secondary" id="initializeTeam">현재 자료로 공유 저장소 시작</button>':''}${team.error?'<button class="secondary" id="reloadTeam">서버 자료 다시 불러오기</button>':''}`;$('#main').prepend(node);
  if($('#initializeTeam'))$('#initializeTeam').onclick=async()=>{const button=$('#initializeTeam');button.disabled=true;try{await teamRequest('initialize',{management:management.data,records});team.error='';await loadTeamMonth(date.slice(0,7),true);render();toast('공유 저장소에 기존 자료를 보관했습니다.')}catch(error){team.error=error.message;showTeamStatus()}};
  if($('#reloadTeam'))$('#reloadTeam').onclick=()=>{modal('<h2>서버 자료를 불러올까요?</h2><p>현재 기기의 미반영 변경은 아래 백업 버튼으로 먼저 저장할 수 있습니다. 서버 자료를 불러오면 같은 항목의 미반영 변경은 대신 적용하지 않습니다.</p><button class="secondary" id="backupTeam">현재 자료 백업</button><button class="primary" id="confirmReloadTeam">서버 자료 불러오기</button>');$('#backupTeam').onclick=downloadTeamBackup;$('#confirmReloadTeam').onclick=async()=>{team.error='';configPending=false;await loadTeamMonth(date.slice(0,7),true);$('#dialog').close();render()}};
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
render=function(){if(location.hash==='#performance')history.replaceState(null,'','#attendance');previousOperationsRender();showTeamStatus();patchPhotos();holidayNotice();if(location.hash.split('/')[0]==='#attendance'&&$('#main .panel')){$('#main .panel').insertAdjacentHTML('beforeend',automaticLedger(selectedDate));if($('#exportLinkedEntries'))$('#exportLinkedEntries').onclick=()=>exportEntries(management.data.entries.filter(e=>e.date===selectedDate),'출석연동_실적_'+selectedDate+'.csv')}};
openEditor=function(type,id=''){if(type==='closures')return openClosureEditor(id);if(type==='members')return openMemberPhotoEditor(id);return previousPhotoEditor(type,id)};
editDay=function(key){const d=key.slice(0,10),id=key.slice(11),member=management.find('members',id);if(d>date){toast('미래 출결을 입력할 수 없습니다.');return}modal(`<h2>${esc(member.name)} · ${d}</h2><form id="linkedDayForm" class="entityform"><label>출결 상태<select name="status">${['출석','결석',''].map(s=>`<option value="${s}" ${(records[key]||'')===s?'selected':''}>${s||'미입력 · 연결 실적 취소'}</option>`).join('')}</select></label><p class="formhint">출석 이외 상태로 바꾸면 그날 연결된 실적을 모두 취소합니다. 결석은 월별 출석부에 O로만 표시합니다.</p><p id="linkedDayError" role="alert"></p><button class="primary" type="submit">출결과 연결 실적 저장</button></form>`);$('#linkedDayForm').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await commitAttendance(id,d,new FormData(e.target).get('status'));$('#dialog').close();toast('출결과 연결 실적을 함께 반영했습니다.')}catch(error){$('#linkedDayError').textContent=error.message;e.submitter.disabled=false}}};
function bindPublicCheckins(){if(!team.active){document.querySelectorAll('[data-checkin]').forEach(button=>{button.disabled=true;button.title='Google 공동 저장을 연결한 뒤 출석할 수 있습니다.'});return;}document.querySelectorAll('[data-checkin]').forEach(button=>button.onclick=()=>{
  const member=management.find('members',button.dataset.checkin);if(status(member)==='출석'){modal(`<h2>${esc(member.name)} 님,<br>오늘 출석했어요.</h2><p>다시 누르지 않아도 괜찮아요.</p>`);return}
  modal(`${photoMarkup(member,'confirm-portrait')}<h2>${esc(member.name)} 님이 맞나요?</h2><p>이름이 맞으면 출석 버튼을 눌러 주세요.</p>${personalDaySummary(member)}<button id="autoConfirmCheckin" class="primary">네, 출석할게요</button>`);void hydratePhotos();$('#closeDialog').textContent='아니요, 다시 고를게요';
  $('#autoConfirmCheckin').onclick=async()=>{const nonce=crypto.randomUUID();$('#dialog').dataset.operation=nonce;$('#dialogcontent').innerHTML=`<span class="saving-spinner" aria-hidden="true"></span><h2>출석을 기록하고 있어요</h2><p>${esc(member.name)} 님, 잠시만 기다려 주세요.</p>`;$('#closeDialog').textContent='창 닫기';await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));try{const result=await commitAttendance(member.id,date,'출석',true);if($('#dialog').open&&$('#dialog').dataset.operation===nonce){$('#dialogcontent').innerHTML=`<span class="successmark">✓</span><h2>${esc(member.name)} 님,<br>출석했어요.</h2><p>${prettyDate}</p><p class="completion-meta">${team.active?'서버 저장 확인':'기기 저장 확인'} · 영역 실적 ${PerformanceProjection.aggregate(management.data.entries.filter(e=>e.memberId===member.id&&e.date===date)).filter(e=>e.checked).length}건${team.googleConfigured?' · Google 반영 대기':' · Google 미연결'}</p>`;$('#closeDialog').textContent='확인했어요';say(member.name+' 님 출석했어요.')}}catch(error){if($('#dialog').open&&$('#dialog').dataset.operation===nonce){$('#dialogcontent').innerHTML=`<h2>기록을 확인하지 못했어요</h2><p>${esc(error.message)}</p><p>창을 닫고 이름을 다시 눌러 주세요. 같은 요청으로 중복 없이 확인합니다.</p>`;$('#closeDialog').textContent='이름으로 돌아가기'}}};
})}
bindManagement=function(page){
  previousOperationsBind(page);bindClosureManagement();if(page==='appearance')bindBannerSettings();if(page==='kiosk')bindPublicCheckins();
  if(page==='login'){
    $('#loginForm').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await teamBoot;if(team.configured){const response=await fetch('/api/integration-login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('#loginCode').value})});if(!response.ok){const failure=await response.json();throw Error(failure.error||'직원 비밀번호를 확인해 주세요.');}team.authenticated=true;monthRevisions.clear();await loadTeamMonth(date.slice(0,7),true)}else if($('#loginCode').value!=='demo1234')throw Error('프리뷰 코드를 확인해 주세요.');adminSession=true;location.hash='dashboard'}catch(error){$('#loginError').textContent=error.message;button.disabled=false}};
    if(team.configured){$('#loginHint').textContent=team.local?'이 컴퓨터의 공유 서버 · 시연 비밀번호 demo1234 (운영 배포 시 변경)':'배포 서버의 직원 비밀번호를 입력하세요. Google 계정 비밀번호가 아닙니다.'}
  }
  if(page==='attendance'){document.querySelectorAll('[data-status]').forEach(select=>select.onchange=async()=>{const previous=status(management.find('members',select.dataset.status),selectedDate);select.disabled=true;try{await commitAttendance(select.dataset.status,selectedDate,select.value);toast('출결과 연결 실적을 반영했습니다.')}catch(error){select.value=previous;select.disabled=false;toast(error.message)}})}
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
