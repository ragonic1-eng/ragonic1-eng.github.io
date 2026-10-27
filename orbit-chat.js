// Orbit chat: a floating chibi donkey that answers questions about the trip, shows places on a small map, suggests spots
// nearby, and proposes card changes. Changes are only applied after the person taps "Apply", as one undoable step.
(() => {
 const el=id=>document.getElementById(id),{escape,valid,maps}=PlaceCore;
 const STORE='little-orbit-chat',HINT='little-orbit-chat-hint',GEO='little-orbit-geo';
 const DOG=`<svg viewBox="0 0 64 64" aria-hidden="true" class="orbit-mascot"><g transform="translate(32 35) scale(.9) translate(-32 -35)"><g stroke="#7a8094" stroke-width="1.4"><ellipse cx="9.5" cy="27" rx="6.6" ry="12.5" transform="rotate(58 9.5 27)" fill="#b9bece"/><ellipse cx="54.5" cy="27" rx="6.6" ry="12.5" transform="rotate(-58 54.5 27)" fill="#b9bece"/></g><ellipse cx="9" cy="27.4" rx="3.2" ry="8.4" transform="rotate(58 9 27.4)" fill="#f4c3d2"/><ellipse cx="55" cy="27.4" rx="3.2" ry="8.4" transform="rotate(-58 55 27.4)" fill="#f4c3d2"/><ellipse cx="32" cy="36" rx="22.5" ry="20.5" fill="#b9bece" stroke="#7a8094" stroke-width="1.4"/><g fill="#5a6072"><circle cx="27.5" cy="16.5" r="4.2"/><circle cx="32" cy="14.2" r="4.8"/><circle cx="36.6" cy="16.5" r="4.2"/></g><g class="mascot-eyes"><ellipse cx="22.5" cy="31.5" rx="4.4" ry="5" fill="#2b2f3b"/><ellipse cx="41.5" cy="31.5" rx="4.4" ry="5" fill="#2b2f3b"/><circle cx="24" cy="29.6" r="1.8" fill="#fff"/><circle cx="43" cy="29.6" r="1.8" fill="#fff"/><circle cx="21.2" cy="33.6" r=".85" fill="#fff"/><circle cx="40.2" cy="33.6" r=".85" fill="#fff"/></g><ellipse cx="15.5" cy="40" rx="4" ry="2.8" fill="#f5a9c4" opacity=".8"/><ellipse cx="48.5" cy="40" rx="4" ry="2.8" fill="#f5a9c4" opacity=".8"/><ellipse cx="32" cy="46.5" rx="14.5" ry="9.5" fill="#e4e7ee" stroke="#a1a7b7" stroke-width="1"/><ellipse cx="27" cy="44.2" rx="1.5" ry="1.9" fill="#4b5061"/><ellipse cx="37" cy="44.2" rx="1.5" ry="1.9" fill="#4b5061"/><path d="M28.2 49.4q3.8 4.4 7.6 0Z" fill="#e2768f" stroke="#4b5061" stroke-width="1.2" stroke-linejoin="round"/></g></svg>`;
 const MEMORY_URL='https://github.com/ragonic1-eng/ragonic1-eng.github.io/blob/main/orbit-knowledge.md';
 const IDEAS=['Show all our hotels on a map','What’s fun near our next stop?','Any rainy-day ideas for today?'];
 let log=[],busy=false,settingsRequest;
 try{log=JSON.parse(sessionStorage.getItem(STORE)||'[]');if(!Array.isArray(log))log=[]}catch{log=[]}
 const save=()=>{try{sessionStorage.setItem(STORE,JSON.stringify(log.slice(-30)))}catch{}};
 const settings=()=>settingsRequest??=Promise.all([fetch('places-config.json',{cache:'no-cache'}).then(r=>r.json()),fetch('config.json',{cache:'no-cache'}).then(r=>r.json())]).catch(()=>{settingsRequest=null;return [{},{}]});
 function room(){const p=new URLSearchParams(location.hash.slice(1));return {roomId:p.get('room'),roomKey:p.get('key')}}
 const clock=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
 const dayLabel=i=>{const d=state?.days?.[i];if(!d)return 'Day '+(i+1);const date=new Date(d.date+'T12:00:00');return date.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})};
 const span=m=>m<60?m+' min':Math.floor(m/60)+' h'+(m%60?' '+m%60+' min':'');

 // --- Page furniture. ---
 document.body.insertAdjacentHTML('beforeend',`<button type="button" id="orbitPal" class="orbit-pal" aria-label="Ask Orbit" aria-expanded="false" aria-controls="orbitChat">${DOG}<span class="orbit-pal-hint" id="orbitPalHint" hidden>Ask me!</span></button>
<section id="orbitChat" class="orbit-chat" role="dialog" aria-label="Chat with Orbit" hidden><header class="orbit-chat-head"><span class="orbit-chat-face">${DOG}</span><div><strong>Orbit</strong><small>Your trip helper · always asks before changes</small></div><button type="button" id="orbitChatClear" class="orbit-chat-tool" aria-label="Start a new chat" title="New chat">↺</button><button type="button" id="orbitChatClose" class="orbit-chat-tool" aria-label="Close chat">✕</button></header>
<div id="orbitChatLog" class="orbit-chat-log" aria-live="polite"></div>
<form id="orbitChatForm" class="orbit-chat-form"><label class="sr-only" for="orbitChatInput">Message Orbit</label><textarea id="orbitChatInput" rows="1" maxlength="1000" placeholder="Ask Orbit… e.g. where are our hotels?" enterkeyhint="send"></textarea><button type="submit" id="orbitChatSend" class="primary" aria-label="Send">➤</button></form></section>`);
 const pal=el('orbitPal'),panel=el('orbitChat'),list=el('orbitChatLog'),input=el('orbitChatInput');
 try{if(!localStorage.getItem(HINT)){el('orbitPalHint').hidden=false;setTimeout(()=>{el('orbitPalHint').hidden=true},9000)}}catch{}
 function open(){window.Sounds?.play('heehaw');panel.hidden=false;pal.setAttribute('aria-expanded','true');document.body.classList.add('orbit-chat-open');el('orbitPalHint').hidden=true;try{localStorage.setItem(HINT,'1')}catch{}render();input.focus({preventScroll:true})}
 function close(){if(!panel.hidden)window.Sounds?.play('close');panel.hidden=true;pal.setAttribute('aria-expanded','false');document.body.classList.remove('orbit-chat-open');pal.focus({preventScroll:true})}
 pal.onclick=()=>panel.hidden?open():close();
 // Messages pop up in the same corner; lift Orbit above any message on screen so it stays tappable.
 const toast=document.getElementById('toast');
 function clearOfToast(){
  pal.style.translate='';if(!toast?.classList.contains('show'))return;
  const t=toast.getBoundingClientRect(),p=pal.getBoundingClientRect();
  if(t.left<p.right&&p.left<t.right&&t.top<p.bottom&&p.top<t.bottom)pal.style.translate=`0 ${Math.round(t.top-p.bottom-10)}px`;
 }
 if(toast){new MutationObserver(clearOfToast).observe(toast,{attributes:true,attributeFilter:['class'],childList:true});addEventListener('resize',clearOfToast)}
 el('orbitChatClose').onclick=close;
 el('orbitChatClear').onclick=()=>{if(busy)return;log=[];save();render();input.focus()};
 panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close()}});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();el('orbitChatForm').requestSubmit()}});
 input.addEventListener('input',()=>{input.style.height='auto';input.style.height=Math.min(input.scrollHeight,110)+'px'});
 el('orbitChatForm').onsubmit=e=>{e.preventDefault();send(input.value)};

 // --- What Orbit is told about the trip: times, titles, places and known map points. Never the trip key. ---
 function tripSummary(){
  let geo={};try{geo=JSON.parse(localStorage.getItem(GEO)||'{}')||{}}catch{}
  return {today:new Date().toISOString().slice(0,10),selectedDay:typeof day==='number'?day:0,days:state.days.map(d=>{let t=d.start;return {date:d.date,name:d.name,region:d.region,cards:d.cards.map(c=>{
   const start=t;t+=c.duration;const card={id:c.id,title:c.title,start:clock(start),end:clock(t),category:c.category,notes:c.notes||''};
   const p=c.place;if(p){const known=Number.isFinite(p.lat)?p:geo[[p.nameZh||p.name,p.address].join('|')];card.place={name:p.nameZh&&p.nameZh!==p.name?p.name+' ('+p.nameZh+')':p.name,address:p.address||'',...(Number.isFinite(known?.lat)&&Number.isFinite(known?.lon)?{lat:known.lat,lon:known.lon}:{})}}
   return card})}})};
 }

 // --- Sending. ---
 async function send(question){
  question=String(question||'').trim();if(!question||busy)return;
  const {roomId,roomKey}=room();
  log.push({role:'user',text:question});input.value='';input.style.height='auto';
  if(!roomId||!roomKey){log.push({role:'assistant',text:'I can only help on your private shared trip. Tap “Turn on Orbit” to make one — then ask me again!',needsShare:true});save();render();return}
  busy=true;window.Sounds?.play('send');save();render();
  try{
   const [config,app]=await settings();if(!config.chatUrl||app.provider!=='supabase'||!config.chatUrl.startsWith(String(app.supabaseUrl).replace(/\/$/,'')+'/functions/v1/'))throw Error('Orbit chat isn’t set up for this site yet.');
   const messages=log.filter(m=>m.text&&!m.failed).slice(-10).map(m=>({role:m.role,text:m.role==='assistant'?m.text+(m.changes?'\n[Proposed changes: '+m.changes.map(describe).join('; ')+(m.status?' — '+m.status:'')+']':''):m.text}));
   if(navigator.onLine===false)throw Object.assign(Error('You’re offline.'),{code:'OFFLINE'});
   // A busy AI or a network blip is retried once before anything is shown.
   const data=await Problems.withRetry(async()=>{
    const response=await fetch(config.chatUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:app.supabaseKey},body:JSON.stringify({roomId,roomKey,messages,trip:tripSummary()}),signal:AbortSignal.timeout(140000),referrerPolicy:'no-referrer'});
    let data;try{data=await response.json()}catch{throw Object.assign(Error('Orbit sent back an answer the site couldn’t read.'),{code:'INVALID_RESULT'})}
    if(!response.ok)throw Problems.fromResponse(response,data,'Orbit couldn’t answer right now.');
    return data;
   });
   window.Sounds?.play('chime');
   log.push({role:'assistant',text:String(data.text||''),map:data.map,places:Array.isArray(data.places)?data.places:undefined,changes:Array.isArray(data.changes)&&data.changes.length?data.changes:undefined,changeSummary:data.changeSummary,memory:[...(data.remembered||[]).map(text=>({text:String(text),status:'saved'})),...(data.forgot||[]).map(text=>({text:String(text),status:'replaced'}))],memoryNote:data.memoryError||(Array.isArray(data.memoryOff)&&data.memoryOff.length?'Orbit would remember “'+data.memoryOff.join('”, “')+'”, but its memory isn’t switched on yet.':'')});
  }catch(e){const problem=Problems.describe(e,'Orbit couldn’t answer right now.');window.Sounds?.play('error');log.push({role:'assistant',failed:true,text:problem.title,problem,retryText:question})}
  // The send button is disabled while Orbit thinks, which drops focus; bring it back to the message box.
  finally{busy=false;save();render();if(!panel.hidden)input.focus({preventScroll:true})}
 }

 // --- Showing replies. Model text is escaped; only **bold** and list lines are formatted. ---
 function format(text){
  const lines=escape(text).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').split('\n');let html='',inList=false;
  for(const line of lines){const item=line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);if(item){if(!inList){html+='<ul>';inList=true}html+='<li>'+item[1]+'</li>'}else{if(inList){html+='</ul>';inList=false}if(line.trim())html+='<p>'+line+'</p>'}}
  return html+(inList?'</ul>':'');
 }
 const cardOf=id=>{for(const [i,d] of state.days.entries()){const c=d.cards.find(c=>c.id===id);if(c)return {card:c,day:i}}return null};
 function describe(c){
  const name=c.cardId?'“'+(cardOf(c.cardId)?.card.title||'an activity')+'”':'“'+c.title+'”';
  if(c.op==='add')return `Add ${name} on ${dayLabel(c.day)} at ${c.start} (${span(c.duration)})`;
  if(c.op==='move')return `Move ${name} to ${dayLabel(c.day)} at ${c.start}`;
  if(c.op==='remove')return `Remove ${name} (its time becomes free time)`;
  const bits=[c.title&&'rename to “'+c.title+'”',c.duration&&'make it '+span(c.duration),c.category&&'set type to '+(CATS[c.category]?.label||c.category),c.notes&&'update the description',c.place&&'set the place to '+c.place.name].filter(Boolean);
  return `Change ${name}: ${bits.join(', ')}`;
 }
 // Notes Orbit saved (or replaced) on its own while answering; each saved one can be undone.
 function memoryChips(m,i){
  const chips=(m.memory||[]).map((n,j)=>n.status==='replaced'?`<li class="is-replaced">🐾 Updated: no longer “${escape(n.text)}”</li>`:n.status==='forgotten'?`<li class="is-replaced">🐾 Forgotten: “${escape(n.text)}”</li>`:`<li>🐾 Remembered: “${escape(n.text)}” <button type="button" data-orbit-forget="${i}:${j}"${n.busy?' disabled':''}>${n.busy?'Undoing…':'Undo'}</button>${n.error?`<span class="orbit-memory-error" role="alert">${escape(n.error)}</span>`:''}</li>`).join('');
  return (chips?`<ul class="orbit-memory-list">${chips}</ul>`:'')+(m.memoryNote?`<p class="orbit-memory-note">${escape(m.memoryNote)}</p>`:'');
 }
 function render(){
  const intro=`<div class="orbit-msg orbit-bot"><p>Oh, hello. I’m Orbit 🫏 I can map your stops, find fun places nearby and tweak your plan — I always ask first. <a href="${MEMORY_URL}" target="_blank" rel="noopener noreferrer">What I remember ↗</a></p><div class="orbit-ideas">${IDEAS.map(q=>`<button type="button" data-orbit-ask="${escape(q)}">${escape(q)}</button>`).join('')}</div></div>`;
  list.innerHTML=intro+log.map((m,i)=>m.role==='user'?`<div class="orbit-msg orbit-me">${format(m.text)}</div>`:`<div class="orbit-msg orbit-bot${m.failed?' orbit-failed':''}">${m.problem?Problems.html(m.problem,(m.problem.retry&&m.retryText&&i===log.length-1?`<button type="button" data-orbit-retry="${i}">Try again</button>`:'')+(m.problem.code==='ROOM'?'<button type="button" data-orbit-share>Turn on Orbit</button>':'')):format(m.text)}${m.needsShare?'<button type="button" class="orbit-share" data-orbit-share>Turn on Orbit</button>':''}${m.map?.points?.length?`<div class="orbit-map" data-orbit-map="${i}" role="img" aria-label="${escape(m.map.title||'Map')}"></div>`:''}${m.places?.length?`<ul class="orbit-places">${m.places.map(p=>`<li><div><strong>${escape(p.name)}</strong>${Number.isFinite(p.rating)?` <span class="orbit-rating">★ ${p.rating.toFixed(1)}</span>`:''}${p.why?`<small>${escape(p.why)}</small>`:''}</div><div class="orbit-place-actions"><a href="${escape(maps(p))}" target="_blank" rel="noopener noreferrer">Map ↗</a><button type="button" data-orbit-ask="${escape('Add '+p.name+' to our plan at a good time')}">Add</button></div></li>`).join('')}</ul>`:''}${memoryChips(m,i)}${m.changes?`<div class="orbit-changes"><strong>${escape(m.changeSummary||'Suggested changes')}</strong><ul>${m.changes.map(c=>`<li>${escape(describe(c))}</li>`).join('')}</ul>${m.status?`<p class="orbit-change-status">${escape(m.status)}${m.undoAt&&m.undoAt===history.length?` <button type="button" data-orbit-undo="${i}">Undo</button>`:''}</p>`:`<div class="orbit-change-actions"><button type="button" class="primary" data-orbit-apply="${i}">Apply changes</button><button type="button" data-orbit-decline="${i}">Not now</button></div>`}</div>`:''}</div>`).join('')+(busy?'<div class="orbit-msg orbit-bot orbit-thinking" role="status"><span class="orbit-dots" aria-hidden="true"><i></i><i></i><i></i></span> Orbit is sniffing around…</div>':'');
  el('orbitChatSend').disabled=busy;
  for(const box of list.querySelectorAll('[data-orbit-map]'))drawMap(box,log[Number(box.dataset.orbitMap)].map);
  list.scrollTop=list.scrollHeight;
 }
 list.addEventListener('click',e=>{
  const ask=e.target.closest('[data-orbit-ask]');if(ask){send(ask.dataset.orbitAsk);return}
  // Try again re-asks the same question in place of the failed exchange.
  const retry=e.target.closest('[data-orbit-retry]');if(retry&&!busy){const i=Number(retry.dataset.orbitRetry),m=log[i];if(m?.retryText){log.splice(log[i-1]?.role==='user'&&log[i-1].text===m.retryText?i-1:i,log[i-1]?.text===m.retryText?2:1);send(m.retryText)}return}
  const forget=e.target.closest('[data-orbit-forget]');if(forget){forgetNote(forget.dataset.orbitForget);return}
  const apply=e.target.closest('[data-orbit-apply]');if(apply){applyChanges(Number(apply.dataset.orbitApply));return}
  // Undo here only while Orbit's change is still the latest one, so it never reverses something else.
  const undo=e.target.closest('[data-orbit-undo]');if(undo){const m=log[Number(undo.dataset.orbitUndo)];if(m.undoAt===history.length){undoChange();m.status='Undone.';delete m.undoAt;save();render()}return}
  const decline=e.target.closest('[data-orbit-decline]');if(decline){const m=log[Number(decline.dataset.orbitDecline)];m.status='Not applied.';save();render()}
 });

 // Undo removes the note from orbit-knowledge.md again.
 async function forgetNote(key){
  const [i,j]=key.split(':').map(Number),note=log[i]?.memory?.[j];if(!note||note.busy)return;const {roomId,roomKey}=room();
  note.busy=true;note.error='';render();
  try{
   const [config,app]=await settings();
   const response=await fetch(config.chatUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:app.supabaseKey},body:JSON.stringify({action:'forget',roomId,roomKey,note:note.text}),signal:AbortSignal.timeout(30000),referrerPolicy:'no-referrer'});
   let data;try{data=await response.json()}catch{throw Error('Orbit couldn’t update its memory right now.')}
   if(!response.ok)throw Problems.fromResponse(response,data,'Orbit couldn’t update its memory right now.');
   note.status='forgotten';
  }catch(e){const p=Problems.describe(e,'Orbit couldn’t update its memory right now.');note.error=p.title+(p.fix?' '+p.fix:'')}
  finally{note.busy=false;save();render()}
 }
 // --- Small maps inside replies. ---
 async function drawMap(box,data){
  if(typeof L==='undefined'){box.remove();return}
  const [config]=await settings();
  const map=L.map(box,{zoomControl:false,attributionControl:true,scrollWheelZoom:false});
  L.tileLayer(config.tileUrl||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  const points=data.points.filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon));
  points.forEach((p,i)=>{
   const icon=L.divIcon({className:'',html:`<span class="orbit-pin ${p.kind==='suggestion'?'is-idea':''}">${p.kind==='suggestion'?'★':i+1}</span>`,iconSize:[26,26],iconAnchor:[13,13]});
   L.marker([p.lat,p.lon],{icon,title:p.name}).addTo(map).bindPopup(`<strong>${escape(p.name)}</strong>${p.note?'<br>'+escape(p.note):''}<br><a href="${escape(maps(p))}" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a>`);
  });
  if(points.length===1)map.setView([points[0].lat,points[0].lon],14);else map.fitBounds(points.map(p=>[p.lat,p.lon]),{padding:[24,24],maxZoom:15});
 }

 // --- Applying changes, only after the person approves. All of them land as one undoable step. ---
 function placeFrom(p){
  if(!p)return undefined;
  const place={...p,checked:new Date().toISOString().slice(0,10),bookingNote:'Booking requirement not confirmed yet.'};
  if(!place.source)place.source=place.googleUrl||'https://www.google.com/maps';
  return valid(place)?place:undefined;
 }
 const freeTime=duration=>({id:crypto.randomUUID(),title:'A little breathing room',notes:'',category:'break',duration});
 function run(target,changes){
  for(const c of changes){
   const find=id=>{for(const d of target.days){const i=d.cards.findIndex(x=>x.id===id);if(i>=0)return {d,i}}throw Error('One of the activities Orbit mentioned no longer exists.')};
   const [h,m]=String(c.start||'').split(':').map(Number),start=h*60+m;
   if(c.op==='add'){
    const card={id:crypto.randomUUID(),title:c.title,notes:c.notes||'',category:CATS[c.category]?c.category:'kids',duration:c.duration};const place=placeFrom(c.place);if(place)card.place=place;
    const d=target.days[c.day];d.cards=placement(d,card,start);
   }else if(c.op==='remove'){const {d,i}=find(c.cardId);d.cards.splice(i,1,freeTime(d.cards[i].duration))}
   else if(c.op==='move'){const {d,i}=find(c.cardId),card=d.cards[i];d.cards.splice(i,1,freeTime(card.duration));const to=target.days[c.day];to.cards=placement(to,card,start)}
   else if(c.op==='update'){const {d,i}=find(c.cardId),card=d.cards[i];if(c.title)card.title=c.title;if(c.notes)card.notes=c.notes;if(c.duration)card.duration=c.duration;if(c.category&&CATS[c.category])card.category=c.category;const place=placeFrom(c.place);if(place)card.place=place}
  }
 }
 function applyChanges(index){
  const m=log[index];if(!m?.changes||m.status)return;
  if(el('editor').open){notify('Close the activity editor first, then tap Apply again.',{error:true});return}
  // The app remembers the last card opened in the editor; with the editor closed it must not count as "being edited".
  editing=null;
  // Try on a copy first so a clash is explained instead of half-applied.
  try{const copy=structuredClone(state);run(copy,m.changes);validate(copy)}
  catch(e){m.status='Couldn’t apply: '+(e.message&&e.message!=='Invalid trip'?e.message:'the plan wouldn’t be valid.')+' Ask Orbit for another time.';save();render();return}
  const changedDay=m.changes.find(c=>Number.isInteger(c.day))?.day;
  const ok=mutate(()=>{run(state,m.changes);if(Number.isInteger(changedDay))day=changedDay});
  m.status=ok?'✓ Applied.':'Couldn’t apply these changes.';if(ok){m.undoAt=history.length;window.Sounds?.play('sparkle')}save();render();
 }
 window.orbitChat={open,close,send};
})();
