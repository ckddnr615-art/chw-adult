/* Print only the currently filtered document; never mutate operational records. */
function weeklyPrintPlan(matrix){
 const plan=matrix.map(row=>row.map(ids=>({ids:[...new Set(ids)],rowSpan:1,omit:false,continuation:false})));
 const columns=Math.max(0,...matrix.map(row=>row.length));
 for(let col=0;col<columns;col++){const seen=new Set();let start=0,previous='';
  for(let row=0;row<matrix.length;row++){const item=plan[row][col];if(!item)continue;const ids=[...item.ids],key=ids.length?JSON.stringify([...ids].sort()):'';
   if(key&&key===previous){plan[start][col].rowSpan++;item.omit=true;item.ids=[]}
   else{start=row;item.ids=ids.filter(id=>!seen.has(id));item.continuation=ids.length>0&&!item.ids.length}
   ids.forEach(id=>seen.add(id));previous=key;
  }
 }
 return plan;
}
function prepareWeeklyPrint(copy){
 const table=copy.querySelector('.weekly-timetable');if(!table)return;
 copy.querySelectorAll('.personal-caption h2,.personal-caption .avatar,.weekly-timetable caption,.weekly-timetable thead small').forEach(el=>el.remove());
 const cells=[...table.querySelectorAll('tbody tr')].map(row=>[...row.querySelectorAll('td')]),matrix=cells.map(row=>row.map(cell=>[...cell.querySelectorAll('[data-occurrence]')].map(card=>card.dataset.occurrence))),plan=weeklyPrintPlan(matrix);
 cells.forEach((row,r)=>row.forEach((cell,c)=>{const item=plan[r][c];if(item.omit){cell.remove();return}cell.rowSpan=item.rowSpan;cell.querySelectorAll('[data-occurrence]').forEach(card=>{if(!item.ids.includes(card.dataset.occurrence))card.remove()});if(item.continuation){const content=cell.querySelector('.timetable-cell');if(content)content.textContent='이전 시간부터 이어지는 활동입니다.'}}));
 copy.querySelectorAll('.schedule-warning,.cancelled-occurrences span').forEach(el=>{el.textContent=el.textContent.replace(/\d{4}-\d{2}-\d{2}/g,d=>'일월화수목금토'[new Date(d+'T12:00:00Z').getUTCDay()]+'요일')});
}
function singlePagePrintScale(measure,width,height){
 const fits=scale=>{const size=measure(scale);return size.width<=width+.5&&size.height<=height+.5};
 if(fits(1))return 1;
 let low=.01,high=1;for(let i=0;i<16;i++){const middle=(low+high)/2;if(fits(middle))low=middle;else high=middle}
 const scale=Math.floor(low*1000)/1000;measure(scale);return scale;
}
function fitStaffPrintPage(doc){
 const sheet=doc.querySelector('.staff-print-sheet');if(!sheet)return 1;
 const mm=96/25.4,width=277*mm,height=188*mm;
 const scale=singlePagePrintScale(value=>{sheet.style.width=277/value+'mm';sheet.style.zoom=String(value);const rect=sheet.getBoundingClientRect();return {width:rect.width,height:rect.height}},width,height);
 sheet.dataset.printScale=String(scale);return scale;
}
function printCurrentDocument(button){
 const source=button.closest('.panel');
 if(!source||!source.querySelector('table')){toast('인쇄할 표가 없습니다.');return}
 if(source.querySelector('#monthTable')&&!source.querySelector('.monthly-grid')){toast('공휴일 자료 확인 후 인쇄해 주세요.');return}
 const copy=source.cloneNode(true),labels=[],weekly=!!source.querySelector('.weekly-timetable'),staffPage=weekly&&!!source.querySelector('#timetableStaff');
 source.querySelectorAll('label').forEach(label=>{const control=label.querySelector('select,input[type="date"],input[type="month"]');if(!control||(weekly&&control.type==='date'))return;const name=label.firstChild?.textContent.trim()||'';const value=control.tagName==='SELECT'?control.selectedOptions[0]?.textContent:control.value;if(value)labels.push(name+' · '+value)});
 if(weekly)prepareWeeklyPrint(copy);
 copy.querySelectorAll('.filters,.weektoolbar,.staff-schedule-filter,.timetable-help,.add-slot,.notice,.schedule-warning button,[data-reset-override]').forEach(el=>el.remove());
 copy.querySelectorAll('button').forEach(el=>{const replacement=document.createElement(el.matches('.timetable-card')?'div':'span');replacement.className=el.className;replacement.innerHTML=el.innerHTML;el.replaceWith(replacement)});
 copy.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
 const title=source.querySelector('.personal-caption h2')?.textContent|| (source.querySelector('.monthly-grid')?'월별 출석부':document.querySelector('#timetableStaff')?'직원별 주간 시간표':'주간 시간표');
 document.querySelector('#documentPrintFrame')?.remove();
 const frame=document.createElement('iframe');frame.id='documentPrintFrame';frame.title='인쇄용 문서';frame.style.cssText='position:fixed;left:-20000px;top:0;width:1120px;height:800px;border:0';
 frame.onload=async()=>{try{await frame.contentDocument.fonts.ready;if(staffPage)fitStaffPrintPage(frame.contentDocument);frame.contentWindow.focus();frame.contentWindow.print()}catch{toast('브라우저 인쇄 기능을 열지 못했습니다. 다시 시도해 주세요.')}};
 const base=location.origin+location.pathname.replace(/[^/]*$/,'');
 frame.srcdoc=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><base href="${esc(base)}"><title>${esc(title)} · 충현복지관</title><link rel="stylesheet" href="typography.css"><link rel="stylesheet" href="printing.css"></head><body class="${staffPage?'staff-one-page':''}"><div class="${staffPage?'staff-print-sheet':'print-document'}"><header><p>충현복지관 · 성인지원팀</p><h1>${esc(title)}</h1><p>${labels.map(esc).join('　 /　 ')}</p></header>${copy.outerHTML}${source.querySelector('.monthly-grid')?'<footer>출석 / · 결석 O · 주말·공휴일·기관 휴무일 휴</footer>':''}</div></body></html>`;
 document.body.append(frame);
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-print-document]');if(button)printCurrentDocument(button)});
