/* Browser and Node share the same history and performance rules. */
(function(root){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const uid=()=>Utilities.getUuid();
  class ManagementStore {
    constructor(data){this.data=clone(data);this.upgradeTimetable()}
    static timeSlots(){return [{id:'morning',name:'오전',start:'10:00',end:'11:30'},{id:'afternoon1',name:'오후 1',start:'13:00',end:'14:30'},{id:'afternoon2',name:'오후 2',start:'14:30',end:'15:40'}]}
    static addDays(d,n){const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
    upgradeTimetable(){
      this.data.banners=this.data.banners||[];this.data.closures=this.data.closures||[];this.data.staff=this.data.staff||[];this.data.caseAssignments=this.data.caseAssignments||[];this.data.enrollments=this.data.enrollments||[];this.data.scheduleOverrides=this.data.scheduleOverrides||[];
      // Freeze legacy group audiences on schedules; area edits must not move their participants.
      for(const schedule of this.data.schedules)if(!Object.prototype.hasOwnProperty.call(schedule,'communityId')){const program=this.data.programs.find(p=>p.id===schedule.programId);schedule.communityId=this.data.areas.find(a=>a.id===program?.areaId)?.communityId||''}
      for(const program of this.data.programs){if(!program.facilitatorIds){let staff=this.data.staff.find(s=>s.name===program.staff);if(!staff&&program.staff&&program.active!==false){staff={id:uid(),name:program.staff,active:true};this.data.staff.push(staff)}program.facilitatorIds=staff?[staff.id]:[]}}
      if(!this.data.timetableVersion){for(const schedule of this.data.schedules){schedule.seriesId=schedule.seriesId||schedule.id;schedule.audienceMode=schedule.audienceMode||'community';if(schedule.active!==false&&!schedule.date&&/^schedule-[1-4]$/.test(schedule.id)){const slot=ManagementStore.timeSlots().find(s=>schedule.start<s.end)||ManagementStore.timeSlots()[2];schedule.legacyTime={start:schedule.start,end:schedule.end};schedule.start=slot.start;schedule.end=slot.end;schedule.slotId=slot.id}}this.data.timetableVersion=1}
    }
    staffNames(ids){return (ids||[]).map(id=>this.find('staff',id)?.name).filter(Boolean).join(' · ')}
    caseManagerAt(memberId,d){return this.data.caseAssignments.filter(a=>a.memberId===memberId&&a.from<=d&&(!a.to||a.to>=d)&&a.active!==false).sort((a,b)=>a.from.localeCompare(b.from)).slice(-1)[0]?.staffId||''}
    assignCaseManager(memberId,staffId,from){
      if(staffId&&!this.list('staff').some(s=>s.id===staffId))throw Error('사례관리 직원을 선택해 주세요.');
      const current=this.caseManagerAt(memberId,from);if(current===staffId)return;
      for(const assignment of this.data.caseAssignments.filter(a=>a.memberId===memberId&&(!a.to||a.to>=from))){if(assignment.from>=from)assignment.active=false;else assignment.to=ManagementStore.addDays(from,-1)}
      if(staffId)this.data.caseAssignments.push({id:uid(),memberId,staffId,from,to:'',active:true});
    }
    eligibleMembers(schedule,d){
      const rawEligible=(item,member)=>item.audienceMode==='individual'?this.data.enrollments.some(e=>e.active!==false&&e.memberId===member.id&&e.scheduleId===item.id&&e.from<=d&&(!e.to||e.to>=d)):this.memberGroupAt(member,d)===item.communityId;
      const dated=this.schedulesOn(d).filter(s=>this.find('schedules',s.id)?.date===d&&s.audienceMode==='individual');
      return this.list('members').filter(member=>rawEligible(schedule,member)&&(this.find('schedules',schedule.id)?.date===d||!dated.some(s=>s.start<schedule.end&&schedule.start<s.end&&rawEligible(s,member))));
    }
    assignParticipants(scheduleId,memberIds,from,mode){
      let schedule=this.find('schedules',scheduleId);if(!schedule||schedule.active===false)throw Error('사용 중인 일정을 선택해 주세요.');
      if(!['community','individual'].includes(mode))throw Error('배정 방식을 확인해 주세요.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||(schedule.validFrom&&from<schedule.validFrom)||(schedule.validTo&&from>schedule.validTo)||(schedule.date&&from!==schedule.date))throw Error('배정 적용일이 일정 기간과 맞지 않습니다.');
      const ids=[...new Set(memberIds)];if(ids.some(id=>!this.list('members').some(m=>m.id===id)))throw Error('사용 중인 참여자를 선택해 주세요.');
      if(mode==='individual'&&!ids.length)throw Error('참여자를 한 명 이상 선택해 주세요.');
      if(this.data.enrollments.some(e=>e.scheduleId===scheduleId&&e.active!==false&&e.from>from))throw Error('이미 예약된 미래 배정이 있습니다. 적용일을 확인해 주세요.');
      if(schedule.audienceMode!==mode&&!schedule.date){schedule=this.reviseSchedule(scheduleId,{audienceMode:mode},from);scheduleId=schedule.id}
      const before={mode:schedule.audienceMode,enrollments:clone(this.data.enrollments.filter(e=>e.scheduleId===scheduleId))};
      for(const e of this.data.enrollments.filter(e=>e.scheduleId===scheduleId&&e.active!==false&&(!e.to||e.to>=from))){if(e.from>=from)e.active=false;else e.to=ManagementStore.addDays(from,-1)}
      for(const memberId of ids)this.data.enrollments.push({id:uid(),scheduleId,memberId,from,to:'',active:true});
      schedule.audienceMode=mode;this.audit('참여자 배정','schedules',scheduleId,before,{mode,memberIds:ids,from});
    }
    setDayOverride(scheduleId,d,fields){
      const schedule=this.find('schedules',scheduleId);if(!schedule||schedule.active===false)throw Error('변경할 일정을 찾지 못했습니다.');
      const weekday=new Date(d+'T12:00:00Z').getUTCDay();if((schedule.date&&schedule.date!==d)||(!schedule.date&&!schedule.weekdays.includes(weekday))||(schedule.validFrom&&d<schedule.validFrom)||(schedule.validTo&&d>schedule.validTo))throw Error('선택한 날짜에는 이 일정이 없습니다.');
      if(typeof fields.displayName==='string'&&fields.displayName.length>80)throw Error('당일 활동 이름은 80자 이내로 입력해 주세요.');
      if(!fields.reason||!String(fields.reason).trim())throw Error('변경 이유를 입력해 주세요.');
      if(!['replace','cancel'].includes(fields.kind))throw Error('변경 방식을 확인해 주세요.');
      if(fields.kind==='replace'){
        if(!this.list('programs').some(p=>p.id===fields.programId))throw Error('변경 프로그램을 선택해 주세요.');
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.end)||fields.start>=fields.end)throw Error('변경 시간을 확인해 주세요.');
        if(!String(fields.location||'').trim())throw Error('장소를 입력해 주세요.');
        if((fields.facilitatorIds||[]).some(id=>!this.list('staff').some(s=>s.id===id)))throw Error('진행 직원을 확인해 주세요.');
      }
      const old=this.data.scheduleOverrides.find(o=>o.scheduleId===scheduleId&&o.date===d&&o.active!==false);
      const item={...clone(fields),id:old?.id||uid(),scheduleId,date:d,active:true};
      if(old)this.data.scheduleOverrides[this.data.scheduleOverrides.indexOf(old)]=item;else this.data.scheduleOverrides.push(item);
      this.audit('그날만 변경','scheduleOverrides',item.id,old,item);return item;
    }
    resetDayOverride(scheduleId,d){const old=this.data.scheduleOverrides.find(o=>o.scheduleId===scheduleId&&o.date===d&&o.active!==false);if(old){const before=clone(old);old.active=false;this.audit('그날 변경 취소','scheduleOverrides',old.id,before,old)}}
    reviseSchedule(id,fields,from){
      const old=this.find('schedules',id);if(!old||old.active===false||old.date)throw Error('변경할 반복 일정을 선택해 주세요.');
      if((old.validFrom&&from<old.validFrom)||(old.validTo&&from>old.validTo))throw Error('변경 적용일이 기존 일정 기간을 벗어났습니다.');
      const before=clone(old),next=this.save('schedules','',{...clone(old),...clone(fields),seriesId:old.seriesId||old.id,validFrom:from,validTo:''},from);
      // Preserve the old occurrence IDs and earlier enrollment records.
      old.validTo=ManagementStore.addDays(from,-1);
      for(const enrollment of this.data.enrollments.filter(e=>e.scheduleId===id&&e.active!==false&&(!e.to||e.to>=from))){this.data.enrollments.push({...clone(enrollment),id:uid(),scheduleId:next.id,from:enrollment.from>from?enrollment.from:from});if(enrollment.from>=from)enrollment.active=false;else enrollment.to=ManagementStore.addDays(from,-1)}
      for(const override of this.data.scheduleOverrides.filter(o=>o.scheduleId===id&&o.active!==false&&o.date>=from)){this.data.scheduleOverrides.push({...clone(override),id:uid(),scheduleId:next.id});override.active=false}
      this.audit('반복 일정 변경','schedules',id,before,{previous:old,next});return next;
    }
    personalSchedules(memberId,d){return this.schedulesOn(d).filter(s=>this.eligibleMembers(s,d).some(m=>m.id===memberId))}
    conflictsFor(memberId,d){const schedules=this.personalSchedules(memberId,d),pairs=[];for(let i=0;i<schedules.length;i++)for(let j=i+1;j<schedules.length;j++)if(schedules[i].start<schedules[j].end&&schedules[j].start<schedules[i].end)pairs.push([schedules[i].id,schedules[j].id]);return pairs}

    static seed(groups,people,programs,records){
      const communities=groups.map((name,i)=>({id:`community-${i+1}`,name,active:true}));
      const areas=communities.map((c,i)=>({id:`area-${i+1}`,communityId:c.id,name:['신체적 건강','디지털 생활','생활체육','문화예술'][i],active:true}));
      const members=people.map(p=>({id:p.id,name:p.name,communityId:communities.find(c=>c.name===p.group).id,active:true,history:[{from:'1900-01-01',communityId:communities.find(c=>c.name===p.group).id}]}));
      const programList=programs.map((p,i)=>({id:`program-${i+1}`,name:p[2],areaId:areas[i].id,staff:p[5],active:true}));
      const schedules=programs.map((p,i)=>({id:`schedule-${i+1}`,programId:programList[i].id,start:p[0],end:p[1],location:p[4],weekdays:[1,2,3,4,5],date:'',active:true}));
      return {version:1,communities,members,areas,programs:programList,schedules,entries:[],days:{},audit:[]};
    }
    list(type){return this.data[type].filter(v=>v.active!==false)}
    find(type,id){return this.data[type].find(v=>v.id===id)}
    communityName(id){return this.find('communities',id)?.name||'삭제된 커뮤니티'}
    memberGroupAt(member,d){return [...(member.history||[])].filter(h=>h.from<=d).sort((a,b)=>a.from.localeCompare(b.from)).slice(-1)[0]?.communityId||null}
    audit(action,type,id,before,after){this.data.audit.push({id:uid(),time:new Date().toISOString(),action,type,entityId:id,before:clone(before??null),after:clone(after??null)})}
    save(type,id,fields,today){
      if(!['communities','members','areas','programs','schedules','staff','closures'].includes(type))throw Error('지원하지 않는 항목입니다.');
      const old=id?this.find(type,id):null;if(id&&(!old||old.active===false))throw Error('이미 삭제된 항목입니다.');
      const item={...(old||{}),...clone(fields),id:id||uid(),active:true};
      if(type!=='schedules'){
        item.name=String(item.name||'').trim();if(!item.name||item.name.length>80)throw Error('이름은 1~80자로 입력해 주세요.');
        if(this.list(type).some(v=>v.id!==id&&v.name===item.name&&(type==='closures'?v.date===item.date&&(v.endDate||v.date)===(item.endDate||item.date):type==='members'?v.communityId===item.communityId:type==='areas'?v.communityId===item.communityId:type==='programs'?v.areaId===item.areaId:true)))throw Error('같은 범위에 동일한 이름이 있습니다. 이름을 구분해 주세요.');
      }
      if(type==='closures'){ManagementStore.validateClosure(item);if(this.list('closures').some(c=>c.id!==id&&c.date===item.date&&(c.endDate||c.date)===(item.endDate||item.date)))throw Error('이미 등록한 휴무일입니다. 기존 항목을 수정해 주세요.');}
      if(type==='members'&&!this.list('communities').some(c=>c.id===item.communityId))throw Error('사용 중인 소속을 선택해 주세요.');
      if(type==='programs'){
        if(!this.list('areas').some(a=>a.id===item.areaId))throw Error('사용 중인 영역을 선택해 주세요.');
        if(fields.facilitatorIds){item.facilitatorIds=[...new Set(fields.facilitatorIds)];if(item.facilitatorIds.some(id=>!this.list('staff').some(s=>s.id===id)))throw Error('진행 직원을 확인해 주세요.');item.staff=this.staffNames(item.facilitatorIds)}
        item.staff=String(item.staff||'').trim();if(!item.staff||item.staff.length>150)throw Error('프로그램 진행 직원을 선택해 주세요.');
      }
      if(type==='schedules'){
        if(!this.list('programs').some(p=>p.id===item.programId))throw Error('사용 중인 프로그램을 선택해 주세요.');
        if(!/^\d{2}:\d{2}$/.test(item.start)||!/^\d{2}:\d{2}$/.test(item.end)||item.start>=item.end||item.end>'23:59')throw Error('종료 시간은 시작 시간 이후여야 합니다.');
        if(item.date&&!/^\d{4}-\d{2}-\d{2}$/.test(item.date))throw Error('일정을 확인해 주세요.');
        item.weekdays=(item.weekdays||[]).map(Number).filter(n=>Number.isInteger(n)&&n>=0&&n<=6);
        if(!item.date&&!item.weekdays.length)throw Error('운영 날짜 또는 반복 요일을 선택해 주세요.');
        if(item.facilitatorIds&&item.facilitatorIds.some(id=>!this.list('staff').some(s=>s.id===id)))throw Error('진행 직원을 확인해 주세요.');
        item.slotId=ManagementStore.timeSlots().find(s=>s.start===item.start&&s.end===item.end)?.id||'custom';
        item.audienceMode=item.audienceMode||'community';
        if(!['community','individual'].includes(item.audienceMode))throw Error('배정 방식을 확인해 주세요.');
        item.location=String(item.location||'').trim();if(!item.location||item.location.length>120)throw Error('장소를 1~120자로 입력해 주세요.');
      }
      if(type==='members'){
        if(Object.prototype.hasOwnProperty.call(fields,'caseManagerId')&&fields.caseManagerId&&!this.list('staff').some(s=>s.id===fields.caseManagerId))throw Error('사례관리 직원을 확인해 주세요.');
        item.history=clone(old?.history||[{from:today,communityId:item.communityId}]);
        if(old&&old.communityId!==item.communityId)item.history.push({from:today,communityId:item.communityId});
      }
      this.audit(old?'수정':'등록',type,item.id,old,item);
      if(old)this.data[type][this.data[type].indexOf(old)]=item;else this.data[type].push(item);
      if(type==='members'&&Object.prototype.hasOwnProperty.call(fields,'caseManagerId'))this.assignCaseManager(item.id,fields.caseManagerId,today);
      return item;
    }
    remove(type,id){
      const item=this.find(type,id);if(!item||item.active===false)throw Error('이미 삭제된 항목입니다.');
      const linked=type==='communities'?this.list('members').some(p=>p.communityId===id)||this.list('areas').some(a=>a.communityId===id):type==='areas'?this.list('programs').some(p=>p.areaId===id):type==='programs'?this.list('schedules').some(s=>s.programId===id):type==='staff'?this.list('programs').some(p=>(p.facilitatorIds||[]).includes(id))||this.list('schedules').some(s=>(s.facilitatorIds||[]).includes(id))||this.data.caseAssignments.some(a=>a.staffId===id&&a.active!==false&&!a.to&&this.find('members',a.memberId)?.active!==false):false;
      if(linked&&type!=='programs')throw Error('연결된 현재 항목이 있습니다. 먼저 소속을 변경하거나 하위 항목을 삭제해 주세요.');
      const before=clone(item);item.active=false;item.deletedAt=new Date().toISOString();this.audit('삭제',type,id,before,item);
    }
    captureDays(records){
      for(const [key,status] of Object.entries(records)){
        if(!status)continue;const d=key.slice(0,10),id=key.slice(11),member=this.find('members',id);if(!member)continue;
        if(!this.data.days[key]){const communityId=this.memberGroupAt(member,d);this.data.days[key]={memberId:id,name:member.name,date:d,communityId,community:this.communityName(communityId)}}
      }
    }
    static validateBanner(item){if(!['kiosk','dashboard'].includes(item.id))throw Error('배너 종류를 확인해 주세요.');for(const [key,max] of [['eyebrow',120],['line1',80],['line2',80],['description',300],['buttonLabel',40],['imageAlt',100]])if(typeof item[key]!=='string'||item[key].length>max)throw Error('배너 문구 길이를 확인해 주세요.');if(!item.line1.trim())throw Error('첫 번째 제목을 입력해 주세요.');if(!['cover','contain'].includes(item.imageFit))throw Error('사진 표시 방식을 확인해 주세요.');if(item.fontSizes!==undefined){if(!item.fontSizes||Array.isArray(item.fontSizes)||typeof item.fontSizes!=='object')throw Error('글자 크기를 확인해 주세요.');for(const [key,min,max] of [['eyebrow',10,28],['title',24,72],['description',12,36],['button',12,28]])if(!Number.isInteger(item.fontSizes[key])||item.fontSizes[key]<min||item.fontSizes[key]>max)throw Error('글자 크기 범위를 확인해 주세요.')}if(item.autoRotate!==undefined&&typeof item.autoRotate!=='boolean')throw Error('배너 자동 순환 설정을 확인해 주세요.');if(item.photos!==undefined){if(item.id!=='kiosk'||!Array.isArray(item.photos)||item.photos.length<1||item.photos.length>9)throw Error('배너 사진은 최대 9장까지 등록해 주세요.');for(const photo of item.photos){if(!photo)continue;if(photo.imageFit!==undefined&&!['cover','contain'].includes(photo.imageFit))throw Error('배너 사진 맞춤을 확인해 주세요.');if(photo.imageAlt!==undefined&&(typeof photo.imageAlt!=='string'||photo.imageAlt.length>100))throw Error('배너 사진 설명을 확인해 주세요.');ManagementStore.validateBanner({...item,photos:undefined,photo})}}if(item.photo){const p=item.photo;if(typeof p.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(p.id)||!Number.isFinite(p.zoom)||p.zoom<1||p.zoom>3||![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100)||!Number.isFinite(p.bytes)||p.bytes>131072||typeof p.url!=='string'||!/^\/api\/team\/photos\/[-a-zA-Z0-9]+\/[a-f0-9]+$/.test(p.url)&&p.url!=='')throw Error('배너 사진 정보를 확인해 주세요.')}}
    saveBanner(item){ManagementStore.validateBanner(item);const old=this.data.banners.find(b=>b.id===item.id);if(old)this.data.banners[this.data.banners.indexOf(old)]=clone(item);else this.data.banners.push(clone(item));this.audit('배너 수정','banners',item.id,old,item)}
    static closureContains(item,d){return item.date<=d&&d<=(item.endDate||item.date)}
    static validateClosure(item){for(const d of [item.date,item.endDate||item.date]){if(typeof d!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d)throw Error('올바른 휴무 날짜를 입력해 주세요.')}if((item.endDate||item.date)<item.date)throw Error('종료일은 시작일 이후로 선택해 주세요.');if(typeof item.name!=='string'||!item.name.trim()||item.name.length>80)throw Error('휴무 이름은 1~80자로 입력해 주세요.');if(typeof item.active!=='boolean')throw Error('휴무 상태를 확인해 주세요.')}
    holidayName(d){return [this.holidays?.[d],...(this.data.closures||[]).filter(c=>c.active!==false&&ManagementStore.closureContains(c,d)).map(c=>c.name)].filter(Boolean).join(' · ')}
    programEnabled(id,d){const p=this.find('programs',id);return !!p&&p.active!==false&&([...p.enabledHistory||[]].filter(h=>h.from<=d).sort((a,b)=>a.from.localeCompare(b.from)).slice(-1)[0]?.enabled??true)}
    setProgramEnabled(id,enabled,from){const p=this.find('programs',id);if(!p||p.active===false)throw Error('사용 중인 프로그램을 선택해 주세요.');if(typeof enabled!=='boolean'||!/^\d{4}-\d{2}-\d{2}$/.test(from))throw Error('운영 상태를 확인해 주세요.');const before=clone(p);p.enabledHistory=[...(p.enabledHistory||[]).filter(h=>h.from!==from),{from,enabled}];this.audit(enabled?'프로그램 활성화':'프로그램 비활성화','programs',id,before,p)}
    schedulesOn(d){
      if(this.holidayName(d))return [];
      const weekday=new Date(d+'T12:00:00Z').getUTCDay();
      const resolved=this.list('schedules').filter(s=>(s.date?s.date===d:s.weekdays.includes(weekday))&&(!s.validFrom||s.validFrom<=d)&&(!s.validTo||s.validTo>=d)).map(base=>{
        const override=this.data.scheduleOverrides.find(o=>o.active!==false&&o.scheduleId===base.id&&o.date===d);
        if(override?.kind==='cancel')return null;
        const item={...base,...(override||{}),id:base.id,baseScheduleId:base.id,overrideId:override?.id||'',isException:!!override,changeReason:override?.reason||''};
        const program=this.find('programs',item.programId);if(!program||!this.programEnabled(program.id,d)||!this.programEnabled(base.programId,d))return null;
        const area=this.find('areas',program.areaId);if(!area)return null;
        // A one-day replacement keeps the original audience and owning community.
        const baseProgram=this.find('programs',base.programId),baseArea=this.find('areas',baseProgram?.areaId);
        const facilitatorIds=item.facilitatorIds||program.facilitatorIds||[];
        const communityId=Object.prototype.hasOwnProperty.call(base,'communityId')?base.communityId:(baseArea?.communityId||'');
        return {...item,program:{...program,name:override?.displayName||program.name,staff:this.staffNames(facilitatorIds)||program.staff},facilitatorIds,area,communityId,community:this.communityName(communityId)};
      }).filter(Boolean).sort((a,b)=>a.start.localeCompare(b.start));
      const dated=resolved.filter(s=>this.find('schedules',s.id)?.date===d&&s.audienceMode!=='individual');
      return resolved.filter(s=>this.find('schedules',s.id)?.date===d||!dated.some(one=>one.communityId===s.communityId&&one.start<s.end&&s.start<one.end));
    }
    setParticipation(memberId,scheduleId,d,checked){
      const member=this.find('members',memberId),schedule=this.schedulesOn(d).find(s=>s.id===scheduleId);
      let entry=this.data.entries.find(e=>e.memberId===memberId&&e.scheduleId===scheduleId&&e.date===d);
      if(!member||(!schedule&&!entry))throw Error('참여자나 해당 날짜의 일정이 없습니다.');
      if(!entry&&(!member.active||!this.eligibleMembers(schedule,d).some(m=>m.id===memberId)))throw Error('해당 날짜 소속과 프로그램 커뮤니티가 다릅니다.');
      const before=clone(entry||null);
      if(!entry){const communityId=this.data.days[d+':'+memberId]?.communityId||this.memberGroupAt(member,d);entry={id:uid(),memberId,scheduleId,date:d,name:member.name,communityId,community:this.communityName(communityId),areaId:schedule.area.id,area:schedule.area.name,programId:schedule.program.id,program:schedule.program.name,staff:schedule.program.staff,facilitatorIds:clone(schedule.facilitatorIds||[]),caseManagerId:this.caseManagerAt(memberId,d),start:schedule.start,end:schedule.end,version:0,createdAt:new Date().toISOString()};this.data.entries.push(entry)}
      entry.checked=!!checked;entry.version++;entry.sync='pending';entry.updatedAt=new Date().toISOString();entry.error='';this.audit(checked?'참여 체크':'참여 취소','entries',entry.id,before,entry);return entry;
    }
    editEntry(id,fields){const e=this.find('entries',id);if(!e)throw Error('실적이 없습니다.');const before=clone(e);for(const k of ['name','area','program','staff']){const v=String(fields[k]??e[k]).trim();if(!v||v.length>100)throw Error('실적 항목을 1~100자로 입력해 주세요.');e[k]=v}e.version++;e.updatedAt=new Date().toISOString();e.sync='pending';e.error='';this.audit('실적 정정','entries',id,before,e);return e}
    deleteEntry(id){const e=this.find('entries',id);if(!e)throw Error('실적이 없습니다.');const before=clone(e);e.checked=false;e.version++;e.sync='pending';e.updatedAt=new Date().toISOString();this.audit('실적 삭제','entries',id,before,e);return e}
    applyAttendance(records,memberId,d,nextStatus){
      if(!['출석','결석',''].includes(nextStatus))throw Error('출석·결석·미입력 중 선택해 주세요.');
      const member=this.find('members',memberId);if(!member)throw Error('참여자를 찾을 수 없습니다.');
      this.captureDays(records);const key=d+':'+memberId,previous=records[key]||'';records[key]=nextStatus;this.captureDays(records);
      let generated=0,cancelled=0;
      if(nextStatus==='출석'){
        if(member.active===false&&previous!=='출석')throw Error('삭제한 참여자는 복구 후 출석을 입력해 주세요.');
        const schedules=this.personalSchedules(memberId,d),valid=new Set(schedules.map(s=>s.id));
        // Reconcile only this person's date. Frozen metadata of already-created entries is retained.
        for(const e of this.data.entries.filter(e=>e.memberId===memberId&&e.date===d&&e.checked&&!valid.has(e.scheduleId))){this.deleteEntry(e.id);cancelled++}
        for(const schedule of schedules){let e=this.data.entries.find(e=>e.memberId===memberId&&e.scheduleId===schedule.id&&e.date===d);if(!e||!e.checked){e=this.setParticipation(memberId,schedule.id,d,true);e.source=e.source||'arrival_auto';e.basis='scheduled_on_arrival';e.attendanceLinked=true;generated++}}
      }else for(const e of this.data.entries.filter(e=>e.memberId===memberId&&e.date===d&&e.checked)){this.deleteEntry(e.id);e.cancelReason=nextStatus==='결석'?'출결 결석 변경':'출결 미입력 변경';cancelled++}
      if(previous!==nextStatus)this.audit('출결 변경','days',key,previous,nextStatus);
      return {memberId,date:d,status:nextStatus,generated,cancelled};
    }
    expectedOn(memberId,d){const member=this.find('members',memberId);return !!member&&this.personalSchedules(memberId,d).length>0}
    registerMark(records,memberId,d,today){const weekday=new Date(d+'T12:00:00Z').getUTCDay();if(weekday===0||weekday===6||this.holidayName(d))return '휴';const value=records[d+':'+memberId];if(['출석','지각','조퇴'].includes(value))return '/';if(value==='결석')return 'O';if(d<=today&&this.expectedOn(memberId,d))return 'O';return ''}
    exportRow(e){return [e.name,'','','','','',e.date,e.area,e.staff]}
  }
  root.ManagementStore=ManagementStore;if(typeof module!=='undefined'&&module.exports)module.exports=ManagementStore;
})(globalThis);
