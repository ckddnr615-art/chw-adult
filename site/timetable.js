/* Weekly operations, date exceptions and individual participation are independent of case work. */
const SLOTS=ManagementStore.timeSlots();
function mondayOf(d){const weekday=new Date(d+'T12:00:00Z').getUTCDay();return ManagementStore.addDays(d,weekday===0?-6:1-weekday)}
let programView='timetable',weekStart=mondayOf(date),timetableCommunity='',personalMemberId='',caseStaffFilter='',showEndedSchedules=false,timetableStaff='';
const legacyOpenEditor=openEditor,legacyBindManagement=bindManagement,legacyRender=render;
function staffCheckboxes(selected=[]){return `<fieldset class="staffchecks"><legend>프로그램 담당 직원</legend>${management.list('staff').map(s=>`<label class="checklabel"><input type="checkbox" name="facilitatorId" value="${esc(s.id)}" ${selected.includes(s.id)?'checked':''}>${esc(s.name)}</label>`).join('')||'<p>직원 관리에서 먼저 직원을 등록해 주세요.</p>'}</fieldset>`}
function programOptions(value){return opts(management.list('programs'),value,p=>`${management.communityName(communityOf('programs',p))} / ${p.name}`)}
function timeFields(start,end){
  const selected=ManagementStore.scheduleSlot({start,end});
  return '<label>시간대<select id="slotPreset">'+opts(SLOTS,selected)+'</select></label><div class="formrow">'+field('시작 시간','start',start,'time')+field('종료 시간','end',end,'time')+'</div>';
}
function bindTimeFields(){
  const preset=$('#slotPreset'),form=preset.form,{start,end}=form.elements;
  preset.onchange=()=>{const slot=SLOTS.find(s=>s.id===preset.value);start.value=slot.start;end.value=slot.end};
  const sync=()=>{if(start.value&&end.value&&start.value<end.value)preset.value=ManagementStore.scheduleSlot({start:start.value,end:end.value})};
  start.onchange=end.onchange=sync;
}
function reportWeekdayFields(){
 return '<fieldset class="report-weekdays"><legend>요일별 실적 담당자</legend><p class="formhint">운영하는 요일마다 실적을 기록할 직원 한 명을 선택하세요.</p>'+[1,2,3,4,5,6,0].map(day=>'<label data-report-day-label="'+day+'">'+'일월화수목금토'[day]+'요일<select name="reportStaffDay'+day+'" data-report-day="'+day+'"></select></label>').join('')+'</fieldset>';
}
function bindReportWeekdays(form,initial,mode){
 const remembered={...(initial.reportStaffByWeekday||{})};
 const update=()=>{
  const ids=[...form.querySelectorAll('[name="facilitatorId"]:checked')].map(input=>input.value);
  const weekly=mode(),day=form.querySelector('[name="date"]')?.value;
  const days=weekly?[...form.querySelectorAll('[name="weekday"]:checked')].map(input=>Number(input.value)):day?[new Date(day+'T12:00:00Z').getUTCDay()]:[];
  form.querySelectorAll('[data-report-day]').forEach(select=>{
   const weekday=Number(select.dataset.reportDay),value=remembered[weekday]||'';
   const chosen=ids.includes(value)?value:ids.length===1?ids[0]:'';
   select.innerHTML='<option value="">담당자를 선택해 주세요</option>'+opts(management.list('staff').filter(staff=>ids.includes(staff.id)),chosen);
   select.disabled=!days.includes(weekday);select.required=!select.disabled;
   select.closest('label').hidden=select.disabled;
  });
 };
 form.querySelectorAll('[data-report-day]').forEach(select=>select.onchange=()=>{remembered[select.dataset.reportDay]=select.value});
 form.addEventListener('change',event=>{if(event.target.matches('[name="facilitatorId"],[name="weekday"],[name="date"],[name="repeatMode"],#registrationRepeat'))update()});
 update();
}
function collectReportAssignments(fd){
 return Object.fromEntries([0,1,2,3,4,5,6].map(day=>[day,fd.get('reportStaffDay'+day)]).filter(([,id])=>id));
}
function weekControls(personal=false){
  const members=management.list('members').filter(m=>!caseStaffFilter||management.caseManagerAt(m.id,date)===caseStaffFilter);
  if(personal&&!members.some(m=>m.id===personalMemberId))personalMemberId=members[0]?.id||'';
  return `<div class="weektoolbar"><button class="secondary" data-print-document>인쇄 / PDF 저장</button><div class="weeknav"><button class="secondary" id="previousWeek" aria-label="이전 주">←</button><label>주간 기준일<input id="weekDate" type="date" value="${weekStart}"></label><button class="secondary" id="nextWeek" aria-label="다음 주">→</button><button class="secondary" id="thisWeek">이번 주</button></div><div class="weekfilters">${personal?`<label>사례관리 담당<select id="caseStaffFilter"><option value="">전체 직원</option>${opts(management.list('staff'),caseStaffFilter)}</select></label><label>참여자<select id="personalMember">${opts(members,personalMemberId)}</select></label>`:`<label>커뮤니티<select id="timetableCommunity"><option value="">전체 커뮤니티</option>${opts(management.list('communities'),timetableCommunity)}</select></label>`}</div></div>`;
}
function occurrenceCard(s,d,personal,readOnly=false){const index=management.list('communities').findIndex(c=>c.id===s.communityId),audience=readOnly?0:management.eligibleMembers(s,d).length;return `<${readOnly?'article':'button'} class="timetable-card tone-${(index+4)%4} ${s.isException?'changed':''}" data-occurrence="${s.id}" data-occurrence-date="${d}"><span class="course-community">${esc(readOnly?s.area?.name||'영역 미지정':s.community)}${s.isException?'<em>그날만 변경</em>':''}</span><strong>${esc(s.program.name)}</strong><span class="course-time">${s.start} ~ ${s.end}</span><span>${esc(s.location)}</span><span class="course-staff">진행 · ${esc(s.program.staff||'미지정')}</span>${readOnly?'':`<span class="course-audience">${s.audienceMode==='individual'?'개인별 배정':'소속 기준 배정'} · ${audience}명${personal?' · 내 일정':''}</span>`}${s.isException?`<span class="course-reason">${esc(s.changeReason)}</span>`:''}</${readOnly?'article':'button'}>`}
function timetableGrid(personal=false,readOnly=false){
  const days=Array.from({length:5},(_,i)=>ManagementStore.addDays(weekStart,i));
  const occurrences=d=>(personal?management.personalSchedules(personalMemberId,d):management.schedulesOn(d)).filter(s=>(readOnly||personal||!timetableCommunity||s.communityId===timetableCommunity)&&(readOnly||personal||programView!=='staff'||!timetableStaff||s.facilitatorIds?.includes(timetableStaff)));
  const conflicts=personal?days.filter(d=>management.conflictsFor(personalMemberId,d).length):[];
  const cancelled=management.data.scheduleOverrides.filter(o=>o.active!==false&&o.kind==='cancel'&&o.date>=days[0]&&o.date<=days[4]&&(!timetableCommunity||communityOf('schedules',management.find('schedules',o.scheduleId))===timetableCommunity));
  return `${personal?`<div class="personal-caption"><span class="avatar">${esc(management.find('members',personalMemberId)?.name.slice(0,1)||'—')}</span><div><h2>${esc(management.find('members',personalMemberId)?.name||'참여자를 선택해 주세요')}의 주간 시간표</h2><p>사례관리 · ${esc(management.find('staff',management.caseManagerAt(personalMemberId,date))?.name||'미지정')} / 프로그램은 각 진행 직원과 함께합니다.</p></div></div>`:''}${conflicts.length?`<p class="schedule-warning" role="status">시간이 겹치는 일정이 있습니다: ${conflicts.join(', ')}. 참여자 배정 또는 일정을 확인해 주세요.</p>`:''}<div class="timetable-scroll"><table class="weekly-timetable"><caption>${weekStart} ~ ${days[4]} 주간 시간표</caption><thead><tr><th scope="col">시간</th>${days.map((d,i)=>`<th scope="col" class="${d===date?'today':''}">${'월화수목금'[i]}요일<small>${d.slice(5).replace('-','.')}${d===date?' · 오늘':''}</small>${management.afternoonClosed(d)?'<small>오후 프로그램 없음</small>':''}</th>`).join('')}</tr></thead><tbody>${SLOTS.map(slot=>`<tr><th scope="row"><strong>${slot.name}</strong></th>${days.map(d=>{const items=occurrences(d).filter(s=>ManagementStore.scheduleSlot(s)===slot.id);return `<td class="${d===date?'today':''}"><div class="timetable-cell">${items.map(s=>occurrenceCard(s,d,personal,readOnly)).join('')}${!personal&&!readOnly?`<button class="add-slot" data-add-slot="${slot.id}" data-slot-date="${d}">＋ 일정</button>`:items.length?'':'<span class="slot-empty">배정된 활동이 없습니다</span>'}</div></td>`}).join('')}</tr>`).join('')}</tbody></table></div><p class="timetable-help">${readOnly?'프로그램 수정은 등록/수정 탭에서 진행합니다.':'프로그램을 누르면 해당 날짜 변경·휴강·반복 일정 수정·참여자 배정을 할 수 있습니다.'}</p>${!personal&&!readOnly&&cancelled.length?`<section class="cancelled-occurrences"><h3>이번 주 휴강</h3>${cancelled.map(o=>`<div><span>${o.date} · ${esc(management.find('programs',management.find('schedules',o.scheduleId)?.programId)?.name||'프로그램')} · ${esc(o.reason)}</span><button class="secondary" data-reset-override="${o.scheduleId}" data-override-date="${o.date}">기본 일정으로 복원</button></div>`).join('')}</section>`:''}`;
}
function scheduleMatchesStaff(schedule,staffId){
 if(!staffId)return true;
 const program=management.find('programs',schedule.programId),ids=schedule.facilitatorIds||program?.facilitatorIds||[];
 return staffId==='unassigned'?!ids.length&&!program?.staff:ids.includes(staffId);
}
function scheduleList(programId='',staffId=''){
  const items=management.list('schedules').filter(s=>(!programId||s.programId===programId)&&scheduleMatchesStaff(s,staffId)&&(showEndedSchedules||(!s.validTo||s.validTo>=date)&&(!s.date||s.date>=date)));
  return `<section class="panel"><div class="panelhead"><h2>운영 일정</h2><label class="checklabel"><input id="showEnded" type="checkbox" ${showEndedSchedules?'checked':''}>종료된 일정도 보기</label></div><div class="tablewrap"><table class="admin-table"><thead><tr><th>프로그램</th><th>운영일 / 적용 기간</th><th>시간</th><th>진행 직원</th><th>참여 방식</th><th>관리</th></tr></thead><tbody>${items.map(s=>{const p=management.find('programs',s.programId);return `<tr><td>${esc(p?.name||'삭제된 프로그램')}<small>${esc(management.communityName(communityOf('schedules',s)))}</small></td><td>${s.date||s.weekdays.map(n=>'일월화수목금토'[n]).join(' · ')+' 반복'}<small>${s.validFrom||'기본'} ~ ${s.validTo||'종료일 없음'}</small></td><td>${s.start} ~ ${s.end}</td><td>${esc(management.staffNames(s.facilitatorIds||p?.facilitatorIds)||p?.staff||'미지정')}</td><td>${s.audienceMode==='individual'?'개인별 배정':'소속 기준 배정'}</td><td class="rowactions"><button class="secondary" data-edit="schedules:${s.id}">수정</button><button class="secondary" data-assign="${s.id}">참여자 배정</button><button class="secondary danger" data-delete="schedules:${s.id}">삭제</button></td></tr>`}).join('')||'<tr><td colspan="6">등록된 일정이 없습니다.</td></tr>'}</tbody></table></div></section>`;
}
function programHub(){
  const tabs=[['timetable','주간 시간표'],['catalog','프로그램 목록'],['schedules','일정 관리'],['staff','직원별 시간표']];
  const add=programView==='catalog'?'<button class="primary" data-add="programs">＋ 프로그램 등록</button>':'<button class="primary" id="newSchedule">＋ 일정 등록</button>';
  const summary=heading('프로그램 관리','시간표와 프로그램·일정을 한곳에서 관리합니다. 사례관리 담당과 프로그램 진행 직원은 서로 독립적입니다.',add);
  let content='';
  if(programView==='timetable'||programView==='personal'||programView==='staff')content=`<section class="panel timetable-panel">${weekControls(programView==='personal')}${programView==='staff'?`<label class="staff-schedule-filter">프로그램 진행 직원<select id="timetableStaff"><option value="">전체 직원</option>${opts(management.list('staff'),timetableStaff)}</select></label>`:''}${timetableGrid(programView==='personal')}</section>`;
  else if(programView==='catalog'){const page=catalogPage('programs');content=page.slice(page.indexOf('<section class="panel">'))}
  else content=scheduleList();
  return summary+`<div class="program-tabs" role="group" aria-label="프로그램 관리 화면">${tabs.map(([id,label])=>`<button data-program-view="${id}" class="${programView===id?'selected':''}" aria-pressed="${programView===id}">${label}</button>`).join('')}</div>`+content;
}
function staffPage(){return heading('직원 관리','프로그램에 지정한 담당 직원별로 실적 탭이 연결됩니다.',`<button class="primary" data-add="staff">＋ 직원 등록</button>`)+`<section class="panel"><div class="tablewrap"><table class="admin-table"><thead><tr><th>직원</th><th>사례관리 인원</th><th>프로그램 역할</th><th>관리</th></tr></thead><tbody>${management.list('staff').map(s=>`<tr><td>${esc(s.name)}</td><td>${management.list('members').filter(m=>management.caseManagerAt(m.id,date)===s.id).length}명</td><td>${management.list('programs').filter(p=>p.facilitatorIds?.includes(s.id)).length}개 프로그램</td><td class="rowactions"><button class="secondary" data-case-staff="${s.id}">담당 시간표</button><button class="secondary" data-edit="staff:${s.id}">수정</button><button class="secondary danger" data-delete="staff:${s.id}">삭제</button></td></tr>`).join('')}</tbody></table></div><p class="notice">프로그램 담당 직원과 운영 요일별 실적 담당 한 명을 지정하면 해당 직원의 탭에 기록됩니다. 사례관리 출석부는 참여자별 사례관리 담당을 기준으로 표시합니다.</p></section>`}

