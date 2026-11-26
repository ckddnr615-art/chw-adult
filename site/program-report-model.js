/* Read-only programme reports: one indexed scan of saved entries, no writes. */
(function(root){
 const dayAfter=(d,n=1)=>{const v=new Date(d+'T12:00:00Z');v.setUTCDate(v.getUTCDate()+n);return v.toISOString().slice(0,10)};
 function dates(from,to){
  const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
  if(!valid(from)||!valid(to)||from>to)throw Error('시작일과 종료일을 확인해 주세요.');
  const days=[];for(let d=from;d<=to;d=dayAfter(d)){if(days.length===366)throw Error('한 번에 최대 366일까지 조회할 수 있습니다.');days.push(d)}return days;
 }
 function months(from,to){dates(from,to);const out=[];for(let m=from.slice(0,7);m<=to.slice(0,7);){out.push(m);const d=new Date(m+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);m=d.toISOString().slice(0,7)}return out}
 function build(store,records,{programId,from,to,today},prepared=null){
  const days=dates(from,to),program=store.find('programs',programId);if(!program)throw Error('프로그램을 선택해 주세요.');
  const entries=new Map(),members=new Map(),weeks=new Map(),daily=[],actual=[];
  for(const entry of prepared?prepared.entries:store.data.entries){if(entry.programId!==programId||entry.date<from||entry.date>to)continue;let day=entries.get(entry.date);if(!day)entries.set(entry.date,day=[]);day.push(entry)}
  const weekFor=d=>{const weekday=new Date(d+'T12:00:00Z').getUTCDay(),key=dayAfter(d,-((weekday+6)%7));if(!weeks.has(key))weeks.set(key,{key,from:d,to:d,operating:0,expected:0,present:0,absent:0,pending:0,future:0,unique:new Set()});const week=weeks.get(key);week.to=d;return week};
  for(const d of days){
   const week=weekFor(d),all=prepared?prepared.schedules.get(d):store.schedulesOn(d),schedules=all.filter(s=>s.program.id===programId),targets=new Map(),saved=entries.get(d)||[];
   const target=(id,name)=>{if(!targets.has(id))targets.set(id,{id,name,scheduled:new Map(),entries:[]});return targets.get(id)};
   for(const s of schedules)for(const m of store.eligibleMembers(s,d,all))target(m.id,m.name).scheduled.set(s.id,s);
   for(const e of saved)target(e.memberId,e.name).entries.push(e);
   let present=0,absent=0,pending=0,future=0,expected=0;
   for(const row of targets.values()){
    const checked=row.entries.filter(e=>e.checked),isFuture=d>today;
    // A saved occurrence is retained even when its programme, member or assignment was later removed.
    const planned=new Set([...row.scheduled.keys(),...row.entries.map(e=>e.scheduleId)]),attended=new Set(checked.map(e=>e.scheduleId));
    const excluded=row.entries.some(e=>e.participationOverride==='exclude'),dayAbsent=records[d+':'+row.id]==='결석';
    const state=isFuture?'future':checked.length?'present':dayAbsent||excluded||d<today?'absent':'pending';
    const partial=state==='present'&&attended.size<planned.size;
    const mark=isFuture?'예정':state==='present'?partial?'△':'/':state==='absent'?'O':'?';
    const staff=[...new Set(checked.flatMap(e=>Array.isArray(e.reportStaff)?e.reportStaff.filter(s=>s.checked!==false).map(s=>s.name):[e.staff]).filter(Boolean))];
    const details=[...row.scheduled.values()].map(s=>{const match=row.entries.filter(e=>e.scheduleId===s.id),did=match.some(e=>e.checked);return s.start+'~'+s.end+' '+(s.location||'장소 미정')+' '+(did?'출석':isFuture?'예정':state==='absent'?'결석':'미확인')});
    if(!members.has(row.id))members.set(row.id,{id:row.id,name:row.name,cells:{},present:0,absent:0,pending:0,future:0});
    const member=members.get(row.id);member.cells[d]={mark,state,partial,expected:1,present:state==='present'?1:0,details:details.join(' · ')};member[state]++;
    if(!isFuture)expected++;if(state==='present'){present++;week.unique.add(row.id);actual.push({date:d,memberId:row.id,name:row.name,staff:staff.join(' · ')||'실적 담당 미지정',sessions:attended.size,partial,sync:checked.some(e=>e.sync==='error')?'오류':checked.every(e=>e.sync==='synced')?'반영 확인':'반영 대기'})}else if(state==='absent')absent++;else if(state==='pending')pending++;else future++;
   }
   const operating=targets.size>0||schedules.length>0;
   week.operating+=Number(operating);week.expected+=expected;week.present+=present;week.absent+=absent;week.pending+=pending;week.future+=future;
   daily.push({date:d,holiday:store.holidayName(d),operating,expected,present,absent,pending,future});
  }
  const weekRows=[...weeks.values()].map((w,i)=>({...w,label:(i+1)+'주',unique:w.unique.size}));
  const rows=[...members.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
  return {programId,name:program.name,from,to,days,daily,dayInfo:Object.fromEntries(daily.map(day=>[day.date,day])),weeks:weekRows,members:rows,actual:actual.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ko')),totals:{operating:daily.filter(d=>d.operating).length,expected:daily.reduce((n,d)=>n+d.expected,0),present:actual.length,absent:rows.reduce((n,m)=>n+m.absent,0),pending:rows.reduce((n,m)=>n+m.pending,0),unique:rows.filter(m=>m.present).length,future:rows.reduce((n,m)=>n+m.future,0)}};
 }
 function buildAll(store,records,{from,to,today}){
  const range=dates(from,to),schedules=new Map(),byProgram=new Map(),people=new Set(),personDays=new Set(),weeklyPeople=new Map(),rows=[],weekTotals=new Map();
  // Share schedule expansion for every programme and index entries once for the whole query.
  for(const day of range)schedules.set(day,store.schedulesOn(day));
  for(const entry of store.data.entries)if(entry.date>=from&&entry.date<=to){if(!byProgram.has(entry.programId))byProgram.set(entry.programId,[]);byProgram.get(entry.programId).push(entry)}
  const totals={operating:0,expected:0,present:0,absent:0,pending:0,future:0,unique:0,personDays:0};
  const monthKeys=months(from,to);
  for(const program of store.data.programs){
   if(program.active===false&&!byProgram.has(program.id)&&!range.some(d=>schedules.get(d).some(s=>s.program.id===program.id)))continue;
   const report=build(store,records,{programId:program.id,from,to,today},{schedules,entries:byProgram.get(program.id)||[]});
   const monthly=Object.fromEntries(monthKeys.map(key=>[key,0])),staff=new Set();
   for(const entry of report.actual){people.add(entry.memberId);personDays.add(entry.date+':'+entry.memberId);monthly[entry.date.slice(0,7)]++;if(entry.staff!=='실적 담당 미지정')entry.staff.split(' · ').forEach(name=>staff.add(name));
    const weekday=new Date(entry.date+'T12:00:00Z').getUTCDay(),key=dayAfter(entry.date,-((weekday+6)%7));if(!weeklyPeople.has(key))weeklyPeople.set(key,new Set());weeklyPeople.get(key).add(entry.memberId);
   }
   for(const key of ['operating','expected','present','absent','pending','future'])totals[key]+=report.totals[key];
   for(const week of report.weeks){if(!weekTotals.has(week.key))weekTotals.set(week.key,{...week,unique:0,operating:0,expected:0,present:0,absent:0,pending:0,future:0});const total=weekTotals.get(week.key);for(const key of ['operating','expected','present','absent','pending','future'])total[key]+=week[key]}
   rows.push({id:program.id,name:program.name,active:program.active!==false,totals:report.totals,staff:[...staff].join(' · ')||'참여 실적 없음',weekly:Object.fromEntries(report.weeks.map(w=>[w.key,w.present])),monthly});
  }
  totals.unique=people.size;totals.personDays=personDays.size;
  const weeks=[...weekTotals.values()].map(week=>({...week,unique:weeklyPeople.get(week.key)?.size||0}));
  return {kind:'all',name:'전체 프로그램 통합',from,to,days:range,months:monthKeys,weeks,rows:rows.sort((a,b)=>a.name.localeCompare(b.name,'ko')),totals};
 }
 const api={build,buildAll,dates,months};if(typeof module!=='undefined')module.exports=api;else root.ProgramReports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
