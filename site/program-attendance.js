/* Group by programme, then by session so different attendance times remain visible. */
function programAttendanceGroups(store, records, day, staffId=''){
  const groups=new Map();
  const sessions=new Map();
  function session(item){
    const key=JSON.stringify([item.scheduleId,item.programId,item.start,item.end,item.name,item.area,item.staff]);
    if(sessions.has(key))return sessions.get(key);
    const groupId=item.programId||item.name;
    if(!groups.has(groupId))groups.set(groupId,{id:groupId,name:store.find('programs',groupId)?.name||item.name,sessions:[]});
    const result={...item,key,rows:new Map()};
    sessions.set(key,result);
    groups.get(groupId).sessions.push(result);
    return result;
  }
  for(const schedule of store.schedulesOn(day)){
    const row=session({scheduleId:schedule.id,programId:schedule.program.id,name:schedule.program.name,
      area:schedule.area.name,staff:schedule.program.staff,start:schedule.start,end:schedule.end,
      staffIds:schedule.facilitatorIds||[],scheduled:true});
    for(const member of store.eligibleMembers(schedule,day)){
      row.rows.set(member.id,{memberId:member.id,name:member.name,dayStatus:records[day+':'+member.id]||''});
    }
  }
  for(const entry of store.data.entries.filter(item=>item.date===day)){
    const row=session({scheduleId:entry.scheduleId,programId:entry.programId,name:entry.program,
      area:entry.area,staff:entry.staff,start:entry.start,end:entry.end,
      staffIds:entry.facilitatorIds||[],scheduled:false});
    const existing=row.rows.get(entry.memberId);
    if(existing?.entry?.checked&&!entry.checked)continue;
    row.rows.set(entry.memberId,{memberId:entry.memberId,name:entry.name,
      dayStatus:records[day+':'+entry.memberId]||'',entry});
  }
  return [...groups.values()].map(group=>{
    const sessions=group.sessions.filter(item=>!staffId||item.staffIds.includes(staffId))
      .sort((a,b)=>a.start.localeCompare(b.start)).map(item=>({...item,rows:[...item.rows.values()]
        .sort((a,b)=>a.name.localeCompare(b.name,'ko'))}));
    const participants=new Set(sessions.flatMap(item=>item.rows.filter(row=>row.entry?.checked).map(row=>row.memberId)));
    return {...group,sessions,count:participants.size};
  }).filter(group=>group.sessions.length).sort((a,b)=>a.sessions[0].start.localeCompare(b.sessions[0].start)||
    a.name.localeCompare(b.name,'ko'));
}
if(typeof module!=='undefined')module.exports=programAttendanceGroups;

let programAttendanceDate='',programAttendanceStaff='';
const openProgramGroups=new Set();
let deskStaff='';

function showStaffDesk(){
  const staff=management.list('staff');
  if(!staff.length)return;
  const id=deskStaff||team.staffId||'';
  const members=id?management.list('members').filter(member=>management.caseManagerAt(member.id,date)===id):[];
  const schedules=id?management.schedulesOn(date).filter(item=>item.facilitatorIds?.includes(id)):[];
  $('#main').insertAdjacentHTML('beforeend',`<section class="panel program-attendance">
    <h2>담당 직원 오늘 업무</h2>
    <div class="filters"><label>담당 직원 <select id="deskStaff"><option value="">직원을 선택해 주세요</option>${opts(staff,id)}</select></label></div>
    ${id?`<h3>담당 참여자 · ${members.length}명</h3>
      <p>${members.map(member=>esc(member.name)+' ('+(records[date+':'+member.id]||'미입력')+')').join(' · ')||'담당 참여자가 없습니다.'}</p>
      <h3>진행 프로그램 · ${schedules.length}개</h3>
      <ul>${schedules.map(item=>`<li>${esc(item.start)} ~ ${esc(item.end)} · ${esc(item.program.name)}${item.isException?' · 오늘 변경':''}</li>`).join('')||'<li>오늘 진행 프로그램이 없습니다.</li>'}</ul>
      <a href="#attendance" id="deskProgramAttendance">프로그램별 출결 확인 ↗</a>`:''}
  </section>`);
  $('#deskStaff').onchange=event=>{deskStaff=event.target.value;render()};
  if($('#deskProgramAttendance'))$('#deskProgramAttendance').onclick=()=>{programAttendanceStaff=id;programAttendanceDate=date};
}

