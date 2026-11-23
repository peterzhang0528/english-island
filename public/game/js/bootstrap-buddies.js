const loading=document.querySelector('#buddy-loading');
try{const{initBuddyUI}=await import('./world-buddies.js');await initBuddyUI();loading.hidden=true;}
catch(error){console.error('Buddy Island could not open',error);loading.hidden=true;document.querySelector('#start-panel').hidden=true;document.querySelector('#buddy-fallback').hidden=false;}
