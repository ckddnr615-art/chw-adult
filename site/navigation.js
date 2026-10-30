/* Workspace routes keep old bookmarks while separating masters, programmes and timetables. */
let programScheduleFilter='',assignmentStaffFilter='';
let operationsView='affiliations',peopleView='list',programManagementView='programs',timetableView='personal';
typeNames.communities='소속';
const routeLabels={affiliations:'소속 관리',staff:'직원 관리',closures:'기관 휴무일'};
function subpage(html,title){return html.replace('class="intro"','class="intro subpage-intro"').replace(/<h1>([\s\S]*?)<\/h1>/,(_,name)=>`<h2>${title||name}</h2>`)}
function workspaceTabs(items,current,attribute,label){return `<div class="program-tabs management-tabs" role="group" aria-label="${label}">${items.map(([id,name])=>`<button ${attribute}="${id}" aria-pressed="${current===id}" class="${current===id?'selected':''}">${name}</button>`).join('')}</div>`}
function operationsHub(){
 const content={affiliations:()=>catalogPage('communities'),staff:staffPage,closures:closurePage};
 return heading('운영 관리','소속·직원·기관 휴무일을 관리합니다.')+workspaceTabs(Object.entries(routeLabels),operationsView,'data-operations-view','운영 관리 하위 메뉴')+subpage(content[operationsView]());
}
function participantsHub(){return heading('참여자 관리','참여자 정보와 담당 사례관리자를 관리합니다. 시간표는 왼쪽 시간표 메뉴에서 확인하세요.')+subpage(catalogPage('members'),'참여자 명단')}
function programWorkspace(){
 const area=programManagementView==='areas',weekly=programManagementView==='weekly';
 const tabs=workspaceTabs([['programs','프로그램'],['areas','영역']],area?'areas':'programs','data-program-management-view','프로그램 관리 하위 메뉴');
 const subtabs=area?'':workspaceTabs([['programs','등록/수정'],['weekly','프로그램 일정']],weekly?'weekly':'programs','data-program-subview','프로그램 작업 하위 메뉴').replace('management-tabs','management-tabs program-subtabs');
 const content=area?subpage(catalogPage('areas'),'영역 관리'):weekly?programWeeklyOverview():subpage(catalogPage('programs'),'프로그램 등록/수정');
 return heading('프로그램 관리','프로그램 정보·일정·참여자 배정을 함께 관리합니다.')+tabs+subtabs+content;
}
function timetableWorkspace(){
 const personal=timetableView==='personal';programView=personal?'personal':'staff';
 return heading('시간표','개인별 참여 일정과 직원별 프로그램 진행 일정을 확인하고 인쇄합니다.')+workspaceTabs([['personal','개인별 시간표'],['staff','직원별 시간표']],timetableView,'data-timetable-view','시간표 하위 메뉴')+`<section class="panel timetable-panel">${weekControls(personal)}${personal?'':`<label class="staff-schedule-filter">프로그램 진행 직원<select id="timetableStaff"><option value="">전체 직원</option>${opts(management.list('staff'),timetableStaff)}</select></label>`}${timetableGrid(personal)}</section>`;
}
function normalizeWorkspaceRoute(raw){const aliases={communities:'operations/affiliations',areas:'programs/areas',staff:'operations/staff',schedules:'programs','operations/areas':'programs/areas','operations/programs':'programs','people/timetable':'timetable/personal','programs/personal':'timetable/personal','programs/staff':'timetable/staff'};return raw.startsWith('programs/schedules')?'programs':aliases[raw]||raw}
managementPages.operations=operationsHub;managementPages.people=participantsHub;managementPages.programs=programWorkspace;managementPages.timetable=timetableWorkspace;
const managementRender=render,managementBind=bindManagement;
render=function(){
 const raw=location.hash.slice(1),normalized=normalizeWorkspaceRoute(raw);if(normalized!==raw)history.replaceState(null,'','#'+normalized);
 const [root,child,programId]=normalized.split('/');
 programScheduleFilter=root==='programs'&&child==='schedules'&&management.find('programs',programId)?programId:'';
 if(root==='operations')operationsView=Object.hasOwn(routeLabels,child)?child:'affiliations';
 if(root==='programs')programManagementView=child==='areas'?'areas':child==='weekly'?'weekly':'programs';
 if(root==='timetable')timetableView=child==='staff'?'staff':'personal';
 managementRender();
 if(!adminSession)return;
 if(root==='operations')$('#crumb').textContent=`운영 관리 / ${routeLabels[operationsView]}`;
 if(root==='programs')$('#crumb').textContent=`프로그램 관리 / ${programManagementView==='areas'?'영역':programManagementView==='weekly'?'프로그램 일정':'프로그램 등록/수정'}`;
 if(root==='timetable')$('#crumb').textContent=`시간표 / ${timetableView==='personal'?'개인별 시간표':'직원별 시간표'}`;
};
bindManagement=function(page){
 managementBind(page);
 document.querySelectorAll('[data-program-subview]').forEach(button=>button.onclick=()=>{showArchived=false;location.hash=button.dataset.programSubview==='weekly'?'programs/weekly':'programs'});
 if($('#assignmentStaffFilter'))$('#assignmentStaffFilter').onchange=e=>{assignmentStaffFilter=e.target.value;render()};
 if($('#assignmentProgramFilter'))$('#assignmentProgramFilter').onchange=e=>{location.hash='programs/schedules'+(e.target.value?'/'+e.target.value:'')};
 document.querySelectorAll('[data-program-participants]').forEach(button=>button.onclick=()=>{showEndedSchedules=false;location.hash='programs/schedules/'+button.dataset.programParticipants});
 if(page==='programs'&&programManagementView==='schedules'&&$('#newSchedule'))$('#newSchedule').onclick=()=>openScheduleEditor('',{programId:programScheduleFilter,assignAfterSave:true});
 document.querySelectorAll('[data-operations-view]').forEach(button=>button.onclick=()=>{showArchived=false;location.hash=`operations/${button.dataset.operationsView}`});
 document.querySelectorAll('[data-program-management-view]').forEach(button=>button.onclick=()=>{showArchived=false;location.hash=button.dataset.programManagementView==='areas'?'programs/areas':'programs'});
 document.querySelectorAll('[data-timetable-view]').forEach(button=>button.onclick=()=>{location.hash=`timetable/${button.dataset.timetableView}`});
};