function programAttendancePanel(){
  const day=programAttendanceDate||date;
  const groups=programAttendanceGroups(management,records,day,programAttendanceStaff);
  return `<section class="panel program-attendance" id="programAttendancePanel">
    <h2>프로그램별 출결·실적</h2>
    <div class="filters">
      <label>기준일 <input id="programAttendanceDate" type="date" max="${date}" value="${day}"></label>
      <label>진행 직원 <select id="programAttendanceStaff"><option value="">전체 직원</option>${opts(management.list('staff'),programAttendanceStaff)}</select></label>
      <button class="secondary" id="refreshProgramAttendance">새로 확인</button>
      <button class="secondary" id="addProgramAttendance" ${team.active&&team.authenticated?'':'disabled'}>＋ 대체 참여 기록</button>
    </div>
    ${management.afternoonClosed(day)?'<p class="notice">첫째 수요일 오후 프로그램 없음</p>':''}
    <p class="formhint">출석 연동은 배정표를 기준으로 생성됩니다. 실제 참여나 불참을 확인한 뒤 정정할 수 있습니다.</p>
    <p id="programAttendanceFeedback" role="status"></p>
    ${groups.map(group=>`<details class="program-attendance-group" data-program-group="${esc(group.id)}" ${openProgramGroups.has(group.id)?'open':''}>
      <summary><strong>${esc(group.name)}</strong><span>실적 ${group.count}명 · ${group.sessions.length}회차</span></summary>
      ${group.sessions.map(session=>programSessionMarkup(session,day)).join('')}
    </details>`).join('')||'<p>표시할 프로그램이 없습니다.</p>'}
  </section>`;
}

function programSessionMarkup(session,day){
  return `<section class="program-session"><h3>${esc(session.start)} ~ ${esc(session.end)} · ${esc(session.area)}</h3>
    <p>${esc(session.staff||'진행 직원 미지정')}${session.scheduled?'':' · 변경 전 일정의 기록'}</p>
    <div class="tablewrap"><table class="admin-table">
      <thead><tr><th>참여자</th><th>참여 상태</th><th>실적 시트</th><th>정정</th></tr></thead>
      <tbody>${session.rows.map(row=>{
        const entry=row.entry;
        const state=entry?.checked?(entry.participationOverride==='include'?'참여 확인':'출석 연동'):
          row.dayStatus==='결석'?'결석':entry?.participationOverride==='exclude'?'불참':
          entry?'취소':row.dayStatus==='출석'?'참여 확인 필요':'미출석';
        const sync=entry?.sync==='synced'?(entry.checked?'영역 실적 반영':'정정 반영'):
          entry?.sync==='error'?'반영 실패':entry?.sync==='pending'?'반영 대기':'—';
        const command={memberId:row.memberId,date:day,scheduleId:session.scheduleId,entryId:entry?.id||'',expectedVersion:entry?.version||0};
        const canEdit=team.active&&team.authenticated&&row.dayStatus==='출석'&&(entry||session.scheduled);
        const button=(checked,label)=>`<button class="secondary" data-program-attendance="${esc(JSON.stringify({...command,checked}))}">${label}</button>`;
        return `<tr><td>${esc(row.name)}</td><td>${state}</td><td title="${esc(entry?.error||'')}">${sync}</td><td class="rowactions">${canEdit?
          (entry?.checked?button(false,'불참으로 정정')+(entry.participationOverride==='include'?'':button(true,'참여 확인')):button(true,'참여 기록')):'—'}</td></tr>`;
      }).join('')||'<tr><td colspan="4">배정된 참여자가 없습니다.</td></tr>'}</tbody>
    </table></div></section>`;
}

