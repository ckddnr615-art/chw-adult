const {test}=require('node:test');
const assert=require('node:assert/strict');
const Store=require('../site/domain.js');
function fixture(){return new Store(Store.seed(['건강','스마트'],[{id:'member-1',name:'참여자1',group:'건강'},{id:'member-2',name:'참여자2',group:'스마트'}],[['10:00','11:00','건강활동','건강','강의실','직원1'],['10:30','11:30','디지털활동','스마트','정보실','직원2']],{}))}
function replacement(store,extra={}){return {kind:'replace',programId:'program-1',displayName:'외부 체험활동',start:'10:00',end:'11:30',location:'지역사회',facilitatorIds:[store.list('staff')[0].id],reason:'외부활동',...extra}}
test('오전, 오후, 종일을 구분하며 기존 오후 일정의 상세 시간을 유지한다',()=>{
 assert.deepEqual(Store.timeSlots().map(s=>s.name),['오전','오후','종일']);
 assert.equal(Store.scheduleSlot({start:'14:30',end:'15:40',slotId:'afternoon2'}),'afternoon');
 assert.equal(Store.scheduleSlot({start:'10:00',end:'13:00'}),'morning');
 assert.equal(Store.scheduleSlot({start:'10:00',end:'15:40'}),'all-day');
});

