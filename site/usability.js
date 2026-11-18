/* The kiosk offers photo-first check-in and a program-by-program roster. */
let participantSearchQuery='',kioskScheduleKey='',kioskPeriod='';
const kioskTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function kioskProgramKey(schedule){return ManagementStore.programAttendanceKey(schedule.id,schedule.program.id)}
function photoFirstSchedule(items,time){
 const running=items.filter(item=>item.start<=time&&time<item.end);
 if(running.length)return running.length===1?running[0]:null;
 const upcoming=items.filter(item=>item.start>time&&(time<'13:00'?item.start<'13:00':item.start>='13:00'));
 return upcoming.length===1?upcoming[0]:null;
}
function publicProgramRoster(schedule,schedules){
 const confirmed=new Set(kioskProgramCheckins[kioskProgramKey(schedule)]||[]);
 const members=management.eligibleMembers(schedule,date,schedules);
 const assigned=new Set(members.map(member=>member.id));
 for(const id of confirmed){
  if(assigned.has(id))continue;
  const member=management.find('members',id);
  if(member&&member.active!==false&&status(member)==='출석')members.push(member);
 }
 const present=members.filter(member=>confirmed.has(member.id)&&status(member)==='출석');
 const absent=members.filter(member=>status(member)==='결석');
 const waiting=members.filter(member=>status(member)!=='결석'&&!(status(member)==='출석'&&confirmed.has(member.id)));
 return {members,present,absent,waiting};
}
function selectedKioskProgram(){return management.schedulesOn(date).find(schedule=>kioskProgramKey(schedule)===kioskScheduleKey)}
function activeKioskPeriod(schedules){
 if(kioskPeriod&& (kioskPeriod!=='all-day'||schedules.some(item=>ManagementStore.scheduleSlot(item)==='all-day')))return kioskPeriod;
 return kioskTime.format(new Date())<'13:00'?'morning':'afternoon';
}
function kioskProgramChoices(schedules,period){
 const slots=ManagementStore.timeSlots().filter(({id})=>id!=='all-day'||schedules.some(item=>ManagementStore.scheduleSlot(item)===id));
 const icons={morning:'☀',afternoon:'◑','all-day':'◷'};
 const tabs='<div class="kiosk-period-controls" role="group" aria-label="프로그램 시간대">'+slots.map(({id,name})=>'<button type="button" class="secondary" data-kiosk-period="'+id+'" aria-pressed="'+(id===period)+'" aria-controls="kioskPeriodPrograms"><span aria-hidden="true">'+icons[id]+'</span> '+name+'</button>').join('')+'</div>';
 const items=schedules.filter(schedule=>ManagementStore.scheduleSlot(schedule)===period);
 return `${tabs}<div id="kioskPeriodPrograms">${items.length?`<div class="kiosk-program-grid">${items.map(schedule=>{
   const {members,present}=publicProgramRoster(schedule,schedules);
   const key=kioskProgramKey(schedule),index=[...schedule.program.id].reduce((n,c)=>(31*n+c.charCodeAt(0))%AFFILIATION_SHAPES.length,0);
   return `<button class="kiosk-program-card" type="button" data-kiosk-program="${esc(key)}" aria-pressed="${key===kioskScheduleKey}"><span class="communityicon ${['green','blue','orange','purple'][index%4]}">${groupIcon(index,AFFILIATION_SHAPES[index][0])}</span><span><strong>${esc(schedule.program.name)}</strong><small>${esc(schedule.start)} ~ ${esc(schedule.end)} · ${esc(schedule.location||'장소 미정')}</small><span class="kiosk-program-count">총원 ${members.length}명 / 출석 ${present.length}명</span></span></button>`;
 }).join('')}</div>`:'<p>이 시간대에는 프로그램이 없어요.</p>'}</div>`;
}
function kioskProgramSummary(schedule){
 const {members,present,absent,waiting}=publicProgramRoster(schedule);
 const waitingList=(title,list)=>`<div><h4>${title} <strong>${list.length}명</strong></h4><p>${list.map(member=>esc(member.name)).join(' · ')||'없어요'}</p></div>`;
 return `<section class="kiosk-program-summary" aria-labelledby="kioskProgramSummaryTitle"><div class="kiosk-program-summary-head"><div><h3 id="kioskProgramSummaryTitle" tabindex="-1">${esc(schedule.program.name)}</h3><p>총원 ${members.length}명 / <strong>출석 ${present.length}명</strong></p></div>${members.length?'<button type="button" class="primary" id="programPhotoPicker"><span aria-hidden="true">▣</span> 이 프로그램에서 내 사진 찾기</button>':''}</div><div class="kiosk-program-status">${waitingList('◷ 아직 안 왔어요',waiting)}${waitingList('− 오늘 못 와요',absent)}</div></section>`;
}
function replaceKioskDialog(content){
 if($('#dialog').open)$('#dialogcontent').innerHTML=content;
 else modal(content);
 $('#closeDialog').textContent='닫기';
}
function showKioskPhotoPicker(schedule,page=0){
 const members=(schedule?publicProgramRoster(schedule).members:management.list('members')).slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const pageSize=12,start=page*pageSize;
 replaceKioskDialog(`<h2 id="kioskPhotoTitle" tabindex="-1">내 사진을 눌러 주세요</h2>${schedule?'<p>'+esc(schedule.program.name)+'</p>':''}<div class="kiosk-photo-grid">${members.slice(start,start+pageSize).map(member=>`<div class="kiosk-photo-option"><button type="button" class="personcard" data-kiosk-person="${esc(member.id)}">${photoMarkup(member)}<b>${esc(member.name)}</b></button><button type="button" class="secondary" aria-label="${esc(member.name)} 이름 듣기" data-kiosk-read="${esc(member.name)}">🔊</button></div>`).join('')||'<p>오늘 등록된 참여자가 없어요.</p>'}</div>${members.length>pageSize?`<div class="kiosk-photo-pages"><button type="button" class="secondary" id="previousPhotos" ${page===0?'disabled':''}>← 이전 사진</button><button type="button" class="secondary" id="nextPhotos" ${start+pageSize>=members.length?'disabled':''}>다음 사진 →</button></div>`:''}`);
 $('#kioskPhotoTitle').focus();
 $('#dialogcontent').querySelectorAll('[data-kiosk-person]').forEach(button=>button.onclick=()=>openPublicCheckin(button.dataset.kioskPerson,schedule));
 $('#dialogcontent').querySelectorAll('[data-kiosk-read]').forEach(button=>button.onclick=()=>say(button.dataset.kioskRead,true));
 if($('#previousPhotos'))$('#previousPhotos').onclick=()=>{showKioskPhotoPicker(schedule,page-1);say('이전 사진이에요.')};
 if($('#nextPhotos'))$('#nextPhotos').onclick=()=>{showKioskPhotoPicker(schedule,page+1);say('다음 사진이에요.')};
 void hydratePhotos();
}
function openPublicCheckin(id,requestedSchedule){
 const member=management.find('members',id);
 if(!team.active||!team.programCheckin||!member||member.active===false)return;
 if(status(member)==='결석'){showAbsenceNotice();return}
 const assigned=management.personalSchedules(id,date);
 const schedule=requestedSchedule||photoFirstSchedule(assigned,kioskTime.format(new Date()));
 const agenda=!requestedSchedule&&assigned.length?'<details class="kiosk-person-agenda"><summary>오늘 내 프로그램 보기</summary><ul>'+assigned.map(item=>'<li><strong>'+esc(item.program.name)+'</strong><span>'+esc(item.start)+' ~ '+esc(item.end)+' · '+esc(item.location||'장소 미정')+'</span></li>').join('')+'</ul></details>':'';
 const key=schedule&&kioskProgramKey(schedule);
 const completed=key&&(kioskProgramCheckins[key]||[]).includes(id)&&status(member)==='출석';
 const instruction=!schedule?'지금 출석할 프로그램을 확인하기 어려워요. 가까운 직원에게 알려 주세요.':completed?'이 프로그램은 이미 출석했어요.':'내 사진이 맞으면 초록색 출석 버튼을 눌러 주세요.';
 const spoken=member.name+' 님. '+(schedule?schedule.program.name+'. ':'')+instruction;
 replaceKioskDialog(photoMarkup(member,'confirm-portrait')+`<h2>${esc(member.name)} 님이 맞나요?</h2>${schedule?`<p class="kiosk-confirm-program"><strong>${esc(schedule.program.name)}</strong><span>${esc(schedule.start)} ~ ${esc(schedule.end)} · ${esc(schedule.location||'장소 미정')}</span></p>`:''}<p>${instruction}</p><div class="kiosk-confirm-actions">${schedule&&!completed?'<button type="button" class="primary" id="confirmProgramCheckin">✓ 출석하기</button>':!schedule?'<button type="button" class="primary" id="kioskAskStaff">직원에게 도움 요청하기</button>':''}<button type="button" class="secondary" id="kioskReadConfirm">🔊 안내 듣기</button><button type="button" class="secondary" id="kioskBackToPhotos">← 사진으로 돌아가기</button></div>${agenda}`);
 void hydratePhotos();
 say(spoken);
 $('#kioskReadConfirm').onclick=()=>say(spoken,true);
 if($('#kioskAskStaff'))$('#kioskAskStaff').onclick=()=>say(member.name+' 님의 프로그램 출석 확인을 도와주세요.',true);
 $('#kioskBackToPhotos').onclick=()=>showKioskPhotoPicker(requestedSchedule);
 const confirm=$('#confirmProgramCheckin');
 if(!confirm)return;
 confirm.onclick=async()=>{
  if(status(member)==='결석'){showAbsenceNotice();return}
  replaceKioskDialog('<span class="saving-spinner" aria-hidden="true"></span><h2>출석을 기록하고 있어요</h2>');
  const spinner=$('#dialogcontent .saving-spinner'),dialog=$('#dialog');
  const isCurrent=()=>dialog.open&&dialog.contains(spinner);
  try{
   await commitAttendance(member.id,date,'출석',true,undefined,schedule);
   refreshKioskAfterDialog();
   if(!isCurrent())return;
   if(status(member)==='결석'){showAbsenceNotice();return}
   replaceKioskDialog(`<div role="status" class="kiosk-checkin-success"><span class="successmark" aria-hidden="true">✓</span><h2>출석이 완료됐어요.</h2><p>${esc(schedule.program.name)}</p></div>`);
   say(member.name+' 님, '+schedule.program.name+' 출석이 완료됐어요.');
   const success=$('#dialogcontent .kiosk-checkin-success');
   const timer=setTimeout(()=>{if(dialog.open&&dialog.contains(success))dialog.close()},4000);
   dialog.addEventListener('close',()=>clearTimeout(timer),{once:true});
  }catch(error){
   if(error.currentStatus!==undefined)refreshKioskAfterDialog();
   if(!isCurrent())return;
   if(error.code==='ABSENCE_LOCKED'){showAbsenceNotice();return}
   replaceKioskDialog('<h2>출석을 확인해 주세요</h2><p>'+esc(error.message)+'</p><button type="button" class="secondary" id="kioskRetry">다시 확인</button>');
   $('#kioskRetry').onclick=()=>openPublicCheckin(id,requestedSchedule);
   say(error.message);
  }
 };
}
function bindParticipantSearch(){
 const search=$('#participantSearch'),results=$('#participantSearchResults');
 const paint=()=>{
  participantSearchQuery=search.value;
  const query=participantSearchQuery.normalize('NFKC').trim().replace(/\s/g,'');
  results.replaceChildren();
  if(!query)return;
  const matches=people.filter(person=>person.name.normalize('NFKC').replace(/\s/g,'').includes(query));
  if(!matches.length){results.textContent='일치하는 이름이 없어요.';return}
  for(const person of matches){
   const button=document.createElement('button');
   button.type='button';button.className='secondary';button.textContent=person.name;
   button.onclick=()=>openPublicCheckin(person.id);
   results.append(button);
  }
 };
 search.oninput=paint;paint();
}
kiosk=function(){
 const closed=management.holidayName(date),holidayPending=!holidayYears.has(date.slice(0,4));
 const ready=team.active&&team.programCheckin&&!holidayPending&&!closed;
 const schedules=ready?management.schedulesOn(date):[],period=activeKioskPeriod(schedules);
 const selected=ready?selectedKioskProgram():null;
 const schedule=selected&&ManagementStore.scheduleSlot(selected)===period?selected:null;
 const message=team.error?'공동 저장을 연결하려면 직원에게 알려 주세요.':closed?`오늘은 ${esc(closed)}입니다.`:team.active&&!team.programCheckin?'프로그램 출석을 사용하려면 직원이 서버를 업데이트해야 해요.':!ready?'오늘 프로그램을 확인하고 있어요.':management.afternoonClosed(date)?'오늘은 오후 프로그램이 없어요.':'';
 return `<div class="kiosk-flow"><div class="welcome-line"><span>성인지원팀 · 출석하기</span>${clockMarkup()}</div>${message?`<p class="public-service-notice" role="status">${message}</p>`:''}<div class="compact-welcome">${bannerMarkup('kiosk')}</div>${ready?`<section class="kiosk-photo-entry"><button type="button" class="primary" id="startPhotoCheckin"><span aria-hidden="true">▣</span> 내 사진으로 출석</button><button type="button" class="secondary" id="kioskReadHelp">🔊 방법 듣기</button></section><details class="participant-search" ${participantSearchQuery?'open':''}><summary>이름으로 찾기</summary><label for="participantSearch">참여자 이름</label><input type="search" id="participantSearch" autocomplete="off" value="${esc(participantSearchQuery)}"><div id="participantSearchResults" class="participant-search-results"></div></details><section class="kiosk-program-section"><h2>오늘 프로그램</h2>${kioskProgramChoices(schedules,period)}${schedule?kioskProgramSummary(schedule):''}</section>`:''}<div class="bottomhelp"><button id="askStaff" class="secondary">직원에게 도움 요청하기</button></div></div>`;
};
const previousPickerBind=bindManagement;
bindManagement=function(page){
 previousPickerBind(page);
 if(page!=='kiosk'||!$('#startPhotoCheckin'))return;
 $('#startPhotoCheckin').onclick=()=>{showKioskPhotoPicker();say('내 사진을 눌러 주세요.')};
 $('#kioskReadHelp').onclick=()=>say('내 사진으로 출석 버튼을 누르고, 내 사진을 골라 주세요. 직원에게 도움을 요청해도 돼요.',true);
 bindParticipantSearch();
 document.querySelectorAll('[data-kiosk-period]').forEach(button=>button.onclick=()=>{
  kioskPeriod=button.dataset.kioskPeriod;kioskScheduleKey='';render();
  $('[data-kiosk-period="'+kioskPeriod+'"]')?.focus({preventScroll:true});
  say(button.textContent.trim()+' 프로그램이에요.');
 });
 document.querySelectorAll('[data-kiosk-program]').forEach(button=>button.onclick=()=>{
  kioskScheduleKey=button.dataset.kioskProgram;render();
  const schedule=selectedKioskProgram();
  if(!schedule)return;
  const roster=publicProgramRoster(schedule);
  $('#kioskProgramSummaryTitle')?.focus();
  say(schedule.program.name+'. '+roster.present.length+'명 출석했어요. '+roster.waiting.length+'명은 아직 안 왔어요. 이 프로그램에 출석하려면 내 사진 찾기를 눌러 주세요.');
 });
 if($('#programPhotoPicker'))$('#programPhotoPicker').onclick=()=>{showKioskPhotoPicker(selectedKioskProgram());say('내 사진을 눌러 주세요.')};
};

