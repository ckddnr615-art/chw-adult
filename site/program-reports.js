/* Explicit, read-only range queries. No polling, spreadsheet writes or report maintenance here. */
const programReportState={mode:'month',month:date.slice(0,7),from:date.slice(0,7)+'-01',to:date,programId:'*',overview:'weeks',view:'register',page:0,busy:false,error:'',result:null,checkedAt:''};
function programReportFilters(){
 const s=programReportState,programs=management.data.programs.slice().sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 return `<form id="programReportForm" class="filters program-report-filters"><label>프로그램<select id="programReportProgram" name="programId" required ${s.busy?'disabled':''}><option value="*" ${s.programId==='*'?'selected':''}>전체 프로그램 (통합)</option><option value="">프로그램 선택</option>${programs.map(p=>`<option value="${esc(p.id)}" ${p.id===s.programId?'selected':''}>${esc(p.name)}${p.active===false?' (종료)':''}</option>`).join('')}</select></label><label>조회 방식<select id="programReportMode" ${s.busy?'disabled':''}><option value="month" ${s.mode==='month'?'selected':''}>월별 조회</option><option value="range" ${s.mode==='range'?'selected':''}>기간별 조회</option></select></label>${s.mode==='month'?`<label>조회 월<input id="programReportMonth" type="month" required value="${esc(s.month)}" ${s.busy?'disabled':''}></label>`:`<label>시작일<input id="programReportFrom" type="date" required value="${esc(s.from)}" ${s.busy?'disabled':''}></label><label>종료일<input id="programReportTo" type="date" required value="${esc(s.to)}" ${s.busy?'disabled':''}></label>`}<button class="primary" type="submit" ${s.busy?'disabled':''}>${s.busy?'조회 중…':'조회하기'}</button></form>`;
}
function programReportWeeks(report){
 return `<section class="panel"><h2>주차별 요약</h2><p class="formhint">월요일~일요일 기준입니다. 연인원은 같은 프로그램에 참여한 한 사람을 하루 한 번 계산합니다.</p><div class="tablewrap"><table class="admin-table"><thead><tr>${['주차','기간','운영·예정일','출석 연인원','결석 연인원','확인 대기','실인원'].map(h=>'<th scope="col">'+h+'</th>').join('')}</tr></thead><tbody>${report.weeks.map(w=>`<tr><th scope="row">${w.label}</th><td>${w.from.slice(5)} ~ ${w.to.slice(5)}</td><td>${w.operating}일</td><td><strong>${w.present}명</strong></td><td>${w.absent}명</td><td>${w.pending}명</td><td>${w.unique}명</td></tr>`).join('')}</tbody></table></div></section>`;
}
function programReportColumns(report){return report.days.length<=31?report.days.map(d=>({key:d,label:d.slice(5),dates:[d]})):report.weeks.map(w=>({key:w.key,label:w.label+' '+w.from.slice(5),dates:report.days.filter(d=>d>=w.from&&d<=w.to)}))}
function programReportCell(member,column,report){
 if(column.dates.length===1){const d=column.dates[0],cell=member.cells[d];return {mark:cell?.mark||(report.dayInfo[d]?.holiday?'휴':'—'),details:cell?.details||'프로그램 배정 없음'}}
 const cells=column.dates.map(d=>member.cells[d]).filter(Boolean),count=cells.filter(c=>c.state!=='future').length,present=cells.filter(c=>c.state==='present').length;
 return {mark:cells.length?present+' / '+count:'—',details:'출석 '+present+'회 / 조회일 기준 대상 '+count+'회 · 미래 예정 '+cells.filter(c=>c.state==='future').length+'회'};
}
function programReportTable(report){
 const s=programReportState,start=s.page*35;
 if(s.view==='actual'){
  const rows=report.actual.slice(start,start+35);
  return `<div class="tablewrap"><table class="admin-table"><thead><tr>${['일자','이름','프로그램 실적 담당','실적','참여 일정 수','시트 반영'].map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td>${r.date}</td><th scope="row">${esc(r.name)}</th><td>${esc(r.staff)}</td><td>1건${r.partial?' · 일부 시간 참여':''}</td><td>${r.sessions}회</td><td>${r.sync}</td></tr>`).join('')||'<tr><td colspan="6">확인된 프로그램 참여 실적이 없습니다.</td></tr>'}</tbody></table></div>`;
 }
 const columns=programReportColumns(report);
 return `<p class="formhint">${report.days.length>31?'기간이 길어 주차별 출석 / 대상 횟수로 표시합니다.':'/ 출석 · △ 일부 일정 참여 · O 결석 · ? 오늘 확인 대기 · 예정 미래 배정 · — 배정 없음 · 휴 휴무일'}<br>지난 운영일의 미기록은 O로 표시합니다. 센터 출석만으로 프로그램 참여 실적을 만들지 않습니다.</p><div class="tablewrap program-report-scroll" tabindex="0" role="region" aria-label="프로그램 출석부 가로 스크롤"><table class="program-report-grid"><thead><tr><th scope="col">참여자</th>${columns.map(c=>'<th scope="col">'+c.label+'</th>').join('')}<th>출석</th><th>결석</th></tr></thead><tbody>${report.members.slice(start,start+35).map(m=>`<tr><th scope="row">${esc(m.name)}</th>${columns.map(c=>{const cell=programReportCell(m,c,report);return `<td title="${esc(m.name+' · '+c.label+' · '+cell.details)}">${esc(cell.mark)}</td>`}).join('')}<td>${m.present}</td><td>${m.absent}</td></tr>`).join('')||`<tr><td colspan="${columns.length+3}">해당 기간에 배정 또는 기록된 인원이 없습니다.</td></tr>`}</tbody></table></div>`;
}
function programOverviewColumns(report){return programReportState.overview==='months'?report.months.map(key=>({key,label:key,field:'monthly'})):report.weeks.map(w=>({key:w.key,label:w.label+' '+w.from.slice(5)+'~'+w.to.slice(5),field:'weekly'}))}
function programOverviewCsv(report){
 const columns=programOverviewColumns(report);
 return [['프로그램','기록 당시 프로그램 실적 담당',...columns.map(c=>c.label),'실인원','실적 연인원','결석 연인원','확인 대기'],...report.rows.map(row=>[row.name,row.staff,...columns.map(c=>row[c.field][c.key]||0),row.totals.unique,row.totals.present,row.totals.absent,row.totals.pending]),['전체 합계 (실인원 중복 제외)','',...columns.map(c=>report.rows.reduce((n,row)=>n+(row[c.field][c.key]||0),0)),report.totals.unique,report.totals.present,report.totals.absent,report.totals.pending]];
}
function programOverviewPage(){
 const s=programReportState,r=s.result,columns=programOverviewColumns(r),rows=r.rows.slice(s.page*35,s.page*35+35);
 const footer='<tr><th scope="row">전체 합계</th><td>전체 프로그램 기준</td>'+columns.map(c=>'<td>'+r.rows.reduce((n,row)=>n+(row[c.field][c.key]||0),0)+'</td>').join('')+'<td>'+r.totals.unique+'</td><td>'+r.totals.present+'</td><td>'+r.totals.absent+'</td><td>'+r.totals.pending+'</td></tr>';
 return heading('프로그램 출석·실적','전체 프로그램을 한 표에서 비교합니다. 프로그램명을 누르면 개별 출석부를 확인합니다.')+'<section class="panel">'+programReportFilters()+'<p class="formhint">최대 366일 · 필요한 월을 한 번씩 조회하고 모든 프로그램이 같은 자료를 사용합니다.</p><p id="programReportProgress" role="status">'+(s.busy?'선택한 기간의 자료를 확인하고 있습니다.':'')+'</p><p class="formerror" role="alert">'+esc(s.error)+'</p></section><section class="panel"><h2>전체 프로그램 통합표</h2><p>'+r.from+' ~ '+r.to+' · 마지막 조회 '+esc(s.checkedAt)+'</p><div class="program-report-stats">'+[['프로그램',r.rows.length+'개'],['전체 실인원',r.totals.unique+'명'],['프로그램 실적 연인원',r.totals.present+'건'],['일자별 출석 연인원',r.totals.personDays+'명'],['확인 대기',r.totals.pending+'명']].map(([name,value])=>'<div><span>'+name+'</span><strong>'+value+'</strong></div>').join('')+'</div><p class="formhint">프로그램 실적은 프로그램별 참여 건수를 합산합니다. 같은 사람이 같은 날 여러 프로그램에 참여하면 프로그램마다 1건입니다. 전체 실인원은 프로그램 간 중복을 제외하고, 일자별 출석 연인원은 같은 날 중복을 제외합니다. 표의 주차·월별 숫자는 프로그램 참여 연인원이며 미래 예정은 제외합니다.</p><div class="panelhead"><div class="program-report-tabs" role="group" aria-label="통합표 기간 단위"><button class="secondary" data-program-overview="weeks" aria-pressed="'+(s.overview!=='months')+'">주차별 통합</button><button class="secondary" data-program-overview="months" aria-pressed="'+(s.overview==='months')+'">월별 통합</button></div><button class="secondary" id="programReportCsv">↓ 통합표 CSV</button></div><div class="tablewrap program-report-scroll" tabindex="0" role="region" aria-label="전체 프로그램 통합표"><table class="program-report-grid"><thead><tr><th scope="col">프로그램</th><th scope="col">기록 당시 실적 담당</th>'+columns.map(c=>'<th scope="col">'+c.label+'</th>').join('')+'<th scope="col">실인원</th><th scope="col">실적 연인원</th><th scope="col">결석 연인원</th><th scope="col">확인 대기</th></tr></thead><tbody>'+rows.map(row=>'<tr><th scope="row"><button type="button" class="textbutton" data-program-report-detail="'+esc(row.id)+'">'+esc(row.name)+(row.active?'':' (종료)')+' ↗</button></th><td>'+esc(row.staff)+'</td>'+columns.map(c=>'<td>'+Number(row[c.field][c.key]||0)+'</td>').join('')+'<td>'+row.totals.unique+'</td><td><strong>'+row.totals.present+'</strong></td><td>'+row.totals.absent+'</td><td>'+row.totals.pending+'</td></tr>').join('')+'</tbody><tfoot>'+footer+'</tfoot></table></div><div class="program-report-pages"><button class="secondary" id="programReportPrevious" '+(s.page===0?'disabled':'')+'>← 이전</button><span>'+(r.rows.length?s.page+1:0)+' / '+Math.ceil(r.rows.length/35)+'쪽 · 전체 '+r.rows.length+'개 프로그램</span><button class="secondary" id="programReportNext" '+((s.page+1)*35>=r.rows.length?'disabled':'')+'>다음 →</button></div><p class="formhint">전체 합계는 현재 페이지에 보이지 않는 프로그램도 포함합니다. 종료된 프로그램의 해당 기간 기록도 보존합니다. CSV에는 전체 프로그램을 내보냅니다.</p></section>';
}
function programReportsPage(){
 if(programReportState.result?.kind==='all')return programOverviewPage();
 const s=programReportState,r=s.result,total=r?(s.view==='actual'?r.actual.length:r.members.length):0;
 return heading('프로그램 출석·실적','프로그램별 월간 출석부와 주차별 기록을 확인합니다. 조회하기를 누를 때만 자료를 확인합니다.')+`<section class="panel">${programReportFilters()}<p class="formhint">한 번에 최대 366일 · 전체 통합 또는 개별 프로그램 · 서버 쓰기 없이 저장된 기록만 조회합니다.</p><p id="programReportProgress" role="status">${s.busy?'선택한 기간의 자료를 확인하고 있습니다.':''}</p><p role="alert" class="formerror">${esc(s.error)}</p></section>`+(r?`<section class="panel program-report-heading"><h2>${esc(r.name)}</h2><p>${r.from} ~ ${r.to} · 마지막 조회 ${esc(s.checkedAt)}</p><div class="program-report-stats">${[['운영·예정',r.totals.operating+'일'],['출석 실인원',r.totals.unique+'명'],['실적 연인원',r.totals.present+'건'],['결석',r.totals.absent+'명'],['확인 대기',r.totals.pending+'명']].map(([name,value])=>'<div><span>'+name+'</span><strong>'+value+'</strong></div>').join('')}</div><p class="formhint">실인원은 기간 내 중복을 뺀 인원, 연인원은 날짜별 참여 인원의 합입니다. 미래 예정은 실적·결석에 포함하지 않습니다. 담당자는 사례관리 담당이 아닌 기록 당시 프로그램 실적 담당입니다.</p></section>`+programReportWeeks(r)+`<section class="panel"><div class="panelhead"><div class="program-report-tabs" role="group" aria-label="프로그램 보고서 보기"><button class="secondary" data-program-report-view="register" aria-pressed="${s.view==='register'}">출석부</button><button class="secondary" data-program-report-view="actual" aria-pressed="${s.view==='actual'}">실적표</button></div><button class="secondary" id="programReportCsv">↓ ${s.view==='actual'?'실적표':'출석부'} CSV</button></div>${programReportTable(r)}<div class="program-report-pages"><button class="secondary" id="programReportPrevious" ${s.page===0?'disabled':''}>← 이전</button><span>${total?Math.floor(s.page+1):0} / ${Math.ceil(total/35)}쪽 · 전체 ${total}${s.view==='actual'?'건':'명'}</span><button class="secondary" id="programReportNext" ${(s.page+1)*35>=total?'disabled':''}>다음 →</button></div></section>`:'<section class="panel"><h2>프로그램과 조회 기간을 골라 주세요</h2><p>조회한 결과에 출석부, 주차별 요약, 실제 참여 실적이 표시됩니다.</p></section>');
}
async function queryProgramReports(){
 const s=programReportState;if(s.busy)return;
 try{
  if(!adminSession||!team.active)throw Error('공동 저장 연결과 관리자 로그인을 확인해 주세요.');
  if(configPending||configSaving)throw Error('입력 중인 변경을 저장한 뒤 조회해 주세요.');
  if(s.mode==='month'){if(!/^\d{4}-\d{2}$/.test(s.month))throw Error('조회 월을 선택해 주세요.');s.from=s.month+'-01';s.to=new Date(Date.UTC(Number(s.month.slice(0,4)),Number(s.month.slice(5)),0,12)).toISOString().slice(0,10)}
  const months=ProgramReports.months(s.from,s.to);if(!s.programId)throw Error('프로그램을 선택해 주세요.');
  s.busy=true;s.error='';render();
  const response=await fetch('/api/team/status',{credentials:'same-origin'}),auth=await response.json();if(!response.ok||!auth.authenticated)throw Error('관리자 로그인 시간이 만료되었거나 연결을 확인할 수 없습니다. 다시 로그인해 주세요.');
  for(let i=0;i<months.length;i++){
   const year=months[i].slice(0,4);await ensureHolidayYear(year);
   const loaded=await loadTeamMonth(months[i]);if(!loaded)throw Error('선택한 기간을 불러오지 못했습니다.');
   const progress=$('#programReportProgress');if(progress)progress.textContent=(i+1)+' / '+months.length+'개월 확인 완료';
  }
  s.result=s.programId==='*'?ProgramReports.buildAll(management,records,{from:s.from,to:s.to,today:date}):ProgramReports.build(management,records,{programId:s.programId,from:s.from,to:s.to,today:date});s.page=0;
  s.checkedAt=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
 }catch(error){s.error=error.message}finally{s.busy=false;if(location.hash.split('/')[0]==='#program-reports')render()}
}
function exportProgramReport(){
 const s=programReportState,r=s.result;if(!r)return;
 const rows=r.kind==='all'?programOverviewCsv(r):s.view==='actual'?[['프로그램','일자','이름','프로그램 실적 담당','실적 건수','참여 일정 수','시트 반영'],...r.actual.map(a=>[r.name,a.date,a.name,a.staff,1,a.sessions,a.sync])]:[['프로그램','이름',...r.days,'출석','결석'],...r.members.map(m=>[r.name,m.name,...r.days.map(d=>programReportCell(m,{label:d,dates:[d]},r).mark),m.present,m.absent])];
 const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replace(/"/g,'""')+'"';
 const blob=new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=r.name.replace(/[\\/:*?"<>|]/g,'_')+'_'+r.from+'_'+r.to+'_'+(r.kind==='all'?'통합표':s.view==='actual'?'실적표':'출석부')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const previousProgramReportBind=bindManagement;
bindManagement=function(page){
 previousProgramReportBind(page);if(page!=='program-reports')return;
 const s=programReportState;
 $('#programReportForm').onsubmit=e=>{e.preventDefault();void queryProgramReports()};
 $('#programReportProgram').onchange=e=>{s.programId=e.target.value};
 $('#programReportMode').onchange=e=>{s.mode=e.target.value;render()};
 for(const [id,key] of [['programReportMonth','month'],['programReportFrom','from'],['programReportTo','to']])if($('#'+id))$('#'+id).onchange=e=>{s[key]=e.target.value};
 document.querySelectorAll('[data-program-overview]').forEach(button=>button.onclick=()=>{s.overview=button.dataset.programOverview;s.page=0;render()});
 document.querySelectorAll('[data-program-report-detail]').forEach(button=>button.onclick=()=>{s.programId=button.dataset.programReportDetail;s.view='register';void queryProgramReports()});
 document.querySelectorAll('[data-program-report-view]').forEach(button=>button.onclick=()=>{s.view=button.dataset.programReportView;s.page=0;render()});
 if($('#programReportPrevious'))$('#programReportPrevious').onclick=()=>{s.page--;render()};
 if($('#programReportNext'))$('#programReportNext').onclick=()=>{s.page++;render()};
 if($('#programReportCsv'))$('#programReportCsv').onclick=exportProgramReport;
};
managementPages['program-reports']=programReportsPage;
