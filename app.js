const CATS={kids:{label:'Kids & play',icon:'♧',color:'#a5c8a6'},food:{label:'Food & treats',icon:'♨',color:'#e3b78e'},hotel:{label:'Stay & unwind',icon:'☾',color:'#b9a4df'},travel:{label:'Getting around',icon:'➤',color:'#91b5da'},shopping:{label:'Shopping',icon:'♧',color:'#d7a3bd'},break:{label:'Breathing room',icon:'☁',color:'#94adb8'}};
const BRANCH_TYPES={booking:{label:'Booking',icon:'⌑',done:'Booked / confirmed'},bring:{label:'Bring',icon:'♧',done:'Packed / ready'},prepare:{label:'Prepare',icon:'☑',done:'Prepared'},note:{label:'Note',icon:'✎',done:'Reviewed'}};
let branchActivity=null,branchEditing=null;
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state,original,day=0,filter='all',drag=null,editing=null,history=[],toastTimer;
const total=d=>d.cards.reduce((n,c)=>n+c.duration,0), fmt=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`, timeval=v=>{const [h,m]=v.split(':').map(Number);return h*60+m}, duration=n=>n>=60?`${Math.floor(n/60)}h${n%60?' '+n%60+'m':''}`:`${n}m`, uid=()=>crypto.randomUUID();
function notify(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2800)}
function persist(){try{localStorage.setItem('little-orbit-v1',JSON.stringify(state));$('saveStatus').textContent='● Saved on this device';window.orbitSync?.queue()}catch(e){$('saveStatus').textContent='Not saved — export your trip';notify('Browser storage unavailable. Export to keep your changes.')}}
function mutate(fn){history.push(JSON.stringify(state));if(history.length>40)history.shift();fn();persist();render()}
function dateLabel(d,opts){return new Date(d.date+'T12:00:00').toLocaleDateString('en-SG',opts)}
function render(){
 try{localStorage.setItem('little-orbit-day',String(day))}catch{}
 $('days').innerHTML=state.days.map((d,i)=>`<button class="day-tab ${i===day?'active':''}" data-day="${i}" aria-current="${i===day?'date':'false'}"><span>DAY ${i+1} · ${dateLabel(d,{weekday:'short'}).toUpperCase()}</span><b>${dateLabel(d,{day:'numeric',month:'short'})}</b><small>${esc(d.region)}</small><span class="day-count">${d.cards.filter(c=>c.category!=='break').length} activities · ${duration(total(d))}</span></button>`).join('');
 const d=state.days[day], used=total(d), available=d.end-d.start, free=available-used;
 $('dayDate').textContent=`DAY ${day+1} · ${dateLabel(d,{weekday:'long',day:'numeric',month:'long'}).toUpperCase()}`;$('dayTitle').textContent=d.name;$('dayRegion').textContent='⌖ '+d.region;
 $('start').value=fmt(d.start);$('end').value=fmt(d.end);$('planned').textContent=duration(used)+' planned';$('remaining').textContent=free>=0?duration(free)+' of breathing room':duration(-free)+' over your day';$('remaining').className=free<0?'warning':'';
 $('budgetBar').innerHTML=Object.entries(CATS).map(([key,cat])=>{const mins=d.cards.filter(c=>c.category===key).reduce((n,c)=>n+c.duration,0);return `<span title="${cat.label}: ${duration(mins)}" style="width:${mins/Math.max(available,used)*100}%;background:${cat.color}"></span>`}).join('');
 let cursor=d.start;$('timeline').innerHTML=d.cards.map((c,i)=>{const start=cursor;cursor+=c.duration;const cat=CATS[c.category];return `<div class="timeline-row" data-id="${esc(c.id)}" data-start="${start}" data-end="${cursor}" style="--cat:${cat.color}"><div class="time"><button data-action="edit" class="time-edit" aria-label="Change start time for ${esc(c.title)}">${fmt(start)}</button><small>${fmt(cursor)}${cursor>=1440?' +1d':''}</small></div><div class="track"></div><article class="activity" draggable="true" data-id="${esc(c.id)}" tabindex="0" aria-label="${esc(c.title)}. Use arrow buttons to reorder."><div class="card-timing"><div><span class="timing-label">Meet / start</span><button type="button" class="card-start" data-action="edit" aria-label="Change start time for ${esc(c.title)}">${fmt(start)}</button>${start>=1440?'<small>Next day</small>':''}</div><div><span class="timing-label">Finish</span><strong>${fmt(cursor)}</strong>${cursor>=1440?'<small>Next day</small>':''}</div><div><span class="timing-label">Duration</span><strong class="timing-duration">${duration(c.duration)}</strong></div></div><p class="activity-status"></p><div class="card-top"><span class="grip">⠿</span><span class="cat-icon">${cat.icon}</span><div class="card-main"><h3>${esc(c.title)}</h3><span class="category">${cat.label}</span>${c.optional?'<span class="optional-badge">✦ OPTIONAL</span>':''}</div><div class="card-actions"><button data-action="up" title="Move earlier" aria-label="Move earlier" ${i===0?'disabled':''}>↑</button><button data-action="down" title="Move later" aria-label="Move later" ${i===d.cards.length-1?'disabled':''}>↓</button><button data-action="edit" title="Edit activity" aria-label="Edit activity">✎ Edit</button><button data-action="remove" title="Remove activity" aria-label="Remove activity">×</button></div></div><details class="card-details"><summary>Description & family reminders</summary><p class="card-notes">${esc(c.notes)||'Add your own description, directions, or reminders.'}</p><button type="button" data-action="description">${c.notes?'Edit description':'Add a description'}</button></details><div class="card-bottom"><div class="duration"><span>◷</span><button data-action="less" aria-label="Reduce duration by 15 minutes">−</button><span>${duration(c.duration)}</span><button data-action="more" aria-label="Increase duration by 15 minutes">＋</button></div><span>${c.estimated?'Estimated duration · editable':'Flexible timing'}</span><button class="branch-add" data-action="branch" aria-label="Add branch">＋ Branch</button><select class="move-select" data-move="${esc(c.id)}" aria-label="Move activity to another day"><option value="">Move to day…</option>${state.days.map((_,j)=>j!==day?`<option value="${j}">${dateLabel(state.days[j],{day:'numeric',month:'short'})} · Day ${j+1}</option>`:'').join('')}</select></div>${renderBranches(c)}${nextActivityLink(d,i)}</article><button class="insert-here" data-insert="${i+1}" aria-label="Insert activity after ${esc(c.title)}">＋ Add here · ${fmt(cursor)}</button></div>`}).join('') || '<p class="empty">A whole day of possibilities. Add your first activity below.</p>';
 const earlier=document.createElement('button');earlier.className='add-earlier';earlier.textContent='＋ Add an earlier activity';earlier.onclick=()=>{openEditor(null,0);$('activityStart').value=fmt(Math.max(0,d.start-60));scheduleHint();$('activityStart').focus()};$('timeline').prepend(earlier);
 $('undo').disabled=!history.length;renderLibrary();updateTripClock();
}
function renderLibrary(){const q=$('search').value.toLowerCase();$('filters').innerHTML=[['all','✧ Everything'],...Object.entries(CATS).map(([k,v])=>[k,v.icon+' '+v.label])].map(([k,v])=>`<button data-filter="${k}" aria-pressed="${filter===k}" class="${filter===k?'active':''}">${v}</button>`).join('');
 const cards=original.days.flatMap(d=>d.cards).filter(c=>c.category!=='break').filter(c=>(filter==='all'||filter===c.category)&&(c.title+' '+c.notes).toLowerCase().includes(q));$('libraryCount').textContent=cards.length+' IDEAS';$('library').innerHTML=cards.map(c=>{const cat=CATS[c.category];return `<div class="idea" draggable="true" data-library="${c.id}" style="--cat:${cat.color}"><span class="cat-icon">${cat.icon}</span><div><h3>${esc(c.title)}</h3><small>${cat.label} · ${duration(c.duration)}</small></div><button data-add="${c.id}" aria-label="Add ${esc(c.title)}">＋</button></div>`}).join('')||'<p class="empty">No matching ideas. Try another search.</p>'}
function nextActivityLink(d,index){const next=d.cards.slice(index+1).find(c=>c.category!=='break');if(!next)return '<p class="next-stop">☾ Last activity of the day</p>';return `<button class="next-stop" data-next="${esc(next.id)}">Up next · ${fmt(slotTime(d,d.cards.indexOf(next)))} · ${esc(next.title)} ↓</button>`}
function slotTime(d,index){return d.start+d.cards.slice(0,index).reduce((n,c)=>n+c.duration,0)}
function defaultStart(d){
 let cursor=d.start;
 for(const c of d.cards){if(c.category==='break'&&cursor<1440)return cursor;cursor+=c.duration}
 return cursor<1440?cursor:d.start;
}
function openEditor(card,insertIndex){
 editing=card?.id??null;
 $('editorTitle').textContent=card?'Edit your adventure':'A new little adventure';
 $('title').value=card?.title??'';$('duration').value=card?.duration??60;
 $('activityDay').innerHTML=state.days.map((d,i)=>`<option value="${i}">${dateLabel(d,{weekday:'short',day:'numeric',month:'short'})} · ${esc(d.region)}</option>`).join('');
 $('activityDay').value=day;
 const d=state.days[day],index=card?d.cards.findIndex(c=>c.id===card.id):insertIndex??d.cards.length;
 const start=card||insertIndex!==undefined?slotTime(d,index):defaultStart(d);
 $('activityStart').value=fmt(start);
 if(!card)$('duration').value=Math.min(60,1440-start);
 $('saveActivity').textContent=card?'Save changes ✦':'Add activity ✦';
 $('title').setCustomValidity('');
 $('category').innerHTML=Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
 $('category').value=card?.category??'kids';$('notes').value=card?.notes??'';$('optional').checked=card?.optional??false;
 scheduleHint();$('editor').showModal();
}
// Insert at an explicit clock time. Free-time cards can split; scheduled activities are never silently truncated.
function placement(d,card,start){
 const cards=d.cards.filter(c=>c.id!==editing).map(c=>({...c}));
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
 const target=Number($('activityDay').value),d=state.days[target],start=timeval($('activityStart').value),mins=Number($('duration').value);
 $('scheduleActions').replaceChildren();$('nextActivity').replaceChildren();
 const choice=$('placeBefore'),selected=choice.value;
 choice.innerHTML='<option value="">Choose an activity…</option>'+d.cards.filter(c=>c.id!==editing&&c.category!=='break').map(c=>`<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
 choice.value=selected;
 try{
  if(!Number.isInteger(mins)||mins<1||mins>1440)throw Error('How long will you stay? Enter 1–1440 minutes.');
  const cards=placement(d,{id:editing??'preview',title:$('title').value.trim()||'Your new activity',duration:mins},start),end=start+mins,previewStart=Math.min(d.start,start),finish=previewStart+total({cards});
  $('scheduleHint').textContent=`${dateLabel(d,{day:'numeric',month:'short'})} · ${fmt(start)}–${fmt(end)}${end>=1440?' (next day)':''}. `+(finish>d.end?`This puts your day ${duration(finish-d.end)} past wrap-up. You can still save, or shorten the visit.`:'There’s room for this in your day.');
  if(start<d.start)$('scheduleHint').textContent+=` Your day will now start at ${fmt(start)}; later activities keep their times when there’s room.`;
  $('scheduleHint').classList.toggle('warning',finish>d.end);
  const i=cards.findIndex(c=>c.id===(editing??'preview')),previous=cards.slice(0,i).findLast(c=>c.category!=='break'),next=cards.slice(i+1).find(c=>c.category!=='break');
  const line=document.createElement('p');line.className='muted';line.textContent=previous?`After ${previous.title}`:'First activity of the day';$('nextActivity').append(line);
  const heading=document.createElement('strong');heading.textContent=next?`Up next · ${next.title}`:'Your last activity of the day';$('nextActivity').append(heading);
  const detail=document.createElement('p');
  if(next){const nextStart=slotTime({...d,start:previewStart,cards},cards.indexOf(next)),gap=nextStart-end;detail.textContent=`${fmt(nextStart)} · ${gap>0?duration(gap)+' of breathing room before it.':'Follows straight after.'} Linked automatically by time.`}
  else detail.textContent='Add another card later and it will appear here automatically.';
  $('nextActivity').append(detail);return true;
 }catch(e){
  $('scheduleHint').textContent=e.message;$('scheduleHint').classList.add('warning');
  $('nextActivity').textContent='Choose a free time or a card’s start time to see what comes next.';
  let cursor=d.start;
  for(const c of d.cards.filter(c=>c.id!==editing)){
   const end=cursor+c.duration;
   if(start>cursor&&start<end&&c.category!=='break'){
    const button=document.createElement('button');button.type='button';button.textContent=`Start after this activity · ${fmt(end)}`;
    button.disabled=end>=1440;button.onclick=()=>{$('activityStart').value=fmt(end);scheduleHint()};$('scheduleActions').append(button);break;
   }cursor=end;
  }
  return false;
 }
}
$('activityDay').onchange=()=>{const d=state.days[Number($('activityDay').value)];$('activityStart').value=fmt(defaultStart(d));scheduleHint()};
$('placeBefore').onchange=()=>{
 const d=state.days[Number($('activityDay').value)],cards=d.cards.filter(c=>c.id!==editing),index=cards.findIndex(c=>c.id===$('placeBefore').value);
 if(index<0)return;
 $('activityStart').value=fmt(slotTime({...d,cards},index));scheduleHint();
};
$('activityStart').oninput=$('duration').oninput=scheduleHint;
$('title').oninput=()=>$('title').setCustomValidity('');
$('jumpLibrary').onclick=()=>{$('search').scrollIntoView({behavior:'smooth',block:'center'});$('search').focus({preventScroll:true})};
function addLibrary(id,index){const source=original.days.flatMap(d=>d.cards).find(c=>c.id===id);if(!source)return;mutate(()=>state.days[day].cards.splice(index??state.days[day].cards.length,0,{...source,id:uid()}));notify('Added to your day')}
$('days').onclick=e=>{const el=e.target.closest('[data-day]');if(el){day=Number(el.dataset.day);render()}};
$('filters').onclick=e=>{const el=e.target.closest('[data-filter]');if(el){filter=el.dataset.filter;renderLibrary()}};$('search').oninput=renderLibrary;
$('library').onclick=e=>{const el=e.target.closest('[data-add]');if(el)addLibrary(el.dataset.add)};
$('timeline').onclick=e=>{const next=e.target.closest('[data-next]');if(next){const row=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===next.dataset.next);row?.scrollIntoView({behavior:'smooth',block:'center'});row?.querySelector('.activity')?.focus({preventScroll:true});return}const branchButton=e.target.closest('[data-branch-action]');if(branchButton){handleBranchAction(branchButton);return}const insert=e.target.closest('[data-insert]');if(insert)return openEditor(null,Number(insert.dataset.insert));const button=e.target.closest('[data-action]'),row=e.target.closest('[data-id]');if(!button||!row)return;const cards=state.days[day].cards,i=cards.findIndex(c=>c.id===row.dataset.id),c=cards[i];if(!c)return;const action=button.dataset.action;if(action==='edit')return openEditor(c);if(action==='description'){openEditor(c);$('notes').focus();return}if(action==='branch')return openBranch(c);mutate(()=>{if(action==='remove')cards.splice(i,1);if(action==='less')c.duration=Math.max(5,c.duration-15);if(action==='more')c.duration=Math.min(1440,c.duration+15);if(action==='up'&&i>0)[cards[i],cards[i-1]]=[cards[i-1],cards[i]];if(action==='down'&&i<cards.length-1)[cards[i],cards[i+1]]=[cards[i+1],cards[i]]});if(action==='remove')notify('Activity removed. Undo to bring it back.')};
$('timeline').onchange=e=>{if(!e.target.matches('[data-move]')||e.target.value==='')return;const id=e.target.dataset.move,target=Number(e.target.value);mutate(()=>{const cards=state.days[day].cards,i=cards.findIndex(c=>c.id===id);state.days[target].cards.push(cards.splice(i,1)[0])});notify('Moved to day '+(target+1))};
for(const id of ['timeline','library']){$(id).addEventListener('dragstart',e=>{if(e.target.closest('button,input,select')){e.preventDefault();return}const lib=e.target.closest('[data-library]'),card=e.target.closest('.activity');if(!lib&&!card)return;drag=lib?{library:lib.dataset.library}:{id:card.dataset.id,day};e.dataTransfer.setData('text/plain',JSON.stringify(drag));e.dataTransfer.effectAllowed='move';card?.classList.add('dragging')});$(id).addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over'))})}
$('timeline').ondragover=e=>{e.preventDefault();document.querySelectorAll('.over').forEach(x=>x.classList.remove('over'));e.target.closest('.timeline-row')?.classList.add('over')};$('timeline').ondrop=e=>{e.preventDefault();if(!drag)return;const row=e.target.closest('.timeline-row'),cards=state.days[day].cards;let index=row?cards.findIndex(c=>c.id===row.dataset.id):cards.length;if(drag.library)addLibrary(drag.library,index);else if(drag.id!==row?.dataset.id)mutate(()=>{const src=state.days[drag.day].cards,old=src.findIndex(c=>c.id===drag.id);if(old<0)return;const [card]=src.splice(old,1);if(src===cards&&old<index)index--;cards.splice(index,0,card)});drag=null};
$('new').onclick=$('addBottom').onclick=()=>openEditor();$('cancel').onclick=()=>$('editor').close();$('form').onsubmit=e=>{
 e.preventDefault();if(!scheduleHint())return;
 const values={title:$('title').value.trim(),category:$('category').value,duration:Number($('duration').value),notes:$('notes').value,optional:$('optional').checked};
 if(!values.title){$('title').setCustomValidity('Give your activity a name.');$('title').reportValidity();return;}
 const target=Number($('activityDay').value),source=state.days.flatMap(d=>d.cards).find(c=>c.id===editing),card={...source,...values,id:editing??uid()};
 let cards;try{cards=placement(state.days[target],card,timeval($('activityStart').value))}catch(e){$('scheduleHint').textContent=e.message;return}
 mutate(()=>{if(editing)for(const d of state.days)d.cards=d.cards.filter(c=>c.id!==editing);state.days[target].cards=cards;state.days[target].start=Math.min(state.days[target].start,timeval($('activityStart').value));day=target});
 $('editor').close();notify('Activity saved · later times updated');
};
for(const id of ['start','end'])$(id).onchange=()=>{const start=timeval($('start').value),end=timeval($('end').value);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){notify('Wrap-up time must be after the start.');render();return}mutate(()=>Object.assign(state.days[day],{start,end}))};
$('fit').onclick=()=>{const d=state.days[day],over=total(d)-(d.end-d.start);if(over<=0)return notify('Your day already fits, with room to breathe.');const flexible=d.cards.filter(c=>!['travel','hotel'].includes(c.category)),capacity=flexible.reduce((n,c)=>n+Math.max(0,c.duration-15),0);if(capacity<over)return notify('Not enough flexible time. Move a card or extend your day.');mutate(()=>{let left=over;while(left>0)for(const c of flexible){const reduce=Math.min(5,left,c.duration-15);if(reduce>0){c.duration-=reduce;left-=reduce}}});notify('Shortened flexible activities. Travel and hotel times kept.')};
$('undo').onclick=()=>{if(!history.length)return;state=JSON.parse(history.pop());persist();render();notify('Last change undone')};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='taiwan-together.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Trip exported. Import this file on another device.')};
$('import').onclick=()=>$('file').click();$('file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>2000000)throw Error();const data=JSON.parse(await file.text());validate(data);mutate(()=>state=data);notify('Shared trip imported')}catch{notify('Could not import. Choose a valid Little Orbit trip export.')}e.target.value=''};
function validate(s){if(!s||!Array.isArray(s.days)||s.days.length!==7)throw Error('Invalid trip');const ids=new Set();for(const d of s.days){if(typeof d.name!=='string'||typeof d.region!=='string'||!/^2026-12-\d\d$/.test(d.date)||!Number.isInteger(d.start)||!Number.isInteger(d.end)||d.start<0||d.end>1440||d.end<=d.start||!Array.isArray(d.cards)||d.cards.length>200)throw Error();for(const c of d.cards){if(typeof c.id!=='string'||ids.has(c.id)||typeof c.title!=='string'||typeof c.notes!=='string'||!Object.hasOwn(CATS,c.category)||!Number.isInteger(c.duration)||c.duration<1||c.duration>1440)throw Error();ids.add(c.id);if(c.branches!==undefined){if(!Array.isArray(c.branches)||c.branches.length>100)throw Error();const branchIds=new Set();for(const b of c.branches){if(typeof b.id!=='string'||branchIds.has(b.id)||!Object.hasOwn(BRANCH_TYPES,b.type)||typeof b.title!=='string'||typeof b.notes!=='string'||typeof b.done!=='boolean'||typeof b.url!=='string'||(b.url&&!safeUrl(b.url)))throw Error();branchIds.add(b.id)}}}}}
(async()=>{try{const response=await fetch('trip.json');if(!response.ok)throw Error();original=await response.json();for(const d of original.days){const cards=[];let cursor=d.start;for(const c of d.cards){if(c.originalStart>cursor)cards.push({id:'gap-'+c.id,title:'A little breathing room',category:'break',duration:c.originalStart-cursor,notes:'Unscheduled time from the original itinerary. Use it for a snack, rest, or getting to the next stop.',optional:false});cards.push(c);cursor=c.originalStart+c.duration}d.cards=cards}state=structuredClone(original);try{const selected=Number(localStorage.getItem('little-orbit-day'));if(Number.isInteger(selected)&&selected>=0&&selected<7)day=selected;const saved=localStorage.getItem('little-orbit-v1');if(saved){const parsed=JSON.parse(saved);validate(parsed);state=parsed;if(!location.hash&&addAirportMorning(state))persist()}}catch{notify('Saved trip could not be read. Original itinerary loaded.')}render();document.dispatchEvent(new Event('orbit-ready'))}catch{$('timeline').innerHTML='<p class="empty">The itinerary could not load. Serve this folder with an HTTP server and reload.</p>'}})();

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
 branchActivity=card.id;branchEditing=branch?.id??null;
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
 if(action==='remove')notify('Branch removed. Undo to restore it.');
}
$('branchType').onchange=()=>{$('branchDoneLabel').textContent=BRANCH_TYPES[$('branchType').value].done};
$('branchCancel').onclick=()=>$('branchEditor').close();
$('branchForm').onsubmit=e=>{
 e.preventDefault();const title=$('branchTitle').value.trim(),url=$('branchUrl').value.trim();if(!title)return;
 if(url&&!safeUrl(url)){return $('branchUrl').setCustomValidity('Use an http:// or https:// link.')}
 const card=state.days.flatMap(d=>d.cards).find(c=>c.id===branchActivity);if(!card)return;
 const values={id:branchEditing??uid(),type:$('branchType').value,title,notes:$('branchNotes').value,url,done:$('branchDone').checked};
 mutate(()=>{card.branches??=[];const i=card.branches.findIndex(b=>b.id===branchEditing);if(i<0)card.branches.push(values);else card.branches[i]=values});
 $('branchEditor').close();notify('Branch saved with your activity');
};
$('branchUrl').oninput=()=>$('branchUrl').setCustomValidity('');

// Singapore and Taiwan share UTC+8 year-round. Compare full dates, never just clock times.
function tripMidnight(d){return Date.parse(d.date+'T00:00:00+08:00')}
function jumpToActivity(id){const row=[...document.querySelectorAll('.timeline-row')].find(r=>r.dataset.id===id);row?.scrollIntoView({behavior:'smooth',block:'center'});row?.querySelector('.activity')?.focus({preventScroll:true})}
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