const usabilityDashboard=dashboard;
dashboard=function(){
 const output=usabilityDashboard().replaceAll('예시 일정','오늘 일정');
 const overlaps=management.list('members').filter(m=>management.conflictsFor(m.id,date).length).length;
 const unassigned=management.schedulesOn(date).filter(s=>s.audienceMode==='individual'&&!management.eligibleMembers(s,date).length).length;
 const failed=management.data.entries.filter(e=>e.sync==='error').length;
 const tasks=[[overlaps,'시간이 겹치는 참여자','timetable/personal','명'],[unassigned,'참여자 미배정 일정','programs/schedules','건'],[failed,'실적 전송 오류','workspace','건']].filter(x=>x[0]);
 if(!tasks.length)return output;
 const html=`<section class="attention-strip" aria-labelledby="attentionTitle"><h2 id="attentionTitle">오늘 확인할 일</h2><div>${tasks.map(([count,label,route,unit])=>`<a href="#${route}"><span>${label}</span><strong>${count}${unit} ↗</strong></a>`).join('')}</div><p>시간 중복은 개인별 시간표에서 확인해 주세요. 전송 오류는 조회된 실적 자료 기준입니다.</p></section>`;
 return output.replace('<section class="metrics">',html+'<section class="metrics">');
};
render();
