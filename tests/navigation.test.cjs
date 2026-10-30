const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({typeNames:{},managementPages:{},render(){},bindManagement(){}});vm.runInContext(fs.readFileSync(require.resolve('../site/navigation.js'),'utf8'),context);
test('기존 시간표·영역·프로그램 링크를 새 워크스페이스로 연결한다',()=>{
 const cases={'people/timetable':'timetable/personal','operations/programs':'programs','operations/areas':'programs/areas',schedules:'programs',staff:'operations/staff','programs/staff':'timetable/staff',programs:'programs','timetable/personal':'timetable/personal'};
 for(const [old,target] of Object.entries(cases))assert.equal(context.normalizeWorkspaceRoute(old),target);
});
test('운영 관리의 하위 메뉴는 소속·직원·기관 휴무 순서이다',()=>{assert.equal(vm.runInContext('Object.keys(routeLabels).join(",")',context),'affiliations,staff,closures')});