test('소속 없는 영역·프로그램·개별 일정 등록 후 다른 소속 이용인도 배정한다',()=>{
 const store=fixture(),area=store.save('areas','',{name:'공통 영역'},'2026-10-26');
 const program=store.save('programs','',{name:'공통 활동',areaId:area.id,facilitatorIds:[store.list('staff')[0].id]},'2026-10-26');
 const schedule=store.save('schedules','',{programId:program.id,date:'2026-10-26',weekdays:[],start:'13:00',end:'15:40',location:'활동실',audienceMode:'individual',communityId:''},'2026-10-26');
 store.assignParticipants(schedule.id,['member-1','member-2'],'2026-10-26','individual');
 assert.equal(store.eligibleMembers(store.schedulesOn('2026-10-26').find(s=>s.id===schedule.id),'2026-10-26').length,2);
 const entry=store.setParticipation('member-2',schedule.id,'2026-10-26',true);assert.equal(entry.area,'공통 영역');assert.equal(entry.communityId,'community-2');
});
test('프로그램 영역을 바꾸어도 기존 소속 기준 배정과 과거 실적은 유지한다',()=>{
 const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true),snapshot=JSON.stringify(entry);
 store.save('programs','program-1',{areaId:'area-2'},'2026-10-27');
 const occurrence=store.schedulesOn('2026-10-27').find(s=>s.id==='schedule-1');assert.equal(occurrence.area.id,'area-2');assert.equal(occurrence.communityId,'community-1');assert.equal(store.eligibleMembers(occurrence,'2026-10-27')[0].id,'member-1');assert.equal(JSON.stringify(entry),snapshot);
});
test('그날만 변경은 다음 주 같은 요일과 원래 일정에 영향을 주지 않는다',()=>{
  const store=fixture(),before=JSON.stringify(store.find('schedules','schedule-1'));
  store.setDayOverride('schedule-1','2026-10-26',replacement(store));
  assert.equal(store.schedulesOn('2026-10-26').find(s=>s.id==='schedule-1').program.name,'외부 체험활동');
  assert.equal(store.schedulesOn('2026-11-02').find(s=>s.id==='schedule-1').program.name,'건강활동');
  assert.equal(JSON.stringify(store.find('schedules','schedule-1')),before);
});
test('그날 휴강과 복원은 다른 날짜를 유지한다',()=>{const store=fixture();store.setDayOverride('schedule-1','2026-10-26',{kind:'cancel',reason:'기관 행사'});assert.equal(store.schedulesOn('2026-10-26').some(s=>s.id==='schedule-1'),false);assert.equal(store.schedulesOn('2026-10-27').some(s=>s.id==='schedule-1'),true);store.resetDayOverride('schedule-1','2026-10-26');assert.equal(store.schedulesOn('2026-10-26').some(s=>s.id==='schedule-1'),true)});
test('반복 일정 변경은 적용일 이전의 일정 ID와 실적을 보존한다',()=>{
  const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true),before=JSON.stringify(entry);
  const next=store.reviseSchedule('schedule-1',{start:'14:30',end:'15:40',location:'새 장소'},'2026-10-28');
  assert.equal(store.schedulesOn('2026-10-27').find(s=>s.program.id==='program-1').id,'schedule-1');
  assert.equal(store.schedulesOn('2026-10-28').find(s=>s.program.id==='program-1').id,next.id);
  assert.equal(store.schedulesOn('2026-10-28').find(s=>s.id===next.id).start,'14:30');
  assert.equal(JSON.stringify(store.data.entries[0]),before);
});
test('기본 일정 변경 이후에도 미리 등록한 미래 임시 변경을 보존한다',()=>{const store=fixture();store.setDayOverride('schedule-1','2026-11-02',replacement(store));const next=store.reviseSchedule('schedule-1',{location:'변경 장소'},'2026-10-28');const actual=store.schedulesOn('2026-11-02').find(s=>s.id===next.id);assert.equal(actual.program.name,'외부 체험활동');assert.equal(actual.location,'지역사회')});
test('소속이 다른 사람도 개인별 프로그램에 배정하고 실적을 기록할 수 있다',()=>{
  const store=fixture();store.assignParticipants('schedule-1',['member-2'],'2026-10-26','individual');
  const schedule=store.schedulesOn('2026-10-26').find(s=>s.program.id==='program-1');
  assert.deepEqual(store.eligibleMembers(schedule,'2026-10-26').map(m=>m.id),['member-2']);
  const entry=store.setParticipation('member-2',schedule.id,'2026-10-26',true);assert.equal(entry.communityId,'community-2');assert.equal(store.find('members','member-2').communityId,'community-2');
});
test('사례관리 담당 변경은 프로그램 진행 직원과 참여 배정을 바꾸지 않는다',()=>{
  const store=fixture(),staff=store.list('staff');store.assignParticipants('schedule-1',['member-1'],'2026-10-26','individual');
  const before=JSON.stringify(store.personalSchedules('member-1','2026-10-26'));
  store.assignCaseManager('member-1',staff[1].id,'2026-10-26');
  assert.equal(store.caseManagerAt('member-1','2026-10-26'),staff[1].id);
  assert.equal(JSON.stringify(store.personalSchedules('member-1','2026-10-26')),before);
  assert.equal(store.personalSchedules('member-1','2026-10-26')[0].program.staff,'직원1');
});
test('미래 개인 배정 전환은 이전 커뮤니티 시간표를 유지한다',()=>{
  const store=fixture();store.assignParticipants('schedule-1',['member-2'],'2026-10-28','individual');
  assert.equal(store.personalSchedules('member-1','2026-10-27').some(s=>s.program.id==='program-1'),true);
  assert.equal(store.personalSchedules('member-1','2026-10-28').some(s=>s.program.id==='program-1'),false);
  assert.equal(store.personalSchedules('member-2','2026-10-28').some(s=>s.program.id==='program-1'),true);
});
test('개인별 시간표의 중복 시간은 감지한다',()=>{const store=fixture();store.assignParticipants('schedule-1',['member-2'],'2026-10-26','individual');assert.equal(store.conflictsFor('member-2','2026-10-26').length,1)});
test('70명 이상과 직원 8명의 사례관리를 프로그램과 독립적으로 연결한다',()=>{
  const initial=Store.seed(['건강','스마트'],Array.from({length:76},(_,i)=>({id:`member-${i}`,name:`참여자${i}`,group:i%2?'스마트':'건강'})),[['10:00','11:30','활동1','건강','실1','직원1'],['13:00','14:30','활동2','스마트','실2','직원2']],{}),store=new Store(initial);
  for(let i=3;i<=8;i++)store.save('staff','',{name:`직원${i}`},'2026-10-26');
  const staff=store.list('staff');for(let i=0;i<76;i++)store.assignCaseManager(`member-${i}`,staff[i%8].id,'2026-10-26');
  store.assignParticipants('schedule-1',['member-1','member-2','member-3'],'2026-10-26','individual');
  const scheduled=store.schedulesOn('2026-10-26').find(s=>s.program.id==='program-1');
  assert.equal(store.data.caseAssignments.length,76);assert.equal(staff.length,8);assert.equal(store.eligibleMembers(scheduled,'2026-10-26').length,3);
});
test('기존 사용자 지정 시간은 마이그레이션으로 덮어쓰지 않는다',()=>{const store=fixture(),data=structuredClone(store.data);delete data.timetableVersion;data.schedules.push({id:'user-custom',programId:'program-1',date:'2026-10-26',weekdays:[],start:'09:20',end:'16:00',location:'외부',active:true});const migrated=new Store(data);assert.equal(migrated.find('schedules','user-custom').start,'09:20');assert.equal(migrated.find('schedules','user-custom').end,'16:00')});

