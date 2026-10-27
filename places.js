// Activity editor place search: live suggestions, Orbit (Qwen) research, travel times and plan checks.
(() => {
 const el=id=>document.getElementById(id),{escape,valid,html}=PlaceCore;
 // Bounding boxes keep suggestions in the chosen area (minLon,minLat,maxLon,maxLat).
 const AREAS={tw:[119.3,21.8,122.1,25.4],sg:[103.6,1.15,104.1,1.48]};
 let catalogue=[],draft=null,options=[],active=-1,generation=0,typing,controller,flow,settingsRequest,schedule=null,journey=null,journeyToken=0,journeyTimer,advice=null,finding=false,autoTitle='',near=null,transfers={},auto={},baseline={},filled=[];
 const remoteCache=new Map(),routeCache=new Map(),pointCache=new Map();
 const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[’']/g,'').trim();
 const known=text=>catalogue.filter(p=>p.aliases.some(a=>norm(text).includes(norm(a))));
 function matches(q){q=norm(q);if(q.length<2)return [];return catalogue.filter(p=>[p.name,p.nameZh,...p.aliases].some(a=>norm(a).includes(q)||q.includes(norm(a)))).slice(0,6)}
 const inferred=()=>known(el('title').value+' '+el('notes').value);
 const hasPoint=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon);
 const today=()=>new Date().toISOString().slice(0,10);
 const clock=m=>{m=((Math.round(m)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
 const span=m=>{m=Math.max(0,Math.round(m));return m<60?m+' min':Math.floor(m/60)+' h'+(m%60?' '+m%60+' min':'')};
 const settings=()=>settingsRequest??=fetch('places-config.json').then(r=>{if(!r.ok)throw Error();return r.json()}).catch(()=>{settingsRequest=null;return {}});
 function room(){const p=new URLSearchParams(location.hash.slice(1));return {roomId:p.get('room'),roomKey:p.get('key')}}
 const shared=()=>{const r=room();return !!(r.roomId&&r.roomKey)};
 function timeout(signal,ms){const local=new AbortController(),stop=()=>local.abort();signal?.addEventListener('abort',stop);const timer=setTimeout(stop,ms);return {signal:local.signal,done(){clearTimeout(timer);signal?.removeEventListener('abort',stop)}}}

 // --- Map lookups (Photon suggestions, OSRM routes); every failure has a usable fallback. ---
 const OSM_CATEGORY={restaurant:'food',cafe:'food',fast_food:'food',food_court:'food',bakery:'food',ice_cream:'food',hotel:'hotel',hostel:'hotel',guest_house:'hotel',motel:'hotel',apartment:'hotel',mall:'shopping',department_store:'shopping',supermarket:'shopping',marketplace:'shopping',gift:'shopping',clothes:'shopping',station:'travel',aerodrome:'travel',bus_station:'travel',ferry_terminal:'travel',zoo:'kids',theme_park:'kids',playground:'kids',park:'kids',museum:'kids',aquarium:'kids',attraction:'kids',farm:'kids'};
 function fromPhoton(f){
  const p=f?.properties||{},[lon,lat]=f?.geometry?.coordinates||[],kind={N:'node',W:'way',R:'relation'}[p.osm_type],type=String(p.osm_value||p.type||'place').replaceAll('_',' ');
  const street=[p.housenumber,p.street].filter(Boolean).join(' '),area=p.city||p.town||p.district||p.county||p.state||'';
  const address=[street,p.district,p.city,p.county,p.state,p.country].filter((v,i,a)=>v&&a.indexOf(v)===i).join(', ');
  return {id:kind?`osm-${kind}-${p.osm_id}`:'map-'+lat+','+lon,name:String(p.name||street||area).slice(0,200),address,description:`A ${type}${area?' in '+area:''}.`,lat:Number(lat),lon:Number(lon),source:kind&&/^\d+$/.test(String(p.osm_id))?`https://www.openstreetmap.org/${kind}/${p.osm_id}`:'https://www.openstreetmap.org/',bookingNote:'Booking requirement not confirmed yet.',checked:today(),planning:{category:OSM_CATEGORY[p.osm_value]||''}};
 }
 async function suggest(q,{limit=6,signal,bias=near}={}){
  const config=await settings();if(config.enabled===false||!config.suggestUrl)throw Error('off');
  const url=new URL(config.suggestUrl);if(url.protocol!=='https:')throw Error('off');
  const area=AREAS[el('placeCountry').value],params={q,limit:String(limit),lang:'en'};
  if(area)params.bbox=area.join(',');if(hasPoint(bias)){params.lat=bias.lat.toFixed(4);params.lon=bias.lon.toFixed(4)}
  url.search=new URLSearchParams(params);
  const response=await fetch(url,{signal,referrerPolicy:'strict-origin-when-cross-origin'});if(!response.ok)throw Error();const data=await response.json();
  return (Array.isArray(data?.features)?data.features:[]).map(fromPhoton).filter(p=>valid(p)&&hasPoint(p));
 }
 // --- Google Maps (through the google-places edge function, which holds the key). The free map is only a fallback
 // while the key isn't set up. ---
 let googleCheck,session='';
 const newSession=()=>{session=crypto.randomUUID().replaceAll('-','')};
 async function googleApi(payload,signal){
  const [config,app]=await Promise.all([settings(),fetch('config.json',{signal}).then(r=>r.json())]);
  if(!config.googleUrl||app.provider!=='supabase'||!config.googleUrl.startsWith(app.supabaseUrl.replace(/\/$/,'')+'/functions/v1/'))throw Error('off');
  const response=await fetch(config.googleUrl,{method:payload?'POST':'GET',headers:{apikey:app.supabaseKey,...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,signal,referrerPolicy:'no-referrer'});
  let data;try{data=await response.json()}catch{throw Error('Google Maps search is unavailable right now.')}
  if(!response.ok){const e=Error(typeof data.error==='string'?data.error:'Google Maps search is unavailable right now.');e.code=data.code;throw e}
  return data;
 }
 // Checked once per page load; a missing key (or no backend) means the free map is used instead.
 const google=()=>googleCheck??=googleApi(null,AbortSignal.timeout(8000)).then(d=>d.available===true).catch(()=>false);
 const fromGoogle=s=>({id:'google-'+s.placeId,googleId:s.placeId,name:String(s.name).slice(0,200),address:String(s.address||'').slice(0,300),source:'https://www.google.com/maps',checked:today()});
 async function search(q,signal){
  if(await google()){if(!session)newSession();const data=await googleApi({action:'autocomplete',input:q,country:el('placeCountry').value,sessionToken:session,...(hasPoint(near)?{near:{lat:near.lat,lon:near.lon}}:{})},signal);return (data.suggestions||[]).map(fromGoogle).filter(valid)}
  return suggest(q,{signal});
 }
 async function googleDetails(place,signal){
  const data=await googleApi({action:'details',placeId:place.googleId,country:el('placeCountry').value,sessionToken:session||undefined},signal);newSession();
  return valid(data.place)?data.place:null;
 }
 // Small places are often missing from the free map. Find an approximate point from the address, trimmed until the map
 // recognises it (house number → hamlet → village → township), then look for the place by name near it. Without an exact
 // match the approximate point is used and labelled, so drive times still work.
 function addressQueries(address){
  const a=String(address||'').trim(),out=[];if(!a)return out;
  if(CJK.test(a)&&!a.includes(',')){
   const m=a.replace(/\s/g,'').match(/^(?:\d{3,6})?(?:台灣|臺灣)?(.+?[縣市])?(.+?[鄉鎮區市])?(.+?[村里])?([^\d]*)/)||[];const [,county,town,village,rest]=m;
   if(rest&&town)out.push(rest.replace(/[路街段巷弄號].*$/,'')+' '+town);if(village&&town)out.push(village+' '+town);if(town)out.push(town+(county?' '+county:''));
  }else{
   const parts=a.split(/\s*,\s*/).map(x=>x.replace(/\bNo\.?\s*/i,'').replace(/\b\d[\d-]*\b/g,'').trim()).filter(x=>x&&!/^(taiwan|singapore|r\.?o\.?c\.?)$/i.test(x));
   for(let i=0;i<parts.length-1;i++)out.push(parts.slice(i).join(', '));
  }
  return [...new Set(out.filter(q=>q.trim().length>1))];
 }
 async function locate(place,signal){
  if(hasPoint(place))return {lat:place.lat,lon:place.lon};
  const name=place.nameZh||place.name,key=el('placeCountry').value+':'+norm(name+'|'+(place.address||''));
  if(pointCache.has(key))return pointCache.get(key);
  const t=timeout(signal,15000);let approx=null;
  try{
   if(await google()){
    // Small farms and cafés are often listed on Google under another name (or not at all), but their street address
    // still pins exactly, so try the name with the address, then the address alone.
    for(const query of [...new Set([[placeName(name),place.address].filter(Boolean).join(' '),place.address].filter(q=>q&&q.trim().length>3))]){
     const data=await googleApi({action:'locate',query:query.slice(0,200),country:el('placeCountry').value},t.signal).catch(e=>{if(t.signal.aborted)throw e;return null});
     if(hasPoint(data?.point)){const point={lat:data.point.lat,lon:data.point.lon};pointCache.set(key,point);return point}
    }
   }
   for(const q of addressQueries(place.address)){const [hit]=await suggest(q,{limit:1,signal:t.signal,bias:null});if(hit){approx={lat:hit.lat,lon:hit.lon,approx:hit.name};break}}
   let point=null;
   for(const n of [...new Set([place.name,place.nameZh].filter(Boolean))]){
    const hits=await suggest(placeName(n),{limit:3,signal:t.signal,bias:approx});
    const hit=hits.find(h=>exact(h,placeName(n))&&(!approx||crowFlies(h,approx)<=5));if(hit){point={lat:hit.lat,lon:hit.lon};break}
   }
   point??=approx;pointCache.set(key,point);return point;
  }catch{if(signal?.aborted)throw Error('Skipped.');return approx}finally{t.done()}
 }
 function crowFlies(a,b){const r=Math.PI/180,x=(b.lon-a.lon)*r*Math.cos((a.lat+b.lat)*r/2),y=(b.lat-a.lat)*r;return Math.hypot(x,y)*6371}
 async function travel(a,b,signal){
  const key=[a.lat,a.lon,b.lat,b.lon].map(n=>n.toFixed(4)).join(',');if(routeCache.has(key))return routeCache.get(key);
  const straight=crowFlies(a,b);if(straight<.05)return {km:0,minutes:0,estimated:false};
  const t=timeout(signal,8000);
  try{
   const config=await settings();if(!config.routeUrl||config.enabled===false)throw Error();const base=new URL(config.routeUrl);if(base.protocol!=='https:')throw Error();
   const response=await fetch(base.href.replace(/\/?$/,'/')+`${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,{signal:t.signal});if(!response.ok)throw Error();const route=(await response.json())?.routes?.[0];
   if(!Number.isFinite(route?.distance)||!Number.isFinite(route?.duration))throw Error();
   const result={km:route.distance/1000,minutes:Math.max(1,Math.round(route.duration/60)),estimated:false};routeCache.set(key,result);return result;
  }catch{if(signal?.aborted)throw Error('Skipped.');
   // Rough fallback: winding roads ~1.3× the straight line at ~40 km/h, plus parking.
   return {km:straight*1.3,minutes:Math.round(straight*1.3/40*60)+5,estimated:true};
  }finally{t.done()}
 }

 // --- Orbit (Supabase edge function using Qwen). ---
 async function orbit(payload,signal,ms){
  const {roomId,roomKey}=room();if(!roomId||!roomKey)throw Error('Open your private shared trip link first (Trip options → Share trip) to use Orbit.');
  const t=timeout(signal,ms);
  try{
   const [config,app]=await Promise.all([settings(),fetch('config.json',{signal:t.signal}).then(r=>r.json())]);
   if(!config.researchUrl||app.provider!=='supabase'||!config.researchUrl.startsWith(app.supabaseUrl.replace(/\/$/,'')+'/functions/v1/'))throw Error('Orbit is not configured for this trip. Map search still works.');
   const response=await fetch(config.researchUrl,{method:'POST',headers:{'Content-Type':'application/json',apikey:app.supabaseKey},body:JSON.stringify({...payload,roomId,roomKey}),signal:t.signal,referrerPolicy:'no-referrer'});
   let data;try{data=await response.json()}catch{throw Error('Orbit is temporarily unavailable. Try again shortly.')}
   if(response.status===404)throw Error('Orbit is awaiting backend setup. Map suggestions still work.');
   if(!response.ok)throw Error((typeof data.error==='string'?data.error:'Orbit is unavailable right now.')+(typeof data.code==='string'&&/^[A-Z_]{2,30}$/.test(data.code)?` (code: ${data.code})`:''));
   return data;
  }catch(e){if(signal?.aborted)throw Error('Skipped.');throw e.name==='AbortError'?Error('Orbit took too long. Try again later.'):e.message==='Failed to fetch'?Error('Cannot reach Orbit. Check your connection.'):e}
  finally{t.done()}
 }
 const researchQuery=p=>[p.nameZh||p.name,p.address].filter(Boolean).join(', ').slice(0,200);
 // Verified research replaces map details. Unverified AI knowledge (relay mode) only fills gaps: the map's address and any
 // researched catalogue facts win, but generic map descriptions are replaced.
 function mergeResearch(base,found){
  if(found.verified!==false)return {...base,...found,id:base.id||found.id,lat:base.lat,lon:base.lon};
  const fromMap=/openstreetmap\.org/.test(base.source||''),merged={...base};
  for(const [k,v] of Object.entries(found)){if(v===''||v===undefined||(Array.isArray(v)&&!v.length))continue;if(base[k]&&!(fromMap&&['description','descriptionZh','bookingNote'].includes(k)))continue;merged[k]=v}
  return {...merged,id:base.id||found.id,lat:base.lat,lon:base.lon,research:found.research,verified:false};
 }

 // --- Loading overlay. ---
 // Appears after a short delay so instant lookups don't flash a screen.
 let loadingTimer;
 function showLoading(title,steps,{now=false}={}){
  el('orbitLoadingTitle').textContent=title;el('orbitSteps').innerHTML=steps.map(s=>`<li data-step="${s.id}" data-state="pending"><span class="step-mark" aria-hidden="true"></span><span>${escape(s.label)}</span></li>`).join('');
  el('form').setAttribute('aria-busy','true');clearTimeout(loadingTimer);loadingTimer=setTimeout(()=>{el('orbitLoading').hidden=false;el('orbitSkip').focus({preventScroll:true})},now?0:250);
 }
 function step(id,state){const item=el('orbitSteps').querySelector(`[data-step="${id}"]`);if(item)item.dataset.state=state}
 function hideLoading(){clearTimeout(loadingTimer);el('form').removeAttribute('aria-busy');if(el('orbitLoading').hidden)return;el('orbitLoading').hidden=true;el('form').removeAttribute('aria-busy');(draft?el('placeSelected').querySelector('button'):el('placeQuery'))?.focus({preventScroll:true})}
 el('orbitSkip').onclick=()=>flow?.abort();

 // --- Suggestions list (combobox). ---
 function setBusy(on){el('placeFinder').classList.toggle('is-searching',on)}
 // Messages also appear at the top of an open suggestion list, which would otherwise cover them.
 function message(text){
  el('placeMessage').textContent=text;const list=el('placeResults');list.querySelector('.combo-note')?.remove();
  if(text&&!list.hidden)list.insertAdjacentHTML('afterbegin',`<p class="combo-note" role="status">${escape(text)}</p>`);
 }
 function closeList(){el('placeResults').hidden=true;el('placeQuery').setAttribute('aria-expanded','false');el('placeQuery').removeAttribute('aria-activedescendant');active=-1}
 function renderOptions(list,heading=''){
  options=list;active=-1;const q=el('placeQuery').value.trim();
  const option=(p,i)=>`${p.weak&&!list[i-1]?.weak?'<p class="combo-heading weak-heading">Not an exact match — check before choosing</p>':''}<button type="button" role="option" id="placeOption${i}" class="place-option${p.weak?' is-weak':''}" data-place-result="${i}" aria-selected="false"><span class="option-icon" aria-hidden="true">${p.research?'✦':'⌖'}</span><span class="option-text"><strong>${escape(p.name)}${p.nameZh&&p.nameZh!==p.name?` <span lang="zh-Hant">${escape(p.nameZh)}</span>`:''}</strong><small>${escape([/openstreetmap\.org/.test(p.source||'')?p.description:'',p.address||'Address to be confirmed'].filter(Boolean).join(' · '))}</small></span></button>`;
  // One input: when the map has no exact match, Orbit (the AI) comes first and Enter asks it.
  const orbitFirst=q.length>=3&&!list.some(p=>!p.weak);
  const ask=q.length>=2?`<button type="button" role="option" id="placeOptionAsk" class="place-option ask-orbit${orbitFirst?' is-first':''}" data-ask-orbit><span class="option-icon" aria-hidden="true">✦</span><span class="option-text"><strong>Find “${escape(q)}” with Orbit</strong><small>${orbitFirst?'Not found exactly on the map. Orbit will work out which place you mean.':'Ask Orbit (AI) to work out which place you mean'}</small></span></button>`:'';
  const manual=q.length>=2?`<button type="button" role="option" id="placeOptionManual" class="place-option manual-option" data-manual-place><span class="option-icon" aria-hidden="true">✎</span><span class="option-text"><strong>Enter the details yourself</strong><small>Type the name, address and booking link</small></span></button>`:'';
  el('placeResults').innerHTML=(orbitFirst?ask:'')+(heading&&list.length?`<p class="combo-heading">${escape(heading)}</p>`:'')+list.map(option).join('')+(orbitFirst?'':ask)+manual;
  const show=!!el('placeResults').children.length;el('placeResults').hidden=!show;el('placeQuery').setAttribute('aria-expanded',String(show));
 }
 function highlight(next){
  const items=[...el('placeResults').querySelectorAll('[role=option]')];if(!items.length)return;
  active=(next+items.length)%items.length;items.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));
  el('placeQuery').setAttribute('aria-activedescendant',items[active].id);items[active].scrollIntoView({block:'nearest'});
 }
 // The map search always returns its closest guess, even a poor one ("suhu cafe" → "85°C Bakery Cafe" on Su-Hua Highway).
 // A result is an exact match only if every searched word appears in its name; the rest are shown separately as guesses.
 function exact(p,q){const hay=norm([p.name,p.nameZh,...(p.aliases||[])].join(' '));return norm(q).split(/[\s,，、·・‧]+/).filter(Boolean).every(w=>hay.includes(w))}
 function merge(local,remote,q){
  const seen=new Set(local.map(p=>norm(p.name))),fresh=remote.filter(p=>!seen.has(norm(p.name)));
  // Google's suggestions are its own ranked matches (they include places named differently from what was typed).
  const good=p=>p.googleId||exact(p,q);
  return [...local,...fresh.filter(good),...fresh.filter(p=>!good(p)).map(p=>({...p,weak:true}))].slice(0,8);
 }
 // Activity titles carry more than a place name ("紅色琉璃瓦草莓園 & SUHU Café (Dahu) · strawberries & lunch"). The map needs
 // just the name (Chinese names join parts with an unspaced "・": 清境農場・青青草原): skip "Lunch ·"-style labels and trailing descriptions, prefer a Chinese name in brackets, take the first of "A & B".
 const GENERIC=/^(breakfast|brunch|lunch|dinner|supper|snacks?|check[ -]?in|check[ -]?out|hotel rest|rest|pit stop|evening|nap|drive|depart|return)\b/i,CJK=/[\u3400-\u9fff]/;
 function placeName(text){
  const parts=String(text||'').split(/\s+[·|｜]\s+|\s*[・‧]\s*|(?<=[\u3400-\u9fff])·(?=[\u3400-\u9fff])/).map(s=>s.trim()).filter(Boolean);
  let name=parts.find(p=>!GENERIC.test(p))||parts[0]||'';
  const bracket=name.match(/[(（]([^()（）]+)[)）]/);
  name=bracket&&CJK.test(bracket[1])&&!CJK.test(name.replace(bracket[0],''))?bracket[1]:name.replace(/\s*[(（][^()（）]*[)）]/g,'');
  name=name.split(/\s*[&＆+]\s*|\s+and\s+/i)[0].trim();
  return name.length>=2?name:String(text||'').trim();
 }
 let lastSearchGoogle=false;
 function noExactMatch(q){if(q.length<3||options.some(p=>!p.weak))return;message(lastSearchGoogle?`Google Maps found nothing for “${q}”. Press Enter or tap “Find with Orbit”.`:`“${q}” isn’t on the free map exactly — small cafés often aren’t. Press Enter or tap “Find with Orbit”.`)}
 function onType(){
  const typed=el('placeQuery').value.trim(),q=placeName(typed),token=++generation;controller?.abort();clearTimeout(typing);message('');
  const local=typed?matches(typed):inferred();renderOptions(local,q?'':'Suggested from this activity');
  if(q.length<3){setBusy(false);return}
  const key=el('placeCountry').value+':'+norm(q);
  if(remoteCache.has(key)){setBusy(false);renderOptions(merge(local,remoteCache.get(key),q));noExactMatch(q);return}
  setBusy(true);
  typing=setTimeout(async()=>{
   controller=new AbortController();const t=timeout(controller.signal,8000);
   try{const remote=await search(q,t.signal);lastSearchGoogle=await google();if(token!==generation)return;remoteCache.set(key,remote);if(remoteCache.size>40)remoteCache.delete(remoteCache.keys().next().value);renderOptions(merge(local,remote,q));noExactMatch(q)}
   catch(e){if(token===generation&&!controller.signal.aborted)message(e.message==='off'?'':e.code==='GOOGLE_AUTH'||/limit/i.test(e.message)?e.message:'Map suggestions are unavailable right now. Press Enter to find it with Orbit, or enter the details yourself.')}
   finally{t.done();if(token===generation)setBusy(false)}
  },350);
 }

 // --- Orbit fills empty form fields; anything the person typed or changed is left alone. ---
 const FILL_LABELS={notes:'description',driverTitle:'Chinese name for the driver',category:'activity type',duration:'visit length'};
 function fillable(id){
  const value=el(id).value;if(auto[id]!==undefined&&value===auto[id])return true;
  if(id==='category')return baseline.isNew&&!baseline.categoryTouched;
  if(id==='duration')return baseline.isNew&&Number(value)===baseline.duration;
  return !value.trim();
 }
 function autofill(place,hints={}){
  const notes=place.research||place.id&&catalogue.some(c=>c.id===place.id)?[place.description,hints.tips&&'Tips: '+hints.tips].filter(Boolean).join('\n\n'):'';
  const values={notes,driverTitle:place.nameZh||'',category:hints.category||'',duration:hints.visitMinutes?String(Math.min(hints.visitMinutes,1440)):''};
  for(const [id,value] of Object.entries(values)){
   if(!value||!fillable(id))continue;
   el(id).value=value;auto[id]=value;el(id).classList.add('auto-filled');if(!filled.includes(id))filled.push(id);
   if(id==='duration')el('duration').dispatchEvent(new Event('input',{bubbles:true}));
  }
  renderFilled();
 }
 function renderFilled(){
  const box=el('orbitFilled'),live=filled.filter(id=>el(id).value===auto[id]);
  if(!live.length){box.hidden=true;return}
  const label=id=>id==='category'&&typeof CATS!=='undefined'?`activity type (${CATS[el('category').value]?.label||el('category').value})`:id==='duration'?`visit length (${span(Number(el('duration').value))})`:FILL_LABELS[id];
  box.hidden=false;box.innerHTML=`<span aria-hidden="true">✦</span><span>Filled in for you: ${escape(live.map(label).join(', '))}. Change anything you like.</span>${live.some(id=>id!=='duration')?'<button type="button" data-review-fill>Review</button>':''}`;
 }
 function clearAutofill(){for(const id of filled)if(el(id).value===auto[id]&&id!=='category'&&id!=='duration'){el(id).value='';el(id).classList.remove('auto-filled')}auto={};filled=[];renderFilled()}
 el('orbitFilled').addEventListener('click',e=>{if(!e.target.closest('[data-review-fill]'))return;el('activityExtras').open=true;el('activityExtras').scrollIntoView({block:'start',behavior:'smooth'})});
 for(const id of ['notes','driverTitle','duration'])el(id).addEventListener('input',e=>{if(e.isTrusted){el(id).classList.remove('auto-filled');renderFilled()}});
 el('category').addEventListener('change',()=>{baseline.categoryTouched=true;el('category').classList.remove('auto-filled');renderFilled()});

 // --- Choosing a place runs the guided lookup. ---
 async function choose(place,{research=true}={}){
  if(!valid(place))return;
  ++generation;controller?.abort();clearTimeout(typing);setBusy(false);closeList();
  const title=el('title').value.trim();if(!title||title===autoTitle){el('title').value=place.name;autoTitle=place.name}
  const {aliases,planning:hints,...picked}=place;draft=structuredClone(picked);finding=false;transfers={};advice=null;el('placeQuery').value='';message('');preview();autofill(draft,hints||{});
  const fromGoogleSearch=!!draft.googleId&&!hasPoint(draft),orbitOn=shared(),steps=[fromGoogleSearch?{id:'google',label:'Getting the address, hours and photo from Google Maps'}:{id:'locate',label:'Pinpointing it on the map'},{id:'travel',label:'Working out travel times from your other stops'}];
  // Google already gives the address, hours and pin; Orbit's web research stays available from the place card.
  if(orbitOn&&research&&!draft.research&&!draft.googleId)steps.push({id:'research',label:'Orbit is searching the web for the address, hours and booking info (up to a minute)'});
  if(orbitOn&&schedule)steps.push({id:'check',label:'Orbit is checking how it fits your day'});
  flow?.abort();const current=flow=new AbortController(),signal=current.signal,notes=[];
  showLoading('Getting '+place.name+' ready…',steps,{now:steps.some(s=>s.id==='research')});
  try{
   let point=null;
   if(fromGoogleSearch){
    step('google','active');
    try{const found=await googleDetails(draft,signal);if(found){const {planning:more,...facts}=found;draft={...facts};point=hasPoint(draft)?{lat:draft.lat,lon:draft.lon}:null;if(el('title').value.trim()===autoTitle){el('title').value=draft.name;autoTitle=draft.name}preview();autofill(draft,more||{})}step('google',found?'done':'failed')}
    catch(e){if(signal.aborted)throw e;notes.push(e.message);step('google','failed')}
   }else{step('locate','active');point=await locate(draft,signal);if(point)Object.assign(draft,point);step('locate',point?'done':'skipped')}
   step('travel','active');await updateJourney(signal);step('travel','done');
   if(steps.some(s=>s.id==='research')){
    step('research','active');
    try{const data=await orbit({query:researchQuery(draft),country:el('placeCountry').value},signal,110000);const best=Array.isArray(data.places)?data.places.find(valid):null;if(best){const {planning:found,...facts}=best;draft=mergeResearch(draft,facts);preview();autofill(draft,found||{});
     // The address Orbit found can pin a place the map didn't know by name.
     if(!point&&draft.address&&(point=await locate(draft,signal))){Object.assign(draft,point);preview();await updateJourney(signal)}}else notes.push(String(data.message||'Orbit couldn’t confirm details with sources.'));step('research',best?'done':'skipped')}
    catch(e){if(signal.aborted)throw e;notes.push(e.message);step('research','failed')}
   }
   if(!point)notes.push('Couldn’t pin it on the map, so travel times are unavailable.');
   if(steps.some(s=>s.id==='check')){step('check','active');await checkPlan(signal);step('check',advice&&!advice.error?'done':'failed')}
  }catch{notes.push('Skipped. You can run Research with Orbit any time.')}
  finally{if(flow===current){flow=null;hideLoading();preview();renderJourney();renderAdvice();message(notes.join(' '))}}
 }
 async function askOrbit(){
  const q=el('placeQuery').value.trim();if(q.length<2){message('Type a place name first.');return}
  if(!shared()){closeList();el('orbitStatus').hidden=false;message('Orbit only works on your shared trip. Tap “Turn on Orbit” above, then try again.');return}
  ++generation;controller?.abort();clearTimeout(typing);setBusy(false);closeList();
  flow?.abort();const current=flow=new AbortController();showLoading('Researching “'+q+'”…',[{id:'research',label:'Orbit is searching the web — this can take up to a minute'}],{now:true});step('research','active');
  try{const data=await orbit({query:q,country:el('placeCountry').value},current.signal,110000);const found=(Array.isArray(data.places)?data.places:[]).filter(valid);if(flow!==current)return;if(found.length){renderOptions(found,'Orbit found');message((data.cached?'Recent research · ':'')+'Choose the right place.')}else{closeList();message(String(data.message||'Orbit couldn’t find this place. Add the town (e.g. “大湖”) or enter it yourself.'))}}
  catch(e){if(flow===current){closeList();message(e.message)}}
  finally{if(flow===current){flow=null;hideLoading();el('placeQuery').focus({preventScroll:true})}}
 }

 // --- Travel legs and fit. ---
 function neighbour(dir){
  if(!schedule)return null;const {stops,index}=schedule;
  // Transfers without a place ("Drive to…") are the journey itself, so measure from the stop before them.
  for(let i=index+dir;i>=0&&i<stops.length;i+=dir){const s=stops[i];if(s.card.category==='break'||(s.card.category==='travel'&&!s.card.place))continue;return s}
  return null;
 }
 async function stopPoint(card,signal){
  if(card.place)return locate(card.place,signal);
  const found=known(card.title+' '+card.notes);return found.length===1?locate(found[0],signal):null;
 }
 async function updateJourney(signal){
  const token=++journeyToken;if(!draft||!schedule){journey=null;renderJourney();return}
  const prev=neighbour(-1),next=neighbour(1);journey={prev:prev&&{stop:prev,loading:true},next:next&&{stop:next,loading:true}};renderJourney();
  const leg=async(stop,outbound)=>{if(!stop)return null;const point=await stopPoint(stop.card,signal);if(!point||!hasPoint(draft))return {stop,point};return {stop,point,route:await travel(outbound?draft:point,outbound?point:draft,signal)}};
  const [a,b]=await Promise.all([leg(prev,false),leg(next,true)]);
  if(token!==journeyToken)return;journey={prev:a,next:b};near=a?.point||null;renderJourney();renderAdvice();
 }
 function fit(free,need){
  if(need===undefined)return null;const spare=free-need;
  if(spare>=10)return {level:'ok',text:`${span(spare)} to spare`};
  if(spare>=0)return {level:'tight',text:spare?`Only ${span(spare)} spare — little room for parking or traffic`:'No spare time for parking or traffic'};
  return {level:'short',text:`About ${span(-spare)} short`};
 }
 function legHTML(leg,outbound){
  const label=outbound?'Then to':'From';
  if(!leg)return `<li class="leg leg-none"><span class="leg-dir" aria-hidden="true">${outbound?'↓':'↑'}</span><div><strong>${outbound?'Last stop of the day':'First stop of the day'}</strong></div></li>`;
  const {stop}=leg,title=escape(stop.card.title),free=outbound?stop.start-schedule.end:schedule.start-stop.end;
  if(leg.loading)return `<li class="leg is-loading"><span class="leg-dir" aria-hidden="true">${outbound?'↓':'↑'}</span><div><strong>${label} ${title}</strong><span class="leg-detail">Calculating travel time…</span></div></li>`;
  if(!leg.route)return `<li class="leg"><span class="leg-dir" aria-hidden="true">${outbound?'↓':'↑'}</span><div><strong>${label} ${title}</strong><span class="leg-detail">${hasPoint(draft)?`Add a place to “${title}” to see the travel time.`:'Travel time appears once this place is on the map.'} ${free>0?span(free)+' free between them.':'No gap between them.'}</span></div></li>`;
  const r=leg.route,f=r.km<.05?null:fit(free,r.minutes),from=outbound?draft:leg.point,to=outbound?leg.point:draft;
  return `<li class="leg"><span class="leg-dir" aria-hidden="true">${outbound?'↓':'↑'}</span><div><strong>${label} ${title}</strong><span class="leg-detail">${r.km<.05?'Same place':`${r.km.toFixed(r.km<10?1:0)} km · ~${span(r.minutes)} drive${r.estimated?' (rough estimate)':''}`} · ${span(free)} free ${outbound?'before it starts at '+clock(stop.start):'after it ends at '+clock(stop.end)}</span>${f?`<span class="fit fit-${f.level}">${f.level==='ok'?'✓':f.level==='tight'?'!':'✕'} ${escape(f.text)}</span>`:''}</div>${r.km>=.05?`<a class="leg-link" href="${escape(PlaceCore.directions(from,to))}" target="_blank" rel="noopener noreferrer" aria-label="Directions in Google Maps from ${outbound?escape(draft.name):title} to ${outbound?title:escape(draft.name)}">Route ↗</a>`:''}</li>`;
 }
 const roundUp=m=>Math.ceil(m/5)*5;
 // The day is packed back to back, so a drive only fits as its own card; later activities then shift.
 const driveFor=l=>roundUp(l.route.minutes+10);
 function transferCard(k,leg){
  const minutes=transfers[k];if(!minutes||!leg?.route)return null;const other=leg.stop.card.title,name=draft.name;
  return {id:(typeof uid==='function'?uid():String(Math.random()).slice(2)),title:k==='prev'?`Drive to ${name}`:`Drive to ${other}`,notes:`About ${span(leg.route.minutes)} by car (${leg.route.km.toFixed(1)} km${leg.route.estimated?', rough estimate':''}) ${k==='prev'?'from '+other:'from '+name}, plus time for parking and getting everyone ready. Added from the travel check.`,category:'travel',duration:minutes};
 }
 function withTransfers(cards,id){
  if(!draft||!journey)return cards;const i=cards.findIndex(c=>c.id===id);if(i<0)return cards;
  const before=transferCard('prev',journey.prev),after=transferCard('next',journey.next);
  return [...cards.slice(0,i),...(before?[before]:[]),cards[i],...(after?[after]:[]),...cards.slice(i+1)];
 }
 function journeySummary(){
  const legs=[['prev',journey.prev],['next',journey.next]].filter(([,l])=>l?.route&&l.route.km>=.05).map(([k,l])=>{const free=k==='prev'?schedule.start-l.stop.end:l.stop.start-schedule.end;return {k,l,free,f:fit(free,l.route.minutes)}});
  const added=Object.entries(transfers).filter(([,m])=>m).map(([k,m])=>`<span class="drive-chip">🚗 ${span(m)} drive ${k==='prev'?'before':'after'} this stop<button type="button" data-drop-transfer="${k}" aria-label="Remove the ${span(m)} drive ${k==='prev'?'before':'after'} this stop">✕</button></span>`).join('');
  if(!legs.length)return added?`<div class="journey-summary is-ok"><div class="journey-fixes">${added}</div></div>`:'';
  const short=legs.filter(x=>x.f.level==='short'),tight=legs.filter(x=>x.f.level==='tight');
  const fixes=[...short,...tight].filter(x=>!transfers[x.k]).map(x=>`<button type="button" data-add-transfer="${x.k}" data-minutes="${driveFor(x.l)}">＋ Add a ${span(driveFor(x.l))} drive ${x.k==='prev'?'from “'+escape(x.l.stop.card.title)+'”':'to “'+escape(x.l.stop.card.title)+'”'}</button>`).join('');
  const chips=added?`<div class="journey-fixes">${added}</div>`:'';
  if(short.length)return `<div class="journey-summary is-short"><p><strong>Travel doesn’t fit yet.</strong> ${short.map(x=>x.k==='prev'?`Getting here from “${escape(x.l.stop.card.title)}” takes ~${span(x.l.route.minutes)}, but there’s ${x.free>0?'only '+span(x.free):'no time'} between them.`:`Reaching “${escape(x.l.stop.card.title)}” takes ~${span(x.l.route.minutes)}, but there’s ${x.free>0?'only '+span(x.free):'no time'} before it starts.`).join(' ')}</p>${fixes?`<div class="journey-fixes">${fixes}</div><p class="journey-note">Adds a “Getting around” card; later activities move to make room.</p>`:''}${chips}</div>`;
  if(tight.length)return `<div class="journey-summary is-tight"><p><strong>Travel fits, just.</strong> Little buffer for traffic, parking or getting the kids ready.</p>${fixes?`<div class="journey-fixes">${fixes}</div>`:''}${chips}</div>`;
  return `<div class="journey-summary is-ok"><p><strong>✓ Travel fits</strong> around your other stops.</p>${chips}</div>`;
 }
 const reschedule=()=>el('activityStart').dispatchEvent(new Event('input',{bubbles:true}));
 el('journey').addEventListener('click',e=>{
  const add=e.target.closest('[data-add-transfer]'),drop=e.target.closest('[data-drop-transfer]');
  if(add){transfers[add.dataset.addTransfer]=Number(add.dataset.minutes);reschedule()}
  if(drop){delete transfers[drop.dataset.dropTransfer];reschedule()}
 });
 function renderJourney(){
  const box=el('journey');if(!draft||!schedule||!journey){box.innerHTML=draft?'':'<p class="journey-empty">Choose a place in step 1 to see travel times from your previous and next stops.</p>';return}
  box.innerHTML=journeySummary()+`<ol class="legs">${legHTML(journey.prev,false)}<li class="leg leg-here"><span class="leg-dir" aria-hidden="true">●</span><div><strong>${escape(draft.name)}</strong><span class="leg-detail">${clock(schedule.start)}–${clock(schedule.end)}</span></div></li>${legHTML(journey.next,true)}</ol>${[journey.prev,journey.next].some(l=>l?.route?.estimated)?'<p class="field-help">Rough estimates assume ~40 km/h. Driving times exclude traffic.</p>':'<p class="field-help">Driving times exclude traffic and parking.</p>'}`;
 }

 // --- Orbit's plan check. ---
 function plan(){
  if(!draft||!schedule)return null;
  const leg=(l,key,time)=>l?{title:l.stop.card.title,place:l.stop.card.place?.name||(known(l.stop.card.title+' '+l.stop.card.notes).length===1?known(l.stop.card.title+' '+l.stop.card.notes)[0].name:''),[key]:clock(time),travelMinutes:l.route?.minutes,km:l.route?.km,estimated:!!l.route?.estimated}:null;
  return {place:{name:draft.name,address:draft.address||'',openingHours:draft.openingHours||'',description:draft.description||''},date:schedule.date,start:clock(schedule.start),end:clock(schedule.end),previous:leg(journey?.prev,'leaveAt',journey?.prev?.stop.end),next:leg(journey?.next,'startsAt',journey?.next?.stop.start)};
 }
 const planKey=()=>JSON.stringify(plan());
 async function checkPlan(signal){
  const request=plan();if(!request)return;const key=JSON.stringify(request);
  try{const data=await orbit({action:'evaluate',plan:request},signal,30000);if(!data.evaluation)throw Error('Orbit couldn’t check this plan.');advice={key,...data.evaluation}}
  catch(e){if(signal?.aborted)throw e;advice={key,error:e.message}}
  renderAdvice();
 }
 async function recheck(){
  flow?.abort();const current=flow=new AbortController();showLoading('Checking your plan…',[{id:'travel',label:'Updating travel times'},{id:'check',label:'Orbit is checking how it fits your day'}]);
  try{step('travel','active');await updateJourney(current.signal);step('travel','done');step('check','active');await checkPlan(current.signal)}catch{}
  finally{if(flow===current){flow=null;hideLoading();renderAdvice()}}
 }
 function renderAdvice(){
  const box=el('orbitAdvice');if(!draft||!schedule){box.innerHTML='';return}
  if(!shared()){box.innerHTML='<p class="orbit-note"><span aria-hidden="true">✦</span> Open your private shared trip link to let Orbit research places and check whether they fit your day.</p>';return}
  const stale=advice&&advice.key!==planKey(),labels={good:'Looks good',tight:'Tight but doable',not_recommended:'Not recommended'};
  if(!advice){box.innerHTML='<button type="button" class="orbit-button" data-orbit-check>✦ Ask Orbit if this fits</button>';return}
  if(advice.error){box.innerHTML=`<div class="orbit-card orbit-error"><p>${escape(advice.error)}</p><button type="button" class="orbit-button" data-orbit-check>Try again</button></div>`;return}
  box.innerHTML=`<div class="orbit-card verdict-${escape(advice.verdict)}${stale?' is-stale':''}"><p class="orbit-head"><span class="verdict">${escape(labels[advice.verdict]||'Orbit’s view')}</span><span class="orbit-by">✦ Orbit</span></p><p class="orbit-headline">${escape(advice.headline)}</p>${advice.reasons?.length?`<ul>${advice.reasons.map(r=>`<li>${escape(r)}</li>`).join('')}</ul>`:''}${advice.suggestion?`<p class="orbit-suggestion"><strong>Try:</strong> ${escape(advice.suggestion)}</p>`:''}${stale?'<p class="orbit-stale">You changed the time or place since Orbit checked.</p><button type="button" class="orbit-button" data-orbit-check>Re-check with Orbit</button>':''}<p class="field-help">AI suggestion — use your own judgement.</p></div>`;
 }
 el('orbitTurnOn').onclick=()=>{el('editor').close();document.getElementById('share').click()};
 el('orbitAdvice').onclick=e=>{if(e.target.closest('[data-orbit-check]'))recheck()};

 // --- Selected place panel. ---
 function preview(){
  const box=el('placeSelected');el('placeFinder').hidden=!!draft&&!finding;el('placeFields').classList.toggle('has-place',!!draft);
  box.innerHTML=draft?`<div class="selected-place"><div class="selected-head"><span class="selected-label">Selected place</span><div class="selected-tools"><button type="button" id="changePlace">${finding?'Keep this place':'Change'}</button><button type="button" id="removePlace">Remove</button></div></div>${html(draft)}<div class="selected-actions"><button type="button" id="correctPlace">Edit details</button>${draft.research?'':'<button type="button" id="researchPlace" class="orbit-button">✦ Research with Orbit</button>'}</div></div>`:'';
  if(!draft)return;
  el('changePlace').onclick=()=>{finding=!finding;preview();if(finding){el('placeQuery').focus();onType()}else closeList()};
  el('removePlace').onclick=()=>{draft=null;finding=false;advice=null;journey=null;transfers={};clearAutofill();reschedule();if(el('title').value.trim()===autoTitle)autoTitle='';preview();renderJourney();renderAdvice();message('');el('placeQuery').focus()};
  el('correctPlace').onclick=()=>{finding=true;preview();el('placeManual').open=true;el('manualPlaceName').value=draft.name;el('manualPlaceAddress').value=draft.address||'';el('manualPlaceDescription').value=draft.description||'';el('manualPlaceBooking').value=draft.bookingUrl||'';el('manualPlaceName').focus()};
  el('researchPlace')?.addEventListener('click',()=>{if(!shared()){message('Open your private shared trip link first (Trip options → Share trip) to use Orbit.');return}choose(draft)});
 }

 // --- Editor lifecycle and events. ---
 function open(card){
  ++generation;controller?.abort();flow?.abort();flow=null;clearTimeout(typing);clearTimeout(loadingTimer);el('orbitLoading').hidden=true;el('form').removeAttribute('aria-busy');
  draft=card?.place&&valid(card.place)?structuredClone(card.place):null;session='';finding=false;advice=null;journey=null;autoTitle='';near=null;transfers={};auto={};filled=[];baseline={isNew:!card,duration:Number(el('duration').value),categoryTouched:!!card};for(const id of ['notes','driverTitle','category','duration'])el(id).classList.remove('auto-filled');el('orbitFilled').hidden=true;el('orbitStatus').hidden=shared();
  el('placeQuery').value='';el('placeManual').open=false;el('manualPlaceMessage').textContent='';for(const id of ['manualPlaceName','manualPlaceAddress','manualPlaceDescription','manualPlaceBooking'])el(id).value='';
  el('placeCountry').value=/changi|singapore|樟宜/i.test(card?.title||'')?'sg':'tw';setBusy(false);closeList();message('');preview();renderJourney();renderAdvice();
 }
 // Google photo links can expire; drop the frame rather than show a broken image.
 document.addEventListener('error',e=>{if(e.target?.matches?.('.place-photo img'))e.target.closest('figure')?.remove()},true);
 el('placeQuery').addEventListener('input',onType);
 el('placeQuery').addEventListener('focus',()=>{if(!el('placeQuery').value&&!draft)onType()});
 el('placeQuery').addEventListener('keydown',e=>{
  const listOpen=!el('placeResults').hidden;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!listOpen)onType();highlight(active+(e.key==='ArrowDown'?1:-1))}
  else if(e.key==='Enter'){e.preventDefault();const items=[...el('placeResults').querySelectorAll('[role=option]')];if(items[active]){items[active].click();return}const first=items.find(b=>b.matches('[data-place-result]:not(.is-weak)'))||items.find(b=>b.matches('[data-ask-orbit]'));first?.click()}
  else if(e.key==='Escape'&&listOpen){e.preventDefault();e.stopPropagation();closeList()}
 });
 el('placeResults').addEventListener('click',e=>{const ask=e.target.closest('[data-ask-orbit]');if(ask){askOrbit();return}if(e.target.closest('[data-manual-place]')){closeList();el('placeManual').open=true;if(!el('manualPlaceName').value)el('manualPlaceName').value=el('placeQuery').value.trim();el('manualPlaceName').focus();return}const b=e.target.closest('[data-place-result]');if(b)choose(options[Number(b.dataset.placeResult)])});
 document.addEventListener('click',e=>{if(!el('placeResults').hidden&&!e.target.closest('#placeFinder'))closeList()});
 el('placeCountry').onchange=()=>{remoteCache.clear();if(el('placeQuery').value)onType()};
 el('useManualPlace').onclick=()=>{
  const name=el('manualPlaceName').value.trim(),address=el('manualPlaceAddress').value.trim(),bookingUrl=el('manualPlaceBooking').value.trim();
  if(!name){el('manualPlaceMessage').textContent='Add a place name first.';el('manualPlaceName').focus();return}
  if(bookingUrl&&!PlaceCore.url(bookingUrl)){el('manualPlaceMessage').textContent='Use a full https:// or http:// booking link.';el('manualPlaceBooking').focus();return}
  const keep=draft&&draft.name===name&&(draft.address||'')===address?{lat:draft.lat,lon:draft.lon}:{};
  el('placeManual').open=false;el('manualPlaceMessage').textContent='';
  choose({...keep,name,address,description:el('manualPlaceDescription').value.trim(),bookingUrl,bookingLabel:'Saved booking link',bookingNote:'User-entered link; confirm the venue and date.'},{research:false});
 };
 el('editor').addEventListener('close',()=>{++generation;controller?.abort();flow?.abort();clearTimeout(typing);clearTimeout(journeyTimer)});
 function card(c){const found=known(c.title+' '+c.notes);return `<div class="place-on-card" data-place-card="${escape(c.id)}">${c.place?html(c.place):''}<button type="button" data-place-edit="${escape(c.id)}">${c.place?'Change place':found.length?'⌖ '+found.length+' place suggestion'+(found.length>1?'s':''):'⌖ Add a place'}</button></div>`}
 document.addEventListener('click',e=>{
  const b=e.target.closest('[data-place-edit]');if(!b)return;const c=state.days[day].cards.find(c=>c.id===b.dataset.placeEdit);if(!c)return;
  openEditor(c);el('placeFields').scrollIntoView({block:'start'});
  if(c.place){finding=true;preview()}else el('placeQuery').value=placeName(c.title);el('placeQuery').focus({preventScroll:true});onType();
 });
 // app.js reports the previewed day whenever the day, time or duration changes.
 function scheduleChanged(next){schedule=next;clearTimeout(journeyTimer);if(!draft){renderJourney();return}if(!next){journey=null;renderJourney();renderAdvice();return}journeyTimer=setTimeout(()=>updateJourney().catch(()=>{}),250)}
 window.orbitPlaces={open,value:()=>draft?structuredClone(draft):undefined,card,schedule:scheduleChanged,withTransfers,locate,settings};
 fetch('places.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(list=>{catalogue=list.filter(p=>valid(p)&&Array.isArray(p.aliases));if(typeof state!=='undefined'&&state){for(const node of document.querySelectorAll('[data-place-card]')){const c=state.days.flatMap(d=>d.cards).find(c=>c.id===node.dataset.placeCard);if(c)node.outerHTML=card(c)}}}).catch(()=>message('Known-place suggestions could not load. Map suggestions and manual entry still work.'));
})();
