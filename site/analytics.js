/* Rates use operating dates and assigned occurrences; unrecorded past operating days are absent. */
let analysisFrom=date.slice(0,7)+'-01',analysisTo=date,analysisGroup='',analysisStaff='',analysisMember='';
function dateSpan(from,to){const result=[];for(let d=from;d<=to&&result.length<366;d=ManagementStore.addDays(d,1))result.push(d);return result}
function analysisData(){
  const dates=dateSpan(analysisFrom,analysisTo>date?date:analysisTo).filter(d=>holidayYears.has(d.slice(0,4))&&!management.holidayName(d)),members=management.data.members.filter(m=>(m.active!==false||Object.keys(records).some(k=>k.endsWith(':'+m.id)&&k.slice(0,10)>=analysisFrom&&k.slice(0,10)<=analysisTo))&&(!analysisGroup||m.communityId===analysisGroup)&&(!analysisStaff||management.caseManagerAt(m.id,date)===analysisStaff)&&(!analysisMember||m.id===analysisMember));
  const byPerson=[],byDay=new Map(dates.map(d=>[d,{date:d,expected:0,present:0,absent:0}])),byProgram=new Map();
  for(const member of members){let expected=0,present=0;for(const d of dates){const schedules=management.personalSchedules(member.id,d),record=records[d+':'+member.id],isPresent=['출석','지각','조퇴'].includes(record);if(schedules.length||record){expected++;if(isPresent)present++;const row=byDay.get(d);row.expected++;if(isPresent)row.present++;else row.absent++}for(const s of schedules){let row=byProgram.get(s.program.id);if(!row){row={id:s.program.id,name:s.program.name,expected:0,present:0};byProgram.set(row.id,row)}row.expected++;if(management.data.entries.some(e=>e.memberId===member.id&&e.scheduleId===s.id&&e.date===d&&e.checked))row.present++}}
    byPerson.push({id:member.id,name:member.name,group:management.communityName(member.communityId),caseManager:management.find('staff',management.caseManagerAt(member.id,date))?.name||'미지정',expected,present,absent:expected-present,rate:expected?Math.round(present/expected*100):null});
  }
  return {members:byPerson,days:[...byDay.values()].filter(d=>d.expected),programs:[...byProgram.values()].map(p=>({...p,rate:p.expected?Math.round(p.present/p.expected*100):null}))};
}
function rateLabel(row){return row.expected?Math.round(row.present/row.expected*100)+'%':'해당 없음'}


