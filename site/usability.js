/* Presentation changes only: attendance commands and achievement rules remain in operations.js. */
function personalDaySummary(member){
 const items=management.personalSchedules(member.id,date);
 return `<details class="my-day"><summary>나의 오늘 활동 · ${items.length}개</summary>${items.length?`<ul>${items.map(s=>`<li><time>${esc(s.start)} ~ ${esc(s.end)}</time><strong>${esc(s.program.name)}</strong><span>${esc(s.location)}</span></li>`).join('')}</ul>`:'<p>등록된 활동이 없어요. 직원에게 물어봐 주세요.</p>'}</details>`;
}
function persistentCommunityPicker(selected){
 return `<section class="community-picker ${selected?'compact-picker':''}" aria-labelledby="chooseTitle"><div class="sectionintro"><div><h2 id="chooseTitle">${selected?'다니는 곳':'내가 다니는 곳을 눌러 주세요'}</h2>${selected?'':'<p>아래에서 한 곳을 골라 주세요.</p>'}</div>${selected?'<span class="picker-instruction">다른 곳도 바로 누를 수 있어요</span>':''}</div><div class="groupchoices">${groups.map((g,i)=>`<button class="groupchoice ${participantGroup===g?'selected':''}" data-participant-group="${esc(g)}" aria-pressed="${participantGroup===g}"><span class="communityicon ${['green','blue','orange','purple'][i%4]}">${groupIcon(i,management.list('communities').find(c=>c.name===g)?.shape)}</span><b>${esc(g)}</b><span class="choicecheck">${participantGroup===g?'✓ 골랐어요':selected?'누르기':'여기를 눌러 주세요 →'}</span></button>`).join('')}</div></section>`;
}
function kioskQuickRoster(){
 const list=people.filter(p=>!participantGroup||p.group===participantGroup),waiting=list.filter(p=>!status(p)),absent=list.filter(p=>status(p)==='결석'),present=list.filter(p=>['출석','지각','조퇴'].includes(status(p))).length;
 return `<section class="kiosk-quick-roster" aria-label="오늘 출석 현황"><div class="quick-roster-heading"><strong>오늘 출석 현황 <span>· ${esc(participantGroup||'전체 소속')}</span></strong><span>출석했어요 ${present}명</span></div><div class="quick-roster-columns">${[[waiting,'waiting','◷ 아직 안 왔어요'],[absent,'absent','− 오늘 못 와요']].map(([members,key,title])=>`<section class="quick-roster-bucket ${key}"><h3>${title}<strong>${members.length}명</strong></h3><ul>${members.map(p=>`<li>${esc(p.name)}</li>`).join('')||'<li class="empty-roster">해당하는 사람이 없어요</li>'}</ul></section>`).join('')}</div></section>`;
}
kiosk=function(){
 const selected=groups.includes(participantGroup),community=management.list('communities').find(c=>c.name===participantGroup),closed=management.holidayName(date);
 const common=selected?management.schedulesOn(date).filter(s=>s.communityId===community?.id&&s.audienceMode!=='individual'):[];
 const holidayPending=!holidayYears.has(date.slice(0,4));
 const message=team.error?'Google 공동 저장 연결 설정이 필요합니다. 직원에게 도움을 요청해 주세요.':closed?`오늘은 ${esc(closed)}입니다. 출석은 직원에게 물어봐 주세요.`:holidayPending?'오늘 활동을 확인하고 있어요. 잠시 기다려 주세요.':team.error?'출석 기록 연결을 확인해 주세요. 직원에게 도움을 요청해 주세요.':'';
 return `<div class="kiosk-flow ${selected?'has-selection':''}"><div class="welcome-line"><span>성인지원팀 · 출석하기</span>${clockMarkup()}</div>${message?`<p class="public-service-notice" role="status">${message}</p>`:''}<div class="compact-welcome">${bannerMarkup('kiosk')}</div><div class="persistent-kiosk-tools ${selected?'selected-tools':''}">${persistentCommunityPicker(selected)}${kioskQuickRoster()}</div>${selected?`<section id="selectedContent" class="people-stage" aria-labelledby="choosePerson"><div class="sectionintro"><div><p class="selected-affiliation">${esc(participantGroup)}</p><h2 id="choosePerson">내 사진이나 이름을 눌러 주세요</h2><p>내가 맞는지 한 번 더 확인해요.</p></div></div><div class="attendancecards">${people.filter(p=>p.group===participantGroup).map(p=>`<button class="personcard ${participantState(p)}" data-checkin="${esc(p.id)}"><span class="avatar" aria-hidden="true">${esc(p.name.slice(0,1))}</span><b>${esc(p.name)}</b><small>${participantLabel(p)}</small></button>`).join('')||'<p>등록된 사람이 없어요. 직원에게 물어봐 주세요.</p>'}</div></section><details class="kiosk-secondary"><summary>소속의 공통 일정 보기 · ${common.length}개</summary><p>나의 실제 활동은 사진을 누른 뒤 확인할 수 있어요.</p><div class="participant-schedule-grid">${common.map(s=>`<div class="participant-schedule"><div><b>${esc(s.program.name)}</b><p>${esc(s.start)} ~ ${esc(s.end)} · ${esc(s.location)}</p></div></div>`).join('')||'<p>등록된 공통 일정이 없어요.</p>'}</div></details>`:''}<div class="bottomhelp"><span>고르기 어려우신가요?</span><button id="askStaff" class="secondary">직원에게 도움 요청하기</button></div></div>`;
};
const previousPickerBind=bindManagement;
bindManagement=function(page){
 previousPickerBind(page);
 if(page!=='kiosk')return;
 document.querySelectorAll('[data-participant-group]').forEach(button=>button.onclick=()=>{
  participantGroup=button.dataset.participantGroup;render();say(participantGroup+'를 골랐어요. 내 사진이나 이름을 눌러 주세요.');
  document.querySelector('.compact-picker')?.scrollIntoView({block:'start',behavior:'instant'});
  [...document.querySelectorAll('[data-participant-group]')].find(el=>el.dataset.participantGroup===participantGroup)?.focus({preventScroll:true});
 });
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
 return output.replace('<section class="studio-hero',html+'<section class="studio-hero');
};
render();
