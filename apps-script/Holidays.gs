function parseHolidays(raw,year){
 let items,total;
 if(raw.trim().startsWith('{')){
  const response=JSON.parse(raw).response;
  if(String(response?.header?.resultCode)!=='00')throw Error('공휴일 API 인증 또는 응답 오류');
  const item=response.body?.items?.item;items=item?(Array.isArray(item)?item:[item]):[];total=Number(response.body?.totalCount);
 }else{
  const code=raw.match(/<resultCode>\s*([^<]+)\s*<\/resultCode>/)?.[1]?.trim();
  if(code!=='00')throw Error('공휴일 API 인증 또는 응답 오류');
  total=Number(raw.match(/<totalCount>(\d+)<\/totalCount>/)?.[1]);
  items=[...raw.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m=>Object.fromEntries(['locdate','dateName','isHoliday'].map(k=>[k,m[1].match(new RegExp('<'+k+'>([\\s\\S]*?)</'+k+'>'))?.[1]])));
 }
 if(!Number.isInteger(total)||total!==items.length)throw Error('공휴일 API 목록이 불완전합니다.');
 const dates={};for(const item of items){if(item.isHoliday!=='Y')continue;const d=String(item.locdate);if(!new RegExp('^'+year+'[0-9]{4}$').test(d))throw Error('공휴일 날짜 오류');const iso=d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6),name=String(item.dateName||'공휴일').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&amp;/g,'&').slice(0,100);if(new Date(iso+'T12:00:00Z').toISOString().slice(0,10)!==iso)throw Error('공휴일 날짜 오류');dates[iso]=dates[iso]?dates[iso]+' · '+name:name}
 if(!Object.keys(dates).length)throw Error('공휴일 API에 해당 연도 자료가 없습니다.');
 return dates;
}
