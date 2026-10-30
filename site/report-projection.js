/* Daily achievements are independent from detailed programme participation. */
var PerformanceProjection=(function(){
 function areaName(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ')}
 function key(entry){if(!entry.memberId||!entry.date||!areaName(entry.area))throw Error('참여자 ID·날짜·영역명이 필요합니다.');return JSON.stringify([entry.date,entry.memberId,areaName(entry.area)])}
 function order(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99')||(a.end||'99:99').localeCompare(b.end||'99:99')||String(a.id).localeCompare(String(b.id))}
 function aggregate(entries){const groups=new Map();for(const e of entries){const k=key(e);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(e)}return [...groups].map(([reportKey,items])=>{const active=items.filter(e=>e.checked).sort(order),source=(active.length?active:[...items].sort(order))[0];return {...source,reportKey,program:areaName(source.area),area:areaName(source.area),checked:active.length>0,sourceIds:active.map(e=>e.id),allSourceIds:items.map(e=>e.id)}}).sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name,'ko')||a.area.localeCompare(b.area,'ko')||a.memberId.localeCompare(b.memberId))}
 function columns(e){return [e.name,'','','','','',e.date,e.area,'','','',e.staff,'',e.reportKey||key(e)]}
 return {key,aggregate,columns};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PerformanceProjection;
