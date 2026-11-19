/* Daily achievements are independent from detailed programme participation. */
var PerformanceProjection=(function(){
 function areaName(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ')}
 function key(entry){
  if(!entry.memberId||!entry.date||!label(entry))throw Error('참여자 ID·날짜·실적 이름이 필요합니다.');
  return entry.reportMode==='program'?JSON.stringify([entry.date,entry.memberId,'program',entry.programId||label(entry)]):
    JSON.stringify([entry.date,entry.memberId,areaName(entry.area)]);
 }
 function label(entry){return areaName(entry.reportMode==='program'?entry.program:entry.area)}
 function order(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99')||(a.end||'99:99').localeCompare(b.end||'99:99')||String(a.id).localeCompare(String(b.id))}
 function staffTargets(items,active){
  var targets=[];
  items.forEach(function(item){(item.reportStaff||[]).forEach(function(staff){
   if(targets.some(function(target){return target.id===staff.id}))return;
   targets.push({id:staff.id,name:staff.name,checked:active.some(function(row){return (row.reportStaff||[]).some(function(target){return target.id===staff.id})})});
  })});
  return targets;
 }
 function aggregate(entries){const groups=new Map();for(const e of entries){const k=key(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}return [...groups].map(([reportKey,items])=>{const active=items.filter(e=>e.checked).sort(order),source=(active.length?active:[...items].sort(order))[0];return {...source,...(Array.isArray(source.reportStaff)?{reportStaff:staffTargets(items,active)}:{}),reportKey,program:label(source),area:areaName(source.area),checked:active.length>0,sourceIds:active.map(e=>e.id),allSourceIds:items.map(e=>e.id)}}).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ko')||label(a).localeCompare(label(b),'ko')||a.memberId.localeCompare(b.memberId))}
 function columns(e){return [e.name,'','','','','',e.date,label(e),'','','',e.staff,'',e.reportKey||key(e)]}
 return {key,label,aggregate,columns};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PerformanceProjection;
