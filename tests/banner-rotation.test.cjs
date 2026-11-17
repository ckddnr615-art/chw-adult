const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context=vm.createContext({
 managementPages:{},window:{addEventListener(){}},
 photoMarkup:({photo})=>'<img data-test-photo="'+photo.id+'">'
});
vm.runInContext(fs.readFileSync(require.resolve('../site/banners.js'),'utf8'),context);
const photo=id=>({id,imageAlt:'활동',imageFit:'contain',x:20,y:70,zoom:1.5});

test('기존 배너에서 빈 칸을 건너뛰고 등록 순서대로 최대 두 장만 표시한다',()=>{
 const photos=[null,photo('one'),null,photo('two'),photo('three')];
 const banner={id:'kiosk',photos,autoRotate:true};
 const markup=context.bannerPhotoStrip(banner);
 assert.match(markup,/data-columns="2"/);
 assert.deepEqual([...markup.matchAll(/data-test-photo="([^"]+)"/g)].map(m=>m[1]),['one','two']);
 assert.doesNotMatch(markup,/empty-photo-slot|data-banner-pause/);
 assert.equal(photos.length,5);
 assert.equal(context.bannerPhotoSlots(banner)[1].zoom,1.5);
});

test('한 장은 한 칸 전체에 표시하고 사진이 없으면 심벌 하나를 표시한다',()=>{
 const single=context.bannerPhotoStrip({id:'kiosk',photo:photo('original')});
 assert.match(single,/data-columns="1"/);
 assert.match(single,/data-test-photo="original"/);
 assert.doesNotMatch(single,/empty-photo-slot/);
 const empty=context.bannerPhotoStrip({id:'kiosk',photos:[null,null]});
 assert.equal((empty.match(/chunghyun-symbol/g)||[]).length,1);
 assert.equal((context.bannerSlotControls().match(/data-banner-slot=/g)||[]).length,2);
});
