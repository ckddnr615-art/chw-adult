const {test}=require('node:test');
const assert=require('node:assert/strict');
const Store=require('../site/domain.js');
function fixture(){return new Store(Store.seed(['건강','스마트'],[{id:'member-1',name:'검증참여자',group:'건강'}],[['10:00','11:00','건강활동','건강','강의실','담당자'],['11:00','12:00','디지털활동','스마트','정보실','담당자2']],{}))}
test('배너 문구·사진 구도는 두 화면별로 보관하며 실적을 바꾸지 않는다',()=>{
 const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true),before=JSON.stringify(entry);
 const b={id:'kiosk',eyebrow:'소개',line1:'첫째 줄',line2:'둘째 줄',description:'안내\n다음 줄',buttonLabel:'',imageAlt:'활동 사진',imageFit:'cover',photo:{id:'photo-test',url:'/api/team/photos/photo-test/abcdef',bytes:12000,zoom:1.5,x:20,y:70}};
 store.saveBanner(b);store.saveBanner({...b,id:'dashboard',line1:'대시보드'});store.saveBanner({...b,line1:'수정 문구'});
 assert.equal(store.data.banners.length,2);assert.equal(store.data.banners.find(x=>x.id==='kiosk').photo.y,70);assert.equal(store.data.banners.find(x=>x.id==='dashboard').line1,'대시보드');assert.equal(JSON.stringify(entry),before);
 assert.throws(()=>store.saveBanner({...b,photo:{...b.photo,url:'https://example.com/unsafe'}}),/배너 사진/);
 assert.throws(()=>store.saveBanner({...b,line1:''}),/제목/);
 assert.throws(()=>store.saveBanner({...b,photo:{...b.photo,zoom:4}}),/배너 사진/);
});
test('배너 글자 크기는 화면별로 저장하고 허용 범위를 검증한다',()=>{
 const store=fixture(),b={id:'kiosk',eyebrow:'소개',line1:'제목',line2:'두 번째 줄',description:'안내',buttonLabel:'',imageAlt:'배너',imageFit:'cover',photo:null,fontSizes:{eyebrow:20,title:52,description:24,button:16}};
 store.saveBanner(b);store.saveBanner({...b,id:'dashboard',fontSizes:{...b.fontSizes,title:36}});
 assert.equal(store.data.banners.find(x=>x.id==='kiosk').fontSizes.title,52);assert.equal(store.data.banners.find(x=>x.id==='dashboard').fontSizes.title,36);
 assert.throws(()=>store.saveBanner({...b,fontSizes:{...b.fontSizes,title:99}}),/글자 크기/);
 assert.throws(()=>store.saveBanner({...b,fontSizes:{...b.fontSizes,title:'52'}}),/글자 크기/);
 assert.throws(()=>store.saveBanner({...b,fontSizes:null}),/글자 크기/);
});