async function saveProgramAttendance(command){
  const response=await teamRequest('program-attendance',command);
  try{await loadTeamMonth(command.date.slice(0,7),true)}catch{
    if($('#dialog').open)$('#dialog').close();
    render();
    toast('참여 기록을 저장했습니다. 최신 시트 반영 상태는 새로 확인해 주세요.');
    return;
  }
  if($('#dialog').open)$('#dialog').close();
  render();
  const receipt=response.reportReceipt;
  toast(receipt?.failed?'참여 기록 저장 완료 · 실적 시트 반영 실패':
    receipt?.pending||receipt?.mappingMissing?'참여 기록 저장 완료 · 실적 시트 반영 대기':'참여 기록을 저장했습니다.');
}

function bindProgramAttendance(){
  const panel=$('#programAttendancePanel');
  if(!panel)return;
  panel.querySelectorAll('[data-program-group]').forEach(group=>group.ontoggle=()=>{
    if(!group.isConnected)return;
    if(group.open)openProgramGroups.add(group.dataset.programGroup);
    else openProgramGroups.delete(group.dataset.programGroup);
  });
  $('#programAttendanceStaff').onchange=event=>{programAttendanceStaff=event.target.value;render()};
  async function refresh(day){
    const feedback=$('#programAttendanceFeedback');
    feedback.textContent='기록을 확인하고 있습니다.';
    try{
      if(team.active&&!await loadTeamMonth(day.slice(0,7),true))throw Error('공유 자료를 읽지 못했습니다.');
      programAttendanceDate=day;
      render();
    }catch(error){feedback.textContent=error.message}
  }
  $('#programAttendanceDate').onchange=event=>{
    const day=event.target.value;
    if(day&&day<=date)void refresh(day);
    else event.target.value=programAttendanceDate||date;
  };
  $('#refreshProgramAttendance').onclick=()=>refresh(programAttendanceDate||date);
  panel.querySelectorAll('[data-program-attendance]').forEach(button=>button.onclick=async()=>{
    const command=JSON.parse(button.dataset.programAttendance);
    button.disabled=true;
    try{await saveProgramAttendance(command)}catch(error){
      if(error.conflict){
        await refresh(command.date);
        const feedback=$('#programAttendanceFeedback');
        if(feedback)feedback.textContent=error.message;
      }else $('#programAttendanceFeedback').textContent=error.message;
      button.disabled=false;
    }
  });
  $('#addProgramAttendance').onclick=()=>openAlternativeAttendance(programAttendanceDate||date);
}

function openAlternativeAttendance(day){
  const members=management.list('members').filter(member=>records[day+':'+member.id]==='출석')
    .sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  const schedules=management.schedulesOn(day);
  if(!members.length||!schedules.length){toast('선택할 출석 참여자와 운영 프로그램이 필요합니다.');return}
  modal(`<h2>대체 참여 기록</h2><form id="alternativeAttendance" class="entityform">
    <p>${esc(day)}</p>
    <label>참여자 <select name="memberId" required><option value="">선택해 주세요</option>${opts(members,'')}</select></label>
    <label>실제 참여 프로그램 <select name="scheduleId" required><option value="">선택해 주세요</option>${opts(schedules,'',s=>s.start+' ~ '+s.end+' · '+s.program.name)}</select></label>
    <p class="formhint">원래 배정된 프로그램에 참여하지 않았다면 해당 프로그램에서 불참으로 정정해 주세요.</p>
    <p id="alternativeAttendanceError" role="alert"></p>
    <button type="submit" class="primary">참여 기록 저장</button>
  </form>`);
  $('#alternativeAttendance').onsubmit=async event=>{
    event.preventDefault();
    const {memberId,scheduleId}=Object.fromEntries(new FormData(event.target));
    const schedule=schedules.find(s=>s.id===scheduleId);
    const entry=management.data.entries.find(e=>e.memberId===memberId&&e.date===day&&management.entryMatchesSchedule(e,schedule));
    event.submitter.disabled=true;
    try{await saveProgramAttendance({memberId,date:day,scheduleId,entryId:entry?.id||'',expectedVersion:entry?.version||0,checked:true})}
    catch(error){$('#alternativeAttendanceError').textContent=error.message;event.submitter.disabled=false}
  };
}
