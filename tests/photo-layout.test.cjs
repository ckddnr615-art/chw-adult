const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {calculate}=require('../site/photo-layout.js');
test('정사각형 사진이 영역에 딱 맞아도 양 축을 따로 움직이고 확대·축소한다',()=>{
 const base={frameWidth:190,frameHeight:190,imageWidth:1000,imageHeight:1000};
 const center=calculate({...base}),moved=calculate({...base,x:75,y:25});assert.equal(center.dx,0);assert.equal(center.dy,0);assert.equal(moved.dx,47.5);assert.equal(moved.dy,-47.5);assert.equal(moved.width,190);
 assert.equal(calculate({...base,zoom:.5}).zoom,.5);assert.equal(calculate({...base,zoom:3}).zoom,3);assert.notEqual(center.transform,moved.transform);
});
test('가로·세로 사진의 끝부분도 이동 가능하며 화면 크기에 맞춰 구도를 다시 계산한다',()=>{
 const wide=calculate({frameWidth:190,frameHeight:190,imageWidth:2500,imageHeight:500,x:100});assert.equal(wide.width,950);assert.equal(wide.dx,380);
 const tall=calculate({frameWidth:190,frameHeight:190,imageWidth:500,imageHeight:2500,y:0});assert.equal(tall.height,950);assert.equal(tall.dy,-380);
 const small=calculate({frameWidth:64,frameHeight:64,imageWidth:1000,imageHeight:1000,x:75});assert.equal(small.dx,16);
});
test('같은 사진의 동시 요청·화면 이동·재접속은 캐시를 재사용하고 새 버전만 다시 받는다',async()=>{
 let fetches=0;const memory=new Map(),disk=new Map();
 const context=vm.createContext({URL,Blob,location:{origin:'https://example.com'},photoObjectUrls:memory,localPhoto:async key=>{if(!disk.has(key))return '';const url='blob:cached-'+key;memory.set(key,url);return url},cachePhoto:async(key,blob)=>disk.set(key,blob),fetch:async(url,options)=>{fetches++;assert.equal(options.cache,'force-cache');return {ok:true,blob:async()=>new Blob(['test'],{type:'image/webp'})}}});
 vm.runInContext(fs.readFileSync(require.resolve('../site/photo-cache.js'),'utf8'),context);
 await vm.runInContext("Promise.all([sharedPhoto('/api/team/photos/test/abc'),sharedPhoto('/api/team/photos/test/abc'),sharedPhoto('/api/team/photos/test/abc')])",context);assert.equal(fetches,1);
 memory.clear();await vm.runInContext("sharedPhoto('/api/team/photos/test/abc')",context);assert.equal(fetches,1);
 await vm.runInContext("sharedPhoto('/api/team/photos/test/def')",context);assert.equal(fetches,2);
 await assert.rejects(vm.runInContext("sharedPhoto('https://other.example/api/team/photos/test/abc')",context));assert.equal(fetches,2);
});
