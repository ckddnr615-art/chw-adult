/* Same-day, read-only preview. No names, photo IDs, attendance commands or
   authentication are stored here. Only a verified public response may save it. */
(function(){
 const key='ch-kiosk-preview:v1:'+String(window.GOOGLE_SHARED_CONFIG?.webAppUrl||'');
 function read(today){
  try{
   const raw=localStorage.getItem(key);if(!raw||raw.length>100000)return null;
   const value=JSON.parse(raw),age=Date.now()-value.savedAt;
   if(value.version!==1||value.date!==today||age<0||age>43200000||!Array.isArray(value.programs)||value.programs.length>200)return null;
   if(!value.programs.every(p=>['name','start','end','location','slot'].every(k=>typeof p[k]==='string')&&Number.isInteger(p.total)&&p.total>=0&&Number.isInteger(p.present)&&p.present>=0&&p.present<=p.total))return null;
   return value;
  }catch{return null}
 }
 function save(snapshot){
  if(snapshot?.scope!=='today'||!snapshot.config||!snapshot.initialized)return;
  try{
   const schedules=management.schedulesOn(snapshot.date);
   const programs=schedules.map(schedule=>{
    const members=management.eligibleMembers(schedule,snapshot.date,schedules),confirmed=new Set(snapshot.programCheckins?.[ManagementStore.programAttendanceKey(schedule.id,schedule.program.id)]||[]);
    const present=members.filter(m=>confirmed.has(m.id)&&snapshot.records?.[snapshot.date+':'+m.id]==='출석').length;
    return {name:schedule.program.name,start:schedule.start,end:schedule.end,location:schedule.location||'장소 미정',slot:ManagementStore.scheduleSlot(schedule),total:members.length,present};
   });
   const value=JSON.stringify({version:1,date:snapshot.date,savedAt:Date.now(),programs});
   if(value.length<100000)localStorage.setItem(key,value);
  }catch{/* Storage quota or preview failure must not interrupt attendance. */}
 }
 function markup(today){
  const cached=read(today);if(!cached)return '';
  const period=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date())<'13'?'morning':'afternoon';
  const items=cached.programs.filter(p=>p.slot===period||p.slot==='all-day');
  return '<section class="kiosk-startup-preview" aria-labelledby="startupPreviewTitle"><h2 id="startupPreviewTitle">오늘 프로그램 · 이전 확인 자료</h2><p role="status">최신 내용을 확인하고 있어요. 확인이 끝나면 출석할 수 있어요.</p><div class="kiosk-program-grid">'+items.map(p=>'<div class="kiosk-program-card"><span><strong>'+esc(p.name)+'</strong><small>'+esc(p.start)+' ~ '+esc(p.end)+' · '+esc(p.location)+'</small><span class="kiosk-program-count">이전 확인: 총원 '+p.total+'명 / 출석 '+p.present+'명</span></span></div>').join('')+'</div></section>';
 }
 window.KioskStartupPreview={read,save,markup};
})();