test('배너 사진 세 장은 각 구도·설명을 독립 저장하고 기존 한 장 배너도 유지한다',()=>{
 const store=fixture(),photo={id:'photo-test',url:'/api/team/photos/photo-test/abcdef',bytes:12000,zoom:1,x:50,y:50};
 const b={id:'kiosk',eyebrow:'소개',line1:'제목',line2:'',description:'안내',buttonLabel:'',imageAlt:'기존 사진',imageFit:'cover',photo};
 store.saveBanner(b);assert.equal(store.data.banners[0].photo.url,photo.url);
 const photos=[photo,{...photo,id:'photo-two',url:'/api/team/photos/photo-two/abcdef',x:20,imageAlt:'두 번째 활동',imageFit:'contain'},{...photo,id:'photo-three',url:'/api/team/photos/photo-three/abcdef',zoom:2,y:80}];
 store.saveBanner({...b,photos});assert.equal(store.data.banners[0].photos[1].x,20);assert.equal(store.data.banners[0].photos[2].zoom,2);assert.equal(store.data.banners[0].photos[0].x,50);
 const untouched=JSON.stringify(store.data.banners);assert.throws(()=>store.saveBanner({...b,photos:Array(10).fill(photo)}),/최대 9장/);assert.throws(()=>store.saveBanner({...b,photos:[photo,null,{...photo,url:'https://other.example/photo'}]}),/배너 사진/);assert.equal(JSON.stringify(store.data.banners),untouched);
 store.saveBanner({...b,photos:[photo,null,photos[2]]});assert.equal(store.data.banners[0].photos[1],null);assert.equal(store.data.banners[0].photos[2].zoom,2);
});
test('월별 미입력은 오늘까지 운영일만 결석 O로 표시하고 실적을 만들지 않는다',()=>{
  const store=fixture(),records={};
  assert.equal(store.registerMark(records,'member-1','2026-10-26','2026-10-26'),'O');
  assert.equal(store.registerMark(records,'member-1','2026-10-23','2026-10-26'),'O');
  assert.equal(store.registerMark(records,'member-1','2026-10-27','2026-10-26'),'');
  assert.equal(store.registerMark(records,'member-1','2026-10-24','2026-10-26'),'휴');
  assert.equal(store.registerMark(records,'member-1','2026-10-25','2026-10-26'),'휴');
  assert.equal(store.registerMark(records,'member-1','2026-10-31','2026-10-26'),'휴');
  records['2026-10-26:member-1']='출석';
  assert.equal(store.registerMark(records,'member-1','2026-10-26','2026-10-26'),'/');
  assert.deepEqual(store.data.entries,[]);
  assert.equal(Object.keys(records).length,1);
});
test('커뮤니티 이동과 프로그램 수정은 이미 생성한 실적을 바꾸지 않는다',()=>{
  const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true),before=JSON.stringify(entry);
  store.save('members','member-1',{name:'검증참여자',communityId:'community-2'},'2026-10-27');
  store.save('programs','program-1',{name:'변경한 프로그램',areaId:'area-1',staff:'새 담당자'},'2026-10-27');
  assert.equal(JSON.stringify(store.data.entries[0]),before);
  assert.equal(store.memberGroupAt(store.find('members','member-1'),'2026-10-26'),'community-1');
  assert.equal(store.memberGroupAt(store.find('members','member-1'),'2026-10-27'),'community-2');
  assert.deepEqual(store.exportRow(entry),['검증참여자','','','','','','2026-10-26','신체적 건강','담당자']);
});
test('당일 이동 전 출결의 소속 스냅샷은 이동 후에도 유지된다',()=>{
  const store=fixture(),records={'2026-10-26:member-1':'출석'};store.captureDays(records);
  store.save('members','member-1',{name:'새 이름',communityId:'community-2'},'2026-10-26');store.captureDays(records);
  assert.equal(store.data.days['2026-10-26:member-1'].communityId,'community-1');
  assert.equal(store.data.days['2026-10-26:member-1'].name,'검증참여자');
});
test('반복 체크는 실적을 중복 생성하지 않고 버전만 올린다',()=>{
  const store=fixture(),a=store.setParticipation('member-1','schedule-1','2026-10-26',true),id=a.id;
  store.setParticipation('member-1','schedule-1','2026-10-26',false);store.setParticipation('member-1','schedule-1','2026-10-26',true);
  assert.equal(store.data.entries.length,1);assert.equal(a.id,id);assert.equal(a.version,3);assert.equal(a.checked,true);
});
test('참여자 삭제는 현재 목록에서 제외하고 과거 실적은 남긴다',()=>{
  const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true);store.remove('members','member-1');
  assert.equal(store.list('members').length,0);assert.equal(store.data.entries[0].id,entry.id);assert.equal(store.data.entries[0].checked,true);
});
test('연결된 하위 항목을 가진 커뮤니티는 삭제하지 않는다',()=>{const store=fixture();assert.throws(()=>store.remove('communities','community-1'),/연결된 현재 항목/);assert.equal(store.find('communities','community-1').active,true)});
test('신규 참여자는 가입일 이전 소속이 없다',()=>{const store=fixture(),member=store.save('members','',{name:'새 참여자',communityId:'community-1'},'2026-10-26');assert.equal(store.memberGroupAt(member,'2026-10-25'),null)});
test('일정 요일·날짜와 시간 검증을 적용한다',()=>{const store=fixture();assert.equal(store.schedulesOn('2026-10-25').length,0);assert.equal(store.schedulesOn('2026-10-26').length,2);assert.throws(()=>store.save('schedules','',{programId:'program-1',start:'12:00',end:'10:00',location:'실',weekdays:[1]},'2026-10-26'),/종료 시간/)});
test('실적 정정과 삭제는 해당 실적만 바꾼다',()=>{const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true);store.editEntry(entry.id,{staff:'정정담당'});assert.equal(entry.staff,'정정담당');assert.equal(store.find('programs','program-1').staff,'담당자');store.deleteEntry(entry.id);assert.equal(entry.checked,false);assert.equal(entry.sync,'pending')});
test('일정 삭제 후에도 기존 실적을 명시적으로 정정할 수 있다',()=>{const store=fixture(),entry=store.setParticipation('member-1','schedule-1','2026-10-26',true);store.remove('schedules','schedule-1');store.setParticipation('member-1','schedule-1','2026-10-26',false);assert.equal(entry.checked,false);assert.equal(entry.version,2);assert.equal(entry.program,'건강활동')});
