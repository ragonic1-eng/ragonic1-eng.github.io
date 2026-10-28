// One-off travel tidy-up for the current plan: turns travel that was stored as activity cards into proper travel rows
// (home → Changi T3 by car, a walk to the departure hall, flights, airport transfers) and fixes cards filed under the
// wrong type. It reads the live plan, so personal edits stay; every change can be unticked, and all of them apply as
// one undoable step for everyone on the shared trip.
window.travelTidy=(() => {
 const VERSION=1,KEY='little-orbit-tidy-dismissed',$=id=>document.getElementById(id);
 const today=()=>new Date().toISOString().slice(0,10);
 const make=(title,category,duration,extra={})=>({id:uid(),title,notes:'',category,duration,...extra});
 const leg=(title,duration,mode,notes)=>make(title,'travel',duration,{leg:true,mode,notes});
 const at=(d,test)=>d.cards.findIndex(test);
 const startOf=(d,id)=>{let t=d.start;for(const c of d.cards){if(c.id===id)return t;t+=c.duration}return null};
 const HOME={name:'Monterey Park Condominium',address:'West Coast Rise, Singapore',description:'Home.',checked:today()};
 const T3={name:'Changi Airport Terminal 3',address:'65 Airport Boulevard, Singapore 819663',description:'EVA Air departs from Terminal 3 (flight trackers; confirm on your booking).',checked:today()};
 const flight=c=>c.category==='travel'&&!/check/i.test(c.title)&&/\bEVA\b|\bBR ?\d{3}\b|flight/i.test(c.title);

 // Each proposal says what it changes in plain words and edits the plan it is given (a copy for checks, then the real one).
 function proposals(s){
  const out=[],day=date=>s.days.find(d=>d.date===date),first=day('2026-12-07'),last=day('2026-12-13');
  if(first){
   const i=at(first,c=>c.id==='home-to-airport'||/^leave home/i.test(c.title));
   if(i>=0&&first.cards[i].category==='travel'&&!first.cards[i].leg)out.push({id:'home',day:'Mon 7 Dec',text:'Split “Leave home → Changi Airport” into: 🏠 Home · Monterey Park Condo (10 min) → 🚗 drive to Changi T3 (40 min) → 🛄 Changi T3 drop-off (10 min) → 🚶 walk to the T3 departure hall (15 min). Airport check-in & playtime is shortened so your flight time stays the same.',apply:t=>{
    const d=t.days.find(x=>x.date==='2026-12-07'),j=at(d,c=>c.id==='home-to-airport'||/^leave home/i.test(c.title));if(j<0)return;
    const flightCard=d.cards.find(flight),before=flightCard&&startOf(d,flightCard.id);
    d.cards.splice(j,1,make('Home · Monterey Park Condo','hotel',10,{notes:'Final bag check and load the car.',place:{...HOME}}),
     leg('Drive to Changi Airport T3',40,'drive','About 30–35 min from West Coast Rise via the PIE or ECP, plus loading the car and the kids. The travel row shows the live drive time.'),
     make('Changi Airport T3 · drop-off','travel',10,{notes:'Unload bags, get a trolley and the stroller out.',place:{...T3}}),
     leg('Walk to T3 Departure Hall',15,'walk','From the drop-off kerb to the EVA Air check-in row with bags and kids.'));
    // Keep the flight where it was by giving the extra minutes back from airport playtime (never below an hour).
    if(flightCard){const extra=startOf(d,flightCard.id)-before,play=d.cards.find(c=>c.id==='airport-play-checkin'||/airport check-in & playtime/i.test(c.title));if(extra>0&&play)play.duration=Math.max(60,play.duration-extra)}
   }});
   const f=first.cards.find(flight);
   if(f&&!f.leg)out.push({id:'flight216',day:'Mon 7 Dec',text:`Show “${f.title}” as a ✈️ flight travel row instead of an activity card.`,apply:t=>{const c=t.days.find(x=>x.date==='2026-12-07').cards.find(flight);if(c){c.leg=true;c.mode='flight'}}});
   const m=at(first,c=>/meet your private driver/i.test(c.title)),next=first.cards[m+1];
   if(m>=0&&next&&!isLeg(next))out.push({id:'taoyuan',day:'Mon 7 Dec',text:'Add the evening drives in Taoyuan: 🚗 airport → convenience-store stop (25 min) and 🚗 store → Chao Motels (10 min). Check-in moves up to 35 min later (less if there’s free time in between). These are estimates; the travel rows show live times once the stops are on the map.',apply:t=>{
    const d=t.days.find(x=>x.date==='2026-12-07'),k=at(d,c=>/meet your private driver/i.test(c.title));if(k<0)return;
    d.cards.splice(k+1,0,leg('Drive to a Taoyuan 7-Eleven / FamilyMart',25,'drive','From Taoyuan Airport Terminal 2 towards Chao Motels, stopping for bentos on the way.'));
    // The store → hotel hop uses free time in between first, so check-in only moves if there isn't enough.
    const b=at(d,c=>/bento/i.test(c.title)),h=at(d,c=>/chao motels/i.test(c.title));
    if(b<0||h<=b||d.cards.slice(b+1,h).some(c=>c.category!=='break'))return;
    let need=10;for(const c of d.cards.slice(b+1,h)){const take=Math.min(need,c.duration);c.duration-=take;need-=take}
    d.cards=d.cards.filter(c=>c.category!=='break'||c.duration>0);
    d.cards.splice(at(d,c=>/bento/i.test(c.title))+1,0,leg('Drive to Chao Motels',10,'drive','Short hop from the convenience store to the hotel.'));
   }});
  }
  if(last){
   const wake=last.cards.find(c=>/wake up/i.test(c.title)&&c.category==='travel'),transfer=last.cards.find(c=>/airport transfer/i.test(c.title)&&!c.leg),checkin=last.cards.find(c=>/airport check-in/i.test(c.title)&&c.category!=='travel');
   if(wake||transfer||checkin)out.push({id:'last',day:'Sun 13 Dec',text:[wake&&'“Wake up & final bag checks” becomes a hotel activity',transfer&&'“Private airport transfer” becomes a 🚗 drive row to the airport',checkin&&'“Airport check-in · EVA Air BR 215” is filed as travel instead of hotel'].filter(Boolean).join('; ')+'.',apply:t=>{
    const d=t.days.find(x=>x.date==='2026-12-13');
    for(const c of d.cards){if(/wake up/i.test(c.title)&&c.category==='travel')c.category='hotel';if(/airport transfer/i.test(c.title)){c.leg=true;c.mode='drive'}if(/airport check-in/i.test(c.title)&&c.category!=='travel')c.category='travel'}
   }});
  }
  // Placeholder drive titles ("From x to x") get the name of the stop they lead to.
  for(const d of s.days)d.cards.forEach((c,i)=>{
   if(!/^from\s+x\s+to\s+x$/i.test(c.title.trim()))return;
   const to=d.cards.slice(i+1).find(n=>n.category!=='break'&&!isLeg(n));if(!to)return;
   const name=window.orbitPlaces?.placeName?.(to.title)||to.place?.name||to.title;
   out.push({id:'rename-'+c.id,day:dateLabel(d,{weekday:'short',day:'numeric',month:'short'}),text:`Rename “${c.title}” to “Drive to ${name}” and show it as a 🚗 travel row.`,apply:t=>{for(const x of t.days)for(const y of x.cards)if(y.id===c.id){y.title=`Drive to ${name}`;y.leg=true;y.mode='drive'}}});
  });
  return out;
 }

 function banner(){
  const box=$('travelTidy');if(!box||!state)return;
  let dismissed=false;try{dismissed=sessionStorage.getItem(KEY)===String(VERSION)}catch{}
  const list=(state.travelTidy||0)>=VERSION||dismissed?[]:proposals(state);
  if(!list.length){box.hidden=true;return}
  box.hidden=false;
  box.innerHTML=`<p><strong>🧳 Travel tidy-up: ${list.length} change${list.length>1?'s':''} ready.</strong> Travel that was saved as activity cards becomes travel rows. Untick anything you don’t want${/room=/.test(location.hash)?'; this updates the plan for everyone on your shared trip':''}. You can undo.</p><details class="tidy-list"><summary>Review the changes</summary><ul>${list.map(p=>`<li><label><input type="checkbox" data-tidy="${esc(p.id)}" checked> <span><b>${esc(p.day)}</b> · ${esc(p.text)}</span></label></li>`).join('')}</ul></details><div class="schedule-update-actions"><button type="button" class="primary" id="applyTidy">Apply selected</button><button type="button" id="dismissTidy">Not now</button></div>`;
  $('applyTidy').onclick=()=>{
   const chosen=new Set([...box.querySelectorAll('[data-tidy]:checked')].map(i=>i.dataset.tidy)),picked=proposals(state).filter(p=>chosen.has(p.id));
   if(!picked.length){notify('Nothing selected. Tick at least one change, or tap “Not now”.',{error:true});return}
   // Tried on a copy first, so a clash is explained instead of half-applied.
   try{const copy=structuredClone(state);for(const p of picked)p.apply(copy);validate(copy)}catch{notify('These changes don’t fit the plan as it is now. Reload the page and try again.',{error:true});return}
   if(!mutate(()=>{for(const p of picked)p.apply(state);state.travelTidy=VERSION}))return;
   const first=state.days.findIndex(d=>d.date==='2026-12-07');if(picked.some(p=>p.day.includes('7 Dec'))&&first>=0&&day!==first){day=first;render()}
   notify(`Travel tidied: ${picked.length} change${picked.length>1?'s':''} applied.`,{actions:[{label:'Undo',run:undoChange}]});
  };
  $('dismissTidy').onclick=()=>{try{sessionStorage.setItem(KEY,String(VERSION))}catch{}box.hidden=true};
 }
 return {banner,proposals};
})();
