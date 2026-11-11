(function(){
 const cfg = Object.assign({block:false,error:null,readyDelay:300,startDelay:250}, window.__ytMock||{});
 const PS={UNSTARTED:-1,ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3,CUED:5};
 window.__ytLog=window.__ytLog||[]; window.__ytPlayers=0;
 class Player{
  constructor(el,opts){ window.__ytPlayers++; const host=typeof el==='string'?document.getElementById(el):el;
   const f=document.createElement('iframe'); f.id=host.id; f.setAttribute('allow','autoplay'); f.width=opts.width; f.height=opts.height; f.dataset.videoId=opts.videoId; f.dataset.loop=opts.playerVars.loop+'/'+opts.playerVars.playlist;
   host.replaceWith(f); this.opts=opts; this.state=-1; this.vol=100; this.t=0; this.ev=opts.events||{}; window.__ytPlayer=this;
   setTimeout(()=>this.ev.onReady&&this.ev.onReady({target:this}), cfg.readyDelay);}
  _set(s){this.state=s; this.ev.onStateChange&&this.ev.onStateChange({data:s,target:this});}
  playVideo(){ __ytLog.push('play'); if(cfg.error){ setTimeout(()=>this.ev.onError({data:cfg.error}),50); return;}
   const active=navigator.userActivation?navigator.userActivation.isActive:false;
   if(cfg.block && !active){ setTimeout(()=>this.ev.onAutoplayBlocked&&this.ev.onAutoplayBlocked({}),50); return;}
   this._set(3); setTimeout(()=>{ if(this.state===3){this._set(1); clearInterval(this.iv); this.iv=setInterval(()=>{ if(this.state===1) this.t+=0.25;},250);} }, cfg.startDelay);}
  pauseVideo(){ __ytLog.push('pause'); if(this.state===1||this.state===3) this._set(2); }
  setVolume(v){this.vol=v} getVolume(){return this.vol} unMute(){} seekTo(t){this.t=t}
  getPlayerState(){return this.state} getCurrentTime(){return this.t}
 }
 window.YT={Player,PlayerState:PS};
 setTimeout(()=>window.onYouTubeIframeAPIReady&&window.onYouTubeIframeAPIReady(),0);
})();
