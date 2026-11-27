/* A selection draft survives filtering; only submitting the form changes assignments. */
function assignmentCandidates(store,scheduleId,from){
 const base=store.find('schedules',scheduleId);
 if(!base||!/^\d{4}-\d{2}-\d{2}$/.test(from))return [];
 const start=base.validFrom&&base.validFrom>from?base.validFrom:from;
 const dates=base.date?[base.date]:Array.from({length:7},(_,i)=>ManagementStore.addDays(start,i));
 const targets=dates.filter(d=>d>=from).map(d=>({date:d,schedule:store.schedulesOn(d).find(s=>s.id===scheduleId)})).filter(x=>x.schedule);
 return store.list('members').slice().sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true})||a.id.localeCompare(b.id)).map(member=>{
  const conflicts=new Map();
  for(const target of targets)for(const other of store.personalSchedules(member.id,target.date)){
   if(other.id===scheduleId||other.start>=target.schedule.end||target.schedule.start>=other.end)continue;
   // Dated individual assignments already replace this person's overlapping recurring schedule.
   if(base.date&&!store.find('schedules',other.id)?.date)continue;
   conflicts.set(other.id,{name:other.program.name,start:other.start,end:other.end,date:target.date});
  }
  return {member,staffId:store.caseManagerAt(member.id,from),conflicts:[...conflicts.values()]};
 });
}
function saveAssignmentSelection(store,id,selected,from,audience,reportMode,owners){
 const backup=JSON.stringify(store.data);
 try{
  let schedule=store.find('schedules',id);
  if(!schedule)throw Error('일정을 다시 확인해 주세요.');
  if(reportMode!=='weekday'&&reportMode!=='participant')throw Error('실적 배정 방식을 선택해 주세요.');
  if(reportMode!==(schedule.reportAssignmentMode||'weekday')){
   if(reportMode==='weekday'&&(schedule.facilitatorIds||[]).length>1&&!Object.keys(schedule.reportStaffByWeekday||{}).length)throw Error('요일별 한 직원 방식으로 바꾸려면 프로그램 수정에서 요일별 담당자를 먼저 선택해 주세요.');
   const fields={reportAssignmentMode:reportMode,...(reportMode==='participant'?{audienceMode:'individual',reportStaffByWeekday:{}}:{})};
   schedule=schedule.date?store.save('schedules',id,fields,from):store.reviseSchedule(id,fields,from);
  }
  store.assignParticipants(schedule.id,selected,from,reportMode==='participant'?'individual':audience,owners,{allowUnassignedReportOwners:true});
  return schedule;
 }catch(error){store.data=JSON.parse(backup);throw error}
}
function applyAssignmentOwner(owners,selected,visibleIds,staffId){
 if(!staffId)return 0;
 let count=0;for(const id of new Set(visibleIds))if(selected.has(id)){owners.set(id,staffId);count++}
 return count;
}
function openAssignmentPicker(id,d=date){
 const schedule=management.find('schedules',id),program=management.find('programs',schedule.programId);
 d=scheduleEditDate(schedule,d);
 let perParticipant=schedule.reportAssignmentMode==='participant';
 const reportStaff=management.list('staff').filter(staff=>(schedule.facilitatorIds||program.facilitatorIds||[]).includes(staff.id));
 const owners=new Map(management.data.enrollments.filter(e=>e.scheduleId===id&&e.active!==false&&e.from<=d&&(!e.to||e.to>=d)).map(e=>[e.memberId,e.reportStaffId||'']));
 // Community mode must start with its actual audience, so switching to individual mode does not drop everyone.
 const existing=management.schedulesOn(d).find(s=>s.id===id);
 const selected=new Set(schedule.audienceMode==='individual'?management.data.enrollments.filter(e=>e.scheduleId===id&&e.active!==false&&e.from<=d&&(!e.to||e.to>=d)).map(e=>e.memberId):existing?management.eligibleMembers(existing,d).map(m=>m.id):[]);
 const activeIds=new Set(management.list('members').map(m=>m.id));for(const key of selected)if(!activeIds.has(key))selected.delete(key);
 modal(`<h2>프로그램 참여자 배정</h2><p>${esc(program.name)} · ${schedule.start} ~ ${schedule.end}</p>${perParticipant?'<p class="connection-note">참여자별 담당 분배: 각 이용인의 실적 담당 직원을 한 명씩 선택하세요. 해당 직원 시트에만 기록되며 사례관리 담당은 바뀌지 않습니다.</p>':''}<form id="assignmentForm" class="entityform"><p class="assignment-apply-summary" id="assignmentApplySummary">${esc(d)}부터 명단 적용 · 사람을 선택하고 아래에서 저장하세요.</p><details class="simple-advanced assignment-settings"><summary>날짜·배정 방식 설정</summary><div class="assignment-headerfields"><label>참여 방식<select name="audienceMode" id="audienceMode"><option value="community" ${schedule.communityId||communityOf('schedules',schedule)?'':'disabled'}>소속 기준 배정</option><option value="individual" ${schedule.audienceMode==='individual'?'selected':''}>참여자 개별 배정</option></select></label>${field('명단 적용 시작일','from',d,'date')}</div><label>실적 배정 방식<select id="assignmentReportMode"><option value="weekday" ${!perParticipant?'selected':''}>요일별 한 직원에게 기록</option><option value="participant" ${perParticipant?'selected':''}>참여자별 담당 직원에게 나눠 기록</option></select></label><p class="formhint">위 날짜부터 명단을 적용합니다. 과거 출석에 명단을 연결하려면 그 날짜로 바꾼 뒤 저장하세요.</p></details><div id="assignmentMembers" class="assignment-picker"><div class="assignment-filters"><label>이름 검색<input id="assignmentSearch" type="search" placeholder="이름 일부로 찾기" autocomplete="off"></label><label>담당 사례관리자<select id="assignmentCaseStaff"><option value="">전체 직원</option><option value="unassigned">미지정</option>${opts(management.list('staff'),'')}</select></label></div><div class="assignment-options"><details class="assignment-extra-filters"><summary>추가 필터</summary><label class="checklabel"><input type="checkbox" id="assignmentAvailable">확인 범위에 시간 겹침 없는 사람만</label><label class="checklabel"><input type="checkbox" id="assignmentSelected">선택한 사람만 보기</label></details></div><p id="assignmentCount" role="status" aria-live="polite"></p><p id="assignmentOwnerCount" role="status"></p><div class="assignment-actions"><button type="button" class="secondary" id="assignmentSelectAll">검색 결과 전체 선택</button><button type="button" class="secondary" id="assignmentClearVisible">검색 결과 선택 해제</button></div><div id="assignmentOwnerBulk" class="assignment-owner-bulk" ${perParticipant?'':'hidden'}><label>프로그램 실적 담당 직원 (선택 시 자동 적용)<select id="assignmentReportStaff"><option value="">직원 선택</option>${sortedOpts(reportStaff,'')}</select></label><p id="assignmentAutoStaffFeedback" class="formhint" role="status">직원을 선택하면 화면에 보이는 체크 인원에게 자동 적용됩니다. 마지막에 저장을 눌러 주세요.</p></div><p id="assignmentOwnerHelp" class="formhint" ${perParticipant?'':'hidden'}>사례관리자로 검색한 뒤 아래 참여자를 확인하고 프로그램 실적 담당 직원을 고르면 화면에 보이는 체크 인원의 담당이 자동으로 바뀝니다. 저장하면 지정한 인원만 그 직원에게 기록됩니다. 아직 담당자를 지정하지 않은 인원은 전송 대기합니다.</p><div id="assignmentList" class="member-checks"></div><details class="assignment-import"><summary>다른 일정의 참여자 불러오기</summary><label>가져올 일정<select id="assignmentSource"><option value="">일정을 선택해 주세요</option>${opts(management.list('schedules').filter(s=>s.id!==id),'',s=>{const p=management.find('programs',s.programId);return `${p?.name||'프로그램'} · ${s.date||s.weekdays.map(n=>'일월화수목금토'[n]).join('·')} ${s.start}~${s.end}`})}</select></label><button type="button" class="secondary" id="assignmentImport">현재 선택에 추가</button><p class="formhint">적용일 기준 배정 명단을 추가합니다. 기존 선택은 유지됩니다.</p></details><p class="formhint">검색·필터를 바꿔도 선택은 유지됩니다. 반복 일정의 시간 겹침은 적용일부터 7일간 확인하며 이후 변경까지 보장하지 않습니다. 날짜 지정 일정은 그날만 확인합니다.</p><p id="assignmentConflictNote" class="formhint"></p></div><p class="formhint">담당 사례관리자와 관계없이 배정할 수 있습니다. 시간 겹침 표시는 안내이며, 일반 반복 배정의 중복을 자동 해제하지 않습니다.</p><p id="formError" class="formerror" role="alert"></p><button type="submit" class="primary">명단 저장</button></form>`);
 let candidates=[],visible=[];
 const from=()=>$('#assignmentForm [name="from"]').value;
 const refresh=()=>{
  const query=$('#assignmentSearch').value.replace(/\s/g,'').toLocaleLowerCase(),staff=$('#assignmentCaseStaff').value;
  visible=candidates.filter(c=>(!query||c.member.name.replace(/\s/g,'').toLocaleLowerCase().includes(query))&&(!staff||(staff==='unassigned'?!c.staffId:c.staffId===staff))&&(!$('#assignmentAvailable').checked||!c.conflicts.length)&&(!$('#assignmentSelected').checked||selected.has(c.member.id)));
  const missing=[...selected].filter(key=>!owners.get(key)).length;
  $('#assignmentOwnerCount').textContent=perParticipant?`담당 지정 ${selected.size-missing}명 · 미지정 ${missing}명 (전송 대기)`:'';
  $('#assignmentCount').textContent=`전체 ${candidates.length}명 · 화면에 보이는 ${visible.length}명 · 전체 선택 ${selected.size}명 (다른 검색 결과 포함)`;
  $('#assignmentList').innerHTML=visible.map(c=>`<div class="assignment-member-row"><label class="member-check ${selected.has(c.member.id)?'is-selected':''}"><input type="checkbox" name="memberId" value="${esc(c.member.id)}" ${selected.has(c.member.id)?'checked':''}>${photoMarkup(c.member,'assignment-photo')}<span class="assignment-person"><strong>${esc(c.member.name)}</strong><small>사례관리 · ${esc(management.find('staff',c.staffId)?.name||'미지정')}</small><small class="${c.conflicts.length?'assignment-overlap':'assignment-free'}">${c.conflicts.length?'시간 겹침 · '+c.conflicts.map(x=>`${esc(x.name)} (${x.start}~${x.end})`).join(', '):'확인 범위에 시간 겹침 없음'}</small></span></label>${perParticipant?`<label class="assignment-report-owner">실적 담당 직원<select data-assignment-owner="${esc(c.member.id)}" aria-label="${esc(c.member.name)} 실적 담당 직원" ${selected.has(c.member.id)?'':'disabled'}><option value="">담당 직원 선택</option>${sortedOpts(reportStaff,owners.get(c.member.id)||(reportStaff.length===1?reportStaff[0].id:''))}</select></label>`:''}</div>`).join('')||'<p class="assignment-empty">조건에 맞는 참여자가 없습니다. 검색어나 필터를 바꿔 주세요.</p>';
  const overlaps=candidates.filter(c=>selected.has(c.member.id)&&c.conflicts.length).length;
  $('#assignmentConflictNote').textContent=overlaps?`선택한 사람 중 ${overlaps}명은 시간이 겹칩니다. 기존 프로그램과 배정을 확인해 주세요.`:schedule.date?'날짜 지정 개별 배정은 그날 겹치는 기존 반복 일정을 대신합니다.':'';
  $('#assignmentSelectAll').disabled=!visible.length;$('#assignmentClearVisible').disabled=!visible.some(c=>selected.has(c.member.id));void hydratePhotos();
 };
 const reload=()=>{$('#assignmentApplySummary').textContent=from()+'부터 명단 적용 · 사람을 선택하고 아래에서 저장하세요.';if(reportStaff.length===1)management.list('members').forEach(member=>{if(!owners.get(member.id))owners.set(member.id,reportStaff[0].id)});candidates=assignmentCandidates(management,id,from());refresh()};
 const toggle=()=>{$('#assignmentMembers').hidden=$('#audienceMode').value!=='individual';if(!$('#assignmentMembers').hidden)reload()};
 const switchReportMode=()=>{perParticipant=$('#assignmentReportMode').value==='participant';$('#assignmentOwnerBulk').hidden=!perParticipant;$('#assignmentOwnerHelp').hidden=!perParticipant;if(perParticipant)$('#audienceMode').value='individual';toggle()};
 $('#assignmentReportMode').onchange=switchReportMode;
 $('#audienceMode').onchange=()=>{if(perParticipant)$('#audienceMode').value='individual';toggle()};$('#assignmentForm [name="from"]').onchange=reload;
 $('#assignmentSearch').oninput=refresh;for(const key of ['assignmentCaseStaff','assignmentAvailable','assignmentSelected'])$('#'+key).onchange=refresh;
 $('#assignmentList').onchange=event=>{const box=event.target;if(box.dataset.assignmentOwner){owners.set(box.dataset.assignmentOwner,box.value);refresh();return}if(box.name!=='memberId')return;box.checked?selected.add(box.value):selected.delete(box.value);if(box.checked)autoAssign([box.value]);refresh()};
 $('#assignmentSelectAll').onclick=()=>{visible.forEach(c=>selected.add(c.member.id));autoAssign(visible.map(c=>c.member.id));refresh()};
 $('#assignmentClearVisible').onclick=()=>{visible.forEach(c=>selected.delete(c.member.id));refresh()};
 $('#assignmentImport').onclick=()=>{const source=management.find('schedules',$('#assignmentSource').value);if(!source){$('#formError').textContent='가져올 일정을 선택해 주세요.';return}const day=from();const ids=source.audienceMode==='individual'?management.data.enrollments.filter(e=>e.scheduleId===source.id&&e.active!==false&&e.from<=day&&(!e.to||e.to>=day)).map(e=>e.memberId):management.list('members').filter(m=>management.memberGroupAt(m,day)===communityOf('schedules',source)).map(m=>m.id);ids.filter(key=>activeIds.has(key)).forEach(key=>selected.add(key));$('#formError').textContent='';refresh()};
 const autoAssign=ids=>{
  if(!perParticipant)return;
  const staff=$('#assignmentReportStaff').value;if(!staff)return;
  const count=applyAssignmentOwner(owners,selected,ids,staff),name=reportStaff.find(person=>person.id===staff)?.name||'';
  $('#assignmentAutoStaffFeedback').textContent=count?name+' 직원에게 '+count+'명을 자동 배정했습니다. 저장하면 반영됩니다.':'체크된 인원이 없습니다. 이용인을 체크하면 선택한 직원이 자동으로 지정됩니다.';
  $('#formError').textContent='';
 };
 $('#assignmentReportStaff').onchange=()=>{autoAssign(visible.map(c=>c.member.id));refresh()};
 switchReportMode();
 $('#assignmentForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),backup=JSON.stringify(management.data);try{if(perParticipant&&team.active&&!team.participantReportOwners)throw Error('참여자별 실적 담당 기능을 위해 Apps Script 서버를 먼저 업데이트해 주세요.');saveAssignmentSelection(management,id,[...selected],fd.get('from'),fd.get('audienceMode'),perParticipant?'participant':'weekday',Object.fromEntries(owners));if(!persist())throw Error('저장하지 못했습니다.');$('#dialog').close();render();toast(perParticipant?'담당자 배정을 저장했습니다. 미지정 인원은 실적 전송 대기합니다.':'참여자 배정을 저장했습니다. 사례관리 담당은 그대로입니다.')}catch(error){management.data=JSON.parse(backup);$('#formError').textContent=error.message}};
}
