// Small, synthesised sound effects (no audio files): a soft tick for buttons, pick-up and drop for cards, a hee-haw
// for Orbit, chimes for good news and a low tone for problems. Quiet by default, switchable per device.
// iPhones in silent mode mute these, which is intended.
window.Sounds=(() => {
 const KEY='little-orbit-sound',VOLUME=.2;
 let ctx=null,master=null,muted=false,pickedAt=0;
 try{muted=localStorage.getItem(KEY)==='off'}catch{}
 const played=[];// last sounds, for tests and debugging
 function audio(){
  if(ctx)return ctx;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
  try{ctx=new AC();master=ctx.createGain();master.gain.value=VOLUME;master.connect(ctx.destination)}catch{ctx=null}
  return ctx;
 }
 // Browsers only allow sound after a tap or key press.
 for(const type of ['pointerdown','keydown'])addEventListener(type,()=>{if(!muted)audio()?.resume?.()},{capture:true,passive:true});
 // One note: frequency glide, quick attack, smooth fade so nothing clicks.
 function tone({type='sine',freq,to=freq,dur=.1,gain=.15,delay=0,filter}){
  const c=ctx;if(!c||c.state!=='running')return;const t=c.currentTime+delay;
  const osc=c.createOscillator(),env=c.createGain();osc.type=type;osc.frequency.setValueAtTime(freq,t);osc.frequency.exponentialRampToValueAtTime(to,t+dur);
  env.gain.setValueAtTime(.0001,t);env.gain.exponentialRampToValueAtTime(gain,t+.012);env.gain.exponentialRampToValueAtTime(.0001,t+dur);
  let out=osc;if(filter){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=filter;osc.connect(f);out=f}
  out.connect(env);env.connect(master);osc.start(t);osc.stop(t+dur+.02);
 }
 const SOUNDS={
  tap:()=>tone({freq:1250,dur:.035,gain:.06}),
  fold:()=>tone({freq:900,to:1100,dur:.05,gain:.06}),
  pickup:()=>tone({freq:440,to:700,dur:.09,gain:.14}),
  drop:()=>{tone({type:'triangle',freq:340,to:220,dur:.11,gain:.2});tone({freq:900,dur:.05,gain:.07,delay:.06})},
  remove:()=>tone({freq:620,to:180,dur:.1,gain:.14}),
  undo:()=>{tone({freq:700,to:470,dur:.1,gain:.12});tone({freq:470,to:520,dur:.08,gain:.08,delay:.09})},
  // A tiny, friendly donkey "hee-haw".
  heehaw:()=>{tone({type:'sawtooth',freq:820,to:960,dur:.13,gain:.12,filter:1700});tone({type:'sawtooth',freq:540,to:400,dur:.2,gain:.13,delay:.14,filter:1300})},
  close:()=>tone({freq:720,to:520,dur:.08,gain:.08}),
  send:()=>tone({freq:660,to:990,dur:.08,gain:.09}),
  chime:()=>{tone({freq:1047,dur:.2,gain:.1});tone({freq:1319,dur:.26,gain:.09,delay:.09})},
  sparkle:()=>{tone({freq:784,dur:.12,gain:.1});tone({freq:988,dur:.12,gain:.1,delay:.07});tone({freq:1319,dur:.28,gain:.1,delay:.14})},
  error:()=>{tone({type:'triangle',freq:330,dur:.13,gain:.16});tone({type:'triangle',freq:247,dur:.2,gain:.16,delay:.14})}
 };
 function play(name){
  if(muted||!SOUNDS[name])return;played.push(name);if(played.length>30)played.shift();
  if(audio())SOUNDS[name]();
 }
 function setMuted(off){muted=!!off;try{localStorage.setItem(KEY,muted?'off':'on')}catch{};if(!muted){audio()?.resume?.();play('chime')}sync()}
 function sync(){const b=document.getElementById('soundToggle');if(!b)return;b.setAttribute('aria-pressed',String(!muted));b.textContent=muted?'🔈 Sounds off':'🔊 Sounds on'}

 // --- Where sounds happen. ---
 // Buttons and folds get a soft tick, except controls that make their own sound.
 document.addEventListener('click',e=>{
  const t=e.target.closest('button,summary,[role=option],a.maps-button');if(!t||t.disabled)return;
  if(t.closest('#orbitPal,#soundToggle,[data-orbit-apply],#orbitChatSend,[data-action=remove],#undo,#mobileUndo,.drag-handle'))return;
  play(t.tagName==='SUMMARY'?'fold':'tap');
 },true);
 // Card pick-up: mouse drag, or the touch drag's floating copy appearing.
 document.addEventListener('dragstart',e=>{if(e.target.closest?.('.activity,.idea, [draggable=true]')){pickedAt=Date.now();play('pickup')}},true);
 new MutationObserver(list=>{for(const m of list)for(const n of m.addedNodes)if(n.classList?.contains('sort-ghost')){pickedAt=Date.now();play('pickup')}}).observe(document.body,{childList:true});
 // app.js reports each saved change; one that follows a pick-up is a drop.
 function changed(){if(Date.now()-pickedAt<15000){pickedAt=0;play('drop')}}
 addEventListener('load',sync);
 document.addEventListener('click',e=>{if(e.target.closest('[data-action=remove]'))play('remove')},true);
 document.addEventListener('click',e=>{const b=e.target.closest('#soundToggle');if(b)setMuted(!muted)});
 return {play,changed,setMuted,get muted(){return muted},played};
})();
