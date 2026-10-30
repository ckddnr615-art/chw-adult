/* Only the three photo cells are replaced; attendance DOM and focus are untouched. */
function createBannerRotation({count,interval=10000,canRun,show,schedule=setTimeout,cancel=clearTimeout}){
 let timer=null,disposed=false,busy=false,offset=0;
 const stop=()=>{if(timer!==null){cancel(timer);timer=null}};
 const arm=()=>{stop();if(!disposed&&!busy&&count>3&&canRun())timer=schedule(tick,interval)};
 const tick=async()=>{timer=null;if(disposed||busy||!canRun())return;busy=true;const next=(offset+3)%count;try{const shown=await show(next,()=>!disposed&&canRun());if(!disposed&&shown!==false)offset=next}catch{}finally{busy=false;arm()}};
 return {start:arm,refresh:arm,stop,destroy(){disposed=true;stop()},get offset(){return offset}};
}
let disposeBannerRotation=()=>{},bannerUserPaused=false;
function bindBannerRotation(){
 disposeBannerRotation();disposeBannerRotation=()=>{};
 if(location.hash!=='#kiosk')return;
 const strip=document.querySelector('.kiosk-flow .banner-photo-strip'),b=bannerConfig('kiosk'),photos=bannerPhotoSlots(b).filter(Boolean);
 if(!strip||photos.length<=3||b.autoRotate===false)return;
 const button=document.querySelector('[data-banner-pause]'),position=document.querySelector('[data-banner-position]'),reduced=matchMedia('(prefers-reduced-motion: reduce)');let visible=true,hovered=false;
 const canRun=()=>!bannerUserPaused&&!reduced.matches&&!document.hidden&&visible&&!hovered&&!participantGroup&&!document.querySelector('#dialog')?.open&&!document.activeElement?.closest('.community-picker,[data-checkin],#dialog');
 const updateLabel=()=>{if(!button)return;const interacting=!!participantGroup||!!document.querySelector('#dialog')?.open;button.disabled=interacting||reduced.matches;button.setAttribute('aria-pressed',String(bannerUserPaused||interacting||reduced.matches));button.textContent=interacting?'사진 멈춤 · 출석 선택 중':reduced.matches?'사진 멈춤 · 동작 줄이기':bannerUserPaused?'사진 재생':'사진 멈추기'};
 const gallery=strip.closest('.banner-gallery');
 const rotation=createBannerRotation({count:photos.length,canRun,show:async(next,stillAllowed)=>{
  const group=Array.from({length:3},(_,i)=>photos[(next+i)%photos.length]);
  // Fetch each version through the shared cache; decode before replacing the visible images.
  await Promise.all(group.map(async photo=>{const url=await sharedPhoto(photo.url),probe=new Image();probe.src=url;await probe.decode()}));
  if(!stillAllowed()||!strip.isConnected)return false;
  for(const frame of strip.querySelectorAll('.portrait'))photoResizeObserver?.unobserve(frame);
  strip.innerHTML=bannerPhotoCells(group);for(const img of strip.querySelectorAll('img[data-member-photo]'))await hydratePhoto(img);
  if(position)position.textContent=`활동 사진 ${group.map(p=>photos.indexOf(p)+1).join('·')} / ${photos.length}`;
  strip.animate?.([{opacity:.65},{opacity:1}],{duration:300});return true;
 }});
 const refresh=()=>{updateLabel();rotation.refresh()};
 const enter=()=>{hovered=true;refresh()},leave=()=>{hovered=false;refresh()};
 const stopOnInteraction=event=>{if(event.target.closest('.community-picker,[data-checkin],#dialog'))rotation.stop()};
 const afterInteraction=()=>queueMicrotask(refresh);
 const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;refresh()});observer?.observe(strip);
 if(button)button.onclick=()=>{bannerUserPaused=!bannerUserPaused;refresh()};
 gallery.addEventListener('pointerenter',enter);gallery.addEventListener('pointerleave',leave);
 document.addEventListener('pointerdown',stopOnInteraction,true);document.addEventListener('click',afterInteraction);document.addEventListener('focusin',refresh);document.addEventListener('focusout',afterInteraction);document.addEventListener('visibilitychange',refresh);reduced.addEventListener('change',refresh);
 disposeBannerRotation=()=>{rotation.destroy();observer?.disconnect();for(const frame of strip.querySelectorAll('.portrait'))photoResizeObserver?.unobserve(frame);gallery.removeEventListener('pointerenter',enter);gallery.removeEventListener('pointerleave',leave);document.removeEventListener('pointerdown',stopOnInteraction,true);document.removeEventListener('click',afterInteraction);document.removeEventListener('focusin',refresh);document.removeEventListener('focusout',afterInteraction);document.removeEventListener('visibilitychange',refresh);reduced.removeEventListener('change',refresh)};
 updateLabel();rotation.start();
}
const renderBeforeBannerRotation=render;
render=function(){disposeBannerRotation();renderBeforeBannerRotation();bindBannerRotation()};
bindBannerRotation();