let targetSearch='';
function rateRing(row){const rate=row.expected?Math.round(row.present/row.expected*100):0;return '<div class="rate-chart"><div class="rate-ring" role="img" aria-label="참석률 '+rate+'퍼센트" style="--rate:'+rate+'"><strong>'+(row.expected?rate+'%':'—')+'</strong><span>참석률</span></div><div><h3>'+esc(row.name)+'</h3><p>출석 <b>'+row.present+'</b> / 대상 <b>'+row.expected+'</b></p><p class="muted">결석·미입력 '+(row.expected-row.present)+'일</p></div></div>'}
function linkedAttendanceCharts(stats){const row=stats.members.find(r=>r.id===analysisMember),empty='<div class="chart-empty"><span aria-hidden="true">↗</span><p>위에서 대상 이름을 선택해 주세요.</p></div>';return '<section class="panel insight-card"><div class="panelhead"><h2>개인별 참석률</h2></div>'+(row?rateRing(row):empty)+'<p class="notice">운영일 기준 · 미입력은 결석으로 계산합니다.</p></section><section class="panel insight-card"><div class="panelhead"><h2>프로그램별 참석률</h2></div>'+(row?(stats.programs.length?'<p class="muted">'+esc(row.name)+'님의 프로그램별 참여 현황</p><div class="program-rate-list">'+stats.programs.map(p=>{const rate=p.expected?Math.round(p.present/p.expected*100):0;return '<div class="program-rate-item"><div><strong>'+esc(p.name)+'</strong><span>'+rate+'%</span></div><div class="program-rate-track" role="img" aria-label="'+esc(p.name)+' 참석률 '+rate+'퍼센트"><i style="width:'+rate+'%"></i></div><small>출석 '+p.present+' / 배정 '+p.expected+'건</small></div>'}).join('')+'</div>':'<div class="chart-empty"><p>선택한 기간에 배정된 프로그램이 없습니다.</p></div>'):empty)+'<p class="notice">선택한 참여자의 출석에 연결된 배정 실적 기준입니다.</p></section>'}
function weekdayAttendanceTable(stats){const rows=[1,2,3,4,5].map(day=>{const dates=stats.days.filter(r=>new Date(r.date+'T12:00:00+09:00').getUTCDay()===day);return {day,expected:dates.reduce((n,r)=>n+r.expected,0),present:dates.reduce((n,r)=>n+r.present,0),absent:dates.reduce((n,r)=>n+r.absent,0)}});return '<section class="panel weekday-attendance"><div class="panelhead"><div><h2>요일별 출석률</h2><p>'+esc(stats.members.find(m=>m.id===analysisMember)?.name||'대상 이름을 선택해 주세요')+' · '+analysisFrom+' ~ '+analysisTo+'</p></div></div>'+(analysisMember?'<div class="tablewrap"><table class="admin-table"><thead><tr><th>요일</th><th>대상일</th><th>출석</th><th>결석·미입력</th><th>출석률</th></tr></thead><tbody>'+rows.map(r=>'<tr><th scope="row">'+'일월화수목금토'[r.day]+'요일</th><td>'+r.expected+'</td><td>'+r.present+'</td><td>'+r.absent+'</td><td><strong>'+(r.expected?Math.round(r.present/r.expected*100)+'%':'—')+'</strong></td></tr>').join('')+'</tbody></table></div><p class="notice">배정된 운영일 기준입니다. 대상일이 없는 요일은 —로 표시합니다.</p>':'<p class="notice">위에서 참여자를 선택하면 월요일부터 금요일까지 자동으로 표시됩니다.</p>')+'</section>'}

function groupDashboardSchedules(items){
 const groups=new Map();
 for(const item of [...items].sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||a.program.name.localeCompare(b.program.name,'ko'))){if(!groups.has(item.start))groups.set(item.start,[]);groups.get(item.start).push(item)}
 return [...groups].map(([start,items])=>({start,items}));
}
function dashboardProgramList(){
 const items=management.schedulesOn(date),groups=groupDashboardSchedules(items);
 return '<p class="today-program-count">오늘 '+items.length+'개 프로그램 · 시작 시간순</p><div class="today-program-groups">'+groups.map(g=>'<section class="today-program-group"><h3><time>'+esc(g.start)+'</time><span>시작 · '+g.items.length+'개</span></h3><div class="today-program-cards">'+g.items.map(s=>'<button class="today-program-card" data-occurrence="'+esc(s.id)+'" data-occurrence-date="'+date+'"><span class="today-program-time">'+esc(s.start)+' ~ '+esc(s.end)+(s.isException?' · 변경 일정':'')+'</span><strong>'+esc(s.program.name)+'</strong><span class="today-program-location">장소 · '+esc(s.location||'미정')+'</span><span class="today-program-staff">진행 · '+esc(s.program.staff||'미지정')+'</span></button>').join('')+'</div></section>').join('')+(!items.length?'<p class="notice">오늘 운영하는 프로그램이 없습니다.</p>':'')+'</div>';
}

