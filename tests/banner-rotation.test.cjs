const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Store=require('../site/domain.js');
const context=vm.createContext({managementPages:{},window:{addEventListener(){}},render(){},location:{hash:'#test'},setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(require.resolve('../site/banners.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(require.resolve('../site/banner-rotation.js'),'utf8'),context);
function clock(){let next=0;const callbacks=new Map();return {callbacks,schedule(fn,ms){assert.equal(ms,10000);callbacks.set(++next,fn);return next},cancel(id){callbacks.delete(id)},async run(){const [id,fn]=callbacks.entries().next().value;callbacks.delete(id);await fn()}}}
test('9장은 세 장씩 순환하고 다음 바퀴에 첫 세 장을 다시 보여준다',async()=>{
 const c=clock(),seen=[],rotation=context.createBannerRotation({count:9,canRun:()=>true,show:async offset=>{seen.push(offset)},schedule:c.schedule,cancel:c.cancel});
 rotation.start();await c.run();await c.run();await c.run();assert.deepEqual(seen,[3,6,0]);assert.equal(c.callbacks.size,1);rotation.destroy();assert.equal(c.callbacks.size,0);
});
test('출석 선택으로 멈춘 뒤 진행 중인 사진 준비가 끝나도 교체하지 않는다',async()=>{
 const c=clock();let allowed=true,finish,painted=false;
 const rotation=context.createBannerRotation({count:9,canRun:()=>allowed,show:async(offset,stillAllowed)=>{await new Promise(r=>finish=r);if(!stillAllowed())return false;painted=true},schedule:c.schedule,cancel:c.cancel});
 rotation.start();const pending=c.run();allowed=false;rotation.refresh();finish();await pending;assert.equal(painted,false);assert.equal(rotation.offset,0);assert.equal(c.callbacks.size,0);rotation.destroy();
});
test('사진이 세 장 이하면 순환 타이머를 만들지 않는다',()=>{
 const c=clock(),rotation=context.createBannerRotation({count:3,canRun:()=>true,show(){throw Error('호출되면 안 됨')},schedule:c.schedule,cancel:c.cancel});rotation.start();assert.equal(c.callbacks.size,0);
});
test('기존 3장 자료를 보존하고 9장 편집·순환에서 사진을 누락하지 않는다',()=>{
 const photos=Array.from({length:9},(_,i)=>({id:'photo-'+i,url:'/api/team/photos/photo-'+i+'/abcdef',bytes:10000,x:i,y:50,zoom:1,imageAlt:'활동 '+i,imageFit:'cover'}));
 const b={id:'kiosk',eyebrow:'기관',line1:'제목',line2:'',description:'안내',buttonLabel:'',imageAlt:'활동',imageFit:'cover',photo:photos[0],photos,autoRotate:true};Store.validateBanner(b);
 assert.equal(context.bannerPhotoSlots({...b,photos:photos.slice(0,3)}).length,9);
 assert.equal(context.bannerVisiblePhotos(b,6).map(p=>p.id).join(','),'photo-6,photo-7,photo-8');
 assert.equal(context.bannerVisiblePhotos({...b,photos:[photos[0],null,null,null,null,null,photos[6]]},0).filter(Boolean).length,2);
 assert.equal(context.bannerVisiblePhotos(b,6,true).map(p=>p.id).join(','),'photo-6,photo-7,photo-8');
 assert.throws(()=>Store.validateBanner({...b,autoRotate:'true'}),/자동 순환/);assert.throws(()=>Store.validateBanner({...b,photos:[...photos,photos[0]]}),/최대 9장/);
});
