// Day map: numbered pins and the driving route, drive times between stops in the timeline,
// stops not yet on the map, and a suggested shorter order. Map data © OpenStreetMap contributors; routes by OSRM.
(() => {
 const el=id=>document.getElementById(id),{escape}=PlaceCore;
 const GEO='little-orbit-geo',ROUTES='little-orbit-routes',MOVABLE=new Set(['kids','shopping']);
 const read=k=>{try{return JSON.parse(localStorage.getItem(k))||{}}catch{return {}}};
 const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
 const trim=(o,max)=>{const keys=Object.keys(o);for(const k of keys.slice(0,Math.max(0,keys.length-max)))delete o[k]};
 const geo=read(GEO),routes=read(ROUTES);
 const hasPoint=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon);
 const clock=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
 const span=m=>{m=Math.max(0,Math.round(m));return m<60?m+' min':Math.floor(m/60)+' h'+(m%60?' '+m%60+' min':'')};
 const km=k=>k.toFixed(k<10?1:0)+' km';
 function crow(a,b){const r=Math.PI/180,x=(b.lon-a.lon)*r*Math.cos((a.lat+b.lat)*r/2),y=(b.lat-a.lat)*r;return Math.hypot(x,y)*6371}
 const estimate=(a,b)=>{const d=crow(a,b)*1.3;return {km:d,minutes:Math.round(d/40*60)+5,estimated:true}};
 let map,layer,last=null,token=0,timer,resizeTimer,suggestion=null;

 // --- Flights: drawn as an arc between airports; ground routes are worked out separately on each side. ---
 const AIRPORTS={SIN:{name:'Singapore Changi Airport',lat:1.3644,lon:103.9915},TPE:{name:'Taiwan Taoyuan International Airport',lat:25.0777,lon:121.2328}};
 const CITY={singapore:'SIN',changi:'SIN',sin:'SIN',taipei:'TPE',taoyuan:'TPE',tpe:'TPE'};
 const FLIGHTS={BR216:['SIN','TPE'],BR215:['TPE','SIN']};
 const isFlight=c=>c.mode==='flight'||(c.category==='travel'&&!c.place&&!/check/i.test(c.title)&&/\bflight\b|\bEVA\b|\bBR ?\d{3}\b/i.test(c.title));
 function flightRoute(c){
  const code=(c.title.match(/\bBR ?(\d{3})\b/i)||[])[1],known=code&&FLIGHTS['BR'+code];if(known)return known;
  const m=c.title.match(/([A-Za-z]+)\s*(?:→|->|to)\s*([A-Za-z]+)/);const a=m&&CITY[m[1].toLowerCase()],b=m&&CITY[m[2].toLowerCase()];
  return a&&b&&a!==b?[a,b]:null;
 }
 function arc(a,b,steps=48){
  // A gentle curve (quadratic Bézier) so the flight reads as a flight, not a road.
  const mid={lat:(a.lat+b.lat)/2,lon:(a.lon+b.lon)/2},dx=b.lon-a.lon,dy=b.lat-a.lat,c={lat:mid.lat-dx*.18,lon:mid.lon+dy*.18};
  return Array.from({length:steps+1},(_,i)=>{const t=i/steps,u=1-t;return [u*u*a.lat+2*u*t*c.lat+t*t*b.lat,u*u*a.lon+2*u*t*c.lon+t*t*b.lon]});
 }
 function flightsOf(all){
  const seen=new Set(),out=[];
  for(const s of all){const r=(isFlight(s.card)||/\bBR ?\d{3}\b/i.test(s.card.title))&&flightRoute(s.card);if(!r)continue;const key=r.join('-');if(seen.has(key))continue;seen.add(key);
   const from=AIRPORTS[r[0]],to=AIRPORTS[r[1]];out.push({card:s.card,from:{...from,code:r[0]},to:{...to,code:r[1]},arc:arc(from,to)})}
  return out;
 }
 // --- Data: the selected day's stops, their map points and the route between them. ---
 function stops(){const d=state.days[day];let t=d.start;return d.cards.map((c,i)=>{const s={card:c,index:i,start:t,end:t+c.duration};t+=c.duration;return s})}
 async function point(card){
  const p=card.place;if(!p)return guess(card);if(hasPoint(p))return {lat:p.lat,lon:p.lon};
  const key=[p.nameZh||p.name,p.address].join('|');if(geo[key])return geo[key];
  const found=await window.orbitPlaces?.locate(p).catch(()=>null);
  if(found){geo[key]=found;trim(geo,300);write(GEO,geo)}
  return found||null;
 }
 // Stops without a place are looked up by the name in their title, only when it looks like a real place name
 // (Chinese characters, or two capitalised words like "Schokolake Country House"). Such pins are marked as guesses.
 const misses=new Set();
 const PLAIN=/^(the|a|an|at|to|in|on|and|back|hotel|homestay|room|breakfast|lunch|dinner|evening|morning|airport|leisurely|hello|meet|wake|check|private|final|bento|downtime|rest|nap)$/i;
 function guessName(card){
  if(['break','travel'].includes(card.category))return '';
  const name=window.orbitPlaces?.placeName?.(card.title)||'';
  if(/[\u3400-\u9fff]/.test(name))return name;
  const words=name.split(/\s+/);return words.some((w,i)=>/^[A-Z][\w’'-]+$/.test(w)&&!PLAIN.test(w)&&/^[A-Z][\w’'-]+$/.test(words[i+1]||'')&&!PLAIN.test(words[i+1]))?name:'';
 }
 async function guess(card){
  const name=guessName(card);if(!name)return null;const key='title|'+name;
  if(geo[key])return {...geo[key],guess:true};if(misses.has(key))return null;
  // A miss may just be a network blip, so it's only remembered until the page reloads.
  const found=await window.orbitPlaces?.locate({name}).catch(()=>null);
  if(!found){misses.add(key);return null}
  geo[key]={lat:found.lat,lon:found.lon};trim(geo,300);write(GEO,geo);return {...geo[key],guess:true};
 }
 async function route(points){
  const key=points.map(p=>p.lon.toFixed(5)+','+p.lat.toFixed(5)).join(';');if(routes[key])return routes[key];
  try{
   const config=await window.orbitPlaces.settings();if(!config.routeUrl||config.enabled===false)throw Error();
   const base=new URL(config.routeUrl);if(base.protocol!=='https:')throw Error();
   const response=await fetch(base.href.replace(/\/?$/,'/')+key+'?overview=simplified&geometries=geojson',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();
   const r=(await response.json())?.routes?.[0];if(!Array.isArray(r?.legs)||r.legs.length!==points.length-1)throw Error();
   const result={legs:r.legs.map(l=>({km:l.distance/1000,minutes:Math.max(1,Math.round(l.duration/60))})),line:(r.geometry?.coordinates||[]).map(([lon,lat])=>[lat,lon])};
   routes[key]=result;trim(routes,40);write(ROUTES,routes);return result;
  }catch{
   // Rough fallback, never cached: straight lines, winding roads ~1.3× at ~40 km/h plus parking.
   return {legs:points.slice(1).map((p,i)=>estimate(points[i],p)),line:points.map(p=>[p.lat,p.lon]),estimated:true};
  }
 }
 async function compute(){
  const my=++token,all=stops(),points=await Promise.all(all.map(s=>s.card.category==='break'?null:point(s.card)));
  if(my!==token)return;
  // A guessed pin more than 80 km from every confirmed stop of the day is probably the wrong place, so it's dropped.
  const sure=points.filter(p=>p&&!p.guess);
  for(let i=0;i<points.length;i++)if(points[i]?.guess&&sure.length&&sure.every(p=>crow(p,points[i])>80))points[i]=null;
  const pinned=all.map((s,i)=>({...s,point:points[i]})).filter(s=>s.point);
  // A flight splits the day: each side gets its own road route, and no drive is worked out across the sea.
  const flightAt=all.filter(s=>isFlight(s.card)).map(s=>s.index),groups=[];let group=[];
  for(const s of pinned){if(group.length&&flightAt.some(f=>f>group.at(-1).index&&f<s.index)){groups.push(group);group=[]}group.push(s)}
  if(group.length)groups.push(group);
  const legs=[],lines=[];
  for(const g of groups){const r=g.length>1?await route(g.map(s=>s.point)):{legs:[],line:[]};legs.push(...r.legs,null);lines.push(r.line)}
  legs.pop();
  if(my!==token)return;
  last={day,all,pinned,legs,lines,flights:flightsOf(all),unpinned:all.filter((s,i)=>!points[i]&&!['break','travel'].includes(s.card.category))};
  suggestion=optimise(last);drawConnectors();addMapButtons();drawPanel();
 }

 // --- Timeline: drive time between consecutive stops that are on the map. ---
 // Drives are reserved in the plan as quiet travel cards, shown as a "🚗 … to …" line on the stop before. Each pair of
 // pinned stops gets the real drive time: under that line when there is one, otherwise as its own line on the stop
 // before. Short drives get a one-tap fix.
 const BUFFER=10,needFor=leg=>Math.ceil((leg.minutes+BUFFER)/5)*5;
 function pairs(){
  if(!last||last.day!==day)return [];
  return last.pinned.slice(1).map((b,i)=>{
   const a=last.pinned[i],leg=last.legs[i];if(!leg||leg.km<.05)return null;
   const between=last.all.slice(a.index+1,b.index).map(s=>s.card);
   // With another (unmapped) stop in between, the drive is shown for information but the time can't be judged.
   // Walks and flights aren't drives, so they block the drive check like a stop would.
   const drive=c=>isLeg(c)&&(c.mode||'drive')==='drive',blocked=between.some(c=>c.category!=='break'&&!drive(c)),free=b.start-a.end,need=needFor(leg);
   return {a,b,leg,between,free,need,short:!blocked&&free<need-2,legCard:blocked?null:between.find(drive),via:b.index-a.index>1};
  }).filter(Boolean);
 }
 function drawConnectors(){
  document.querySelectorAll('#timeline .leg-connector,#timeline .leg-info').forEach(n=>n.remove());
  const total=el('dayDriving');
  if(!last||last.day!==day){if(total)total.hidden=true;return}
  const list=pairs(),guessed=x=>x.a.point.guess||x.b.point.guess;
  for(const x of list){
   const route=`<a href="${escape(PlaceCore.directions(x.a.point,x.b.point))}" target="_blank" rel="noopener noreferrer" aria-label="Driving directions from ${escape(x.a.card.title)} to ${escape(x.b.card.title)}">Route ↗</a>`;
   const to=x.b.card.place?.name||x.b.card.title,facts=`<b>${x.leg.estimated||guessed(x)?'≈ ':''}${span(x.leg.minutes)}</b> drive · ${km(x.leg.km)}`;
   const fix=x.short?`<span class="leg-warn">Needs ~${span(x.need)} with parking and the kids; ${x.free>0?'only '+span(x.free):'no time'} planned.</span> <button type="button" class="leg-fix" data-fix-drive="${escape(x.b.card.id)}">${x.legCard?'Make it '+span(x.legCard.duration+x.need-x.free):'＋ Add '+span(x.need)+' drive'}</button>`:'';
   const note=guessed(x)?'<small class="leg-guess">Location guessed from the title — add a place to be sure.</small>':'';
   const line=x.legCard&&[...document.querySelectorAll('#timeline .travel-line')].find(n=>n.dataset.legLine===x.legCard.id);
   if(line){
    line.classList.toggle('is-short',x.short);line.insertAdjacentHTML('beforeend',`<p class="leg-info${x.short?' is-short':''}">Route check: ${facts} ${route}${fix?'<br>'+fix:''}${note}</p>`);
   }else{
    // No travel time planned: say so on the stop before (it leaves from there).
    const box=[...document.querySelectorAll('#timeline .timeline-row')].find(r=>r.dataset.id===x.a.card.id)?.querySelector('.travel-lines');
    box?.insertAdjacentHTML('beforeend',`<div class="leg-connector${x.short?' is-short':''}"><span class="leg-car" aria-hidden="true">🚗</span><span class="leg-text">${facts} to ${escape(to)}${x.via?' <small>(after the stops in between)</small>':''}${fix?' '+fix:''}${note}</span>${route}</div>`);
   }
  }
  if(total){
   const minutes=list.reduce((n,x)=>n+x.leg.minutes,0),short=list.filter(x=>x.short).length;
   total.hidden=!list.length;
   total.innerHTML=list.length?`🚗 About <b>${span(minutes)}</b> of driving between mapped stops${short?` · <span class="leg-warn">${short} drive${short>1?'s don’t':' doesn’t'} fit</span> <button type="button" class="leg-fix" data-fix-drive="all">Fix ${short>1?'all':'it'}</button>`:''}`:'';
  }
 }
 // Makes room for drives: planned travel grows by what's missing; otherwise new travel time takes the free time in between
 // and later activities move by the shortfall. All fixes land as one undoable change.
 function fixDrives(list){
  const work=list.filter(x=>x.short);if(!work.length)return;
  mutate(()=>{
   const cards=state.days[day].cards;
   for(const x of work){
    const at=cards.findIndex(c=>c.id===x.b.card.id),from=cards.findIndex(c=>c.id===x.a.card.id);if(at<0||from<0)continue;
    const legCard=cards.slice(from+1,at).find(c=>isLeg(c)&&(c.mode||'drive')==='drive');
    if(legCard){legCard.duration+=x.need-x.free;continue}
    const name=x.b.card.place?.name||window.orbitPlaces?.placeName?.(x.b.card.title)||x.b.card.title;
    cards.splice(from+1,at-from-1,{id:crypto.randomUUID(),title:`Drive to ${name}`,notes:`About ${span(x.leg.minutes)} by car (${km(x.leg.km)}), plus ${BUFFER} min for parking and getting the kids in and out. Added automatically.`,category:'travel',leg:true,duration:x.need});
   }
  });
 }
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-fix-drive]');if(!b)return;
  const list=pairs();fixDrives(b.dataset.fixDrive==='all'?list:list.filter(x=>x.b.card.id===b.dataset.fixDrive));
 });

 // --- Suggest a shorter order within runs of movable stops (play and shopping), keeping meals, hotels and drives fixed. ---
 function permutations(list){if(list.length<2)return [list];return list.flatMap((x,i)=>permutations([...list.slice(0,i),...list.slice(i+1)]).map(p=>[x,...p]))}
 function optimise(data){
  const runs=[];let run=[];
  for(const s of data.all){if(s.card.category==='break')continue;const p=data.pinned.find(q=>q.card.id===s.card.id);if(p&&MOVABLE.has(s.card.category))run.push(p);else{if(run.length>1)runs.push(run);run=[]}}
  if(run.length>1)runs.push(run);
  const changes=[];let saved=0;
  for(const r of runs.filter(r=>r.length<=7)){
   const i=data.pinned.indexOf(r[0]),before=data.pinned[i-1],after=data.pinned[i+r.length];
   const cost=order=>[before,...order,after].filter(Boolean).reduce((n,s,k,a)=>k?n+crow(a[k-1].point,s.point):0,0);
   // With no earlier stop, the first stop is where the day sets off from, so it stays first.
   const orders=before?permutations(r):permutations(r.slice(1)).map(o=>[r[0],...o]);
   const best=orders.reduce((b,o)=>cost(o)<cost(b)?o:b,r),gain=(cost(r)-cost(best))*1.3/40*60;
   if(gain>=5&&best.some((s,k)=>s!==r[k])){changes.push({from:r.map(s=>s.card.id),to:best.map(s=>s.card.id),names:best.map(s=>s.card.title)});saved+=gain}
  }
  return changes.length?{changes,minutes:Math.round(saved)}:null;
 }
 function applySuggestion(){
  if(!suggestion)return;const plan=suggestion;
  mutate(()=>{const cards=state.days[day].cards;for(const c of plan.changes){const slots=c.from.map(id=>cards.findIndex(x=>x.id===id)),moved=c.to.map(id=>cards.find(x=>x.id===id));slots.forEach((slot,k)=>{cards[slot]=moved[k]})}});
 }

 // --- Map panel. ---
 const visible=()=>getComputedStyle(el('mapPanel')).display!=='none';
 // Set up once, even when two draws ask at the same moment (e.g. tapping 📍 Map before the map was ever shown).
 let mapSetup=null;
 function ensureMap(){if(map||!window.L)return Promise.resolve();return mapSetup??=createMap()}
 async function createMap(){
  const config=await window.orbitPlaces.settings();
  map=L.map(el('map'),{zoomControl:true,scrollWheelZoom:true}).setView([23.7,121],7);
  L.tileLayer(config.tileUrl||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · routes <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a>'}).addTo(map);
  layer=L.layerGroup().addTo(map);
 }
 function popup(s,n){
  // Guessed pins have no saved place yet: link to the point and say it's a guess.
  const p=s.card.place||{name:'',lat:s.point.lat,lon:s.point.lon},hours=p.openingHours;
  return `<div class="map-popup"><strong>${n}. ${escape(s.card.title)}</strong><span class="map-popup-time">${clock(s.start)}–${clock(s.end)}</span>${p.name&&p.name!==s.card.title?`<span class="map-popup-place">${escape(p.name)}${p.nameZh&&p.nameZh!==p.name?' · '+escape(p.nameZh):''}</span>`:''}${p.description?`<p>${escape(p.description.slice(0,160))}${p.description.length>160?'…':''}</p>`:''}${hours?`<p>🕘 ${escape(hours)}</p>`:''}${s.point.guess?'<p class="leg-guess">Location guessed from the title — add a place to be sure.</p>':''}<div class="map-popup-actions"><button type="button" data-map-show="${escape(s.card.id)}">Show in plan</button><a href="${escape(PlaceCore.maps(p))}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a></div></div>`;
 }
 async function drawPanel(){
  const d=state.days[day];el('mapTitle').textContent=`Day ${day+1} · ${d.name}`;
  const box=el('mapUnpinned');
  box.innerHTML=last?.unpinned.length?`<p><strong>Not on the map yet (${last.unpinned.length})</strong> — pin them to see drive times.</p><div>${last.unpinned.map(s=>`<button type="button" data-place-edit="${escape(s.card.id)}">⌖ ${escape(s.card.title)}</button>`).join('')}</div>`:'';
  el('mapOptimise').hidden=!suggestion;if(suggestion)el('mapOptimise').textContent=`✦ Optimise route · save ~${span(suggestion.minutes)}`;
  if(!visible())return;
  await ensureMap();if(!map||!last)return;
  map.invalidateSize();layer.clearLayers();
  const dashed=last.legs.some(l=>l?.estimated)?'6 8':null;
  for(const line of last.lines)if(line.length>1)L.polyline(line,{color:'#9a7ab6',weight:4,opacity:.85,dashArray:dashed}).addTo(layer);
  markers={};
  for(const f of last.flights){
   L.polyline(f.arc,{color:'#e1609f',weight:3,opacity:.9,dashArray:'2 9',lineCap:'round'}).addTo(layer);
   const mid=f.arc[Math.floor(f.arc.length/2)],label=`<div class="map-popup"><strong>✈️ ${escape(f.card.title)}</strong><span class="map-popup-place">${f.from.code} ${escape(f.from.name)} → ${f.to.code} ${escape(f.to.name)}</span><div class="map-popup-actions"><button type="button" data-map-show="${escape(f.card.id)}">Show in plan</button></div></div>`;
   markers[f.card.id]=L.marker(mid,{title:f.card.title,icon:L.divIcon({className:'map-plane',html:'<span>✈️</span>',iconSize:[30,30],iconAnchor:[15,15]})}).bindPopup(label,{maxWidth:260}).addTo(layer);
   for(const a of [f.from,f.to])L.marker([a.lat,a.lon],{title:a.name,icon:L.divIcon({className:'map-airport',html:`<span>${a.code}</span>`,iconSize:[40,22],iconAnchor:[20,11]})}).bindPopup(escape(a.name)).addTo(layer);
  }
  last.pinned.forEach((s,i)=>{
   const color=(typeof CATS!=='undefined'&&CATS[s.card.category]?.color)||'#766091';
   markers[s.card.id]=L.marker([s.point.lat,s.point.lon],{title:s.card.title,icon:L.divIcon({className:'map-pin',html:`<span style="background:${color}">${i+1}</span>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-14]})}).bindPopup(popup(s,i+1),{maxWidth:260}).addTo(layer);
  });
  const all=[...last.pinned.map(s=>[s.point.lat,s.point.lon]),...last.flights.flatMap(f=>[[f.from.lat,f.from.lon],[f.to.lat,f.to.lon]])];
  el('mapEmpty').hidden=all.length>0;
  // A redraw keeps the card the person selected in view instead of jumping back to the whole day.
  if(!(selected&&focusCard(selected,{quiet:true,instant:true}))&&all.length)map.fitBounds(L.latLngBounds(all),{padding:[36,36],maxZoom:15,animate:false});
 }
 // --- Selecting a card shows it on the map: a stop flies to its pin, a drive frames both ends, a flight frames the arc. ---
 let markers={},selected=null;
 const still=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 function focusCard(id,{quiet=false,instant=false}={}){
  if(!map||!last||last.day!==day||!visible())return false;
  // A move made mid zoom-animation is dropped by Leaflet, so wait for it to finish.
  if(map._animatingZoom){map.once('zoomend',()=>focusCard(id,{quiet,instant}));return true}
  // Leaflet ignores a move made during its own zoom animation unless it is explicitly instant.
  const calm=instant||still(),move=(bounds,point)=>{if(point){const z=Math.max(map.getZoom(),14);calm?map.setView(point,z,{animate:false}):map.flyTo(point,z,{duration:.8})}else calm?map.fitBounds(bounds,{padding:[40,40],maxZoom:14,animate:false}):map.flyToBounds(bounds,{padding:[40,40],maxZoom:14,duration:.8})};
  const stop=last.pinned.find(s=>s.card.id===id),flight=last.flights.find(f=>f.card.id===id),drive=pairs().find(x=>x.legCard?.id===id);
  if(stop)move(null,[stop.point.lat,stop.point.lon]);
  else if(flight)move(L.latLngBounds(flight.arc));
  else if(drive)move(L.latLngBounds([[drive.a.point.lat,drive.a.point.lon],[drive.b.point.lat,drive.b.point.lon]]));
  else return false;
  selected=id;
  document.querySelectorAll('#timeline .timeline-row.is-map-selected').forEach(r=>r.classList.remove('is-map-selected'));
  [...document.querySelectorAll('#timeline .timeline-row')].find(r=>r.dataset.id===id)?.classList.add('is-map-selected');
  const marker=markers[id];
  if(marker&&!quiet){map.once('moveend',()=>{marker.openPopup();const e=marker.getElement();e?.classList.remove('is-focus');void e?.offsetWidth;e?.classList.add('is-focus')});if(still())marker.openPopup()}
  return true;
 }
 // Tapping a card (anywhere but its controls) selects it on a visible map.
 document.addEventListener('click',e=>{
  const card=e.target.closest('#timeline .activity');if(!card||e.target.closest('button,a,input,select,textarea,.drag-handle'))return;
  focusCard(card.closest('.timeline-row')?.dataset.id);
 });
 // On phones the map is a sheet, so pinned cards get a 📍 Map button that opens it already showing the place.
 async function showOnMap(id){if(!visible())setOpen(true);await drawPanel();focusCard(id)}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-map-focus]');if(b)showOnMap(b.dataset.mapFocus)});
 function addMapButtons(){
  if(!last||last.day!==day)return;
  const ids=new Set([...last.pinned.map(s=>s.card.id),...last.flights.map(f=>f.card.id)]);
  for(const row of document.querySelectorAll('#timeline .timeline-row')){
   const bar=row.querySelector('.card-primary');if(!bar||!ids.has(row.dataset.id)||bar.querySelector('.map-focus'))continue;
   bar.insertAdjacentHTML('afterbegin',`<button type="button" class="map-focus" data-map-focus="${escape(row.dataset.id)}" aria-label="Show ${escape(row.querySelector('h3')?.textContent||'this stop')} on the map">📍 Map</button>`);
  }
  if(selected)[...document.querySelectorAll('#timeline .timeline-row')].find(r=>r.dataset.id===selected)?.classList.add('is-map-selected');
 }
 function refresh(){if(typeof state==='undefined'||!state)return;if(last&&last.day!==day)selected=null;clearTimeout(timer);if(last&&last.day!==day){document.querySelectorAll('#timeline .leg-connector').forEach(n=>n.remove())}else {drawConnectors();addMapButtons()}timer=setTimeout(()=>compute().catch(()=>{}),150)}

 // --- Events. ---
 function setOpen(open){document.body.classList.toggle('map-open',open);el('mapToggle').setAttribute('aria-expanded',String(open));if(open){drawPanel();el('mapClose').focus({preventScroll:true})}else el('mapToggle').focus({preventScroll:true})}
 el('mapToggle').onclick=()=>setOpen(!document.body.classList.contains('map-open'));
 el('mapClose').onclick=()=>setOpen(false);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('map-open')&&!document.querySelector('dialog[open]'))setOpen(false)});
 el('mapAdd').onclick=()=>{setOpen(false);openEditor();el('placeQuery').focus()};
 el('mapOptimise').onclick=()=>{
  if(!suggestion)return;const box=el('mapSuggestion');
  box.hidden=false;box.innerHTML=`<p><strong>Shorter order</strong> (saves about ${span(suggestion.minutes)} of driving, estimated):</p><ol>${suggestion.changes.flatMap(c=>c.names).map(n=>`<li>${escape(n)}</li>`).join('')}</ol><p class="field-help">Meals, hotels and drives stay where they are. Times shift to match.</p><div><button type="button" class="primary" id="mapApply">Use this order</button><button type="button" id="mapKeep">Keep mine</button></div>`;
  el('mapApply').onclick=()=>{box.hidden=true;applySuggestion()};el('mapKeep').onclick=()=>{box.hidden=true};
 };
 el('mapPanel').addEventListener('click',e=>{
  const b=e.target.closest('[data-map-show]');if(!b)return;
  const row=[...document.querySelectorAll('#timeline .timeline-row')].find(r=>r.dataset.id===b.dataset.mapShow);
  if(document.body.classList.contains('map-open'))setOpen(false);
  row?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});row?.classList.add('just-updated');setTimeout(()=>row?.classList.remove('just-updated'),1400);
 });
 // Pin buttons reuse the editor's "Add a place" flow; on phones the map closes first.
 el('mapUnpinned').addEventListener('click',e=>{if(e.target.closest('[data-place-edit]')&&document.body.classList.contains('map-open'))setOpen(false)},true);
 addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(visible())drawPanel()},200)});
 window.orbitMap={refresh,current:()=>last,focus:focusCard,view:()=>map&&{lat:map.getCenter().lat,lon:map.getCenter().lng,zoom:map.getZoom()}};
})();
