// Public calendar contains dates and names only; the service key stays on the server.
const holidayYears=new Map(),holidayLoads=new Map();
management.holidays={};
async function ensureHolidayYear(year){
 year=String(year);const existing=holidayYears.get(year);if(existing&&Date.now()-existing.checkedAt<3600000)return existing;
 if(holidayLoads.has(year))return holidayLoads.get(year);
 const work=(async()=>{const response=await fetch('/api/holidays?year='+year);let data;try{data=await response.json()}catch{throw Error('공휴일 서버 응답을 확인하지 못했습니다.')}
  if(!response.ok||!data.ok)throw Error(data.error||'공휴일 조회 실패');
  for(const d of Object.keys(management.holidays))if(d.startsWith(year+'-'))delete management.holidays[d];
  Object.assign(management.holidays,data.dates);holidayYears.set(year,{...data,checkedAt:Date.now()});refreshCollections();return data;
 })();holidayLoads.set(year,work);try{return await work}finally{holidayLoads.delete(year)}
}
function holidayNotice(){
 const year=(location.hash==='#reports'?reportMonth:date).slice(0,4),data=holidayYears.get(year),name=management.holidayName(date);
 let node=document.querySelector('#holidayStatus');if(!node){document.querySelector('#main')?.insertAdjacentHTML('afterbegin','<p id="holidayStatus" class="holiday-status" role="status"></p>');node=document.querySelector('#holidayStatus')}
 if(!node)return;
 node.textContent=data?(data.stale?data.warning:year+'년 공휴일 자동 반영 · 출석률 계산에서 제외')+(name?' · 오늘 '+name:''):'공휴일 자료를 확인하고 있습니다.';
 if(!data&&!holidayLoads.has(year))void ensureHolidayYear(year).then(()=>render()).catch(error=>{if(node.isConnected){node.textContent=error.message+' · 공휴일 확인 전 집계는 보류됩니다.';node.insertAdjacentHTML('beforeend',' <button class="secondary" id="retryHolidays">다시 확인</button>');document.querySelector('#retryHolidays').onclick=()=>{void ensureHolidayYear(year).then(()=>render()).catch(e=>toast(e.message))}}});
 const closed=!!name||!data;
 document.querySelectorAll('[data-checkin]').forEach(button=>{if(closed){button.disabled=true;button.title=name?'오늘은 '+name+'입니다.':'공휴일 자료 확인 후 출석할 수 있습니다.'}});
}
