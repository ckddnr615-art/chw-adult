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
function openAssignmentPicker(id,d=date){
 const schedule=management.find('schedules',id),program=management.find('programs',schedule.programId);
 // Community mode must start with its actual audience, so switching to individual mode does not drop everyone.
 const existing=management.schedulesOn(d).find(s=>s.id===id);
 const selected=new Set(schedule.audienceMode==='individual'?management.data.enrollments.filter(e=>e.scheduleId===id&&e.active!==false&&e.from<=d&&(!e.to||e.to>=d)).map(e=>e.memberId):existing?management.eligibleMembers(existing,d).map(m=>m.id):[]);
 const activeIds=new Set(management.list('members').map(m=>m.id));for(const key of selected)if(!activeIds.has(key))selected.delete(key);
 modal(`<h2>프로그램 참여자 배정</h2><p>${esc(program.name)} · ${schedule.start} ~ ${schedule.end}</p><form id="assignmentForm" class="entityform"><div class="assignment-headerfields"><label>참여 방식<select name="audienceMode" id="audienceMode"><option value="community" ${schedule.communityId||communityOf('schedules',schedule)?'':'disabled'}>소속 기준 배정</option><option value="individual" ${schedule.audienceMode==='individual'?'selected':''}>참여자 개별 배정</option></select></label>${field('배정 적용일','from',d,'date')}</div><div id="assignmentMembers" class="assignment-picker"><div class="assignment-filters"><label>이름 검색<input id="assignmentSearch" type="search" placeholder="이름 일부로 찾기" autocomplete="off"></label><label>담당 사례관리자<select id="assignmentCaseStaff"><option value="">전체 직원</option><option value="unassigned">미지정</option>${opts(management.list('staff'),'')}</select></label></div><div class="assignment-options"><label class="checklabel"><input type="checkbox" id="assignmentAvailable">확인 범위에 시간 겹침 없는 사람만</label><label class="checklabel"><input type="checkbox" id="assignmentSelected">선택한 사람만 보기</label></div><p id="assignmentCount" role="status" aria-live="polite"></p><div class="assignment-actions"><button type="button" class="secondary" id="assignmentSelectAll">검색 결과 전체 선택</button><button type="button" class="secondary" id="assignmentClearVisible">검색 결과 선택 해제</button></div><div id="assignmentList" class="member-checks"></div><details class="assignment-import"><summary>다른 일정의 참여자 불러오기</summary><label>가져올 일정<select id="assignmentSource"><option value="">일정을 선택해 주세요</option>${opts(management.list('schedules').filter(s=>s.id!==id),'',s=>{const p=management.find('programs',s.programId);return `${p?.name||'프로그램'} · ${s.date||s.weekdays.map(n=>'일월화수목금토'[n]).join('·')} ${s.start}~${s.end}`})}</select></label><button type="button" class="secondary" id="assignmentImport">현재 선택에 추가</button><p class="formhint">적용일 기준 배정 명단을 추가합니다. 기존 선택은 유지됩니다.</p></details><p class="formhint">검색·필터를 바꿔도 선택은 유지됩니다. 반복 일정의 시간 겹침은 적용일부터 7일간 확인하며 이후 변경까지 보장하지 않습니다. 날짜 지정 일정은 그날만 확인합니다.</p><p id="assignmentConflictNote" class="formhint"></p></div><p class="formhint">담당 사례관리자와 관계없이 배정할 수 있습니다. 시간 겹침 표시는 안내이며, 일반 반복 배정의 중복을 자동 해제하지 않습니다.</p><p id="formError" class="formerror" role="alert"></p><button type="submit" class="primary">참여자 배정 저장</button></form>`);
 let candidates=[],visible=[];
 const from=()=>$('#assignmentForm [name="from"]').value;
 const refresh=()=>{
  const query=$('#assignmentSearch').value.replace(/\s/g,'').toLocaleLowerCase(),staff=$('#assignmentCaseStaff').value;
  visible=candidates.filter(c=>(!query||c.member.name.replace(/\s/g,'').toLocaleLowerCase().includes(query))&&(!staff||(staff==='unassigned'?!c.staffId:c.staffId===staff))&&(!$('#assignmentAvailable').checked||!c.conflicts.length)&&(!$('#assignmentSelected').checked||selected.has(c.member.id)));
  $('#assignmentCount').textContent=`전체 ${candidates.length}명 · 검색 결과 ${visible.length}명 · 선택 ${selected.size}명 · 이름 가나다순`;
  $('#assignmentList').innerHTML=visible.map(c=>`<label class="member-check ${selected.has(c.member.id)?'is-selected':''}"><input type="checkbox" name="memberId" value="${esc(c.member.id)}" ${selected.has(c.member.id)?'checked':''}>${photoMarkup(c.member,'assignment-photo')}<span class="assignment-person"><strong>${esc(c.member.name)}</strong><small>담당 · ${esc(management.find('staff',c.staffId)?.name||'미지정')}</small><small class="${c.conflicts.length?'assignment-overlap':'assignment-free'}">${c.conflicts.length?'시간 겹침 · '+c.conflicts.map(x=>`${esc(x.name)} (${x.start}~${x.end})`).join(', '):'확인 범위에 시간 겹침 없음'}</small></span></label>`).join('')||'<p class="assignment-empty">조건에 맞는 참여자가 없습니다. 검색어나 필터를 바꿔 주세요.</p>';
  const overlaps=candidates.filter(c=>selected.has(c.member.id)&&c.conflicts.length).length;
  $('#assignmentConflictNote').textContent=overlaps?`선택한 사람 중 ${overlaps}명은 시간이 겹칩니다. 기존 프로그램과 배정을 확인해 주세요.`:schedule.date?'날짜 지정 개별 배정은 그날 겹치는 기존 반복 일정을 대신합니다.':'';
  $('#assignmentSelectAll').disabled=!visible.length;$('#assignmentClearVisible').disabled=!visible.some(c=>selected.has(c.member.id));void hydratePhotos();
 };
 const reload=()=>{candidates=assignmentCandidates(management,id,from());refresh()};
 const toggle=()=>{$('#assignmentMembers').hidden=$('#audienceMode').value!=='individual';if(!$('#assignmentMembers').hidden)reload()};
 $('#audienceMode').onchange=toggle;$('#assignmentForm [name="from"]').onchange=reload;
 $('#assignmentSearch').oninput=refresh;for(const key of ['assignmentCaseStaff','assignmentAvailable','assignmentSelected'])$('#'+key).onchange=refresh;
 $('#assignmentList').onchange=event=>{const box=event.target;if(box.name!=='memberId')return;box.checked?selected.add(box.value):selected.delete(box.value);refresh()};
 $('#assignmentSelectAll').onclick=()=>{visible.forEach(c=>selected.add(c.member.id));refresh()};
 $('#assignmentClearVisible').onclick=()=>{visible.forEach(c=>selected.delete(c.member.id));refresh()};
 $('#assignmentImport').onclick=()=>{const source=management.find('schedules',$('#assignmentSource').value);if(!source){$('#formError').textContent='가져올 일정을 선택해 주세요.';return}const day=from();const ids=source.audienceMode==='individual'?management.data.enrollments.filter(e=>e.scheduleId===source.id&&e.active!==false&&e.from<=day&&(!e.to||e.to>=day)).map(e=>e.memberId):management.list('members').filter(m=>management.memberGroupAt(m,day)===communityOf('schedules',source)).map(m=>m.id);ids.filter(key=>activeIds.has(key)).forEach(key=>selected.add(key));$('#formError').textContent='';refresh()};
 toggle();
 $('#assignmentForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),backup=JSON.stringify(management.data);try{management.assignParticipants(id,[...selected],fd.get('from'),fd.get('audienceMode'));if(!persist())throw Error('저장하지 못했습니다.');$('#dialog').close();render();toast('참여자 배정을 저장했습니다. 사례관리 담당은 그대로입니다.')}catch(error){management.data=JSON.parse(backup);$('#formError').textContent=error.message}};
}
