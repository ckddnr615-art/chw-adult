/* Preserve existing input nodes and handlers while labelling stacked table cells. */
function responsiveTablePlan(headers,rows){
 const spans=[];
 return rows.map((cells,index)=>{
  const occupied=new Set(),context=[];
  for(const span of spans)if(span.until>index){for(let n=0;n<span.width;n++)occupied.add(span.column+n);if(span.safe&&/프로그램|영역/.test(span.label)&&span.text&&!context.includes(span.text))context.push(span.text)}
  let column=0;
  const labels=cells.map(cell=>{
   while(occupied.has(column))column++;
   const label=headers[column]||'',width=cell.colSpan||1;
   if(cell.rowSpan>1)spans.push({column,width,until:index+cell.rowSpan,label,text:cell.text,safe:cell.safe});
   column+=width;return label;
  });
  return {labels,context:context.join(' · ')};
 });
}
(function(){
 const compact=matchMedia('(max-width:1100px)'),phone=matchMedia('(max-width:760px)');
 const header=document.querySelector('.headeractions'),sidebar=document.querySelector('#sidebar'),menu=document.querySelector('#menu');
 const settings=document.createElement('details');settings.className='compact-display-settings';settings.open=!phone.matches;
 const summary=document.createElement('summary');summary.textContent='보기 설정';settings.append(summary);
 const options=document.createElement('div');options.className='compact-display-options';settings.append(options);
 for(const id of ['voiceToggle','colorblindToggle','contrastToggle']){const button=document.getElementById(id);if(button)options.append(button)}
 header.prepend(settings);
 const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='mobile-menu-backdrop';backdrop.setAttribute('aria-label','메뉴 닫기');backdrop.hidden=true;document.body.append(backdrop);
 menu.setAttribute('aria-controls','sidebar');
 function syncMenu(){const open=compact.matches&&sidebar.classList.contains('open');menu.setAttribute('aria-expanded',String(open));backdrop.hidden=!open;sidebar.inert=compact.matches&&!open}
 function closeMenu(){sidebar.classList.remove('open');syncMenu()}
 backdrop.onclick=()=>{closeMenu();menu.focus()};menu.addEventListener('click',syncMenu);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(phone.matches)settings.open=false;if(sidebar.classList.contains('open')){closeMenu();menu.focus()}}});
 document.addEventListener('click',event=>{if(phone.matches&&!settings.contains(event.target))settings.open=false;if(event.target.closest('#sidebar a'))closeMenu()});
 compact.addEventListener('change',()=>{closeMenu();syncMenu()});phone.addEventListener('change',()=>{settings.open=!phone.matches});
 new MutationObserver(syncMenu).observe(sidebar,{attributes:true,attributeFilter:['class']});syncMenu();
 function labelTables(){
  for(const table of document.querySelectorAll('#main table.admin-table')){
   if(!table.tHead||table.matches('.monthly-grid,.weekly-timetable,.program-report-grid'))continue;
   const headers=[...table.tHead.rows[0].cells].flatMap(cell=>Array(cell.colSpan||1).fill(cell.textContent.trim()));
   const rows=[...table.tBodies].flatMap(body=>[...body.rows]);
   const plan=responsiveTablePlan(headers,rows.map(row=>[...row.cells].map(cell=>({colSpan:cell.colSpan,rowSpan:cell.rowSpan,text:(cell.querySelector('strong')||cell).textContent.trim(),safe:!cell.querySelector('input,select')&&(!!cell.querySelector('strong')||!cell.querySelector('button,details'))}))));
   table.classList.add('mobile-card-table');table.setAttribute('role','table');
   rows.forEach((row,index)=>{row.dataset.mobileContext=plan[index].context;row.setAttribute('role','row');[...row.cells].forEach((cell,n)=>{cell.dataset.mobileLabel=plan[index].labels[n];cell.setAttribute('role',cell.tagName==='TH'?'rowheader':'cell')})});
  }
 }
 let queued=false;
 new MutationObserver(changes=>{
  const changed=changes.some(change=>change.target.closest?.('table.admin-table')||[...change.addedNodes].some(node=>node.nodeType===1&&(node.matches('table.admin-table,tbody,tr')||node.querySelector('table.admin-table'))));
  if(changed&&!queued){queued=true;requestAnimationFrame(()=>{queued=false;labelTables()})}
 }).observe(document.querySelector('#main'),{childList:true,subtree:true});labelTables();
 function keyboardHeight(){document.documentElement.style.setProperty('--visible-window-height',(window.visualViewport?.height||window.innerHeight)+'px');document.documentElement.style.setProperty('--visible-window-top',(window.visualViewport?.offsetTop||0)+'px')}
 window.visualViewport?.addEventListener('resize',keyboardHeight);window.addEventListener('resize',keyboardHeight);keyboardHeight();
})();