function openScheduleEditor(id='',context={}){
  const item=id?management.find('schedules',id):{},firstProgram=management.list('programs')[0],program=management.find('programs',item.programId||context.programId)||firstProgram;
  if(!program){toast('먼저 프로그램을 등록해 주세요.');return}
  const slot=SLOTS.find(s=>s.id===context.slotId)||SLOTS.find(s=>s.start===item.start&&s.end===item.end)||SLOTS[0],start=item.start||slot.start,end=item.end||slot.end;
  const mode=id?(item.date?'once':'weekly'):(context.once?'once':'weekly'),day=item.date||context.day||date;
  modal(`<h2>일정 ${id?'수정':'등록'}</h2><form id="entityForm" class="entityform"><label>프로그램 영역<select id="scheduleArea" required><option value="">영역을 선택해 주세요</option>${opts(management.list('areas'),id||context.programId?program.areaId:'')}</select></label><label>프로그램<select required name="programId" id="scheduleProgram"><option value="">영역을 먼저 선택해 주세요</option></select></label><label>참여 방식<select name="audienceMode" id="scheduleAudience"><option value="individual">참여자 개별 배정</option><option value="community" ${id&&item.audienceMode!=='individual'?'selected':''}>소속 기준 배정</option></select></label><label id="scheduleAudienceGroup">배정 대상 소속<select name="communityId"><option value="">소속을 선택해 주세요</option>${opts(management.list('communities'),item.communityId||communityOf('schedules',item))}</select></label><p class="formhint">영역·프로그램은 소속과 독립적입니다. 개별 배정은 일정 저장 후 참여자를 선택합니다.</p>${id?`<p class="formhint">${mode==='weekly'?'적용일 이후부터 변경합니다. 이전 주의 시간표와 기록한 실적은 그대로 보관합니다.':'이 날짜의 단일 일정입니다. 이미 생성한 실적은 자동 수정하지 않습니다.'}</p><input type="hidden" name="repeatMode" value="${mode}">`:`<label>등록 방식<select name="repeatMode" id="repeatMode"><option value="weekly" ${mode==='weekly'?'selected':''}>요일별 반복 일정</option><option value="once" ${mode==='once'?'selected':''}>특정 날짜만 일정</option></select></label>`}<div id="onceFields">${field('운영 날짜','date',day,'date')}</div><div id="weeklyFields">${field('반복 적용 시작일','validFrom',context.day||(item.validFrom&&item.validFrom>date?item.validFrom:date),'date')}<fieldset><legend>반복 요일</legend>${[1,2,3,4,5,6,0].map(n=>`<label class="checklabel"><input type="checkbox" name="weekday" value="${n}" ${(item.weekdays||[1,2,3,4,5]).includes(n)?'checked':''}>${'일월화수목금토'[n]}</label>`).join('')}</fieldset></div>${timeFields(start,end)}${field('장소','location',item.location||'')}${staffCheckboxes(item.facilitatorIds||program.facilitatorIds)}${reportWeekdayFields()}<p class="formerror" id="formError" role="alert"></p><button type="submit" class="primary">${id&&mode==='weekly'?'적용일 이후 일정 저장':'일정 저장'}</button></form>`);
  const updateProgramOptions=(selected='')=>{const area=$('#scheduleArea').value,items=management.list('programs').filter(p=>p.areaId===area);$('#scheduleProgram').innerHTML='<option value="">'+(area?(items.length?'프로그램을 선택해 주세요':'등록된 프로그램이 없습니다'):'영역을 먼저 선택해 주세요')+'</option>'+opts(items,selected);$('#scheduleProgram').disabled=!area||!items.length};
  $('#scheduleArea').onchange=()=>{updateProgramOptions();document.querySelectorAll('#entityForm [name="facilitatorId"]').forEach(c=>c.checked=false)};updateProgramOptions(id||context.programId?program.id:'');if(!id&&!context.programId)document.querySelectorAll('#entityForm [name="facilitatorId"]').forEach(c=>c.checked=false);
  const toggleMode=()=>{const weekly=($('#repeatMode')?.value||mode)==='weekly';for(const [selector,disabled] of [['#onceFields',weekly],['#weeklyFields',!weekly]]){$(selector).hidden=disabled;$(selector).querySelectorAll('input').forEach(i=>i.disabled=disabled)}};
  const toggleAudience=()=>{const label=$('#scheduleAudienceGroup'),group=label.querySelector('select');label.hidden=$('#scheduleAudience').value!=='community';group.disabled=label.hidden;group.required=!label.hidden};$('#scheduleAudience').onchange=toggleAudience;toggleAudience();if($('#repeatMode'))$('#repeatMode').onchange=toggleMode;toggleMode();bindTimeFields();
  bindReportWeekdays($('#entityForm'),item,()=>($('#repeatMode')?.value||mode)==='weekly');
  $('#scheduleProgram').onchange=e=>{const next=management.find('programs',e.target.value);document.querySelectorAll('#entityForm [name="facilitatorId"]').forEach(c=>c.checked=next?.facilitatorIds?.includes(c.value)||false)};
  $('#entityForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),repeat=fd.get('repeatMode')==='weekly',from=fd.get('validFrom')||date;
    const fields={programId:fd.get('programId'),date:repeat?'':fd.get('date'),weekdays:repeat?fd.getAll('weekday').map(Number):[],validFrom:repeat?from:'',validTo:'',start:fd.get('start'),end:fd.get('end'),location:fd.get('location'),facilitatorIds:fd.getAll('facilitatorId'),reportStaffByWeekday:collectReportAssignments(fd),audienceMode:fd.get('audienceMode'),communityId:fd.get('audienceMode')==='community'?fd.get('communityId'):''};
    if(fields.audienceMode==='community'&&!fields.communityId){$('#formError').textContent='배정 대상 소속을 선택해 주세요.';return}if(!fields.facilitatorIds.length){$('#formError').textContent='진행 직원을 한 명 이상 선택해 주세요.';return}
    const backup=JSON.stringify(management.data);
    try{let savedSchedule;if(id&&repeat)savedSchedule=management.reviseSchedule(id,fields,from);else savedSchedule=management.save('schedules',id,fields,date);if(!persist())throw Error('저장하지 못했습니다. 입력을 유지합니다.');$('#dialog').close();render();if(!id&&context.assignAfterSave&&fields.audienceMode==='individual'){openAssignments(savedSchedule.id,fields.date||fields.validFrom||date);toast('일정을 저장했습니다. 참여자를 선택해 주세요.')}else toast('일정을 저장했습니다. 이전 실적은 유지됩니다.')}
    catch(error){management.data=JSON.parse(backup);$('#formError').textContent=error.message}
  };
}
function occurrenceMenu(id,d){const s=management.schedulesOn(d).find(s=>s.id===id);if(!s)return;const base=management.find('schedules',id);modal(`<h2>${esc(s.program.name)}</h2><p>${d} · ${s.start} ~ ${s.end}<br>${esc(s.location)} · 진행 ${esc(s.program.staff)}</p><div class="occurrence-actions"><button class="primary" id="oneDayChange">이 날짜만 변경 · 휴강</button>${!base.date?'<button class="secondary" id="repeatChange">적용일 이후 반복 일정 수정</button>':`<button class="secondary" id="editSingle">단일 일정 수정</button>`}<button class="secondary" id="assignOccurrence">참여자 배정</button>${s.isException?'<button class="secondary" id="restoreDay">기본 일정으로 복원</button>':''}</div><p class="formhint">이미 출석한 사람의 실적은 당일 변경 화면에서 반영 여부를 선택할 수 있습니다.</p>`);$('#oneDayChange').onclick=()=>{$('#dialog').close();openDayChange(id,d)};if($('#repeatChange'))$('#repeatChange').onclick=()=>{$('#dialog').close();openScheduleEditor(id,{day:d})};if($('#editSingle'))$('#editSingle').onclick=()=>{$('#dialog').close();openScheduleEditor(id)};$('#assignOccurrence').onclick=()=>{$('#dialog').close();openAssignments(id,d)};if($('#restoreDay'))$('#restoreDay').onclick=()=>{if(transaction(()=>management.resetDayOverride(id,d))){$('#dialog').close();render();toast('기본 일정으로 복원했습니다.')}}}
function openDayChange(id,d){
  const current=management.schedulesOn(d).find(s=>s.id===id),base=management.find('schedules',id),program=management.find('programs',base.programId),override=management.data.scheduleOverrides.find(o=>o.scheduleId===id&&o.date===d&&o.active!==false);
  const s=current||{...base,program,facilitatorIds:base.facilitatorIds||program.facilitatorIds};
  modal(`<h2>이 날짜만 변경</h2><form id="overrideForm" class="entityform">${field('변경 날짜','date',d,'date')}<label>변경 방식<select id="changeKind" name="kind"><option value="replace">프로그램·장소·직원 변경</option><option value="cancel" ${override?.kind==='cancel'?'selected':''}>이 날짜 휴강</option></select></label><div id="replacementFields"><label>실적 기준 프로그램 / 영역<select name="programId">${programOptions(s.program.id)}</select></label>${field('당일 활동 이름 (선택 · 예: 서울숲 외부활동)','displayName',override?.displayName||'','text',false)}${timeFields(s.start,s.end)}${field('변경 장소','location',s.location)}${staffCheckboxes(s.facilitatorIds)}<label>이 날짜 실적 담당자<select name="reportStaffId" id="dayReportStaff"></select></label></div><label>변경 이유<input name="reason" maxlength="120" required value="${esc(override?.reason||'')}" placeholder="외부활동, 기관 행사, 진행 직원 변경 등"></label><p class="formhint">기본 시간표는 그대로 두고 이 날짜에만 적용합니다. 외부활동 이름을 입력하면 시간표에 그 이름이 표시됩니다.</p><p id="overrideImpact" class="formhint"></p>${d<=date?'<label class="checklabel"><input type="checkbox" name="recalculateAttendance">이미 출석한 사람의 자동 실적도 다시 계산</label>':''}<p class="formerror" id="formError" role="alert"></p><button class="primary" type="submit">이 날짜에만 적용</button></form>`);
  $('#overrideForm [name="date"]').readOnly=true;
  const reportSelect=$('#dayReportStaff');
  const refreshDayStaff=()=>{
    const ids=[...document.querySelectorAll('#overrideForm [name="facilitatorId"]:checked')].map(input=>input.value);
    const chosen=reportSelect.value||s.reportStaffId||'';
    reportSelect.innerHTML='<option value="">한 명을 선택해 주세요</option>'+opts(management.list('staff').filter(staff=>ids.includes(staff.id)),ids.includes(chosen)?chosen:ids.length===1?ids[0]:'');
    reportSelect.required=!reportSelect.disabled;
  };
  document.querySelectorAll('#overrideForm [name="facilitatorId"]').forEach(input=>input.addEventListener('change',refreshDayStaff));
  refreshDayStaff();
  const audience=current?management.eligibleMembers(current,d):[];
  const arrivals=audience.filter(member=>records[d+':'+member.id]==='출석').length;
  $('#overrideImpact').textContent='현재 '+s.start+' ~ '+s.end+' · '+(s.location||'장소 미지정')+' · '+(management.staffNames(s.facilitatorIds||[])||'직원 미지정')+' · 배정 '+audience.length+'명 / 출석 '+arrivals+'명';
  if(team.active&&d.slice(0,7)!==date.slice(0,7))$('#overrideImpact').textContent='지난 달 날짜입니다. 출결 관리에서 기록된 실적을 확인해 주세요.';
  const toggle=()=>{const cancel=$('#changeKind').value==='cancel';$('#replacementFields').hidden=cancel;$('#replacementFields').querySelectorAll('input,select').forEach(el=>el.disabled=cancel)};$('#changeKind').onchange=toggle;toggle();bindTimeFields();
  $('#overrideForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);if(fd.get('date')!==d){$('#formError').textContent='시간표에서 변경할 날짜를 다시 선택해 주세요.';return}const data={kind:fd.get('kind'),programId:fd.get('programId'),displayName:fd.get('displayName')?.trim()||'',start:fd.get('start'),end:fd.get('end'),location:fd.get('location'),facilitatorIds:fd.getAll('facilitatorId'),reportStaffId:fd.get('reportStaffId')||'',reason:fd.get('reason'),recalculateAttendance:fd.has('recalculateAttendance')};if(data.kind==='replace'&&!data.reportStaffId){$('#formError').textContent='이 날짜 실적 담당자 한 명을 선택해 주세요.';return}if(data.kind==='replace'&&!data.facilitatorIds.length){$('#formError').textContent='진행 직원을 선택해 주세요.';return}const backup=JSON.stringify(management.data);try{management.setDayOverride(id,d,data);if(!persist())throw Error('저장하지 못했습니다.');$('#dialog').close();render();toast(data.recalculateAttendance?'당일 일정 변경과 실적 재계산을 요청했습니다.':'당일 일정을 변경했습니다.')}catch(error){management.data=JSON.parse(backup);$('#formError').textContent=error.message}};
}
function openAssignments(id,d=date){return openAssignmentPicker(id,d)}
function openDayCancellations(){
  modal('<h2>날짜별 일정 일괄 휴강</h2><form id="dayCancellations" class="entityform">'+
    field('날짜','date',weekStart<=date&&date<=ManagementStore.addDays(weekStart,4)?date:weekStart,'date')+
    '<fieldset><legend>휴강할 프로그램</legend><div id="cancellationChoices"></div></fieldset>'+
    field('휴강 이유','reason')+'<label class="checklabel"><input type="checkbox" name="recalculate">이미 출석한 사람의 자동 실적도 다시 계산</label>'+
    '<p id="cancellationError" role="alert"></p><button type="submit" class="primary">선택한 일정 휴강</button></form>');
  const form=$('#dayCancellations'),dateField=form.elements.date;
  function showChoices(){
    const day=dateField.value;
    const choices=day?management.schedulesOn(day):[];
    $('#cancellationChoices').innerHTML=choices.map(item=>{
      const members=management.eligibleMembers(item,day);
      const arrivals=members.filter(member=>records[day+':'+member.id]==='출석').length;
      return '<label class="checklabel"><input type="checkbox" name="schedule" value="'+esc(item.id)+'"> '+
        esc(item.start+' ~ '+item.end+' · '+item.program.name+' · '+(item.program.staff||'직원 미지정'))+
        ' · 배정 '+members.length+'명'+(team.active&&day.slice(0,7)!==date.slice(0,7)?'':' / 출석 '+arrivals+'명')+'</label>';
    }).join('')||'<p>운영 일정이 없습니다.</p>';
  }
  dateField.onchange=showChoices;
  showChoices();
  form.onsubmit=event=>{
    event.preventDefault();
    const input=new FormData(form),day=input.get('date'),ids=input.getAll('schedule');
    if(!ids.length){$('#cancellationError').textContent='휴강할 프로그램을 선택해 주세요.';return}
    const fields={kind:'cancel',reason:input.get('reason'),recalculateAttendance:day<=date&&input.has('recalculate')};
    if(transaction(()=>ids.forEach(id=>management.setDayOverride(id,day,fields)))){
      $('#dialog').close();render();toast(ids.length+'개 일정의 휴강을 요청했습니다.');
    }
  };
}

openEditor=function(type,id=''){if(type==='schedules')return openScheduleEditor(id);return legacyOpenEditor(type,id)};
managementPages.programs=programHub;
managementPages.staff=staffPage;
managementPages.schedules=programHub;
render=function(){if(location.hash==='#schedules'){programView='schedules';history.replaceState(null,'','#programs')}legacyRender()};
bindManagement=function(page){
  legacyBindManagement(page);
  document.querySelectorAll('[data-program-view]').forEach(button=>button.onclick=()=>{programView=button.dataset.programView;showArchived=false;render()});
  if($('#newSchedule'))$('#newSchedule').onclick=()=>openScheduleEditor();
  if($('#weekDate'))$('#weekDate').onchange=e=>{if(e.target.value){weekStart=mondayOf(e.target.value);render()}};
  if($('#weekDate')&&((page==='programs'&&programManagementView==='weekly')||(page==='timetable'&&programView==='staff'))){
    $('#weekDate').closest('.weektoolbar').insertAdjacentHTML('beforeend','<button class="secondary" id="dayCancellationsButton">날짜별 일괄 휴강</button>');
    $('#dayCancellationsButton').onclick=openDayCancellations;
  }
  if($('#previousWeek'))$('#previousWeek').onclick=()=>{weekStart=ManagementStore.addDays(weekStart,-7);render()};
  if($('#nextWeek'))$('#nextWeek').onclick=()=>{weekStart=ManagementStore.addDays(weekStart,7);render()};
  if($('#thisWeek'))$('#thisWeek').onclick=()=>{weekStart=mondayOf(date);render()};
  if($('#timetableCommunity'))$('#timetableCommunity').onchange=e=>{timetableCommunity=e.target.value;render()};
  if($('#caseStaffFilter'))$('#caseStaffFilter').onchange=e=>{caseStaffFilter=e.target.value;render()};
  if($('#personalMember'))$('#personalMember').onchange=e=>{personalMemberId=e.target.value;render()};
  if($('#timetableStaff'))$('#timetableStaff').onchange=e=>{timetableStaff=e.target.value;render()};
  if($('#showEnded'))$('#showEnded').onchange=e=>{showEndedSchedules=e.target.checked;render()};
  document.querySelectorAll('[data-case-staff]').forEach(button=>button.onclick=()=>{caseStaffFilter=button.dataset.caseStaff;peopleView='timetable';if(location.hash==='#timetable/personal')render();else location.hash='timetable/personal'});
  document.querySelectorAll('[data-add-slot]').forEach(button=>button.onclick=()=>openScheduleEditor('',{day:button.dataset.slotDate,slotId:button.dataset.addSlot,once:true}));
  document.querySelectorAll('button[data-occurrence]').forEach(button=>button.onclick=()=>occurrenceMenu(button.dataset.occurrence,button.dataset.occurrenceDate));
  document.querySelectorAll('[data-assign]').forEach(button=>button.onclick=()=>openAssignments(button.dataset.assign));
  document.querySelectorAll('[data-reset-override]').forEach(button=>button.onclick=()=>{if(transaction(()=>management.resetDayOverride(button.dataset.resetOverride,button.dataset.overrideDate))){render();toast('기본 일정으로 복원했습니다.')}});
};
// navigation.js renders after installing the consolidated management views.
/* Register the programme master and its first schedule as one reversible operation. */
function saveProgramWithSchedule(store,programFields,scheduleFields,today){
 const before=JSON.stringify(store.data);
 try{const program=store.save('programs','',programFields,today),schedule=store.save('schedules','',{...scheduleFields,programId:program.id},today);return {program,schedule}}
 catch(error){store.data=JSON.parse(before);throw error}
}
function updateProgramWithSchedule(store,programId,scheduleId,programFields,scheduleFields,today){
 const before=JSON.stringify(store.data);
 try{
  const program=store.save('programs',programId,programFields,today),old=scheduleId?store.find('schedules',scheduleId):null;
  if(old&&old.programId!==programId)throw Error('프로그램의 일정을 다시 선택해 주세요.');
  let schedule;
  if(!old)schedule=store.save('schedules','',{...scheduleFields,programId},today);
  else if(old.date)schedule=store.save('schedules',old.id,{...scheduleFields,programId},today);
  else{
   const keys=['weekdays','start','end','location','facilitatorIds','audienceMode','communityId','validTo','reportStaffByWeekday'];
   const changed=keys.some(k=>JSON.stringify(old[k]??(k==='validTo'?'':null))!==JSON.stringify(scheduleFields[k]??(k==='validTo'?'':null)));
   schedule=changed?store.reviseSchedule(old.id,{...scheduleFields,programId},scheduleFields.validFrom):old;
   if(changed&&scheduleFields.validTo)schedule=store.save('schedules',schedule.id,{validTo:scheduleFields.validTo},today);
  }
  return {program,schedule};
 }catch(error){store.data=JSON.parse(before);throw error}
}
function openProgramRegistration(programId='',selectedScheduleId='',draft=null){
 const editing=!!programId,item=editing?management.find('programs',programId):{};
 const schedules=editing?management.list('schedules').filter(s=>s.programId===programId&&(!s.validFrom||!s.validTo||s.validFrom<=s.validTo)&&(!s.validTo||s.validTo>=date)&&(!s.date||s.date>=date)):[];
 const selectedSchedule=selectedScheduleId==='new'?null:schedules.find(s=>s.id===selectedScheduleId)||schedules[0],initial=selectedSchedule||{};
 const name=draft?.name??item.name??'',areaId=draft?.areaId??item.areaId??programAreaFilter,staffIds=draft?.staffIds??initial.facilitatorIds??item.facilitatorIds??[];
 const applyFrom=initial.validFrom&&initial.validFrom>date?initial.validFrom:date;
 const schedulePicker=editing?`<label>수정할 일정<select id="programEditSchedule">${schedules.map(s=>`<option value="${esc(s.id)}" ${s.id===selectedSchedule?.id?'selected':''}>${s.date||s.weekdays.map(n=>'일월화수목금토'[n]).join('·')+' 반복'} · ${s.start}~${s.end} · ${esc(s.location)}</option>`).join('')}<option value="new" ${!selectedSchedule?'selected':''}>새 일정 추가</option></select></label><p class="formhint">선택한 일정만 변경합니다. 다른 일정은 그대로 유지됩니다. 반복 일정은 변경 적용일부터 반영하며 이전 출석·실적과 참여자 배정을 보관합니다.</p>`:'';
 modal(`<h2>프로그램 ${editing?'수정':'등록'}</h2><p class="program-registration-lead">프로그램 정보와 ${editing?'선택한 운영 일정을 함께 수정합니다.':'첫 운영 일정을 함께 등록합니다.'}</p><form id="entityForm" class="entityform program-registration-form"><section class="registration-section"><h3>1. 프로그램 정보</h3><div class="formrow">${field('프로그램 이름','name',name,'text')}<label>프로그램 영역<select name="areaId" required><option value="">영역을 선택해 주세요</option>${opts(management.list('areas'),areaId)}</select></label></div>${staffCheckboxes(staffIds)}</section><section class="registration-section"><h3>2. 요일과 시간</h3>${schedulePicker}<label>운영 방식<select name="repeatMode" id="registrationRepeat" ${selectedSchedule?'disabled':''}><option value="weekly" ${!initial.date?'selected':''}>요일별 반복 일정</option><option value="once" ${initial.date?'selected':''}>특정 날짜만 운영</option></select></label><div id="registrationWeekly"><div class="formrow">${field(selectedSchedule?'변경 적용일':'시작일','validFrom',applyFrom,'date')}${field('종료일 (선택)','validTo',initial.validTo||'','date',false)}</div><fieldset><legend>운영 요일</legend>${[1,2,3,4,5].map(n=>`<label class="checklabel"><input type="checkbox" name="weekday" value="${n}" ${(initial.weekdays||[1,2,3,4,5]).includes(n)?'checked':''}>${'일월화수목금토'[n]}요일</label>`).join('')}</fieldset></div><div id="registrationOnce">${field('운영 날짜','date',initial.date||date,'date')}</div>${timeFields(initial.start||'10:00',initial.end||'11:30').replace('</select>','<option value="afternoonFull">오후 전체 · 13:00 ~ 15:40</option></select>')}<p class="formhint">오후 전체 13:00 ~ 15:40도 시간대에서 선택할 수 있습니다. 다른 시간의 일정은 등록 후 추가할 수 있습니다.</p>${field('장소','location',initial.location||'','text')}${reportWeekdayFields()}</section><section class="registration-section"><h3>3. 참여자 배정 방식</h3><label>참여 방식<select name="audienceMode" id="registrationAudience"><option value="individual" ${initial.audienceMode!=='community'?'selected':''}>참여자 개별 배정</option><option value="community" ${initial.audienceMode==='community'?'selected':''}>소속 기준 배정</option></select></label><label id="registrationGroup">배정 대상 소속<select name="communityId"><option value="">소속을 선택해 주세요</option>${opts(management.list('communities'),initial.communityId||'')}</select></label><p class="formhint">개별 배정은 저장 후 이름을 검색해 선택합니다. 프로그램 영역은 소속과 관계없이 선택할 수 있습니다.</p></section><p class="formerror" id="formError" role="alert"></p><div class="program-save-actions"><button class="primary" type="submit">프로그램과 일정 저장</button>${editing?'<button class="secondary" type="submit" name="next" value="assign">저장 후 참여자 배정</button>':''}</div></form>`);
 if($('#programEditSchedule'))$('#programEditSchedule').onchange=e=>openProgramRegistration(programId,e.target.value,{name:$('#entityForm [name="name"]').value,areaId:$('#entityForm [name="areaId"]').value});
 const toggleRepeat=()=>{const weekly=$('#registrationRepeat').value==='weekly';for(const [selector,disabled] of [['#registrationWeekly',!weekly],['#registrationOnce',weekly]]){$(selector).hidden=disabled;$(selector).querySelectorAll('input').forEach(el=>el.disabled=disabled)}};
 const toggleAudience=()=>{const label=$('#registrationGroup'),select=label.querySelector('select');label.hidden=$('#registrationAudience').value!=='community';select.disabled=label.hidden;select.required=!label.hidden};
 $('#registrationRepeat').onchange=toggleRepeat;$('#registrationAudience').onchange=toggleAudience;toggleRepeat();toggleAudience();bindTimeFields();
 bindReportWeekdays($('#entityForm'),initial,()=>$('#registrationRepeat').value==='weekly');
 const presetChange=$('#slotPreset').onchange;$('#slotPreset').onchange=()=>{presetChange();if($('#slotPreset').value==='afternoonFull'){for(const [name,value] of [['start','13:00'],['end','15:40']]){const input=$('#entityForm [name="'+name+'"]');input.value=value;input.readOnly=true}}};
 $('#entityForm').onsubmit=e=>{
  e.preventDefault();const fd=new FormData(e.target),weekly=$('#registrationRepeat').value==='weekly',staffIds=fd.getAll('facilitatorId'),before=JSON.stringify(management.data);
  $('#formError').textContent='';
  if(team.active&&!team.weekdayReportTabs){$('#formError').textContent='요일별 담당 배정을 위해 Apps Script 서버를 먼저 업데이트해 주세요.';return}
  if(!staffIds.length){$('#formError').textContent='프로그램 진행 직원을 한 명 이상 선택해 주세요.';return}
  if(weekly&&fd.get('validTo')&&fd.get('validTo')<fd.get('validFrom')){$('#formError').textContent='종료일은 시작일 이후로 설정해 주세요.';return}
  try{
   const result=(editing?(store,pf,sf,today)=>updateProgramWithSchedule(store,programId,selectedSchedule?.id||'',pf,sf,today):saveProgramWithSchedule)(management,{name:fd.get('name'),areaId:fd.get('areaId'),facilitatorIds:staffIds},{date:weekly?'':fd.get('date'),weekdays:weekly?fd.getAll('weekday').map(Number):[],validFrom:weekly?fd.get('validFrom'):'',validTo:weekly?fd.get('validTo'):'',start:fd.get('start'),end:fd.get('end'),location:fd.get('location'),facilitatorIds:staffIds,reportStaffByWeekday:collectReportAssignments(fd),audienceMode:fd.get('audienceMode'),communityId:fd.get('audienceMode')==='community'?fd.get('communityId'):''},date);
   if(!persist())throw Error('저장하지 못했습니다. 입력을 유지합니다.');
   $('#dialog').close();assignmentStaffFilter='';programAreaFilter='';programStaffFilter='';location.hash='programs';
   if(e.submitter?.value==='assign'||result.schedule.audienceMode==='individual'&&(!editing||!selectedSchedule||selectedSchedule.audienceMode!=='individual'))openAssignments(result.schedule.id,result.schedule.date||result.schedule.validFrom||date);
   render();toast('프로그램과 일정을 저장했습니다.'+(!editing&&result.schedule.audienceMode==='individual'?' 참여자를 선택해 주세요.':''));
  }catch(error){management.data=JSON.parse(before);$('#formError').textContent=error.message}
 };
}

function programWeeklyOverview(){
 return '<section class="panel timetable-panel programme-overview"><div class="panelhead"><h2>프로그램 일정</h2><button class="secondary" data-print-document>인쇄 / PDF 저장</button></div><div class="weektoolbar"><div class="weeknav"><button class="secondary" id="previousWeek" aria-label="이전 주">←</button><label>주간 기준일<input id="weekDate" type="date" value="'+weekStart+'"></label><button class="secondary" id="nextWeek" aria-label="다음 주">→</button><button class="secondary" id="thisWeek">이번 주</button></div></div>'+timetableGrid(false,true)+'</section>';
}
