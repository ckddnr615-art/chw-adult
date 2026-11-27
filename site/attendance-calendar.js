/* Reuse the loaded holiday catalog; browsing a month never loads attendance records. */
function attendanceCalendarDays(month,store,today,selected){
 const first=new Date(month+'-01T12:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 return {offset:first.getUTCDay(),days:Array.from({length:count},(_,index)=>{
  const day=month+'-'+String(index+1).padStart(2,'0'),weekday=new Date(day+'T12:00:00Z').getUTCDay();
  const holiday=store.holidays?.[day]||'',closures=(store.data.closures||[]).filter(item=>item.active!==false&&item.date<=day&&day<=(item.endDate||item.date)).map(item=>item.name||'기관 휴관');
  const afternoon=!holiday&&!closures.length&&store.afternoonClosed(day);
  return {day,number:index+1,holiday,closures,afternoon,weekend:weekday===0||weekday===6,selected:day===selected,today:day===today,disabled:day>today};
 })};
}
function bindAttendanceCalendars(){
 for(const id of ['programAttendanceDate','filterDate']){
  const input=document.getElementById(id);if(!input||document.getElementById(id+'Calendar'))continue;
  const button=document.createElement('button');button.type='button';button.id=id+'Calendar';button.className='secondary attendance-calendar-open';button.textContent='휴일 달력';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label','공휴일·휴관일 달력에서 기준일 선택');
  input.insertAdjacentElement('afterend',button);button.onclick=()=>openAttendanceCalendar(input.value,button);
 }
}
function openAttendanceCalendar(selected,opener){
 document.getElementById('attendanceHolidayCalendar')?.remove();
 const dialog=document.createElement('dialog');dialog.id='attendanceHolidayCalendar';dialog.className='attendance-holiday-calendar';dialog.setAttribute('aria-labelledby','attendanceCalendarTitle');
 document.body.append(dialog);let month=selected.slice(0,7),generation=0;
 const close=()=>{dialog.close();dialog.remove();if(opener.isConnected)opener.focus()};
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 async function paint(focusDay=''){
  const request=++generation,year=month.slice(0,4),known=holidayYears.has(year),calendar=attendanceCalendarDays(month,management,date,selected);
  dialog.innerHTML=`<div class="attendance-calendar-heading"><h2 id="attendanceCalendarTitle">${esc(month.replace('-','년 '))}월</h2><button type="button" class="secondary" data-calendar-close aria-label="휴일 달력 닫기">닫기</button></div>
   <div class="attendance-calendar-navigation"><button type="button" class="secondary" data-calendar-month="-1" aria-label="이전 달">← 이전 달</button><button type="button" class="secondary" data-calendar-today>오늘</button><button type="button" class="secondary" data-calendar-month="1" ${month>=date.slice(0,7)?'disabled':''} aria-label="다음 달">다음 달 →</button></div>
   <p class="formhint">공휴일·휴관일도 과거 기록 확인을 위해 선택할 수 있습니다.</p>
   <p class="attendance-calendar-status" role="status">${known?(holidayYears.get(year).stale?'공휴일 자료가 최신이 아닐 수 있습니다.':'공휴일 · 기관 휴관일 · 오후 휴무 표시'):'공휴일 확인 중… 기관 휴관일은 먼저 표시합니다.'}</p>
   <div class="attendance-calendar-grid"><div class="attendance-calendar-weekdays">${['일','월','화','수','목','금','토'].map(name=>`<span>${name}</span>`).join('')}</div><div class="attendance-calendar-dates">${'<span aria-hidden="true"></span>'.repeat(calendar.offset)}${calendar.days.map(item=>{
    const labels=[item.holiday,...item.closures.map(name=>'휴관: '+name),item.afternoon?'오후 휴무':'',item.weekend?'주말':''].filter(Boolean),label=[item.day,...labels,item.today?'오늘':''].filter(Boolean).join(' · ');
    return `<button type="button" class="attendance-calendar-day${item.holiday||item.closures.length||item.weekend?' is-closed':''}${item.selected?' is-selected':''}" data-calendar-day="${item.day}" aria-label="${esc(label)}" aria-pressed="${item.selected}" ${item.today?'aria-current="date"':''} ${item.disabled?'disabled':''}><strong>${item.number}${item.today?'<span>오늘</span>':''}</strong>${labels.map(name=>`<small>${esc(name)}</small>`).join('')}</button>`;
   }).join('')}</div></div>`;
  dialog.querySelector('[data-calendar-close]').onclick=close;
  dialog.querySelectorAll('[data-calendar-month]').forEach(button=>button.onclick=()=>{const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+Number(button.dataset.calendarMonth));month=d.toISOString().slice(0,7);void paint()});
  dialog.querySelector('[data-calendar-today]').onclick=()=>{close();void changeAttendanceDate(date)};
  dialog.querySelectorAll('[data-calendar-day]').forEach(button=>button.onclick=()=>{const day=button.dataset.calendarDay;close();void changeAttendanceDate(day)});
  if(focusDay)dialog.querySelector(`[data-calendar-day="${focusDay}"]`)?.focus();
  if(!known)try{await ensureHolidayYear(year);if(dialog.isConnected&&generation===request)void paint(dialog.contains(document.activeElement)?document.activeElement.dataset.calendarDay||'':'')}catch(error){if(dialog.isConnected&&generation===request){const status=dialog.querySelector('[role="status"]');status.textContent=error.message+' 기관 휴관일만 표시 중입니다. ';const retry=document.createElement('button');retry.type='button';retry.className='secondary';retry.textContent='다시 확인';retry.onclick=()=>{void paint()};status.append(retry)}}
 }
 void paint();dialog.showModal();dialog.querySelector(`[data-calendar-day="${selected}"]`)?.focus();
}
