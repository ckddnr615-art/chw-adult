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
 assert.match(context.bannerSlotControls(),/id="swapBannerPhotos"/);
});

test('소속 카드 순서는 기존 소속 ID와 도형을 유지하고 저장 후 다시 적용된다',()=>{
 const ManagementStore=require('../site/domain.js');
 const model=new ManagementStore(ManagementStore.seed(['404호','401호','403호','405호'],[],[],{}));
 model.data.communities[1].shape='square';
 model.moveKioskAffiliation('community-2',-1);
 model.moveKioskAffiliation('community-3',-1);
 const restored=new ManagementStore(JSON.parse(JSON.stringify(model.data)));
 assert.deepEqual(restored.kioskAffiliations().map(c=>c.name),['401호','403호','404호','405호']);
 assert.equal(restored.kioskAffiliations()[0].shape,'square');
 assert.equal(restored.communityName('community-1'),'404호');
});