let dashboardMonth='',calendarDay='';
function calendarEntries(day){
 return (management.data.calendarNotes||[]).filter(note=>note.active!==false&&(note.date||note.id)===day&&note.text.trim())
  .sort((a,b)=>(a.time||'').localeCompare(b.time||'')||(a.staffName||'').localeCompare(b.staffName||'','ko'));
}
function calendarEntryLabel(note){return [note.time,note.staffName].filter(Boolean).join(' · ')}
function dashboardCalendar(){
 const month=dashboardMonth||date.slice(0,7),chosen=calendarDay.startsWith(month)?calendarDay:date.startsWith(month)?date:month+'-01';
 const first=month+'-01',offset=new Date(first+'T12:00:00Z').getUTCDay();
 const cells=Array.from({length:offset},()=>'<span class="calendar-empty" aria-hidden="true"></span>');
 for(let n=1;n<=monthDays(month);n++){
  const day=month+'-'+String(n).padStart(2,'0'),notes=calendarEntries(day);
  const preview=notes.slice(0,2).map(note=>[calendarEntryLabel(note),note.text].filter(Boolean).join(' ')).join('\n');
  cells.push('<button type="button" data-calendar-day="'+day+'" aria-pressed="'+(chosen===day)+'" '+(day===date?'aria-current="date"':'')+'><span>'+n+(day===date?'<small>오늘</small>':'')+'</span>'+(preview?'<span class="calendar-note-preview">'+esc(preview)+'</span><small class="calendar-entry-count">일정 '+notes.length+'건</small>':'')+'</button>');
 }
 const notes=calendarEntries(chosen);
 const list=notes.map(note=>'<li><div><strong>'+esc(calendarEntryLabel(note)||'등록된 일정')+'</strong><p>'+esc(note.text)+'</p></div><div class="calendar-entry-actions"><button type="button" class="secondary" data-edit-calendar="'+esc(note.id)+'">수정</button><button type="button" class="secondary danger" data-delete-calendar="'+esc(note.id)+'">삭제</button></div></li>').join('');
 return '<section class="panel dashboard-calendar" aria-labelledby="calendarTitle"><div class="panelhead"><div><h2 id="calendarTitle">월간 일정</h2><p class="calendar-today">오늘 · '+esc(prettyDate)+'</p></div><label>조회 월<input type="month" id="dashboardMonth" value="'+month+'"></label></div><div class="calendar-layout"><div><div class="calendar-weekdays" aria-hidden="true">'+[...'일월화수목금토'].map(day=>'<span>'+day+'</span>').join('')+'</div><div class="calendar-days">'+cells.join('')+'</div></div><div class="calendar-day-detail"><h3>'+chosen+' 일정</h3><ul class="calendar-entry-list">'+(list||'<li>등록된 일정이 없습니다.</li>')+'</ul><form id="calendarNoteForm" class="calendar-note-form"><h4 id="calendarFormTitle">일정 등록</h4><label for="calendarStaffName">이름</label><input id="calendarStaffName" maxlength="80" required placeholder="일정 담당자 이름"><label for="calendarTime">시간 (선택)</label><input id="calendarTime" type="time"><label for="calendarNote">일정 내용</label><textarea id="calendarNote" maxlength="1000" required rows="3" placeholder="자신의 일정을 입력해 주세요."></textarea><p id="calendarNoteFeedback" role="status"></p><div class="actions"><button type="submit" class="primary" id="saveCalendarEntry">일정 등록</button><button type="button" class="secondary" id="cancelCalendarEdit" hidden>등록으로 돌아가기</button></div></form></div></div></section>';
}
function bindDashboardCalendar(){
 $('#dashboardMonth').onchange=event=>{if(event.target.value){dashboardMonth=event.target.value;calendarDay='';render()}};
 document.querySelectorAll('[data-calendar-day]').forEach(button=>button.onclick=()=>{
  calendarDay=button.dataset.calendarDay;render();$('#calendarStaffName').focus({preventScroll:true});
 });
 const form=$('#calendarNoteForm'),month=dashboardMonth||date.slice(0,7);
 const day=calendarDay.startsWith(month)?calendarDay:date.startsWith(month)?date:month+'-01';
 let editing=null;
 const reset=()=>{
  editing=null;form.reset();$('#calendarFormTitle').textContent='일정 등록';$('#saveCalendarEntry').textContent='일정 등록';$('#cancelCalendarEdit').hidden=true;$('#calendarNoteFeedback').textContent='';
 };
 $('#cancelCalendarEdit').onclick=reset;
 document.querySelectorAll('[data-edit-calendar]').forEach(button=>button.onclick=()=>{
  const note=management.data.calendarNotes.find(row=>row.id===button.dataset.editCalendar);
  editing=JSON.parse(JSON.stringify(note));
  $('#calendarStaffName').value=note.staffName||'';$('#calendarTime').value=note.time||'';$('#calendarNote').value=note.text;
  $('#calendarFormTitle').textContent='일정 수정';$('#saveCalendarEntry').textContent='수정 저장';$('#cancelCalendarEdit').hidden=false;$('#calendarNoteFeedback').textContent='';$('#calendarNote').focus({preventScroll:true});
 });
 async function save(after,before){
  await requireSharedWriteAccess();
  if(!team.calendarEntries)throw Error('개별 일정 등록을 위해 Apps Script 서버를 새 버전으로 배포해 주세요.');
  const rows=management.data.calendarNotes||(management.data.calendarNotes=[]),index=rows.findIndex(note=>note.id===after.id);
  if(JSON.stringify(index>=0?rows[index]:null)!==JSON.stringify(before))throw Error('다른 직원이 이 일정을 수정했습니다. 최신 일정을 확인해 주세요.');
  ManagementStore.validateCalendarNote(after);
  if(index<0)rows.push(after);else rows[index]=after;
  if(!persist())throw Error('일정을 저장할 준비를 하지 못했습니다.');
  await saveTeamConfig();
  if(team.error)throw Error(team.error);
  render();toast(after.active===false?'일정을 삭제했습니다.':'일정을 저장했습니다.');
 }
 form.onsubmit=async event=>{
  event.preventDefault();
  const button=event.submitter,feedback=$('#calendarNoteFeedback');
  const before=editing;
  const after={...(before||{}),id:before?.id||crypto.randomUUID(),date:day,staffName:$('#calendarStaffName').value.trim(),time:$('#calendarTime').value,text:$('#calendarNote').value.trim(),active:true};
  if(!after.text){feedback.textContent='일정 내용을 입력해 주세요.';return}
  button.disabled=true;
  try{await save(after,before)}catch(error){feedback.textContent=error.message}finally{button.disabled=false}
 };
 document.querySelectorAll('[data-delete-calendar]').forEach(button=>button.onclick=()=>{
  const note=management.data.calendarNotes.find(row=>row.id===button.dataset.deleteCalendar);
  const before=JSON.parse(JSON.stringify(note));
  modal('<h2>일정을 삭제할까요?</h2><p>'+esc(calendarEntryLabel(note))+'</p><p>'+esc(note.text)+'</p><p id="calendarDeleteError" role="alert"></p><button type="button" class="primary danger" id="confirmCalendarDelete">삭제</button>');
  $('#confirmCalendarDelete').onclick=async event=>{
   event.target.disabled=true;
   try{await save({...before,active:false},before);$('#dialog').close()}catch(error){$('#calendarDeleteError').textContent=error.message;event.target.disabled=false}
  };
 });
}