test('종일 프로그램은 첫 수요일에 오전 운영만 남긴다',()=>{
 const store=fixture(),day='2026-11-04';
 const full=store.save('schedules','',{programId:'program-1',weekdays:[3],start:'10:00',end:'15:40',location:'활동실',communityId:'community-1'},day);
 assert.equal(Store.scheduleSlot(store.schedulesOn('2026-11-11').find(s=>s.id===full.id)),'all-day');
 const restricted=store.schedulesOn(day).find(s=>s.id===full.id);
 assert.equal(restricted.end,'13:00');
 assert.equal(Store.scheduleSlot(restricted),'morning');
 assert.equal(Store.inParticipationPeriod(restricted,'pm'),false);
});


test('사진으로 출석할 때 현재 진행 또는 같은 시간대의 유일한 예정 프로그램을 안내한다',()=>{
 const {readFileSync}=require('node:fs'),{runInNewContext}=require('node:vm');
 const source=readFileSync(require.resolve('../site/usability.js'),'utf8');
 const choose=runInNewContext(source.slice(source.indexOf('function photoFirstSchedule('),source.indexOf('function publicProgramRoster('))+'\nphotoFirstSchedule');
 const morning={start:'10:00',end:'11:30'},afternoon={start:'13:30',end:'14:30'},overlap={start:'10:00',end:'15:00'};
 assert.equal(choose([morning,afternoon],'09:55'),morning);
 assert.equal(choose([morning,afternoon],'13:00'),afternoon);
 assert.equal(choose([morning,afternoon],'14:00'),afternoon);
 assert.equal(choose([morning,overlap],'10:10'),null);
 assert.equal(choose([morning,afternoon],'16:00'),null);
});

test('오전과 오후 탭은 선택한 시간의 일정만 표시하며 종일은 별도 탭으로 표시한다',()=>{
 const {readFileSync}=require('node:fs'),{runInNewContext}=require('node:vm');
 const source=readFileSync(require.resolve('../site/usability.js'),'utf8');
 const choose=runInNewContext(source.slice(source.indexOf('function kioskProgramChoices('),source.indexOf('function kioskProgramSummary('))+'\nkioskProgramChoices',{
   ManagementStore:Store,esc:String,kioskProgramKey:s=>s.program.id,AFFILIATION_SHAPES:[['circle']],groupIcon:()=>'',kioskScheduleKey:'',
   publicProgramRoster:()=>({members:[1,2,3],present:[1]})
 });
 const schedules=[['10:00','11:00','오전 활동'],['13:00','14:00','오후 활동'],['10:00','15:40','종일 체험']].map(([start,end,name],id)=>({start,end,program:{id:String(id),name}}));
 const morning=choose(schedules,'morning');
 assert.match(morning,/data-kiosk-period="morning" aria-pressed="true"/);
 assert.match(morning,/data-kiosk-period="all-day"/);
 assert.match(morning,/오전 활동/);
 assert.match(morning,/총원 3명 \/ 출석 1명/);
 assert.doesNotMatch(morning,/오후 활동|종일 체험/);
 assert.match(choose(schedules,'afternoon'),/오후 활동/);
 assert.match(choose(schedules,'all-day'),/종일 체험/);
 assert.doesNotMatch(choose(schedules.slice(0,2),'morning'),/data-kiosk-period="all-day"/);
});
