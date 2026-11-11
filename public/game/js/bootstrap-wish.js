const loading=document.querySelector('#wish-loading');
try{const{initWishUI}=await import('./world-wish.js');await initWishUI();loading.hidden=true;}
catch(error){console.error('Wish adventure could not open',error);loading.hidden=true;document.querySelector('#wish-fallback').hidden=false;parent.postMessage({type:'island-status',level:10,mode:'wish',ready:false,step:0,words:[],muted:false,busy:false,completed:false,bonusCompleted:false,error:'愿望地图暂时没有打开。'},location.origin);}
