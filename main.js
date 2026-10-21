
(()=>{
 const overlay=document.getElementById('unboxing');
 const frames=[...overlay.querySelectorAll('.unbox-frame')];
 const gradient=overlay.querySelector('.unbox-gradient');
  const signature=document.getElementById('unbox-signature');
 const skip=document.getElementById('skip-opening');
 const replay=document.getElementById('replay-opening');
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 let timers=[];
 const wait=(fn,ms)=>timers.push(window.setTimeout(fn,ms));
 const clear=()=>{timers.forEach(clearTimeout);timers=[]};
 function showFrame(i){frames.forEach((f,j)=>f.classList.toggle('active',i===j));}
 function complete(){
   clear(); overlay.hidden=true; overlay.classList.remove('is-gone');
   document.body.classList.remove('opening');replay.hidden=false;signature.classList.remove('active');
 }
 function fadeToLiveCover(){
   // Actual page is already laid out behind the images. The overlay alone fades.
   // No opaque 4th frame, no blank ivory pause, no second page-load animation.
   overlay.classList.add('is-gone');
   wait(complete,1248);
 }
 function start(){
   clear();overlay.hidden=false;overlay.classList.remove('is-gone','ivory-mode');
   gradient.classList.remove('active');signature.classList.remove('active');showFrame(0);replay.hidden=true;
   document.body.classList.add('opening');window.scrollTo(0,0);
   if(reduce){wait(complete,180);return;}
   wait(()=>showFrame(1),728);
   wait(()=>showFrame(2),1612);
   // An ivory wash begins as frame 3 starts; the true cover appears underneath.
   wait(()=>gradient.classList.add('active'),1911);
    wait(()=>signature.classList.add('active'),180);
   wait(fadeToLiveCover,2340);
 }
 skip.addEventListener('click',complete);
 replay.addEventListener('click',start);
 // Fetch the GitHub-hosted images and render real page in parallel, not sequentially.
 start();
})();
