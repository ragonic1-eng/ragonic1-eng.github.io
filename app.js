const CATS={kids:{label:'Kids & play',icon:'♧',color:'#ad6e99',paper:'#fbddee'},food:{label:'Food & treats',icon:'♨',color:'#b57294',paper:'#ffe6f2'},hotel:{label:'Stay & unwind',icon:'☾',color:'#9674b7',paper:'#eee2fb'},travel:{label:'Getting around',icon:'➤',color:'#648eb8',paper:'#dff1ff'},shopping:{label:'Shopping',icon:'♧',color:'#ac739f',paper:'#f7ddf5'},break:{label:'Breathing room',icon:'☁',color:'#7f87b2',paper:'#e8eaff'}};
const BRANCH_TYPES={booking:{label:'Booking',icon:'⌑',done:'Booked / confirmed'},bring:{label:'Bring',icon:'♧',done:'Packed / ready'},prepare:{label:'Prepare',icon:'☑',done:'Prepared'},note:{label:'Note',icon:'✎',done:'Reviewed'}};
let branchActivity=null,branchEditing=null,movingActivity=null;
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,original,day=0,filter='all',drag=null,editing=null,history=[],historyDays=[],toastTimer;
const total=d=>d.cards.reduce((n,c)=>n+c.duration,0), fmt=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`, timeval=v=>{const [h,m]=v.split(':').map(Number);return h*60+m}, duration=n=>n>=60?`${Math.floor(n/60)}h${n%60?' '+n%60+'m':''}`:`${n}m`, uid=()=>crypto.randomUUID();
const reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateElement(el,frames,options){if(el&&!reducedMotion()&&el.animate)el.animate(frames,options)}
function dismissToast(){const toast=$('toast');if(toast.contains(document.activeElement))document.activeElement.blur();toast.classList.remove('show')}
function notify(msg,options={}){
 if(options.error)window.Sounds?.play('error');
 const toast=$('toast');toast.replaceChildren();toast.dataset.kind=options.error?'error':'success';
 const label=document.createElement('span');label.textContent=(options.error?'! ':'✓ ')+msg;toast.append(label);
 for(const action of options.actions??(options.action?[options.action]:[])){const button=document.createElement('button');button.type='button';button.textContent=action.label;button.onclick=()=>{dismissToast();action.run()};toast.append(button)}
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Dismiss message');close.onclick=dismissToast;toast.append(close);
 toast.classList.add('show');clearTimeout(toastTimer);if(!options.error)toastTimer=setTimeout(()=>toast.classList.remove('show'),6500);
 animateElement(toast,[{transform:'translateY(12px)',opacity:0},{transform:'translateY(0)',opacity:1}],{duration:180,easing:'ease-out'});
}
function persist(){try{localStorage.setItem('little-orbit-v1',JSON.stringify(state));$('saveStatus').textContent='● Saved on this device';window.orbitSync?.queue();return true}catch(e){$('saveStatus').textContent='Not saved — export your trip';notify('This browser could not save your changes. Export a backup to keep them.',{error:true,action:{label:'Export backup',run:()=>$('export').click()}});return false}}
function describeChange(before){
 const previous=before.days.flatMap(d=>d.cards),current=state.days.flatMap(d=>d.cards);
 const realAdded=current.find(c=>c.category!=='break'&&!previous.some(p=>p.id===c.id));if(realAdded)return `Added “${realAdded.title}” to your day.`;
 const realRemoved=previous.find(c=>c.category!=='break'&&!current.some(p=>p.id===c.id));if(realRemoved)return `Removed “${realRemoved.title}”.`;
 for(let n=0;n<state.days.length;n++){
  const moved=state.days[n].cards.find(c=>previous.some(p=>p.id===c.id)&&!before.days[n].cards.some(p=>p.id===c.id));
  if(moved)return `Moved “${moved.title}” to Day ${n+1}.`;
 }
 const changed=current.find(c=>c.category!=='break'&&JSON.stringify(c)!==JSON.stringify(previous.find(p=>p.id===c.id)));
 if(changed){const old=previous.find(p=>p.id===changed.id);return old.duration!==changed.duration?`“${changed.title}” is now ${duration(changed.duration)}. Later times updated.`:`Updated “${changed.title}”.`}
 const reordered=state.days.find((d,i)=>d.cards.map(c=>c.id).join()!==before.days[i].cards.map(c=>c.id).join());
 return reordered?'Card moved. The order and times are updated.':'Your day has been updated.';
}
function mutate(fn){
 const before=structuredClone(state),beforeDay=day,positions=new Map([...document.querySelectorAll('.timeline-row')].map(r=>[r.dataset.id,r.getBoundingClientRect()]));
 const active=document.activeElement,row=active?.closest('.timeline-row'),focusId=row?.dataset.id,action=active?.dataset.action;
 const expanded=[...document.querySelectorAll('.timeline-row')].map(r=>({id:r.dataset.id,details:[...r.querySelectorAll('details')].map(el=>el.open)}));
 try{fn();validate(state)}catch(e){state=before;day=beforeDay;notify('This change could not be applied. Keep each day to 200 cards and use valid times and durations.',{error:true});return false}
 history.push(JSON.stringify(before));historyDays.push(beforeDay);if(history.length>40){history.shift();historyDays.shift()}const saved=persist();render();
 for(const old of expanded){const r=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===old.id);r?.querySelectorAll('details').forEach((el,i)=>el.open=old.details[i]??el.open)}
 for(const r of document.querySelectorAll('.timeline-row')){
  const old=positions.get(r.dataset.id),box=r.getBoundingClientRect();
  if(old){const delta=old.top-box.top;if(Math.abs(delta)>1)animateElement(r,[{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:280,easing:'cubic-bezier(.2,.7,.3,1)'});}
  else animateElement(r,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:240,easing:'ease-out'});
 }
 const changed=state.days[day].cards.find(c=>JSON.stringify(c)!==JSON.stringify(before.days[day].cards.find(p=>p.id===c.id))),targetId=changed?.id??focusId;
 const target=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===targetId);target?.classList.add('just-updated');setTimeout(()=>target?.classList.remove('just-updated'),1400);
 if(focusId&&!$('editor').open&&!$('branchEditor').open&&!$('moveEditor').open){const current=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===focusId);const focus=current?.querySelector(`[data-action="${action}"]:not(:disabled)`)??current?.querySelector('.activity')??document.querySelector('.activity')??$('new');focus.focus({preventScroll:true});if(action==='up'||action==='down')focus.scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'})}
 window.Sounds?.changed();if(saved)notify(describeChange(before),{action:{label:'Undo',run:undoChange}});
 return true;
}
function undoChange(){if(!history.length)return;window.Sounds?.play('undo');state=JSON.parse(history.pop());day=historyDays.pop()??day;const saved=persist();render();if(saved)notify('Last change undone. Your previous plan is restored.');animateElement($('timeline'),[{opacity:.5},{opacity:1}],{duration:180})}
function clearFormError(form){form.querySelectorAll('[aria-invalid="true"]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby')});const error=form.querySelector('.form-error');if(error){error.hidden=true;error.textContent=''}}
function formError(form,message,field){const error=form.querySelector('.form-error');error.textContent=message;error.hidden=false;if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',error.id);field.focus()}error.scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'});animateElement(error,[{transform:'translateX(-4px)'},{transform:'translateX(4px)'},{transform:'translateX(0)'}],{duration:180});return false}
function validateActivityForm(){
 const form=$('form');clearFormError(form);
 if(!$('title').value.trim())return formError(form,'What would you like to do? Add a short activity name, then try again.',$('title'));
 if($('title').value.trim().length>150)return formError(form,'Keep the activity name under 150 characters. Use the description for extra details.',$('title'));
 if(!Number.isInteger(Number($('duration').value))||Number($('duration').value)<1||Number($('duration').value)>1440)return formError(form,'Enter a duration from 1 to 1440 minutes, such as 40 for the airport drive.',$('duration'));
 if(!$('activityStart').value)return formError(form,'Choose a start time so we can place this activity in your day.',$('activityStart'));
 if(!scheduleHint()){formError(form,$('scheduleHint').textContent,$('activityStart'));const suggestion=$('scheduleActions').querySelector('button:not(:disabled)');if(suggestion){const show=document.createElement('button');show.type='button';show.textContent='Show suggested times';show.onclick=()=>{suggestion.scrollIntoView({block:'center',behavior:reducedMotion()?'auto':'smooth'});suggestion.focus({preventScroll:true})};$('activityError').append(show)}return false;}
 return true;
}
function dateLabel(d,opts){return new Date(d.date+'T12:00:00').toLocaleDateString('en-SG',opts)}
function render(){
 try{localStorage.setItem('little-orbit-day',String(day))}catch{}
 scheduleUpdateBanner();window.travelTidy?.banner();
 $('days').innerHTML=state.days.map((d,i)=>`<button class="day-tab ${i===day?'active':''}" data-day="${i}" aria-current="${i===day?'date':'false'}"><span>DAY ${i+1} · ${dateLabel(d,{weekday:'short'}).toUpperCase()}</span><b>${dateLabel(d,{day:'numeric',month:'short'})}</b><small>${esc(d.region)}</small><span class="day-count">${d.cards.filter(c=>c.category!=='break').length} activities · ${duration(total(d))}</span></button>`).join('');
 const d=state.days[day], used=total(d), available=d.end-d.start, free=available-used;
 $('budgetSummary').textContent=fmt(d.start)+'–'+fmt(d.end)+' · '+duration(used)+' planned';
 $('dayDate').textContent=`DAY ${day+1} · ${dateLabel(d,{weekday:'long',day:'numeric',month:'long'}).toUpperCase()}`;$('dayTitle').textContent=d.name;$('dayRegion').textContent='⌖ '+d.region;
 $('start').value=fmt(d.start);$('end').value=fmt(d.end);$('planned').textContent=duration(used)+' planned';$('remaining').textContent=free>=0?duration(free)+' of breathing room':duration(-free)+' over your day';$('remaining').className=free<0?'warning':'';
 $('budgetBar').innerHTML=Object.entries(CATS).map(([key,cat])=>{const mins=d.cards.filter(c=>c.category===key).reduce((n,c)=>n+c.duration,0);return `<span title="${cat.label}: ${duration(mins)}" style="width:${mins/Math.max(available,used)*100}%;background:${cat.color}"></span>`}).join('');
 let cursor=d.start;$('timeline').innerHTML=d.cards.map((c,i)=>{const start=cursor;cursor+=c.duration;return compactCard(d,c,i,start,cursor)}).join('')||'<p class="empty">Add your first activity to start the day.</p>';
 const earlier=document.createElement('button');earlier.className='add-earlier';earlier.textContent='＋ Add an earlier activity';earlier.onclick=()=>{openEditor(null,0);$('activityStart').value=fmt(Math.max(0,d.start-60));scheduleHint();$('activityStart').focus()};$('timeline').prepend(earlier);
 $('undo').disabled=!history.length;$('mobileUndo').disabled=!history.length;renderLibrary();updateTripClock();revealSelectedDay();$('mobileSaveStatus').textContent=$('saveStatus').textContent;
 window.orbitMap?.refresh();window.orbitPlaces?.dayGuides?.();
}
// Drives between stops ("Drive Dahu → Puli") show as slim travel rows; flights, airport transfers and pick-ups stay cards.
function isLeg(c){if(!c||c.category!=='travel'||c.place)return false;if(typeof c.leg==='boolean')return c.leg;return !/airport|flight|\bEVA\b|\bBR ?\d|transfer|driver|wake|check|pit stop/i.test(c.title)&&/(^|\s)(drive|depart|regroup)\b|→|\bto\b/i.test(c.title)}
function compactCard(d,c,i,start,end){const cat=CATS[c.category];return `<div class="timeline-row${isLeg(c)?' is-leg mode-'+esc(c.mode||'drive'):''}" data-id="${esc(c.id)}" data-start="${start}" data-end="${end}" style="--cat:${cat.color};--card-bg:${cat.paper}"><div class="time"><button data-action="edit" class="time-edit" aria-label="Change start time for ${esc(c.title)}">${fmt(start)}</button><small>${fmt(end)}</small></div><article class="activity" draggable="${matchMedia('(pointer:fine)').matches?'true':'false'}" data-id="${esc(c.id)}" tabindex="0" aria-label="${esc(c.title)}"><div class="card-timing"><div><span class="timing-label">Start</span><button type="button" class="card-start" data-action="edit" aria-label="Change start time for ${esc(c.title)}">${fmt(start)}</button>${start>=1440?'<small>Next day</small>':''}</div><div><span class="timing-label">Finish</span><strong>${fmt(end)}</strong>${end>=1440?'<small>Next day</small>':''}</div><div><span class="timing-label">Duration</span><strong class="timing-duration">${duration(c.duration)}</strong></div></div><div class="card-top"><div class="card-main"><h3>${esc(c.title)}</h3></div><button type="button" class="drag-handle" data-action="drag" aria-label="Drag to reorder ${esc(c.title)}" title="Drag to reorder; tap for move options"><span aria-hidden="true">⠿</span><small>Drag</small></button></div><p class="activity-status"></p><details class="activity-more"><summary aria-label="Details and actions for ${esc(c.title)}">Details</summary><div class="card-meta"><span class="category">${cat.label}</span>${c.optional?'<span class="optional-badge">Optional idea</span>':''}</div>${window.orbitPlaces?.card(c)??''}<div class="card-primary"><button data-action="edit" aria-label="Edit activity">✎ Edit</button><button class="branch-add" data-action="branch" aria-label="Add branch">＋ Reminder</button><button class="delete-button" data-action="remove" aria-label="Delete activity">🗑 Delete</button></div><details class="card-details" open><summary>✎ Your notes</summary><p class="card-notes">${esc(c.notes)||'Your own reminders, meeting points or plans. Orbit never writes here.'}</p><button type="button" class="text-button" data-action="description">${c.notes?'Edit your notes':'Add your notes'}</button></details><details class="card-more"><summary>Move, reorder or change length</summary><div class="card-actions"><button data-action="up" aria-label="Move earlier" ${i===0?'disabled':''}>↑ Earlier</button><button data-action="down" aria-label="Move later" ${i===d.cards.length-1?'disabled':''}>↓ Later</button><button data-action="move" aria-label="Move card">↗ Move</button></div><div class="card-bottom"><div class="duration"><button data-action="less" aria-label="Reduce duration by 15 minutes" ${c.duration<=1?'disabled':''}>−</button><span>${duration(c.duration)}</span><button data-action="more" aria-label="Increase duration by 15 minutes" ${c.duration>=1440?'disabled':''}>＋</button></div><select class="move-select" data-move="${esc(c.id)}" aria-label="Move activity to another day"><option value="">Move to day…</option>${state.days.map((_,j)=>j!==day?`<option value="${j}">Day ${j+1} · ${dateLabel(state.days[j],{day:'numeric',month:'short'})}</option>`:'').join('')}</select></div></details>${renderBranches(c)}${nextActivityLink(d,i)}</details></article><button class="insert-here" data-insert="${i+1}">＋ Add here · ${fmt(end)}</button></div>`}
function renderLibrary(){const q=$('search').value.toLowerCase();$('filters').innerHTML=[['all','✧ Everything'],...Object.entries(CATS).map(([k,v])=>[k,v.icon+' '+v.label])].map(([k,v])=>`<button data-filter="${k}" aria-pressed="${filter===k}" class="${filter===k?'active':''}">${v}</button>`).join('');
 const cards=original.days.flatMap(d=>d.cards).filter(c=>c.category!=='break').filter(c=>(filter==='all'||filter===c.category)&&(c.title+' '+c.notes).toLowerCase().includes(q));$('libraryCount').textContent=cards.length+' IDEAS';$('library').innerHTML=cards.map(c=>{const cat=CATS[c.category];return `<div class="idea" draggable="true" data-library="${c.id}" style="--cat:${cat.color};--card-bg:${cat.paper}"><span class="cat-icon">${cat.icon}</span><div><h3>${esc(c.title)}</h3><small>${cat.label} · ${duration(c.duration)}</small></div><button data-add="${c.id}" aria-label="Add ${esc(c.title)}">＋</button></div>`}).join('')||'<p class="empty">No matching ideas. Try another search.</p>'}
function nextActivityLink(d,index){const next=d.cards.slice(index+1).find(c=>c.category!=='break');if(!next)return '<p class="next-stop">☾ Last activity of the day</p>';return `<button class="next-stop" data-next="${esc(next.id)}">Up next · ${fmt(slotTime(d,d.cards.indexOf(next)))} · ${esc(next.title)} ↓</button>`}
function slotTime(d,index){return d.start+d.cards.slice(0,index).reduce((n,c)=>n+c.duration,0)}
function defaultStart(d){
 let cursor=d.start;
 for(const c of d.cards){if(c.category==='break'&&cursor<1440)return cursor;cursor+=c.duration}
 return cursor<1440?cursor:d.start;
}
function openEditor(card,insertIndex){
 editing=card?.id??null;
 $('editorTitle').textContent=card?'Edit activity':'Add an activity';$('activityExtras').open=false;
 $('title').value=card?.title??'';$('duration').value=card?.duration??60;
 $('activityDay').innerHTML=state.days.map((d,i)=>`<option value="${i}">${dateLabel(d,{weekday:'short',day:'numeric',month:'short'})}</option>`).join('');
 $('activityDay').value=day;
 const d=state.days[day],index=card?d.cards.findIndex(c=>c.id===card.id):insertIndex??d.cards.length;
 const start=card||insertIndex!==undefined?slotTime(d,index):defaultStart(d);
 $('activityStart').value=fmt(start);
 if(!card)$('duration').value=Math.min(60,1440-start);
 $('saveActivity').textContent=card?'Save changes ✦':'Add activity ✦';
 $('title').setCustomValidity('');clearFormError($('form'));
 $('category').innerHTML=Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
 $('driverTitle').value=card?.driverTitle??'';$('driverNotes').value=card?.driverNotes??'';
 $('category').value=card?.category??'kids';$('notes').value=card?.notes??'';$('optional').checked=card?.optional??false;
 window.orbitPlaces?.open(card);scheduleHint();$('editor').showModal();
}
// Insert at an explicit clock time. Free-time cards can split; scheduled activities are never silently truncated.
function placementBase(d){return d.cards.map(c=>c.id===editing?{id:uid(),title:'A little breathing room',notes:'',category:'break',duration:c.duration}:{...c})}
function placement(d,card,start){
 const cards=placementBase(d);
 if(!Number.isInteger(start)||start<0||start>=1440)throw Error('Choose a start time between 00:00 and 23:59.');
 if(start<d.start){
  const gap=d.start-start-card.duration;
  return [card,...(gap>0?[{id:uid(),title:'A little breathing room',notes:'',category:'break',duration:gap}]:[]),...cards];
 }
 let cursor=d.start;
 for(let i=0;i<cards.length;i++){
  const c=cards[i],end=cursor+c.duration;
  if(start===cursor&&c.category!=='break'){cards.splice(i,0,card);return cards}
  if(start>=cursor&&start<end){
   if(c.category!=='break')throw Error(`This overlaps “${c.title}”, which ends at ${fmt(end)}. Choose ${fmt(end)} or later, or shorten that card first.`);
   const before=start-cursor,after=Math.max(0,end-start-card.duration),pieces=[];
   if(before)pieces.push({...c,duration:before});pieces.push(card);
   if(after)pieces.push({...c,id:uid(),duration:after});
   cards.splice(i,1,...pieces);return cards;
  }
  cursor=end;
 }
 if(start>cursor)cards.push({id:uid(),title:'A little breathing room',notes:'Free time before your next activity.',category:'break',duration:start-cursor});
 cards.push(card);return cards;
}
function scheduleHint(){
 syncDurationControls();
 const target=Number($('activityDay').value),d=state.days[target],start=timeval($('activityStart').value),mins=Number($('duration').value);
 $('scheduleActions').replaceChildren();$('nextActivity').replaceChildren();
 const choice=$('placeBefore'),selected=choice.value;
 choice.innerHTML='<option value="">Choose an activity…</option>'+d.cards.filter(c=>c.id!==editing&&c.category!=='break').map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
 choice.value=selected;
 try{
  if(!Number.isInteger(mins)||mins<1||mins>1440)throw Error('How long will you stay? Enter 1–1440 minutes.');
  // Drive cards suggested by the travel check are previewed exactly as they will be saved.
  const id=editing??'preview',placed=placement(d,{id,title:$('title').value.trim()||'Your new activity',duration:mins},start),cards=window.orbitPlaces?.withTransfers?.(placed,id)??placed,previewStart=Math.min(d.start,start),finish=previewStart+total({cards});
  const begins=previewStart+cards.slice(0,cards.findIndex(c=>c.id===id)).reduce((n,c)=>n+c.duration,0),end=begins+mins;
  $('scheduleHint').textContent=`${dateLabel(d,{day:'numeric',month:'short'})} · ${fmt(begins)}–${fmt(end)}${end>=1440?' (next day)':''}. `+(begins>start?`Includes a ${duration(begins-start)} drive first. `:'')+(finish>d.end?`This puts your day ${duration(finish-d.end)} past wrap-up. You can still save, or shorten the visit.`:'There’s room for this in your day.');
  if(start<d.start)$('scheduleHint').textContent+=` Your day will now start at ${fmt(start)}; later activities keep their times when there’s room.`;
  $('scheduleHint').classList.toggle('warning',finish>d.end);
  const i=cards.findIndex(c=>c.id===(editing??'preview')),previous=cards.slice(0,i).findLast(c=>c.category!=='break'),next=cards.slice(i+1).find(c=>c.category!=='break');
  let clock=previewStart;window.orbitPlaces?.schedule({date:d.date,start:begins,end,index:i,stops:cards.map(c=>({card:c,start:clock,end:clock+=c.duration}))});
  const line=document.createElement('p');line.className='muted';line.textContent=previous?`After ${previous.title}`:'First activity of the day';$('nextActivity').append(line);
  const heading=document.createElement('strong');heading.textContent=next?`Up next · ${next.title}`:'Your last activity of the day';$('nextActivity').append(heading);
  const detail=document.createElement('p');
  if(next){const nextStart=slotTime({...d,start:previewStart,cards},cards.indexOf(next)),gap=nextStart-end;detail.textContent=`${fmt(nextStart)} · ${gap>0?duration(gap)+' break before it.':'Straight after this activity.'}`}
  else detail.textContent='Add another card later and it will appear here automatically.';
  $('nextActivity').append(detail);return true;
 }catch(e){
  $('scheduleHint').textContent=e.message;$('scheduleHint').classList.add('warning');
  window.orbitPlaces?.schedule(null);
  $('nextActivity').textContent='Choose a free time or a card’s start time to see what comes next.';
  let cursor=d.start;
  for(const c of placementBase(d)){
   const end=cursor+c.duration;
   if(start>cursor&&start<end&&c.category!=='break'){
    const button=document.createElement('button');button.type='button';button.textContent=`Start after this activity · ${fmt(end)}`;
    button.disabled=end>=1440;button.onclick=()=>{$('activityStart').value=fmt(end);clearFormError($('form'));scheduleHint()};$('scheduleActions').append(button);const before=document.createElement('button');before.type='button';before.textContent=`Insert before it · ${fmt(cursor)}`;before.onclick=()=>{$('activityStart').value=fmt(cursor);clearFormError($('form'));scheduleHint()};$('scheduleActions').append(before);break;
   }cursor=end;
  }
  return false;
 }
}
$('activityDay').onchange=()=>{const d=state.days[Number($('activityDay').value)];$('activityStart').value=fmt(defaultStart(d));scheduleHint()};
$('placeBefore').onchange=()=>{
 const d=state.days[Number($('activityDay').value)],cards=placementBase(d),index=cards.findIndex(c=>c.id===$('placeBefore').value);
 if(index<0)return;
 $('activityStart').value=fmt(slotTime({...d,cards},index));scheduleHint();
};
$('activityStart').oninput=$('duration').oninput=scheduleHint;
$('title').oninput=()=>$('title').setCustomValidity('');
$('jumpLibrary').onclick=()=>{$('search').scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'center'});$('search').focus({preventScroll:true})};
function addLibrary(id,index){const source=original.days.flatMap(d=>d.cards).find(c=>c.id===id);if(!source)return;const card={...structuredClone(source),id:uid()};if(mutate(()=>state.days[day].cards.splice(index??state.days[day].cards.length,0,card))&&!$('saveStatus').textContent.startsWith('Not saved'))notify(`Added “${card.title}” to your day.`,{actions:[{label:'View activity',run:()=>jumpToActivity(card.id)},{label:'Undo',run:undoChange}]});const button=[...$('library').querySelectorAll('[data-add]')].find(b=>b.dataset.add===id);button?.focus({preventScroll:true})}
$('days').onclick=e=>{const el=e.target.closest('[data-day]');if(el){day=Number(el.dataset.day);render();$('days').querySelector(`[data-day="${day}"]`).focus({preventScroll:true});animateElement($('timeline'),[{opacity:.35,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:180,easing:'ease-out'})}};
$('filters').onclick=e=>{const el=e.target.closest('[data-filter]');if(el){filter=el.dataset.filter;renderLibrary();$('filters').querySelector(`[data-filter="${filter}"]`).focus({preventScroll:true})}};$('search').oninput=renderLibrary;
$('library').onclick=e=>{const el=e.target.closest('[data-add]');if(el)addLibrary(el.dataset.add)};
$('timeline').onclick=e=>{const next=e.target.closest('[data-next]');if(next){const row=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===next.dataset.next);row?.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'center'});row?.querySelector('.activity')?.focus({preventScroll:true});return}const branchButton=e.target.closest('[data-branch-action]');if(branchButton){handleBranchAction(branchButton);return}const insert=e.target.closest('[data-insert]');if(insert)return openEditor(null,Number(insert.dataset.insert));const button=e.target.closest('[data-action]'),row=e.target.closest('[data-id]');if(!button||!row)return;const cards=state.days[day].cards,i=cards.findIndex(c=>c.id===row.dataset.id),c=cards[i];if(!c)return;const action=button.dataset.action;if(action==='drag'||action==='move')return openMove(c);if(action==='edit')return openEditor(c);if(action==='description'){openEditor(c);$('activityExtras').open=true;$('notes').focus();return}if(action==='branch')return openBranch(c);if(action==='remove')return openDelete(c);mutate(()=>{if(action==='less')c.duration=Math.max(1,c.duration-15);if(action==='more')c.duration=Math.min(1440,c.duration+15);if(action==='up'&&i>0)[cards[i],cards[i-1]]=[cards[i-1],cards[i]];if(action==='down'&&i<cards.length-1)[cards[i],cards[i+1]]=[cards[i+1],cards[i]]})};
$('timeline').onchange=e=>{if(!e.target.matches('[data-move]')||e.target.value==='')return;const id=e.target.dataset.move,target=Number(e.target.value);if(!mutate(()=>{const cards=state.days[day].cards,i=cards.findIndex(c=>c.id===id);state.days[target].cards.push(cards.splice(i,1)[0])})||$('saveStatus').textContent.startsWith('Not saved'))return;notify('Activity moved to Day '+(target+1)+'. The destination times are updated.',{actions:[{label:'View day',run:()=>{day=target;render();jumpToActivity(id)}},{label:'Undo',run:undoChange}]})};
for(const id of ['timeline','library']){$(id).addEventListener('dragstart',e=>{if(e.target.closest('button,input,select')){e.preventDefault();return}const lib=e.target.closest('[data-library]'),card=e.target.closest('.activity');if(!lib&&!card)return;drag=lib?{library:lib.dataset.library}:{id:card.dataset.id,day};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='move';card?.classList.add('dragging')});$(id).addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over'))})}
$('timeline').ondragover=e=>{e.preventDefault();document.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));e.target.closest('.timeline-row')?.classList.add('over')};$('timeline').ondrop=e=>{e.preventDefault();if(!drag)return;const row=e.target.closest('.timeline-row'),cards=state.days[day].cards;let index=row?cards.findIndex(c=>c.id===row.dataset.id):cards.length;const movedId=drag.id;if(drag.library)addLibrary(drag.library,index);else if(drag.id!==row?.dataset.id)mutate(()=>{const src=state.days[drag.day].cards,old=src.findIndex(c=>c.id===drag.id);if(old<0)return;const [card]=src.splice(old,1);if(src===cards&&old<index)index--;cards.splice(index,0,card)});const moved=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===movedId);moved?.classList.add('just-updated');setTimeout(()=>moved?.classList.remove('just-updated'),1400);drag=null};
$('new').onclick=$('addBottom').onclick=()=>openEditor();$('cancel').onclick=()=>$('editor').close();$('form').onsubmit=e=>{
 e.preventDefault();if(!validateActivityForm())return;
 const values={place:window.orbitPlaces?.value(),driverTitle:$('driverTitle').value.trim(),driverNotes:$('driverNotes').value.trim(),title:$('title').value.trim(),category:$('category').value,duration:Number($('duration').value),notes:$('notes').value,optional:$('optional').checked};
 if(!values.title){$('title').setCustomValidity('Give your activity a name.');$('title').reportValidity();return;}
 const target=Number($('activityDay').value),source=state.days.flatMap(d=>d.cards).find(c=>c.id===editing),card={...source,...values,id:editing??uid()};if(card.place===undefined)delete card.place;
 let cards;try{cards=placement(state.days[target],card,timeval($('activityStart').value));cards=window.orbitPlaces?.withTransfers?.(cards,card.id)??cards}catch(e){$('scheduleHint').textContent=e.message;return}
 const saved=mutate(()=>{if(editing)for(const d of state.days)d.cards=d.cards.filter(c=>c.id!==editing);state.days[target].cards=cards;state.days[target].start=Math.min(state.days[target].start,timeval($('activityStart').value));day=target});
 if(!saved)return formError($('form'),'This day could not accept the activity. Move or remove a card if the day already has 200 activities, then try again.',$('title'));
 if(saved){$('editor').close();const el=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===card.id);el?.classList.add('just-updated');setTimeout(()=>el?.classList.remove('just-updated'),1400);el?.querySelector('.activity')?.focus({preventScroll:true});el?.scrollIntoView({block:'nearest',behavior:reducedMotion()?'auto':'smooth'})}
};
for(const id of ['start','end'])$(id).onchange=()=>{const start=timeval($('start').value),end=timeval($('end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){render();notify('Wrap-up must be later than the day’s start. Choose a later wrap-up time.',{error:true,action:{label:'Fix wrap-up',run:()=>{ $('dayBudget').open=true;const options=$('dayBudget').closest('.trip-options');if(options)options.open=true;$('end').focus()}}});return}mutate(()=>Object.assign(state.days[day],{start,end}))};
$('fit').onclick=()=>{const d=state.days[day],over=total(d)-(d.end-d.start);if(over<=0)return notify('Your day already fits, with room to breathe.');const flexible=d.cards.filter(c=>!['travel','hotel'].includes(c.category)),capacity=flexible.reduce((n,c)=>n+Math.max(0,c.duration-15),0);if(capacity<over)return notify('There isn’t enough flexible time to shorten. Move an activity to another day or choose a later wrap-up.',{error:true,action:{label:'Adjust wrap-up',run:()=>{ $('dayBudget').open=true;const options=$('dayBudget').closest('.trip-options');if(options)options.open=true;$('end').focus()}}});if(!mutate(()=>{let left=over;while(left>0)for(const c of flexible){const reduce=Math.min(5,left,c.duration-15);if(reduce>0){c.duration-=reduce;left-=reduce}}})||$('saveStatus').textContent.startsWith('Not saved'))return;notify('Shortened flexible activities. Travel and hotel times kept.',{action:{label:'Undo',run:undoChange}})};
$('undo').onclick=undoChange;
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='taiwan-together.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Trip exported. Import this file on another device.')};
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw Error();const data=JSON.parse(await file.text());validate(data);if(mutate(()=>state=data)&&!$('saveStatus').textContent.startsWith('Not saved'))notify('Trip imported. Your previous plan is available with Undo.',{action:{label:'Undo',run:undoChange}})}catch{notify('This file could not be imported. Choose a Little Orbit JSON export smaller than 2 MB. Your current plan is unchanged.',{error:true,action:{label:'Choose another file',run:()=>$('import').click()}})}e.target.value=''};
function validate(s){if(!s||!Array.isArray(s.days)||s.days.length!==7)throw Error('Invalid trip');const ids=new Set();for(const d of s.days){if(typeof d.name!=='string'||typeof d.region!=='string'||!/^2026-12-\d\d$/.test(d.date)||!Number.isInteger(d.start)||!Number.isInteger(d.end)||d.start<0||d.end>1440||d.end<=d.start||!Array.isArray(d.cards)||d.cards.length>200)throw Error();for(const c of d.cards){if(typeof c.id!=='string'||ids.has(c.id)||typeof c.title!=='string'||typeof c.notes!=='string'||!Object.hasOwn(CATS,c.category)||!Number.isInteger(c.duration)||c.duration<1||c.duration>1440)throw Error();ids.add(c.id);if(c.place!==undefined&&!window.PlaceCore?.valid(c.place))throw Error();for(const field of ['driverTitle','driverNotes'])if(c[field]!==undefined&&typeof c[field]!=='string')throw Error();if(c.branches!==undefined){if(!Array.isArray(c.branches)||c.branches.length>100)throw Error();const branchIds=new Set();for(const b of c.branches){if(typeof b.id!=='string'||branchIds.has(b.id)||!Object.hasOwn(BRANCH_TYPES,b.type)||typeof b.title!=='string'||typeof b.notes!=='string'||typeof b.done!=='boolean'||typeof b.url!=='string'||(b.url&&!safeUrl(b.url)))throw Error();branchIds.add(b.id)}}}}}
for(const id of ['new','addBottom','fit','start','end','undo','import','export','share','mobileAdd','mobileNow','mobileUndo'])$(id).disabled=true;
$('timeline').innerHTML='<p class="empty" role="status">Loading your itinerary…</p>';
document.addEventListener('orbit-ready',()=>{for(const id of ['new','addBottom','fit','start','end','import','export','share','mobileAdd','mobileNow'])$(id).disabled=false});
(async()=>{try{const response=await fetch('trip.json',{cache:'no-cache'});if(!response.ok)throw Error();original=await response.json();for(const d of original.days){const cards=[];let cursor=d.start;for(const c of d.cards){if(c.originalStart>cursor)cards.push({id:'gap-'+c.id,title:'A little breathing room',category:'break',duration:c.originalStart-cursor,notes:'Unscheduled time from the original itinerary. Use it for a snack, rest, or getting to the next stop.',optional:false});cards.push(c);cursor=c.originalStart+c.duration}d.cards=cards}state=structuredClone(original);try{const selected=Number(localStorage.getItem('little-orbit-day'));if(Number.isInteger(selected)&&selected>=0&&selected<7)day=selected;const saved=localStorage.getItem('little-orbit-v1');if(saved){const parsed=JSON.parse(saved);validate(parsed);state=parsed;if(!location.hash&&addAirportMorning(state))persist()}}catch{notify('Saved trip could not be read. Original itinerary loaded.')}render();document.dispatchEvent(new Event('orbit-ready'))}catch{$('timeline').innerHTML='<div class="empty" role="alert"><p>We couldn’t load your itinerary. Check your connection, then try again. Your saved plan is still on this device.</p><button type="button" id="retryTrip">Try loading again</button></div>';$('retryTrip').onclick=()=>location.reload()}})();

// A newer bundled schedule (trip.json scheduleUpdate) is offered once per trip. Applying replaces only the listed days,
// syncs to a shared trip like any edit, and can be undone.
function scheduleUpdateBanner(){
 const box=$('scheduleUpdate'),u=original?.scheduleUpdate;let dismissed=false;
 try{dismissed=sessionStorage.getItem('little-orbit-update-dismissed')===String(u?.version)}catch{}
 if(!u||!state||(state.scheduleVersion||1)>=u.version||dismissed){box.hidden=true;return}
 box.hidden=false;box.innerHTML=`<p><strong>Your new schedule for ${esc(u.label)} is ready.</strong> Applying replaces those days with the updated plan${/room=/.test(location.hash)?' for everyone using this shared trip':''}. Other days stay as they are, and you can undo.</p><div class="schedule-update-actions"><button type="button" class="primary" id="applySchedule">Apply new schedule</button><button type="button" id="dismissSchedule">Not now</button></div>`;
 $('applySchedule').onclick=()=>{
  const first=state.days.findIndex(d=>d.date===u.dates[0]);
  if(!mutate(()=>{for(const date of u.dates){const i=state.days.findIndex(d=>d.date===date),fresh=original.days.find(d=>d.date===date);if(i>=0&&fresh)state.days[i]=structuredClone(fresh)}state.scheduleVersion=u.version}))return;
  if(first>=0&&day!==first){day=first;render()}
  notify(`Updated ${u.label} to your new schedule.`,{actions:[{label:'Undo',run:undoChange}]});
 };
 $('dismissSchedule').onclick=()=>{try{sessionStorage.setItem('little-orbit-update-dismissed',String(u.version))}catch{}box.hidden=true};
}
function addAirportMorning(s){
 if(s.airportMorningAdded)return false;
 const d=s.days.find(d=>d.date==='2026-12-07');
 s.airportMorningAdded=true;
 if(!d||d.start!==945||d.cards[0]?.id!=='activity-1-0')return false;
 d.start=750;d.cards.unshift(
 {id:'home-to-airport',title:'Leave home → Changi Airport',category:'travel',duration:40,notes:'',optional:false},
 {id:'airport-play-checkin',title:'Airport check-in & playtime with the kids',category:'kids',duration:155,notes:'',optional:false});
 return true;
}
function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:''}catch{return ''}}
function renderBranches(card){
 const branches=card.branches??[];
 if(!branches.length)return '';
 return `<details class="branches" open><summary>Activity branches <span>${branches.filter(b=>b.done).length}/${branches.length} ready</span></summary><div class="branch-tree">${branches.map(b=>{const type=BRANCH_TYPES[b.type];return `<div class="branch-node ${b.done?'branch-complete':''}"><input type="checkbox" data-branch-action="toggle" data-card="${esc(card.id)}" data-branch="${esc(b.id)}" ${b.done?'checked':''} aria-label="Mark ${esc(b.title)} ready"><div class="branch-content"><span class="branch-type">${type.icon} ${type.label} · ${b.done?'Ready':'To do'}</span><h4>${esc(b.title)}</h4>${b.notes?`<p>${esc(b.notes)}</p>`:''}${safeUrl(b.url)?`<a href="${esc(safeUrl(b.url))}" target="_blank" rel="noopener noreferrer">Open ${b.type==='booking'?'booking':'saved'} link ↗</a>`:''}</div><div class="branch-actions"><button data-branch-action="edit" data-card="${esc(card.id)}" data-branch="${esc(b.id)}" aria-label="Edit branch ${esc(b.title)}">Edit</button><button data-branch-action="remove" data-card="${esc(card.id)}" data-branch="${esc(b.id)}" aria-label="Remove branch ${esc(b.title)}">×</button></div></div>`}).join('')}</div></details>`;
}
function openBranch(card,branch){
 branchActivity=card.id;branchEditing=branch?.id??null;clearFormError($('branchForm'));$('branchUrl').setCustomValidity('');
 $('branchParent').textContent='Attached to '+card.title;
 $('branchEditorTitle').textContent=branch?'Edit activity branch':'Add an activity branch';
 $('branchType').value=branch?.type??'booking';$('branchTitle').value=branch?.title??'';$('branchNotes').value=branch?.notes??'';$('branchUrl').value=branch?.url??'';$('branchDone').checked=branch?.done??false;
 $('branchDoneLabel').textContent=BRANCH_TYPES[$('branchType').value].done;$('branchEditor').showModal();
}
function handleBranchAction(button){
 const card=state.days.flatMap(d=>d.cards).find(c=>c.id===button.dataset.card),branch=card?.branches?.find(b=>b.id===button.dataset.branch);if(!branch)return;
 const action=button.dataset.branchAction;
 if(action==='edit')return openBranch(card,branch);
 mutate(()=>{if(action==='toggle')branch.done=!branch.done;if(action==='remove')card.branches=card.branches.filter(b=>b.id!==branch.id)});

}
$('branchType').onchange=()=>{$('branchDoneLabel').textContent=BRANCH_TYPES[$('branchType').value].done};
$('branchCancel').onclick=()=>$('branchEditor').close();
$('branchForm').onsubmit=e=>{
 e.preventDefault();clearFormError($('branchForm'));const title=$('branchTitle').value.trim(),url=$('branchUrl').value.trim();if(!title)return formError($('branchForm'),'Give this reminder a short title so it’s easy to find.',$('branchTitle'));if(title.length>150)return formError($('branchForm'),'Keep the title to 150 characters; put longer details in the description.',$('branchTitle'));
 if(url&&!safeUrl(url))return formError($('branchForm'),'This link needs to start with https:// or http://, for example https://example.com.',$('branchUrl'));
 const card=state.days.flatMap(d=>d.cards).find(c=>c.id===branchActivity);if(!card)return;
 const values={id:branchEditing??uid(),type:$('branchType').value,title,notes:$('branchNotes').value,url,done:$('branchDone').checked};
 const saved=mutate(()=>{card.branches??=[];const i=card.branches.findIndex(b=>b.id===branchEditing);if(i<0)card.branches.push(values);else card.branches[i]=values});
 if(saved)$('branchEditor').close();else formError($('branchForm'),'This reminder could not be added. Each activity can hold up to 100 reminders; edit or remove an existing one first.',$('branchTitle'));
};
$('branchUrl').oninput=()=>$('branchUrl').setCustomValidity('');

// Singapore and Taiwan share UTC+8 year-round. Compare full dates, never just clock times.
function tripMidnight(d){return Date.parse(d.date+'T00:00:00+08:00')}
function jumpToActivity(id){const row=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===id);row?.scrollIntoView({behavior:reducedMotion()?'auto':'smooth',block:'center'});row?.querySelector('.activity')?.focus({preventScroll:true})}
function updateTripClock(now=Date.now()){
 if(!state)return;
 const d=state.days[day],base=tripMidnight(d),rows=[...document.querySelectorAll('.timeline-row')];
 let current=null,next=null;
 for(const row of rows){
  const begin=base+Number(row.dataset.start)*60000,end=base+Number(row.dataset.end)*60000;
  const past=now>=end,active=now>=begin&&now<end;
  row.classList.toggle('time-passed',past);row.classList.toggle('happening-now',active);
  const article=row.querySelector('.activity');if(active)article.setAttribute('aria-current','step');else article.removeAttribute('aria-current');
  row.querySelector('.activity-status').textContent=past?'Time passed':active?`Now · ${duration(Math.max(1,Math.ceil((end-now)/60000)))} remaining`:'Upcoming';
  if(active)current=row;
  if(!next&&begin>now)next=row;
 }
 $('livePlan').hidden=!(current||(now>=base&&now<base+86400000));
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now));
 $('tripClock').textContent=`${clock} · Singapore / Taiwan (UTC+8)`;
 const focus=current??next,heading=$('liveHeading'),detail=$('liveDetail');
 if(focus){
  const c=d.cards.find(c=>c.id===focus.dataset.id),start=Number(focus.dataset.start),end=Number(focus.dataset.end),wait=Math.ceil((base+start*60000-now)/60000);
  heading.textContent=`${current?'Now':'Up next'} · ${c.title}`;
  detail.textContent=`${fmt(start)}–${fmt(end)}${end>=1440?' · ends next day':''} · ${duration(c.duration)}`+(current?'':wait<=1440?` · starts in ${duration(wait)}`:` · ${dateLabel(d,{day:'numeric',month:'short'})}`);
  $('jumpCurrent').hidden=false;$('jumpCurrent').onclick=()=>jumpToActivity(focus.dataset.id);
 }else{heading.textContent=d.cards.length?'This day’s scheduled activities have ended':'Your day is open';detail.textContent='You can still read and edit every card below.';$('jumpCurrent').hidden=true}
 document.querySelectorAll('.timeline-row.up-next').forEach(r=>r.classList.remove('up-next'));
 if(next){next.classList.add('up-next');next.querySelector('.activity-status').textContent='Up next'}
}
try{$('fadePast').checked=localStorage.getItem('little-orbit-fade')!=='off'}catch{}
function applyFadePreference(){document.body.classList.toggle('fade-past',$('fadePast').checked)}
applyFadePreference();
$('fadePast').onchange=()=>{applyFadePreference();try{localStorage.setItem('little-orbit-fade',$('fadePast').checked?'on':'off')}catch{}};
setInterval(()=>updateTripClock(),15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateTripClock()});

// Immediate press feedback also works for dynamically rendered controls and keyboard activation.
document.addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;animateElement(button,[{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:160,easing:'ease-out'})},true);
for(const id of ['form','branchForm','moveForm'])$(id).addEventListener('input',e=>{if(e.target.matches('input,textarea,select'))clearFormError($(id))});
for(const id of ['editor','branchEditor','shareEditor','moveEditor'])$(id).addEventListener('toggle',()=>{if($(id).open)animateElement($(id),[{opacity:0,transform:'translateY(10px) scale(.98)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:180,easing:'ease-out'})});

$('toast').addEventListener('pointerenter',()=>clearTimeout(toastTimer));
$('toast').addEventListener('focusin',()=>clearTimeout(toastTimer));
for(const event of ['pointerleave','focusout'])$('toast').addEventListener(event,()=>{if($('toast').dataset.kind!=='error')toastTimer=setTimeout(()=>$('toast').classList.remove('show'),6500)});

function revealSelectedDay(){const tab=$('days').querySelector(`[data-day="${day}"]`);if(tab)$('days').scrollLeft=tab.offsetLeft-$('days').offsetLeft-8}
function openMove(card){
 movingActivity=card.id;clearFormError($('moveForm'));$('moveCardName').textContent=card.title;
 $('moveDay').innerHTML=state.days.map((d,i)=>`<option value="${i}">Day ${i+1} · ${dateLabel(d,{weekday:'short',day:'numeric',month:'short'})}</option>`).join('');
 $('moveDay').value=day;populateMovePositions();const cards=state.days[day].cards,index=cards.findIndex(c=>c.id===card.id);$('movePosition').value=cards[index+1]?.id??'';previewMove();$('moveEditor').showModal();
}
function populateMovePositions(){
 const d=state.days[Number($('moveDay').value)];$('movePosition').innerHTML='<option value="">At the end of the day</option>'+d.cards.filter(c=>c.id!==movingActivity).map(c=>`<option value="${esc(c.id)}">Before ${esc(c.title)}</option>`).join('');previewMove();
}
function previewMove(){
 const d=state.days[Number($('moveDay').value)],cards=d.cards.filter(c=>c.id!==movingActivity),card=state.days.flatMap(d=>d.cards).find(c=>c.id===movingActivity);if(!card)return;
 const next=cards.find(c=>c.id===$('movePosition').value),index=next?cards.indexOf(next):cards.length,start=slotTime({...d,cards},index),end=start+card.duration,finish=d.start+total({cards})+card.duration;
 $('movePreview').textContent=`Day ${Number($('moveDay').value)+1} · ${fmt(start)}–${fmt(end)}${end>=1440?' (next day)':''} · ${duration(card.duration)}. `+(next?`Up next: ${next.title}.`:'Last activity of the day.')+(finish>d.end?` This puts the day ${duration(finish-d.end)} past wrap-up.`:'');$('movePreview').classList.toggle('warning',finish>d.end);
}
$('moveDay').onchange=()=>{clearFormError($('moveForm'));populateMovePositions()};$('movePosition').onchange=previewMove;
$('moveForm').onsubmit=e=>{
 e.preventDefault();const source=state.days.find(d=>d.cards.some(c=>c.id===movingActivity)),target=Number($('moveDay').value),next=$('movePosition').value;
 if(!source)return formError($('moveForm'),'This card is no longer in the plan. Close this window and choose another card.',$('moveDay'));
 const card=source.cards.find(c=>c.id===movingActivity);
 if(source!==state.days[target]&&state.days[target].cards.length>=200)return formError($('moveForm'),'This day already has 200 cards. Choose another day or remove an activity first.',$('moveDay'));
 if(!mutate(()=>{source.cards=source.cards.filter(c=>c.id!==movingActivity);const cards=state.days[target].cards,index=cards.findIndex(c=>c.id===next);cards.splice(index<0?cards.length:index,0,card);day=target}))return formError($('moveForm'),'The move could not be applied. Choose another position and try again.',$('movePosition'));
 $('moveEditor').close();revealSelectedDay();jumpToActivity(card.id);const moved=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===card.id);moved?.classList.add('just-updated');setTimeout(()=>moved?.classList.remove('just-updated'),1400);
};
$('moveClose').onclick=$('moveCancel').onclick=()=>$('moveEditor').close();
$('activityCancel').onclick=()=>$('editor').close();$('branchBack').onclick=()=>$('branchEditor').close();
$('mobileAdd').onclick=()=>openEditor();$('mobileUndo').onclick=undoChange;
$('mobileNow').onclick=()=>{if(!$('jumpCurrent').hidden)$('jumpCurrent').click();else $('liveHeading').scrollIntoView({block:'center',behavior:reducedMotion()?'auto':'smooth'})};
const saveObserver=new MutationObserver(()=>{$('mobileSaveStatus').textContent=$('saveStatus').textContent});saveObserver.observe($('saveStatus'),{childList:true,characterData:true,subtree:true});$('mobileSaveStatus').textContent=state?$('saveStatus').textContent:'Loading itinerary…';
// Keep controls usable as the mobile keyboard opens, without locking page zoom.
function fitMobileDialogs(){const viewport=window.visualViewport;document.documentElement.style.setProperty('--usable-height',`${viewport?.height??innerHeight}px`);document.documentElement.style.setProperty('--keyboard-inset',`${Math.max(0,innerHeight-(viewport?.height??innerHeight)-(viewport?.offsetTop??0))}px`)}
window.visualViewport?.addEventListener('resize',fitMobileDialogs);window.visualViewport?.addEventListener('scroll',fitMobileDialogs);window.addEventListener('resize',fitMobileDialogs);fitMobileDialogs();

$('dayBudget').open=false;

if(matchMedia('(max-width:740px)').matches)$('ideaCollection').open=false;

// Pointer sorting works with touch, pen and mouse; the rest of each card keeps normal scrolling.
let pointerSort=null,sortFrame=0,suppressSortClickUntil=0;
function clearPointerSort(){
 const gesture=pointerSort;pointerSort=null;window.orbitDragging=false;cancelAnimationFrame(sortFrame);
 document.querySelectorAll('.drag-origin,.drop-day').forEach(el=>el.classList.remove('drag-origin','drop-day'));
 document.querySelectorAll('.sort-ghost,.sort-marker,.sort-status').forEach(el=>el.remove());
 if(gesture?.handle.hasPointerCapture(gesture.pointerId))gesture.handle.releasePointerCapture(gesture.pointerId);
 if(gesture?.article)requestAnimationFrame(()=>{if(gesture.article.isConnected)gesture.article.draggable=gesture.wasDraggable});
 return gesture;
}
function sortTarget(){
 const g=pointerSort;if(!g?.active)return;
 const say=text=>{if(g.status.textContent!==text)g.status.textContent=text};
 const hit=document.elementFromPoint(g.x,g.y),tab=hit?.closest('#days [data-day]');
 document.querySelectorAll('.drop-day').forEach(el=>el.classList.remove('drop-day'));
 if(tab){g.targetDay=Number(tab.dataset.day);g.beforeId=null;g.valid=true;tab.classList.add('drop-day');g.marker.hidden=true;say(`Release to move to Day ${g.targetDay+1}, at the end of the day.`);return}
 const bounds=$('timeline').getBoundingClientRect(),bottom=document.querySelector('.mobile-actions').getBoundingClientRect();
 const footerVisible=matchMedia('(max-width:740px)').matches;
 g.valid=g.x>=bounds.left&&g.x<=bounds.right&&g.y>=Math.max(0,bounds.top)&&g.y<=Math.min(innerHeight,footerVisible?bottom.top:innerHeight);
 if(!g.valid){g.marker.hidden=true;say('Drag over the list or a day tab to move. Release outside to cancel.');return}
 g.targetDay=g.sourceDay;const rows=[...$('timeline').querySelectorAll('.timeline-row')].filter(r=>r.dataset.id!==g.id);
 const before=rows.find(r=>{const b=r.getBoundingClientRect();return g.y<b.top+b.height/2});g.beforeId=before?.dataset.id??null;
 const edge=before?.getBoundingClientRect()??rows.at(-1)?.getBoundingClientRect()??bounds;
 g.marker.hidden=false;g.marker.style.left=bounds.left+'px';g.marker.style.width=bounds.width+'px';g.marker.style.top=(before?edge.top:edge.bottom)+'px';
 const next=state.days[g.sourceDay].cards.find(c=>c.id===g.beforeId);say(next?`Release before “${next.title}”.`:'Release at the end of the day.');
}
function sortTick(){
 const g=pointerSort;if(!g?.active)return;
 const tabs=$('days').getBoundingClientRect(),footer=matchMedia('(max-width:740px)').matches?document.querySelector('.mobile-actions').getBoundingClientRect().top:innerHeight;
 if(g.y>=tabs.top&&g.y<=tabs.bottom){if(g.x<tabs.left+35)$('days').scrollLeft-=8;if(g.x>tabs.right-35)$('days').scrollLeft+=8}
 else{const upper=Math.max(30,Math.min(tabs.bottom+35,innerHeight*.35)),lower=footer-55;
  if(g.y<upper&&g.y>0)window.scrollBy(0,-Math.min(14,(upper-g.y)*.24));else if(g.y>lower&&g.y<footer)window.scrollBy(0,Math.min(14,(g.y-lower)*.24));}
 g.ghost.style.transform=`translate(${g.x-g.offsetX+6}px,${g.y-g.offsetY-8}px)`;sortTarget();sortFrame=requestAnimationFrame(sortTick);
}
$('timeline').addEventListener('pointerdown',e=>{
 const handle=e.target.closest('.drag-handle');if(!handle||e.button!==0||pointerSort)return;
 const row=handle.closest('.timeline-row'),article=row.querySelector('.activity'),wasDraggable=article.draggable,box=article.getBoundingClientRect();article.draggable=false;
 pointerSort={handle,article,wasDraggable,pointerId:e.pointerId,id:row.dataset.id,sourceDay:day,targetDay:day,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,offsetX:e.clientX-box.left,offsetY:Math.min(e.clientY-box.top,95),active:false,valid:false};
 handle.setPointerCapture(e.pointerId);
});
$('timeline').addEventListener('pointermove',e=>{
 const g=pointerSort;if(!g||e.pointerId!==g.pointerId)return;g.x=e.clientX;g.y=e.clientY;
 if(!g.active&&Math.hypot(g.x-g.startX,g.y-g.startY)<7)return;
 if(!g.active){
  g.active=true;window.orbitDragging=true;dismissToast();const row=g.handle.closest('.timeline-row'),card=row.querySelector('.activity'),box=card.getBoundingClientRect();
  row.classList.add('drag-origin');g.ghost=card.cloneNode(true);g.ghost.className='activity sort-ghost';g.ghost.removeAttribute('data-id');g.ghost.setAttribute('aria-hidden','true');g.ghost.inert=true;g.ghost.querySelectorAll('details').forEach(el=>el.open=false);g.ghost.style.width=box.width+'px';g.ghost.style.setProperty('--card-bg',getComputedStyle(row).getPropertyValue('--card-bg')||getComputedStyle(card).backgroundColor);g.ghost.style.setProperty('--cat',getComputedStyle(row).getPropertyValue('--cat'));document.body.append(g.ghost);
  g.marker=document.createElement('div');g.marker.className='sort-marker';g.marker.textContent='';document.body.append(g.marker);
  g.status=document.createElement('div');g.status.className='sort-status';g.status.setAttribute('role','status');document.body.append(g.status);sortFrame=requestAnimationFrame(sortTick);
 }
 e.preventDefault();sortTarget();
});
$('timeline').addEventListener('pointerup',e=>{
 if(!pointerSort||e.pointerId!==pointerSort.pointerId)return;sortTarget();const g=clearPointerSort();if(!g.active)return;
 suppressSortClickUntil=Date.now()+500;
 requestAnimationFrame(()=>completePointerDrop(g));
});
function completePointerDrop(g){
 if(!g.valid)return notify('Move cancelled. Your plan is unchanged.');
 const source=state.days[g.sourceDay],target=state.days[g.targetDay],card=source.cards.find(c=>c.id===g.id);if(!card)return;
 const proposed=target.cards.filter(c=>c.id!==g.id),before=proposed.findIndex(c=>c.id===g.beforeId);proposed.splice(before<0?proposed.length:before,0,card);
 if(source===target&&proposed.every((c,i)=>c.id===source.cards[i].id))return;
 const applied=mutate(()=>{source.cards=source.cards.filter(c=>c.id!==g.id);state.days[g.targetDay].cards=proposed;day=g.targetDay});
 if(applied){revealSelectedDay();jumpToActivity(card.id);const row=[...$('timeline').querySelectorAll('.timeline-row')].find(r=>r.dataset.id===card.id);row?.classList.add('just-updated');setTimeout(()=>row?.classList.remove('just-updated'),1400)}
}
function cancelPointerSort(){const active=pointerSort?.active;clearPointerSort();if(active){suppressSortClickUntil=Date.now()+500;notify('Move cancelled. Your plan is unchanged.')}}
$('timeline').addEventListener('pointercancel',cancelPointerSort);
$('timeline').addEventListener('lostpointercapture',()=>{if(pointerSort)cancelPointerSort()});
$('timeline').addEventListener('contextmenu',e=>{if(e.target.closest('.drag-handle'))e.preventDefault()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pointerSort){e.preventDefault();cancelPointerSort()}});
window.addEventListener('blur',cancelPointerSort);
document.addEventListener('click',e=>{if(e.target.closest('.drag-handle')&&Date.now()<suppressSortClickUntil){e.preventDefault();e.stopImmediatePropagation()}},true);

function layoutTripControls(){const budget=$('dayBudget');if(matchMedia('(max-width:740px)').matches){document.querySelector('.trip-options .header-right').append(budget)}else $('planner').insertBefore(budget,$('livePlan'))}
window.addEventListener('resize',layoutTripControls);layoutTripControls();
// Commit thumb-bar taps on release, including the first tap after a drag gesture.
const quickBar=document.querySelector('.mobile-actions');let quickTouch=null,quickActivation=null;
quickBar.addEventListener('pointerdown',e=>{const button=e.target.closest('button');if(e.pointerType==='touch'&&button&&!button.disabled){e.preventDefault();quickTouch={button,id:e.pointerId,x:e.clientX,y:e.clientY}}});
quickBar.addEventListener('pointerup',e=>{const tap=quickTouch;quickTouch=null;if(!tap||e.pointerId!==tap.id||e.target.closest('button')!==tap.button||tap.button.disabled||Math.hypot(e.clientX-tap.x,e.clientY-tap.y)>8)return;quickActivation={button:tap.button,time:Date.now()};e.preventDefault();tap.button.click()});
quickBar.addEventListener('pointercancel',()=>quickTouch=null);
quickBar.addEventListener('click',e=>{if(e.isTrusted&&e.detail>0&&quickActivation?.button===e.target.closest('button')&&Date.now()-quickActivation.time<700){e.preventDefault();e.stopImmediatePropagation()}},true);
document.addEventListener('click',e=>{const menu=document.querySelector('.trip-options');if(menu.open&&!menu.contains(e.target))menu.open=false});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))document.querySelector('.trip-options').open=false});

function friendlyClock(mins){const hour=Math.floor(mins/60)%24;return `${hour%12||12}:${String(mins%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`}
function syncDurationControls(){
 const mins=Number($('duration').value),valid=Number.isInteger(mins)&&mins>=1&&mins<=1440,start=timeval($('activityStart').value);
 $('durationWords').textContent=valid?`${Math.floor(mins/60)?Math.floor(mins/60)+(mins>=120?' hours':' hour'):''}${mins>=60&&mins%60?' ':''}${mins%60?mins%60+(mins%60===1?' minute':' minutes'):''}${Number.isInteger(start)?' · finishes '+friendlyClock(start+mins)+(start+mins>=1440?' next day':''):''}`:'Choose how long this activity lasts.';
 $('durationLess').disabled=valid&&mins===1;$('durationMore').disabled=valid&&mins===1440;
 document.querySelectorAll('[data-duration-preset]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.durationPreset)===mins)));
 $('inputTimePreview').textContent=Number.isInteger(start)?friendlyClock(start)+' · local time (UTC+8)':'Choose a time, including AM or PM.';
}
function chooseDuration(value){$('duration').value=Math.max(1,Math.min(1440,value));$('duration').dispatchEvent(new Event('input',{bubbles:true}))}
$('durationPresets').onclick=e=>{const button=e.target.closest('[data-duration-preset]');if(button)chooseDuration(Number(button.dataset.durationPreset))};
$('durationLess').onclick=()=>chooseDuration((Number($('duration').value)||0)-15);$('durationMore').onclick=()=>chooseDuration((Number($('duration').value)||0)+15);

$('driverView').onclick=()=>{$('driverView').href='driver.html'+location.hash};

// The reorder tip shows until it is dismissed on this device.
try{if(localStorage.getItem('little-orbit-tip-drag'))$('dragGuide').hidden=true}catch{}
$('dragGuideClose').onclick=()=>{$('dragGuide').hidden=true;try{localStorage.setItem('little-orbit-tip-drag','1')}catch{}};
// Going offline is explained once, and coming back is confirmed; edits keep saving on this device either way.
addEventListener('offline',()=>notify('You’re offline. Your changes are saved on this device and will sync when you reconnect.',{error:true}));
addEventListener('online',()=>notify('Back online.'));

// Deleting asks first. By default the card's time becomes free time, so later activities (and flights) keep their times;
// ticking the box closes the gap instead. Either way it's one undoable change.
let deleting=null;
function openDelete(card){
 deleting=card.id;const d=state.days.find(d=>d.cards.some(c=>c.id===card.id)),slot=slotTime(d,d.cards.findIndex(c=>c.id===card.id));
 $('deleteTitle').textContent=`Delete “${card.title}”?`;
 $('deleteWhat').textContent=`${fmt(slot)}–${fmt(slot+card.duration)} · ${dateLabel(d,{weekday:'short',day:'numeric',month:'short'})}`;
 $('deleteCloseGap').checked=false;deleteHint();$('deleteDialog').showModal();$('deleteCancel').focus();
}
function deleteHint(){
 const card=state.days.flatMap(d=>d.cards).find(c=>c.id===deleting);if(!card)return;
 $('deleteHint').textContent=$('deleteCloseGap').checked?`Everything after it moves ${duration(card.duration)} earlier.`:'Its time becomes free time, so later activities keep their times. You can undo.';
}
$('deleteCloseGap').onchange=deleteHint;
$('deleteCancel').onclick=()=>$('deleteDialog').close();
$('deleteForm').onsubmit=e=>{
 e.preventDefault();const id=deleting,closeGap=$('deleteCloseGap').checked;$('deleteDialog').close();
 window.Sounds?.play('remove');
 mutate(()=>{for(const d of state.days){const i=d.cards.findIndex(c=>c.id===id);if(i<0)continue;const gone=d.cards[i];
  d.cards.splice(i,1,...(closeGap||gone.category==='break'?[]:[{id:uid(),title:'A little breathing room',notes:`Free time (was “${gone.title}”).`,category:'break',duration:gone.duration}]))}});
};
