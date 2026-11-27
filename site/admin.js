/* Editable local workspace. Google writes require a configured authenticated API. */
const management=new ManagementStore(saved.management||ManagementStore.seed(groups,people,programs,records));
management.captureDays(records);
let participantNameQuery='',participantStaffFilter='';
const memberRowDrafts=new Map();
const caseBulkSelected=new Map();
let caseBulkStaff='',caseBulkBusy=false,caseBulkMessage='';
let managementFilter='',showArchived=false,performanceDate=date,performanceSchedule='',reportStaff='',reportMonth=date.slice(0,7),syncBusy=false;
let apiState={available:false,configured:false,authenticated:false};
const sheetAppUrl='https://script.google.com/a/macros/chw.or.kr/s/AKfycbynQmENIw4yEEKwpt4hA-lV2ueHel6zSWOJDzG5LFbqNGe8VCk2sywf0IzrFP62ZrbM/exec';
const typeNames={members:'참여자',communities:'커뮤니티',areas:'영역',programs:'프로그램',schedules:'일정',staff:'직원'};
function refreshCollections(){
  groups=management.list('communities').map(c=>c.name);
  people=management.list('members').map(p=>({id:p.id,name:p.name,group:management.communityName(p.communityId),communityId:p.communityId}));
  programs=management.schedulesOn(date).map(s=>[s.start,s.end,s.program.name,s.community,s.location,s.program.staff]);
  if(!groups.includes(participantGroup))participantGroup='';
  if(selectedGroup!=='전체 커뮤니티'&&!groups.includes(selectedGroup))selectedGroup='전체 커뮤니티';
}
function transaction(work){
  const before=JSON.stringify(management.data),oldRecords={...records};
  try{management.captureDays(records);work();if(!persist())throw Error('저장하지 못했습니다. 변경 전 상태를 유지합니다.');refreshCollections();return true}
  catch(error){management.data=JSON.parse(before);records=oldRecords;toast(error.message);return false}
}
function opts(items,value,label=x=>x.name){return items.map(x=>`<option value="${esc(x.id)}" ${x.id===value?'selected':''}>${esc(label(x))}</option>`).join('')}
function sortedOpts(items,value,label){
  return opts([...items].sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true})||a.id.localeCompare(b.id)),value,label);
}
function programSelectionItems(items,selected='',includeHidden=false){return items.filter(p=>includeHidden||!p.selectionHidden||p.id===selected)}
let showExcludedPrograms=false;
async function changeProgramListVisibility(id){
 if(changeProgramListVisibility.busy)return;
 changeProgramListVisibility.busy=true;
 try{
  await teamBoot;
  if(!team.active||!team.authenticated)throw Error('관리자 로그인과 공동 저장 연결을 확인해 주세요.');
  if(configPending||configSaving){await saveTeamConfig();if(configPending||team.error)throw Error(team.error||'먼저 입력 중인 변경을 저장해 주세요.')}
  if(team.error)throw Error(team.error);
  const item=management.find('programs',id);if(!item)throw Error('프로그램을 다시 확인해 주세요.');
  const hidden=!item.selectionHidden;
  if(!transaction(()=>{item.selectionHidden=hidden}))return;
  clearTimeout(configTimer);await saveTeamConfig();
  if(team.error||configPending)throw Error(team.error||'목록 변경의 서버 저장을 확인해 주세요.');
  if(typeof programReportState!=='undefined'&&programReportState.programId===id&&hidden)programReportState.programId='*';
  render();toast(hidden?'목록에서 제외했습니다. 출석·실적 기록과 운영 일정은 유지됩니다.':'목록에 다시 표시했습니다.');
 }catch(error){render();toast(error.message)}finally{changeProgramListVisibility.busy=false}
}
function field(label,name,value='',type='text',required=true){return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} maxlength="${name==='location'?120:80}"></label>`}
function communityOf(type,item){if(type==='staff')return '';if(type==='communities')return item.id;if(type==='members'||type==='areas')return item.communityId;if(type==='schedules'&&Object.hasOwn(item,'communityId'))return item.communityId;if(type==='programs')return management.find('areas',item.areaId)?.communityId;return communityOf('programs',management.find('programs',item.programId)||{})}
let programAreaFilter='',programStaffFilter='',programStatusFilter='',programCatalogScope='current',programCatalogSearch='',programCatalogPageIndex=0;

function integratedProgramCatalog(){
 const archiveStates=new Map(management.data.programs.map(p=>[p.id,management.programArchived(p.id,date)])),archived=p=>archiveStates.get(p.id);
 const schedulesFor=p=>management.data.schedules.filter(s=>s.programId===p.id&&(archived(p)||s.active!==false)&&(!s.validFrom||!s.validTo||s.validFrom<=s.validTo)&&(archived(p)||(!s.validTo||s.validTo>=date)&&(!s.date||s.date>=date))).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.start.localeCompare(b.start));
 const allItems=management.data.programs.filter(p=>(showExcludedPrograms||!p.selectionHidden)&&(programCatalogScope==='all'||archived(p)===(programCatalogScope==='archived'))&&(!programCatalogSearch||p.name.toLocaleLowerCase().includes(programCatalogSearch.trim().toLocaleLowerCase()))&&(!programAreaFilter||p.areaId===programAreaFilter)&&(!programStatusFilter||management.programEnabled(p.id,date)===(programStatusFilter==='enabled'))).sort((a,b)=>a.name.localeCompare(b.name,'ko')).filter(p=>{if(!programStaffFilter)return true;const schedules=schedulesFor(p);return schedules.length?schedules.some(s=>scheduleMatchesStaff(s,programStaffFilter)):scheduleMatchesStaff({programId:p.id},programStaffFilter)});
 programCatalogPageIndex=Math.min(programCatalogPageIndex,Math.max(0,Math.ceil(allItems.length/30)-1));
 const items=allItems.slice(programCatalogPageIndex*30,programCatalogPageIndex*30+30);
 const rows=items.map(p=>{
  let schedules=schedulesFor(p);
  const hasSchedules=schedules.length>0;if(programStaffFilter)schedules=schedules.filter(s=>scheduleMatchesStaff(s,programStaffFilter));
  if(programStaffFilter&&hasSchedules&&!schedules.length)return '';
  if(!schedules.length&&programStaffFilter&&!scheduleMatchesStaff({programId:p.id},programStaffFilter))return '';
  const slots=schedules.length?schedules:[null],enabled=management.programEnabled(p.id,date),actions=p.active===false?`<button class="secondary" data-restore="programs:${esc(p.id)}">프로그램 복구</button>`:`<button class="secondary" data-program-toggle="${esc(p.id)}">프로그램 ${enabled?'비활성화':'활성화'}</button><button class="secondary danger" data-delete="programs:${esc(p.id)}">프로그램 전체 삭제</button>`;
  const permanentAction=archived(p)?`<button class="secondary danger" data-program-purge="${esc(p.id)}">완전 삭제</button>`:'';
  return slots.map((s,i)=>`<tr>${!i?`<td rowspan="${slots.length}"><strong>${esc(p.name)}</strong><span class="program-state ${enabled?'enabled':'disabled'}">${p.active===false?'보관':archived(p)?'기간 종료':enabled?'활성':'비활성'}</span>${p.active!==false?`<button type="button" class="secondary program-add-schedule" data-program-add-schedule="${esc(p.id)}">＋ 일정 추가</button>`:''}<details class="program-wide-actions"><summary>프로그램 전체 관리</summary>${actions}</details><button type="button" class="secondary" data-program-list-toggle="${esc(p.id)}">${p.selectionHidden?'목록에 다시 표시':'목록에서 제외 (기록 유지)'}</button>${p.selectionHidden?'<span class="program-state disabled">목록 제외 · 기록 보관</span>':''}${permanentAction}</td><td rowspan="${slots.length}">${esc(management.find('areas',p.areaId)?.name||'영역 미지정')}</td>`:''}<td>${s?esc(s.date||s.weekdays.map(n=>'일월화수목금토'[n]).join(' · ')+' 반복'):'일정 미등록'}${s&&!s.date?`<span class="program-period">${esc(s.validFrom||'기본')} ~ ${esc(s.validTo||'종료일 없음')}</span>`:''}</td><td>${s?s.start+' ~ '+s.end:'—'}</td><td>${s&&p.active!==false&&!archived(p)?programStaffQuickEditor(s):esc(management.staffNames(s?.facilitatorIds||p.facilitatorIds)||p.staff||'미지정')}</td><td class="rowactions">${p.active===false?'—':s?`<div class="schedule-row-actions"><button class="secondary" data-assign="${esc(s.id)}">참여자 선택</button><details class="simple-advanced schedule-more"><summary>일정 상세</summary>${!s.date&&s.weekdays.length>1?`<button class="secondary" data-split-weekdays="${esc(s.id)}">요일별 담당·참여자 나누기</button>`:''}<button class="secondary" data-program-schedule-edit="${esc(s.id)}">수정</button>${!s.date?`<button class="secondary" data-program-start-edit="${esc(s.id)}">시작일 수정</button>`:''}<button class="secondary danger" data-delete="schedules:${esc(s.id)}">이 일정 삭제</button></details></div>`:`<button class="secondary" data-edit="programs:${esc(p.id)}">일정 등록</button>`}</td></tr>`).join('');
 }).join('');
 return heading('프로그램 등록/수정','프로그램을 등록하고 수정창에서 일정과 참여자를 함께 관리합니다.', '<button class="secondary" id="programPurgeStatus">완전 삭제 진행 확인</button><button class="primary" data-add="programs">＋ 프로그램 등록</button>')+`<section class="panel"><div class="filters"><label class="checklabel"><input type="checkbox" id="showExcludedPrograms" ${showExcludedPrograms?'checked':''}>목록에서 제외한 프로그램 보기</label><label>프로그램 구분<select id="programCatalogScope"><option value="current" ${programCatalogScope==='current'?'selected':''}>운영·예정 프로그램</option><option value="archived" ${programCatalogScope==='archived'?'selected':''}>종료·보관 프로그램</option><option value="all" ${programCatalogScope==='all'?'selected':''}>전체 (과거 포함)</option></select></label><label>프로그램 이름<input type="search" id="programCatalogSearch" value="${esc(programCatalogSearch)}" placeholder="이름 검색"></label><button type="button" class="secondary" id="programCatalogSearchButton">검색</button><label>프로그램 영역<select id="programAreaFilter"><option value="">전체 영역</option>${opts(management.list('areas'),programAreaFilter)}</select></label><label>담당자 (프로그램 진행)<select id="programStaffFilter"><option value="">전체 담당자</option><option value="unassigned" ${programStaffFilter==='unassigned'?'selected':''}>미지정</option>${opts(management.list('staff'),programStaffFilter)}</select></label><label>운영 상태<select id="programStatusFilter"><option value="">전체 상태</option><option value="enabled" ${programStatusFilter==='enabled'?'selected':''}>활성</option><option value="disabled" ${programStatusFilter==='disabled'?'selected':''}>비활성</option></select></label></div><div class="tablewrap"><table class="admin-table integrated-program-table"><thead><tr><th>프로그램</th><th>영역</th><th>운영일</th><th>시간</th><th>직원</th><th>관리</th></tr></thead><tbody>${rows||'<tr><td colspan="6">조건에 맞는 프로그램이 없습니다.</td></tr>'}</tbody></table></div><div class="program-report-pages"><button class="secondary" id="programCatalogPrevious" ${programCatalogPageIndex===0?'disabled':''}>← 이전</button><span>${allItems.length?programCatalogPageIndex+1:0} / ${Math.ceil(allItems.length/30)}쪽 · 전체 ${allItems.length}개 프로그램</span><button class="secondary" id="programCatalogNext" ${(programCatalogPageIndex+1)*30>=allItems.length?'disabled':''}>다음 →</button></div><p class="notice">목록에서 제외는 등록 목록과 선택 드롭다운에서만 숨깁니다. 기존 출석·실적·통합 합계와 운영 일정은 유지됩니다. 제외한 프로그램 보기를 켜면 복원할 수 있습니다. 종료·보관 목록은 별도로 조회합니다. 보관은 기록을 유지하며, 완전 삭제는 백업·확인 후 별도로 실행합니다. 비활성화하면 오늘부터 일정과 자동 실적 연결에서 제외됩니다. 이전 날짜 기록과 참여자 배정은 보관합니다. 다시 활성화하면 기존 일정과 배정을 사용합니다.</p></section>`;
}

function programCatalogPage(type){
 if(type==='programs')return integratedProgramCatalog();
 const isProgram=type==='programs',items=management.data[type].filter(x=>(showArchived?x.active===false:x.active!==false)&&(!isProgram||!programAreaFilter||x.areaId===programAreaFilter)&&(!isProgram||!programStaffFilter||(programStaffFilter==='unassigned'?!(x.facilitatorIds||[]).length&&!x.staff:(x.facilitatorIds||[]).includes(programStaffFilter))));
 return heading(`${typeNames[type]} 관리`,'영역과 프로그램은 소속과 관계없이 등록합니다. 프로그램 옆 ‘참여자 등록’에서 요일·시간을 고르고 참여자를 배정합니다.',`<button class="primary" data-add="${type}">＋ ${typeNames[type]} 등록</button>`)+`<section class="panel"><div class="filters">${isProgram?`<label>프로그램 영역<select id="programAreaFilter"><option value="">전체 영역</option>${opts(management.list('areas'),programAreaFilter)}</select></label><label>담당자 (프로그램 진행)<select id="programStaffFilter"><option value="">전체 담당자</option><option value="unassigned" ${programStaffFilter==='unassigned'?'selected':''}>미지정</option>${opts(management.list('staff'),programStaffFilter)}</select></label>`:''}<label class="checklabel"><input id="showArchived" type="checkbox" ${showArchived?'checked':''}>삭제한 항목 보기</label></div><div class="tablewrap"><table class="admin-table"><thead><tr><th>이름</th>${isProgram?'<th>프로그램 영역</th><th>진행 직원</th>':''}<th>관리</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.name)}</td>${isProgram?`<td>${esc(management.find('areas',x.areaId)?.name||'영역 미지정')}</td><td>${esc(management.staffNames(x.facilitatorIds)||x.staff||'미지정')}</td>`:''}<td class="rowactions">${isProgram&&x.active!==false?`<button class="secondary" data-program-participants="${esc(x.id)}">참여자 등록</button>`:''}${x.active===false?`<button class="secondary" data-restore="${type}:${x.id}">복구</button>`:`<button class="secondary" data-edit="${type}:${x.id}">수정</button><button class="secondary danger" data-delete="${type}:${x.id}">삭제</button>`}</td></tr>`).join('')||`<tr><td colspan="${isProgram?4:2}">등록된 항목이 없습니다.</td></tr>`}</tbody></table></div><p class="notice">${items.length}건 · 변경 전 실적은 보존합니다.</p></section>`;
}
function memberNameMatches(member,query){
  const normalize=value=>String(value).normalize('NFKC').replace(/\s/g,'').toLocaleLowerCase('ko');
  return normalize(member.name).includes(normalize(query));
}
function memberAssignmentCells(member){
  const draft=memberRowDrafts.get(member.id),staffId=draft?.caseManagerId??management.caseManagerAt(member.id,date),communityId=draft?.communityId??member.communityId;
  const communities=management.data.communities.filter(row=>row.active!==false||row.id===communityId);
  const staff=management.data.staff.filter(row=>row.active!==false||row.id===staffId);
  const disabled=draft?.saving?'disabled':'';
  return '<td><select data-member-community aria-label="'+esc(member.name)+' 소속" '+disabled+'>'+sortedOpts(communities,communityId)+'</select></td><td><select data-member-case-manager aria-label="'+esc(member.name)+' 사례관리 담당 직원" '+disabled+'><option value="">미지정</option>'+sortedOpts(staff,staffId)+'</select></td>';
}
function bindMemberRowSaving(){
  document.querySelectorAll('tr[data-catalog-type="members"]').forEach(row=>{
    const id=row.dataset.catalogId,button=row.querySelector('[data-member-save]');
    if(!button)return;
    const community=row.querySelector('[data-member-community]'),staff=row.querySelector('[data-member-case-manager]'),feedback=row.querySelector('[data-member-row-status]');
    const before=memberRowDrafts.get(id)?.before||memberEditFields(management.find('members',id));
    const update=()=>{
      const changed=community.value!==before.communityId||staff.value!==before.caseManagerId;
      if(changed)memberRowDrafts.set(id,{before,communityId:community.value,caseManagerId:staff.value});
      else memberRowDrafts.delete(id);
      button.disabled=!changed;feedback.textContent='';
    };
    community.onchange=staff.onchange=update;
    button.onclick=async()=>{
      const draft=memberRowDrafts.get(id);
      if(!draft||draft.saving)return;
      draft.saving=true;draft.error='';button.disabled=true;community.disabled=true;staff.disabled=true;button.textContent='저장 중…';
      try{
        await teamBoot;
        if(!team.active||!team.authenticated)throw Error('관리자 로그인과 공동 저장 연결을 확인해 주세요.');
        if(!team.memberPatch)throw Error('참여자 저장 개선 서버를 먼저 새 버전으로 배포해 주세요.');
        await saveMemberDetails(id,draft.before,{...draft.before,communityId:draft.communityId,caseManagerId:draft.caseManagerId});
        memberRowDrafts.delete(id);render();toast('소속과 사례관리 담당을 저장했습니다.');
      }catch(error){
        draft.saving=false;draft.error=error.message;
        if(error.currentFields){
          draft.error+=' 최신 값을 확인하려면 수정 창을 열어 주세요.';
        }
        render();
      }
    };
  });
}
function bulkCaseManagerMarkup(){
 return '<section class="case-manager-bulk" aria-label="사례관리 담당 일괄 변경"><div class="case-manager-bulk-controls"><button type="button" class="secondary" id="caseSelectVisible" '+(caseBulkBusy?'disabled':'')+'>검색 결과 전체 선택</button><button type="button" class="secondary" id="caseClearSelection" '+(caseBulkBusy?'disabled':'')+'>선택 해제</button><label>선택 인원의 사례관리 담당<select id="caseBulkStaff" '+(caseBulkBusy?'disabled':'')+'><option value="">담당 직원 선택</option><option value="unassigned" '+(caseBulkStaff==='unassigned'?'selected':'')+'>미지정으로 변경</option>'+sortedOpts(management.list('staff'),caseBulkStaff)+'</select></label><button type="button" class="primary" id="caseBulkSave" '+(!caseBulkSelected.size||!caseBulkStaff||caseBulkBusy?'disabled':'')+'>'+(caseBulkBusy?'저장 중…':'선택 '+caseBulkSelected.size+'명 사례관리 저장')+'</button></div><p id="caseBulkCount" class="formhint">선택 총 '+caseBulkSelected.size+'명 · 다른 검색 결과에서 선택한 인원도 포함합니다. 담당자를 고르면 선택 인원의 아래 드롭다운도 바뀝니다. 오늘부터 적용되며 프로그램 실적 담당과 소속은 바뀌지 않습니다.</p><p id="caseBulkFeedback" class="formerror" role="status">'+esc(caseBulkMessage)+'</p></section>';
}
function stageBulkCaseManager(id){
 if(!caseBulkStaff)return;
 const member=management.find('members',id);if(!member||member.active===false)return;
 const before=memberRowDrafts.get(id)?.before||memberEditFields(member),draft=memberRowDrafts.get(id)||{before,communityId:member.communityId,caseManagerId:before.caseManagerId};
 draft.caseManagerId=caseBulkStaff==='unassigned'?'':caseBulkStaff;draft.bulkCase=true;draft.error='';
 if(draft.communityId===before.communityId&&draft.caseManagerId===before.caseManagerId)memberRowDrafts.delete(id);else memberRowDrafts.set(id,draft);
}
function selectBulkCaseMember(id,checked){
 if(checked){
  if(!caseBulkSelected.has(id)){const member=management.find('members',id);caseBulkSelected.set(id,{beforeStaffId:management.caseManagerAt(id,date),previousStaffId:memberRowDrafts.get(id)?.caseManagerId??management.caseManagerAt(id,date)})}
  stageBulkCaseManager(id);
 }else{
  const selected=caseBulkSelected.get(id),draft=memberRowDrafts.get(id);
  if(selected&&draft?.bulkCase){draft.caseManagerId=selected.previousStaffId;delete draft.bulkCase;if(draft.communityId===draft.before.communityId&&draft.caseManagerId===draft.before.caseManagerId)memberRowDrafts.delete(id)}
  caseBulkSelected.delete(id);
 }
}
function bindBulkCaseManagers(){
 if(!$('#caseBulkSave'))return;
 document.querySelectorAll('[data-case-member]').forEach(input=>input.onchange=()=>{selectBulkCaseMember(input.dataset.caseMember,input.checked);caseBulkMessage='';render()});
 $('#caseSelectVisible').onclick=()=>{document.querySelectorAll('tr[data-catalog-type="members"]:not([hidden]) [data-case-member]').forEach(input=>selectBulkCaseMember(input.dataset.caseMember,true));caseBulkMessage='';render()};
 $('#caseClearSelection').onclick=()=>{for(const id of [...caseBulkSelected.keys()])selectBulkCaseMember(id,false);caseBulkMessage='';render()};
 $('#caseBulkStaff').onchange=event=>{caseBulkStaff=event.target.value;for(const id of caseBulkSelected.keys())stageBulkCaseManager(id);caseBulkMessage='';render()};
 $('#caseBulkSave').onclick=async()=>{
  if(caseBulkBusy||!caseBulkSelected.size||!caseBulkStaff)return;
  const members=[...caseBulkSelected].map(([memberId,selection])=>({memberId,beforeStaffId:selection.beforeStaffId})),staffId=caseBulkStaff==='unassigned'?'':caseBulkStaff;
  caseBulkBusy=true;caseBulkMessage='';render();
  try{
   await teamBoot;if(!team.active||!team.authenticated)throw Error('관리자 로그인과 공동 저장 연결을 확인해 주세요.');
   if(!team.caseManagerBatch)throw Error('사례관리 일괄 변경용 Apps Script 서버를 먼저 새 버전으로 배포해 주세요.');
   const result=await saveCaseManagerBatch(members,staffId);
   for(const id of result.memberIds){const draft=memberRowDrafts.get(id);if(draft){draft.before.caseManagerId=staffId;draft.caseManagerId=staffId;delete draft.bulkCase;if(draft.communityId===draft.before.communityId)memberRowDrafts.delete(id)}caseBulkSelected.delete(id)}
   caseBulkMessage='';toast(result.memberIds.length+'명의 사례관리 담당을 저장했습니다.');
  }catch(error){caseBulkMessage=error.message}finally{caseBulkBusy=false;render()}
 };
}
function catalogPage(type){
  if(type==='areas'||type==='programs')return programCatalogPage(type);
  if(type==='communities'){const items=showArchived?management.data.communities.filter(x=>x.active===false):management.kioskAffiliations();return heading('소속 관리','소속 이름과 출석 화면에 보이는 순서를 관리합니다.',`<button class="primary" data-add="communities">＋ 소속 등록</button>`)+`<section class="panel"><label class="checklabel"><input id="showArchived" type="checkbox" ${showArchived?'checked':''}>삭제한 항목 보기</label><div class="tablewrap"><table class="admin-table affiliation-table"><thead><tr><th>이름</th><th>관리</th></tr></thead><tbody>${items.map((x,index)=>`<tr><td>${esc(x.name)}</td><td class="rowactions"><div class="catalog-row-actions">${x.active===false?`<button class="secondary" data-restore="communities:${x.id}">복구</button>`:`<button class="secondary" data-kiosk-move="-1" data-kiosk-affiliation="${esc(x.id)}" aria-label="${esc(x.name)} 앞으로 이동" ${index===0?'disabled':''}>↑ 앞으로</button><button class="secondary" data-kiosk-move="1" data-kiosk-affiliation="${esc(x.id)}" aria-label="${esc(x.name)} 뒤로 이동" ${index===items.length-1?'disabled':''}>↓ 뒤로</button><button class="secondary" data-edit="communities:${x.id}">수정</button><button class="secondary danger" data-delete="communities:${x.id}">삭제</button>`}</div></td></tr>`).join('')||'<tr><td colspan="2">등록된 소속이 없습니다.</td></tr>'}</tbody></table></div></section>`}

  const all=management.data[type].filter(x=>showArchived?x.active===false:x.active!==false),items=all.filter(x=>{
    if(type!=='members')return !managementFilter||communityOf(type,x)===managementFilter;
    const staff=management.caseManagerAt(x.id,date);
    return !participantStaffFilter||(participantStaffFilter==='unassigned'?!staff:staff===participantStaffFilter);
  });
  const visibleMembers=type==='members'?items.filter(member=>memberNameMatches(member,participantNameQuery)).length:items.length;
  if(type==='members')items.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true})||a.id.localeCompare(b.id));
  return heading(`${typeNames[type]} 관리`,'등록·수정·삭제는 현재 운영 목록에 반영됩니다. 이미 기록한 출석과 실적은 보존합니다.',`<button class="primary" data-add="${type}">＋ ${typeNames[type]} 등록</button>`)+`<section class="panel"><div class="filters">${type==='members'?`<label>이름 검색<input type="search" id="participantNameSearch" value="${esc(participantNameQuery)}" placeholder="참여자 이름 검색" autocomplete="off"></label><label>담당 직원<select id="participantStaffFilter"><option value="">전체 직원</option><option value="unassigned" ${participantStaffFilter==='unassigned'?'selected':''}>미지정</option>${opts([...management.data.staff].sort((a,b)=>a.name.localeCompare(b.name,'ko')),participantStaffFilter,staff=>staff.name+(staff.active===false?' (삭제한 직원)':''))}</select></label>`:`<label>소속<select id="managementFilter"><option value="">전체 소속</option>${opts(management.data.communities,managementFilter)}</select></label>`}<label class="checklabel"><input id="showArchived" type="checkbox" ${showArchived?'checked':''}>삭제한 항목 보기</label></div>${type==='members'&&!showArchived?bulkCaseManagerMarkup():''}<div class="tablewrap"><table class="admin-table"><thead><tr>${type==='members'&&!showArchived?'<th class="member-select-cell">선택</th>':''}<th>이름 / 일정</th><th>소속</th><th>${type==='members'?'사례관리 담당':'연결 정보'}</th><th>관리</th></tr></thead><tbody>${items.map(x=>{let title=x.name,detail='';if(type==='members')detail=management.find('staff',management.caseManagerAt(x.id,date))?.name||'미지정';if(type==='areas')detail='프로그램 영역';if(type==='programs')detail=(management.find('areas',x.areaId)?.name||'')+' · 진행 '+(management.staffNames(x.facilitatorIds)||x.staff);if(type==='schedules'){title=management.find('programs',x.programId)?.name||'삭제된 프로그램';detail=(x.date||x.weekdays.map(n=>'일월화수목금토'[n]).join('·')+' 반복')+' / '+x.start+'~'+x.end+' / '+x.location}return `<tr ${type==='members'&&!memberNameMatches(x,participantNameQuery)?'hidden':''} data-catalog-type="${type}" data-catalog-id="${x.id}">${type==='members'&&!showArchived?`<td class="member-select-cell"><input type="checkbox" data-case-member="${esc(x.id)}" aria-label="${esc(x.name)} 일괄 변경 선택" ${caseBulkSelected.has(x.id)?'checked':''} ${caseBulkBusy?'disabled':''}></td>`:''}<td class="member-name-cell">${esc(title)}</td>${type==='members'&&x.active!==false?memberAssignmentCells(x):`<td>${esc(management.communityName(communityOf(type,x)))}</td><td>${esc(detail)}</td>`}<td class="rowactions"><div class="catalog-row-actions">${type==='members'&&x.active!==false?`<button type="button" class="primary" data-member-save="${esc(x.id)}" ${!memberRowDrafts.has(x.id)||memberRowDrafts.get(x.id)?.saving?'disabled':''}>${memberRowDrafts.get(x.id)?.saving?'저장 중…':'저장'}</button>`:''}${x.active===false?`<button class="secondary" data-restore="${type}:${x.id}">복구</button>`:`<button class="secondary" data-edit="${type}:${x.id}">수정</button><button class="secondary danger" data-delete="${type}:${x.id}">삭제</button>`}</div>${type==='members'&&x.active!==false?`<small data-member-row-status role="status">${esc(memberRowDrafts.get(x.id)?.error||'')}</small>`:''}</td></tr>`}).join('')||(type==='members'?'':'<tr><td colspan="4">해당 항목이 없습니다.</td></tr>')}${type==='members'?`<tr id="memberRosterEmpty" ${visibleMembers?'hidden':''}><td colspan="${showArchived?4:5}">검색 조건에 맞는 참여자가 없습니다.</td></tr>`:''}</tbody></table></div><p class="notice">${type==='members'?`<span id="memberRosterCount" role="status">${visibleMembers}명</span>`:items.length+'건'} · 삭제한 항목은 현재 목록에서 제외되며 이력과 이전 실적에 남습니다.</p></section>`;
}
function openEditor(type,id=''){
  if(type==='programs')return openProgramRegistration(id);
  const item=id?management.find(type,id):{},communities=management.list('communities');let form='';
  if(type!=='schedules')form+=field('이름','name',item.name||'');
  if(type==='communities'){const shapes=[...AFFILIATION_SHAPES.map(([id,label])=>[id,label]),['none','도형 없음']],selected=item.shape??shapes[Math.max(0,communities.findIndex(c=>c.id===id))%4][0];form+='<label>출석 화면 도형<select name="shape" id="affiliationShape">'+shapes.map(([value,label])=>'<option value="'+value+'" '+(value===selected?'selected':'')+'>'+label+'</option>').join('')+'</select></label><div id="affiliationShapePreview" class="affiliation-shape-preview" aria-hidden="true">'+groupIcon(0,selected)+'</div><div class="shape-palette" role="group" aria-label="출석 화면 도형 선택">'+shapes.map(([value,label])=>'<button type="button" data-shape-choice="'+value+'" aria-pressed="'+(value===selected)+'" aria-label="'+label+' 도형 선택">'+(value==='none'?'<span class="shape-none">×</span>':groupIcon(0,value))+'<span>'+label+'</span></button>').join('')+'</div><p class="formhint">이름과 도형은 참여자 출석 화면에 자동 반영됩니다. 도형 없음을 선택하면 도형을 제거합니다.</p>'}
  if(type==='members')form+=`<label>소속<select required name="communityId">${sortedOpts(communities,item.communityId||managementFilter)}</select></label>`;
  if(type==='members')form+=`<label>사례관리 담당 직원<select name="caseManagerId"><option value="">미지정</option>${sortedOpts(management.list('staff'),management.caseManagerAt(item.id,date))}</select></label>`;
  if(type==='members')form+='<p class="formhint">다른 커뮤니티를 선택해 저장하면 오늘부터 새 커뮤니티에 표시됩니다. 기존 커뮤니티 명단에서는 제외되고, 이미 기록한 실적은 변경하지 않습니다.</p>';
  if(type==='programs'){
    form+=`<label>프로그램 영역<select name="areaId" id="editorArea" required><option value="">영역을 선택해 주세요</option>${opts(management.list('areas'),item.areaId)}</select></label>${staffCheckboxes(item.facilitatorIds||[])}<p class="formhint">영역은 소속과 관계없이 선택합니다. 프로그램 진행 직원과 사례관리 담당자는 별도로 관리합니다.</p>`;
  }
  if(type==='schedules'){
    const communityId=communityOf(type,item)||communities[0]?.id;
    form+=`<label>소속<select id="editorCommunity">${opts(communities,communityId)}</select></label><label>프로그램<select name="programId" id="editorProgram" required>${opts(management.list('programs').filter(p=>communityOf('programs',p)===communityId),item.programId,p=>p.name+' · '+management.find('areas',p.areaId)?.name)}</select></label>${field('운영 날짜 (비우면 요일별 반복)','date',item.date||'','date',false)}<fieldset><legend>반복 요일</legend>${[0,1,2,3,4,5,6].map(n=>`<label class="checklabel"><input type="checkbox" name="weekday" value="${n}" ${(item.weekdays||[1,2,3,4,5]).includes(n)?'checked':''}>${'일월화수목금토'[n]}</label>`).join('')}</fieldset><div class="formrow">${field('시작 시간','start',item.start||'10:00','time')}${field('종료 시간','end',item.end||'11:00','time')}</div>${field('장소','location',item.location||'')}`;
  }
  modal(`<h2>${typeNames[type]} ${id?'수정':'등록'}</h2><form id="entityForm" class="entityform">${form}<p class="formerror" id="formError" role="alert"></p><button class="primary" type="submit">저장</button></form>`);
  if($('#affiliationShape')){const updateShape=()=>{const value=$('#affiliationShape').value;$('#affiliationShapePreview').innerHTML=groupIcon(0,value);document.querySelectorAll('[data-shape-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.shapeChoice===value)))};$('#affiliationShape').onchange=updateShape;document.querySelectorAll('[data-shape-choice]').forEach(b=>b.onclick=()=>{$('#affiliationShape').value=b.dataset.shapeChoice;updateShape()})};
  if($('#editorCommunity'))$('#editorCommunity').onchange=e=>{if(type==='programs')$('#editorArea').innerHTML=opts(management.list('areas').filter(a=>a.communityId===e.target.value),'');else $('#editorProgram').innerHTML=opts(management.list('programs').filter(p=>communityOf('programs',p)===e.target.value),'')};
  $('#entityForm').onsubmit=e=>{
    e.preventDefault();const fd=new FormData(e.target),fields=Object.fromEntries(fd);if(type==='schedules')fields.weekdays=fd.getAll('weekday').map(Number);if(type==='programs')fields.facilitatorIds=fd.getAll('facilitatorId');
    const before=JSON.stringify(management.data);
    try{management.captureDays(records);management.save(type,id,fields,date);if(!persist())throw Error('저장하지 못했습니다. 입력을 유지합니다.');$('#dialog').close();render();toast('저장했습니다. 이전 실적은 유지됩니다.')}
    catch(error){management.data=JSON.parse(before);$('#formError').textContent=error.message}
  };
}
function deleteItem(type,id){const item=management.find(type,id);modal(`<h2>${typeNames[type]} 삭제</h2><p>${esc(item.name||management.find('programs',item.programId)?.name||'일정')}을 현재 목록에서 삭제할까요?</p><p>이전 출석과 실적은 삭제되지 않습니다. 삭제한 항목 보기에서 복구할 수 있습니다.</p>${type==='programs'?'<p>이 프로그램의 모든 일정이 운영 화면에서 숨겨집니다. 프로그램 복구 시 다시 사용할 수 있습니다.</p>':type==='schedules'?`<p>삭제 대상: ${esc(item.date||item.weekdays.map(n=>'일월화수목금토'[n]).join('·')+' 반복')} ${esc(item.start)} ~ ${esc(item.end)}<br>${esc(item.validFrom||'기본')} ~ ${esc(item.validTo||'종료일 없음')}</p><p>선택한 일정만 삭제합니다. 같은 프로그램의 다른 일정은 유지됩니다.</p>`:''}<button id="confirmEntityDelete" class="primary danger">삭제</button>`);$('#confirmEntityDelete').onclick=()=>{if(transaction(()=>management.remove(type,id))){$('#dialog').close();render();toast('현재 목록에서 삭제했습니다.')}}}
function restoreItem(type,id){if(transaction(()=>{const item=management.find(type,id),before=JSON.stringify(item);item.active=true;try{management.save(type,id,item,date)}catch(e){Object.assign(item,JSON.parse(before));throw e}management.audit('복구',type,id,null,item)}))render()}

function caseRegisterGroups(store,attendance,month,today){
  const dates=registerDates(month);
  const groups=new Map();
  for(const member of store.data.members){
    if(member.active===false&&!dates.some(day=>attendance[day+':'+member.id]))continue;
    const assignedRows=new Map();
    const registeredFrom=(member.history||[]).map(item=>item.from).filter(Boolean).sort()[0];
    for(const [index,day] of dates.entries()){
      const key=day+':'+member.id;
      const archiveDay=member.deletedAt?.slice(0,10);
      const beforeRegistration=!!registeredFrom&&registeredFrom.slice(0,7)===month&&day<registeredFrom;
      if(!attendance[key]&&((!store.memberGroupAt(member,day)&&!beforeRegistration)||(member.active===false&&(!archiveDay||day>archiveDay))))continue;
      const staffId=store.caseManagerAt(member.id,beforeRegistration?registeredFrom:day)||'unassigned';
      if(!assignedRows.has(staffId))assignedRows.set(staffId,{member,cells:dates.map(()=>null)});
      const mark=store.registerMark(attendance,member.id,day,today);
      assignedRows.get(staffId).cells[index]={key,mark:beforeRegistration&&!attendance[key]?(mark==='휴'?'휴':''):mark,...(beforeRegistration&&!attendance[key]?{readOnly:true}:{})};
    }
    for(const [staffId,row] of assignedRows){
      if(!groups.has(staffId)){
        const staff=store.find('staff',staffId);
        groups.set(staffId,{id:staffId,name:staff?.name||'미지정',archived:staff?.active===false,rows:[]});
      }
      groups.get(staffId).rows.push(row);
    }
  }
  return [...groups.values()].sort((a,b)=>a.id==='unassigned'?1:b.id==='unassigned'?-1:a.name.localeCompare(b.name,'ko'));
}
function registerDates(month){return Array.from({length:monthDays(month)},(_,i)=>month+'-'+String(i+1).padStart(2,'0'))}
function visibleRegisterGroups(month){return caseRegisterGroups(management,records,month,date).filter(group=>!reportStaff||group.id===reportStaff)}
function registerCell(cell,member,index){
  if(!cell)return '<td class="register-unassigned-day"></td>';
  if(cell.readOnly)return '<td title="등록 전 날짜">'+(cell.mark==='휴'?'휴':'')+'</td>';
  const period=management.data.days[cell.key]?.participation;
  const label=cell.mark==='/'?(period==='am'?'오전만 참여':period==='pm'?'오후만 참여':'출석'):cell.mark==='O'?'결석':cell.mark==='휴'?'휴무일':'미입력';
  const hint=member.name+' '+(index+1)+'일 '+label;
  return '<td><button class="daycell" data-day="'+esc(cell.key)+'" title="'+esc(label)+'" aria-label="'+esc(hint)+' 수정">'+(cell.mark||'<span class="visually-hidden">미입력</span>')+'</button></td>';
}
let registerView=typeof matchMedia==='function'&&matchMedia('(max-width:760px)').matches?'week':'month',registerFocusDate=date;
function registerViewDates(month,view=registerView){
 const dates=registerDates(month);if(view==='month')return dates;
 const focus=registerFocusDate.startsWith(month+'-')&&dates.includes(registerFocusDate)?registerFocusDate:date.startsWith(month+'-')?date:dates[0];
 if(view==='day')return [focus];
 const weekday=new Date(focus+'T12:00:00Z').getUTCDay(),monday=ManagementStore.addDays(focus,-((weekday+6)%7)),end=ManagementStore.addDays(monday,6);
 return dates.filter(day=>day>=monday&&day<=end);
}
monthTable=function(month,view=registerView){
  if(!holidayYears.has(month.slice(0,4)))return '<p class="notice">공휴일 확인 후 출석부를 표시합니다.</p>';
  const dates=registerViewDates(month,view),columns=dates.length+1;
  const headings=dates.map(day=>'<th scope="col" title="'+esc(management.holidayName(day))+'">'+Number(day.slice(8))+'</th>').join('');
  const body=visibleRegisterGroups(month).map(group=>{
    const rows=group.rows.map(({member,cells})=>'<tr><th scope="row">'+esc(member.name)+'</th>'+dates.map(day=>{const index=Number(day.slice(8))-1;return registerCell(cells[index],member,index)}).join('')+'</tr>').join('');
    return '<tbody><tr class="register-staff"><th scope="rowgroup" colspan="'+columns+'">'+esc(group.name)+(group.archived?' (삭제한 직원)':'')+'</th></tr>'+rows+'</tbody>';
  }).join('')||'<tbody><tr><td colspan="'+columns+'">해당 월에 조회할 참여자가 없습니다.</td></tr></tbody>';
  return '<table class="monthly-grid"><caption>'+esc(month)+' 사례관리 담당자별 출석부'+(view!=='month'?' · '+esc(dates[0]+' ~ '+dates[dates.length-1]):'')+'</caption><thead><tr><th scope="col">참여자</th>'+headings+'</tr></thead>'+body+'</table>';
};
reports=function(){
  const staff=caseRegisterGroups(management,records,reportMonth,date);
  const options='<option value="">전체 담당자</option>'+opts(staff,reportStaff,s=>s.name+(s.archived?' (삭제한 직원)':''));
  return heading('월별 출석부','출석 / · 결석 O · 주말과 휴무일 휴. 지난 운영일과 오늘의 미입력은 결석으로 표시합니다.')+
    '<section class="panel"><div class="filters"><label>조회 월<input id="reportMonth" type="month" value="'+esc(reportMonth)+'" required></label><label>사례관리 담당자<select id="reportStaff">'+options+'</select></label><button class="secondary" data-print-document>인쇄 / PDF 저장</button><button id="exportRegister" class="secondary">↓ 월별 CSV 다운로드</button></div><p class="notice">담당자가 바뀐 날부터 새 담당자 출석부에 표시됩니다. 신규 등록자의 등록 월도 월초부터 주말·휴무일을 표시하며, 등록 전 평일은 빈칸으로 둡니다. 날짜 칸을 눌러 출결을 수정할 수 있습니다.</p><div class="register-view-tools"><label>화면 보기<select id="registerView"><option value="month" '+(registerView==='month'?'selected':'')+'>월 전체</option><option value="week" '+(registerView==='week'?'selected':'')+'>주간 보기</option><option value="day" '+(registerView==='day'?'selected':'')+'>하루 보기</option></select></label><label>기준 날짜<input type="date" id="registerFocusDate" min="'+reportMonth+'-01" max="'+registerDates(reportMonth).slice(-1)[0]+'" value="'+(registerFocusDate.startsWith(reportMonth+'-')?registerFocusDate:reportMonth+'-01')+'"></label><p>화면은 일·주·월로 바꿔 볼 수 있습니다. 인쇄와 CSV는 월 전체입니다.</p></div><div id="monthTable" class="tablewrap">'+monthTable(reportMonth)+'</div></section>';
};
function editDay(key){const d=key.slice(0,10),id=key.slice(11),member=management.find('members',id);if(d>date){toast('미래 날짜에는 출결을 기록할 수 없습니다.');return}modal(`<h2>${esc(member.name)} · ${d}</h2><form id="dayForm" class="entityform"><label>출결 상태<select name="status">${['','출석','결석','지각','조퇴'].map(s=>`<option value="${s}" ${records[key]===s?'selected':''}>${s||'미입력 (기록 삭제)'}</option>`).join('')}</select></label><button type="submit" class="primary">저장</button></form>`);$('#dayForm').onsubmit=e=>{e.preventDefault();const value=new FormData(e.target).get('status');if(transaction(()=>{management.audit(value?'출결 수정':'출결 삭제','days',key,records[key]||'',value);records[key]=value})){$('#dialog').close();render();toast('출결을 저장했습니다.')}}}

function syncLabel(entry){return entry.sync==='synced'?'Google 저장 확인':entry.sync==='error'?'전송 실패 · 재시도 필요':apiState.configured?'전송 대기':'미연결 · 전송 대기'}
function performanceSchedules(d){const schedules=management.schedulesOn(d);for(const entry of management.data.entries.filter(e=>e.date===d)){if(!schedules.some(s=>s.id===entry.scheduleId)){const old=management.find('schedules',entry.scheduleId);schedules.push({id:entry.scheduleId,start:old?.start||'기록',end:old?.end||'',location:old?.location||'',historical:true,communityId:entry.communityId,community:entry.community,program:{name:entry.program,staff:entry.staff},area:{name:entry.area}})}}return schedules}
function performancePage(){
  const schedules=performanceSchedules(performanceDate);if(!schedules.some(s=>s.id===performanceSchedule))performanceSchedule=schedules[0]?.id||'';
  const schedule=schedules.find(s=>s.id===performanceSchedule);
  const members=schedule?management.data.members.filter(p=>(!schedule.historical&&management.eligibleMembers(schedule,performanceDate).some(m=>m.id===p.id))||management.data.entries.some(e=>e.memberId===p.id&&e.scheduleId===schedule.id&&e.date===performanceDate)):[];
  const entries=management.data.entries.filter(e=>e.date===performanceDate&&(!performanceSchedule||e.scheduleId===performanceSchedule));
  return heading('프로그램 참여 · 실적','실제 참여를 확인한 프로그램에 체크하세요. 일출결과 프로그램 참여는 별개입니다.',`<button id="addParticipation" class="primary" ${!schedule||schedule.historical?'disabled':''}>＋ 실적 입력</button>`)+`<section class="panel"><div class="filters"><label>사업 날짜<input id="performanceDate" type="date" max="${date}" value="${performanceDate}"></label><label>프로그램 일정<select id="performanceSchedule">${opts(schedules,performanceSchedule,s=>s.program.name+' '+s.start+' · '+(s.location||'장소 미정'))}</select></label><button class="secondary" id="retrySync">Google 전송 재시도</button><button class="secondary" id="exportPerformance">↓ 기관 제출용 CSV</button></div><p class="connection-note">${apiState.configured?'서버 API 구성 확인됨':'Google 미연결'} · 체크는 우선 이 브라우저에 저장됩니다. 서버 응답으로 확인된 실적에만 Google 저장 확인이 표시됩니다.</p>${schedule?`<p>영역 <b>${esc(schedule.area.name)}</b> · 담당 <b>${esc(schedule.program.staff)}</b> · ${esc(schedule.community)}</p>`:''}<div class="tablewrap"><table class="admin-table"><thead><tr><th>실제 참여</th><th>참여자</th><th>기록 당시 커뮤니티 / 영역</th><th>담당자</th><th>전송 상태</th><th>수정 / 삭제</th></tr></thead><tbody>${members.map(p=>{const entry=entries.find(e=>e.memberId===p.id);return `<tr><td><input type="checkbox" class="participation-check" data-participation="${p.id}" ${entry?.checked?'checked':''} aria-label="${esc(p.name)} ${esc(schedule.program.name)} 참여 확인"></td><td>${esc(entry?.name||p.name)}</td><td>${esc(entry?.community||schedule.community)} / ${esc(entry?.area||schedule.area.name)}</td><td>${esc(entry?.staff||schedule.program.staff)}</td><td>${entry?esc(syncLabel(entry)):'아직 실적 없음'}${entry?.error?`<small>${esc(entry.error)}</small>`:''}</td><td>${entry?`<button class="secondary" data-edit-entry="${entry.id}">정정</button><button class="secondary danger" data-delete-entry="${entry.id}">삭제</button>`:'—'}</td></tr>`}).join('')||'<tr><td colspan="6">선택한 날짜의 일정이나 대상자가 없습니다. 일정 관리에서 등록해 주세요.</td></tr>'}</tbody></table></div></section><section class="panel"><h2>Google Sheets 입력 미리보기</h2><p class="notice">첨부 형식: A 이름 · B~F 빈 열 5개 · G 사업날짜 · H 영역명 · I 담당자. 현재 선택한 프로그램의 체크된 실적만 표시합니다.</p><div class="tablewrap"><table class="performance-preview"><thead><tr>${['A 이름','B','C','D','E','F','G 사업날짜','H 영역명','I 담당자'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${entries.filter(e=>e.checked).map(e=>`<tr>${management.exportRow(e).map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="9">체크된 실적이 없습니다.</td></tr>'}</tbody></table></div></section>`;
}
function participationChange(memberId,checked){if(transaction(()=>management.setParticipation(memberId,performanceSchedule,performanceDate,checked))){render();void flushPerformance()}}
function editEntry(id){const entry=management.find('entries',id);modal(`<h2>기록한 실적 정정</h2><p>${entry.date} · ${esc(entry.community)}</p><form id="entryForm" class="entityform">${field('이름','name',entry.name)}${field('영역명','area',entry.area)}${field('프로그램명','program',entry.program)}${field('담당자','staff',entry.staff)}<p class="formerror" id="formError" role="alert"></p><button class="primary" type="submit">이 실적만 수정</button></form>`);$('#entryForm').onsubmit=e=>{e.preventDefault();if(transaction(()=>management.editEntry(id,Object.fromEntries(new FormData(e.target))))){$('#dialog').close();render();void flushPerformance()}}}
function historyPage(){return heading('변경 이력','등록·수정·삭제와 커뮤니티 이동의 변경 전후를 보관합니다.')+`<section class="panel tablewrap"><table class="admin-table"><thead><tr><th>시간</th><th>작업</th><th>항목</th><th>수정자</th><th>변경 내용</th></tr></thead><tbody>${[...management.data.audit].reverse().slice(0,200).map(a=>`<tr><td>${new Date(a.time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}</td><td>${esc(a.action)}</td><td>${esc(typeNames[a.type]||a.type)}</td><td>${esc(a.actor||'—')}</td><td><details><summary>${esc(a.after?.name||a.before?.name||a.entityId)}</summary><pre>${esc(JSON.stringify({이전:a.before,이후:a.after},null,2))}</pre></details></td></tr>`).join('')||'<tr><td colspan="4">아직 변경 이력이 없습니다.</td></tr>'}</tbody></table></section>`}
workspace=function(){const pending=management.data.entries.filter(e=>e.sync!=='synced').length;return heading('Google Workspace','실제 API 연결 상태와 실적 전송 대기 내역을 확인합니다.')+`<section class="panel"><h2>${apiState.configured?'서버 API 구성됨':'Google 실적 자동 입력 · 연결 준비 중'}</h2><p class="notice">제공된 웹앱 주소는 chw.or.kr Google 계정 인증을 요구합니다. URL 등록만으로 저장 권한이 생기지는 않습니다.</p><label class="endpoint-label">전달받은 Apps Script 주소<input readonly value="${sheetAppUrl}"></label><p class="notice">전송 대기 ${pending}건 · 저장 방식: 현재 브라우저. 연결 후에는 새 프로그램 참여 체크와 명시적 정정·삭제가 자동 전송됩니다. 이전 대기 기록은 확인 후 전송 버튼으로 보낼 수 있습니다.</p><div class="actions"><button id="checkConnection" class="secondary">서버 연결 확인</button><button id="retrySync" class="primary">대기 실적 전송</button><button id="exportAllPerformance" class="secondary">전체 실적 9열 CSV</button></div><p id="connectionResult" role="status" class="notice">${apiState.configured?'API 설정 확인. 관리자 서버 로그인이 필요할 수 있습니다.':'미연결 · Google에 기록된 것으로 표시하지 않습니다.'}</p><h3>연동에 필요한 항목</h3><p class="notice">기관 스프레드시트 ID, 커뮤니티별 시트 탭 매핑, 현재 Apps Script의 소스 또는 API 계약, 서버 비밀값 설정이 필요합니다. 기존 데이터에는 임의 쓰기 요청을 보내지 않습니다.</p><a class="textbutton" href="integration/SETUP.md" target="_blank" rel="noopener">서버와 Apps Script 연동 안내 열기</a></section>`};
const managementPages={people:()=>catalogPage('members'),communities:()=>catalogPage('communities'),areas:()=>catalogPage('areas'),programs:()=>catalogPage('programs'),schedules:()=>catalogPage('schedules'),reports,performance:performancePage,history:historyPage,workspace};

async function checkConnection(){try{const response=await fetch('/api/integration-status',{credentials:'same-origin'});if(!response.ok)throw Error();const data=await response.json();if(data.service!=='ch-performance-api')throw Error();apiState={available:true,configured:!!data.configured,authenticated:!!data.authenticated}}catch{apiState={available:false,configured:false,authenticated:false}}return apiState}
async function flushPerformance(){
  if(syncBusy||!apiState.configured||!apiState.authenticated)return;
  syncBusy=true;try{
    for(const original of management.data.entries.filter(e=>e.sync!=='synced')){
      const request=JSON.parse(JSON.stringify(original));
      try{const response=await fetch('/api/performance',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry:request})});const result=await response.json();if(!response.ok||result.ok!==true||result.id!==request.id||result.version!==request.version)throw Error(result.error||'저장 응답을 확인하지 못했습니다.');if(original.version===request.version){original.sync='synced';original.error='';original.syncedAt=new Date().toISOString();persist()}}
      catch(error){if(original.version===request.version){original.sync='error';original.error=error.message;persist()}break}
    }
  }finally{syncBusy=false;if(['performance','workspace'].includes(location.hash.slice(1)))render()}
}
function exportEntries(entries,name){csv([['이름','','','','','','사업날짜','프로그램명 (기존 영역명 포함)','','','','담당자','','출석고유키(자동)'],...PerformanceProjection.aggregate(entries).filter(e=>e.checked).map(e=>PerformanceProjection.columns(e))],name)}
function bindManagement(page){
 document.querySelectorAll('[data-program-purge]').forEach(button=>button.onclick=()=>openProgramPurge(button.dataset.programPurge));
 if($('#programPurgeStatus'))$('#programPurgeStatus').onclick=showProgramPurgeJobs;
 if($('#showExcludedPrograms'))$('#showExcludedPrograms').onchange=e=>{showExcludedPrograms=e.target.checked;programCatalogPageIndex=0;render()};
 document.querySelectorAll('[data-program-list-toggle]').forEach(button=>button.onclick=async()=>{button.disabled=true;await changeProgramListVisibility(button.dataset.programListToggle)});
 if($('#programCatalogScope'))$('#programCatalogScope').onchange=e=>{programCatalogScope=e.target.value;programCatalogPageIndex=0;programStatusFilter='';render()};
 const runProgramSearch=()=>{programCatalogSearch=$('#programCatalogSearch').value;programCatalogPageIndex=0;render()};
 if($('#programCatalogSearchButton'))$('#programCatalogSearchButton').onclick=runProgramSearch;
 if($('#programCatalogSearch'))$('#programCatalogSearch').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runProgramSearch()}};
 if($('#programCatalogPrevious'))$('#programCatalogPrevious').onclick=()=>{programCatalogPageIndex--;render()};
 if($('#programCatalogNext'))$('#programCatalogNext').onclick=()=>{programCatalogPageIndex++;render()};
 if($('#programStatusFilter'))$('#programStatusFilter').onchange=e=>{programStatusFilter=e.target.value;render()};
 document.querySelectorAll('[data-program-toggle]').forEach(button=>button.onclick=()=>{const id=button.dataset.programToggle,enabled=!management.programEnabled(id,date);if(transaction(()=>management.setProgramEnabled(id,enabled,date))){render();toast(enabled?'프로그램을 활성화했습니다.':'오늘부터 프로그램을 비활성화했습니다.')}});
  if($('#programAreaFilter'))$('#programAreaFilter').onchange=e=>{programAreaFilter=e.target.value;render()};
  if($('#programStaffFilter'))$('#programStaffFilter').onchange=e=>{programStaffFilter=e.target.value;render()};
  document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>openEditor(b.dataset.add));
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(...b.dataset.edit.split(':')));
  document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteItem(...b.dataset.delete.split(':')));
  document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>restoreItem(...b.dataset.restore.split(':')));
  bindMemberRowSaving();
  bindBulkCaseManagers();
  if($('#participantStaffFilter'))$('#participantStaffFilter').onchange=event=>{participantStaffFilter=event.target.value;render()};
  if($('#participantNameSearch'))$('#participantNameSearch').oninput=event=>{
    participantNameQuery=event.target.value;
    let count=0;
    document.querySelectorAll('tr[data-catalog-type="members"]').forEach(row=>{
      const member=management.find('members',row.dataset.catalogId);
      row.hidden=!memberNameMatches(member,participantNameQuery);
      if(!row.hidden)count++;
    });
    $('#memberRosterCount').textContent=count+'명';
    $('#memberRosterEmpty').hidden=count>0;
  };
  if($('#managementFilter'))$('#managementFilter').onchange=e=>{managementFilter=e.target.value;render()};
  if($('#showArchived'))$('#showArchived').onchange=e=>{showArchived=e.target.checked;render()};
  if(page==='reports'){
    $('#registerView').onchange=e=>{registerView=e.target.value;render()};
    $('#registerFocusDate').onchange=e=>{if(registerDates(reportMonth).includes(e.target.value)){registerFocusDate=e.target.value;render()}};
    $('#reportMonth').onchange=e=>{if(e.target.value){reportMonth=e.target.value;reportStaff='';render()}};
    $('#reportStaff').onchange=e=>{reportStaff=e.target.value;render()};
    $('#exportRegister').onclick=()=>{
      if(!holidayYears.has(reportMonth.slice(0,4))){toast('공휴일 자료 확인 후 다운로드해 주세요.');return}
      const rows=visibleRegisterGroups(reportMonth).flatMap(group=>group.rows.map(row=>[group.name,row.member.name,...row.cells.map(cell=>cell?.mark||'')]));
      csv([['사례관리 담당자','이름',...registerDates(reportMonth).map(day=>Number(day.slice(8)))],...rows],reportMonth+'_사례관리_출석부.csv');
    };
    document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>editDay(b.dataset.day));
  }
  if(page==='performance'){
    $('#performanceDate').onchange=e=>{if(e.target.value&&e.target.value<=date){performanceDate=e.target.value;render()}};
    $('#performanceSchedule').onchange=e=>{performanceSchedule=e.target.value;render()};
    document.querySelectorAll('[data-participation]').forEach(b=>b.onchange=()=>participationChange(b.dataset.participation,b.checked));
    document.querySelectorAll('[data-edit-entry]').forEach(b=>b.onclick=()=>editEntry(b.dataset.editEntry));
    document.querySelectorAll('[data-delete-entry]').forEach(b=>b.onclick=()=>{modal('<h2>이 실적을 삭제할까요?</h2><p>해당 프로그램 참여 체크를 해제하고 연결된 Google 실적에도 삭제 요청을 보냅니다. 다른 실적과 일출결은 유지됩니다.</p><button id="confirmEntryDelete" class="primary danger">실적 삭제</button>');$('#confirmEntryDelete').onclick=()=>{if(transaction(()=>management.deleteEntry(b.dataset.deleteEntry))){$('#dialog').close();render();void flushPerformance()}}});
    $('#exportPerformance').onclick=()=>exportEntries(management.data.entries.filter(e=>e.date===performanceDate&&e.scheduleId===performanceSchedule),'프로그램_실적_9열.csv');
    $('#addParticipation').onclick=()=>{const s=management.schedulesOn(performanceDate).find(s=>s.id===performanceSchedule),members=management.eligibleMembers(s,performanceDate);modal(`<h2>프로그램 실적 입력</h2><form id="addEntryForm" class="entityform"><label>참여자<select name="memberId" required>${opts(members,'')}</select></label><p>${esc(s.program.name)} · ${performanceDate}</p><button class="primary" type="submit">참여 실적 입력</button></form>`);$('#addEntryForm').onsubmit=e=>{e.preventDefault();$('#dialog').close();participationChange(new FormData(e.target).get('memberId'),true)}};
  }
  if($('#checkConnection'))$('#checkConnection').onclick=async()=>{await checkConnection();render()};
  if($('#retrySync'))$('#retrySync').onclick=async()=>{await checkConnection();if(!apiState.configured){toast('Google 서버 연동이 아직 설정되지 않았습니다. 대기 기록은 유지됩니다.');return}if(!apiState.authenticated){modal('<h2>Google 전송용 서버 로그인</h2><form id="serverLogin" class="entityform"><label>서버 직원 비밀번호<input name="password" type="password" required autocomplete="current-password"></label><p id="serverError" role="alert"></p><button type="submit" class="primary">인증 후 전송</button></form>');$('#serverLogin').onsubmit=async e=>{e.preventDefault();try{const response=await fetch('/api/integration-login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:new FormData(e.target).get('password')})});if(!response.ok)throw Error('서버 비밀번호를 확인해 주세요.');$('#dialog').close();await checkConnection();await flushPerformance()}catch(error){$('#serverError').textContent=error.message}}}else await flushPerformance()};
  if($('#exportAllPerformance'))$('#exportAllPerformance').onclick=()=>exportEntries(management.data.entries,'전체_실적_9열.csv');
}
// Initial rendering is performed after timetable.js installs the program hub.
// Only inspect the local server configuration. No write is sent by this probe.
// Initial integration status arrives with the shared bootstrap response.
/* Permanent deletion controls: preview, target backup, typed confirmation and resumable steps. */
let programPurgeBusy=false;
async function openProgramPurge(programId){
 if(programPurgeBusy||configPending||configSaving){toast('입력 중인 변경을 저장한 뒤 완전 삭제를 진행해 주세요.');return}
 programPurgeBusy=true;modal('<h2>완전 삭제 대상 확인</h2><p id="programPurgeLoading" role="status">서버의 삭제 대상을 확인하고 있습니다.</p>');const marker=$('#programPurgeLoading'),current=()=>$('#dialog')?.open&&$('#dialogcontent')?.contains(marker);
 try{
  if(!team.programPurge)throw Error('완전 삭제 기능을 사용하려면 Apps Script 새 버전을 먼저 배포해 주세요.');
  const plan=await teamRequest('program-purge',{action:'preview',programId}),backup={format:'ch-program-deletion-backup-v1',createdAt:new Date().toISOString(),revision:plan.revision,config:plan.backup,months:[]};let count=0;
  for(let i=0;i<plan.months.length;i++){
   if(!current())return;
   marker.textContent=(i+1)+' / '+plan.months.length+'개월의 삭제 대상과 백업을 확인하고 있습니다.';
   const part=await teamRequest('program-purge',{action:'backup',programId,ticket:plan.ticket,month:plan.months[i]});count=part.totalEntries;
   if(part.entries.length||part.reports.length)backup.months.push(part);
  }
  if(!current())return;
  modal(`<h2>프로그램 완전 삭제</h2><p><strong>${esc(plan.program.name)}</strong></p><p>일정 ${plan.backup.schedules.length}개 · 참여자 배정 ${plan.backup.enrollments.length}건 · 프로그램 참여 기록 ${count}건 · 대상 월 ${backup.months.length}개</p><p>해당 프로그램과 일정·배정·프로그램 참여 기록을 운영 원본에서 제거하고 직원 실적 시트의 자동 입력 칸을 정리합니다. 이용인 명단·센터 일출결·다른 프로그램과 시트 수동 입력 칸은 유지합니다.</p><p>이미 내려받은 사본과 플랫폼의 변경 이력까지 지우는 기능은 아닙니다. 삭제 후 앱에서 복구할 수 없습니다.</p><button class="secondary" id="downloadProgramPurgeBackup">1. 삭제 대상 JSON 백업 다운로드</button><form class="entityform" id="confirmProgramPurgeForm"><label>2. 프로그램명을 그대로 입력<input id="programPurgeName" autocomplete="off" required></label><label class="checklabel"><input id="programPurgeAck" type="checkbox" required>백업 파일과 삭제 범위를 확인했습니다.</label><p class="formerror" id="programPurgeError" role="alert"></p><button class="primary danger" type="submit" id="startProgramPurge" disabled>3. 완전 삭제 시작</button></form>`);
  let downloaded=false;
  $('#downloadProgramPurgeBackup').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='삭제대상_프로그램_'+programId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);downloaded=true;$('#startProgramPurge').disabled=false;$('#downloadProgramPurgeBackup').textContent='백업 다운로드 요청됨 · 저장 파일을 확인해 주세요.'};
  $('#confirmProgramPurgeForm').onsubmit=async event=>{
   event.preventDefault();if(!downloaded||$('#programPurgeName').value!==plan.program.name||!$('#programPurgeAck').checked){$('#programPurgeError').textContent='백업과 정확한 프로그램명을 확인해 주세요.';return}
   const startButton=$('#startProgramPurge');startButton.disabled=true;
   try{const job=await teamRequest('program-purge',{action:'start',programId,ticket:plan.ticket,confirmName:$('#programPurgeName').value,backupAcknowledged:true});if($('#dialog').open&&$('#dialog').contains(startButton))paintProgramPurgeJob(job)}catch(error){if($('#programPurgeError'))$('#programPurgeError').textContent=error.message;if($('#startProgramPurge'))$('#startProgramPurge').disabled=false}
  };
 }catch(error){if(current())modal('<h2>완전 삭제를 시작하지 않았습니다</h2><p>'+esc(error.message)+'</p>')}finally{programPurgeBusy=false}
}
function paintProgramPurgeJob(job){
 modal(`<h2>완전 삭제 진행</h2><p>${esc(job.name||'프로그램')}</p><p role="status">${job.index||0} / ${job.total||0}개월 처리 완료${job.index>=job.total?' · 저장 데이터 정리 마무리 중':''}</p><p>시트 자동 실적 정리를 확인한 월부터 원본 참여 기록을 제거합니다. 창이 열려 있으면 작업을 나눠 자동으로 이어서 처리합니다. 창을 닫아도 서버에 진행 상태가 남습니다.</p>${job.error?'<p class="formerror" role="alert">'+esc(job.error)+'</p>':''}<button class="primary danger" id="continueProgramPurge">${job.error?'오류 정리 후 다시 시도':'삭제 처리 계속'}</button>`);
 $('#continueProgramPurge').onclick=async()=>{
  const button=$('#continueProgramPurge');button.disabled=true;button.textContent='다음 작업 처리 중…';
  try{const result=await teamRequest('program-purge',{action:'step',programId:job.programId});
   if(result.done){await loadTeamMonth(date.slice(0,7),true);if($('#dialog').open&&$('#dialog').contains(button))modal('<h2>완전 삭제가 완료됐습니다</h2><p>선택한 프로그램과 연결 기록을 운영 원본에서 제거했습니다.</p>');render()}
   else if($('#dialog').open&&$('#dialog').contains(button))paintProgramPurgeJob(result);
  }catch(error){if($('#dialog').open&&$('#dialog').contains(button)){button.disabled=false;button.textContent='다시 시도';toast(error.message)}}
 };
 const autoButton=$('#continueProgramPurge');
 if(!job.error)setTimeout(()=>{if(!document.hidden&&$('#dialog')?.open&&$('#dialog').contains(autoButton)&&!autoButton.disabled)autoButton.click()},1500);
}
async function showProgramPurgeJobs(){
 try{const result=await teamRequest('program-purge',{action:'status'});modal('<h2>완전 삭제 진행 확인</h2>'+(!result.jobs.length?'<p>진행 중인 완전 삭제가 없습니다.</p>':result.jobs.map(job=>'<button class="secondary" data-resume-program-purge="'+esc(job.programId)+'">'+esc(job.name)+' · '+job.index+'/'+job.total+'개월 · 이어서 처리</button>').join('')));document.querySelectorAll('[data-resume-program-purge]').forEach(button=>button.onclick=()=>paintProgramPurgeJob(result.jobs.find(job=>job.programId===button.dataset.resumeProgramPurge)))}catch(error){toast(error.message)}
}