dashboard=function(){const stats=analysisData(),todayAttendance=periodAttendanceData(date,date),todayPresent=people.filter(m=>records[date+':'+m.id]==='출석').length;
return heading('우리의 하루를, 함께.','팀 운영 대시보드 · '+prettyDate,'<a class="primary" href="#attendance">오늘 출결 확인 ↗</a><button id="backupDashboard" class="secondary">운영 자료 백업</button>')+dashboardCalendar()+
'<section class="metrics">'+[['오늘 출석',todayPresent,'명'],['등록 참여자',people.length,'명'],['오늘 프로그램',management.schedulesOn(date).length,'개'],['오늘 참석률',todayAttendance.rate===null?'—':todayAttendance.rate,'%',todayAttendance.present+' / '+todayAttendance.expected+'명']].map(m=>'<div class="metric"><div class="metriclabel">'+m[0]+'</div><strong>'+m[1]+'<small>'+m[2]+'</small></strong>'+(m[3]?'<p class="metric-basis">'+m[3]+'</p>':'')+'</div>').join('')+'</section>'+
'<div class="grid dashboard-operations-grid"><section class="panel today-program-panel"><div class="panelhead"><h2>오늘의 프로그램</h2><a class="textbutton" href="#timetable/staff">시간표 보기 ↗</a></div>'+dashboardProgramList()+'</section>'+periodAttendanceCard()+'</div>'+
'<div class="insight-heading"><div><p class="eyebrow">ATTENDANCE INSIGHTS</p><h2>참여의 흐름을 한눈에.</h2></div><button id="exportAnalysis" class="secondary">↓ 참석률 CSV</button></div><section class="panel period-panel"><div class="analysis-filters"><label>시작일<input id="analysisFrom" type="date" value="'+analysisFrom+'" max="'+date+'"></label><label>종료일<input id="analysisTo" type="date" value="'+analysisTo+'" max="'+date+'"></label><label>대상 이름 검색<input id="targetSearch" type="search" placeholder="이름으로 검색" value="'+esc(targetSearch)+'"></label><label>대상 이름<select id="analysisTarget"><option value="">참여자를 선택해 주세요</option>'+opts(management.list('members').filter(m=>m.name.includes(targetSearch)),analysisMember)+'</select></label></div></section><div class="insights-grid">'+linkedAttendanceCharts(stats)+'</div>'+weekdayAttendanceTable(stats);
};
const analysisBind=bindManagement;
bindManagement=function(page){analysisBind(page);if(page!=='dashboard')return;bindPeriodAttendance();
 $('#backupDashboard').onclick=downloadTeamBackup;
 bindDashboardCalendar();

 const refreshInsights=async()=>{const from=$('#analysisFrom').value,to=$('#analysisTo').value,id=$('#analysisTarget').value;if(!from||!to||from>to||to>date||dateSpan(from,to).length>=366){toast('오늘까지, 1년 이내의 날짜 범위를 선택해 주세요.');return}analysisFrom=from;analysisTo=to;analysisGroup='';analysisStaff='';analysisMember=id;try{for(const year of new Set(dateSpan(from,to).map(d=>d.slice(0,4))))await ensureHolidayYear(year);if(team.active)for(const month of new Set(dateSpan(from,to).map(d=>d.slice(0,7))))await loadTeamMonth(month);if(location.hash==='#dashboard')render()}catch(error){toast('자료를 불러오지 못했습니다. '+error.message)}};
 $('#analysisTarget').onchange=refreshInsights;$('#analysisFrom').onchange=refreshInsights;$('#analysisTo').onchange=refreshInsights;
 $('#targetSearch').oninput=e=>{targetSearch=e.target.value.trim();const items=management.list('members').filter(m=>m.name.includes(targetSearch));$('#analysisTarget').innerHTML='<option value="">'+(items.length?'참여자를 선택해 주세요':'검색 결과가 없습니다')+'</option>'+opts(items,analysisMember);const exact=items.filter(m=>m.name===targetSearch);if(exact.length===1){$('#analysisTarget').value=exact[0].id;refreshInsights()}};
 $('#exportAnalysis').onclick=()=>csv([['이름','소속','사례관리 담당','대상일','출석','결석','참석률'],...analysisData().members.map(r=>[r.name,r.group,r.caseManager,r.expected,r.present,r.absent,rateLabel(r)])],'개인참석률_'+analysisFrom+'_'+analysisTo+'.csv');
};
render();
