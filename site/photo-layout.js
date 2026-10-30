(function(root){
 const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
 function calculate({frameWidth,frameHeight,imageWidth,imageHeight,x=50,y=50,zoom=1,fit='cover'}){if(![frameWidth,frameHeight,imageWidth,imageHeight].every(v=>Number.isFinite(v)&&v>0))return null;const ratio=fit==='contain'?Math.min(frameWidth/imageWidth,frameHeight/imageHeight):Math.max(frameWidth/imageWidth,frameHeight/imageHeight),z=clamp(zoom,.5,3,1),dx=(clamp(x,0,100,50)-50)/50*Math.max(frameWidth/2,(imageWidth*ratio*z-frameWidth)/2),dy=(clamp(y,0,100,50)-50)/50*Math.max(frameHeight/2,(imageHeight*ratio*z-frameHeight)/2);return {width:imageWidth*ratio,height:imageHeight*ratio,dx,dy,zoom:z,transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${z})`}}
 const api={calculate};root.PhotoLayout=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
