// Google Maps place search for Little Orbit, called through the google-places edge function so the key stays server-side.
// Daily caps keep a public site inside Google's free monthly allowance (they reset each UTC day):
//  autocomplete 300/day (~9,000/month, 10,000 free), place details 30/day (~900/month, 1,000 free Enterprise),
//  pins for existing stops 150/day (~4,500/month, within the free Essentials allowance).
export const LIMITS={autocomplete:300,details:30,locate:150};
const API='https://places.googleapis.com/v1/';
const DETAIL_FIELDS='id,displayName,formattedAddress,location,googleMapsUri,regularOpeningHours.weekdayDescriptions,websiteUri,nationalPhoneNumber,rating,userRatingCount,businessStatus,primaryType,editorialSummary,photos';
const REGIONS={tw:'tw',sg:'sg'};
const CATEGORY={restaurant:'food',cafe:'food',coffee_shop:'food',bakery:'food',fast_food_restaurant:'food',ice_cream_shop:'food',food_court:'food',dessert_shop:'food',meal_takeaway:'food',lodging:'hotel',hotel:'hotel',resort_hotel:'hotel',bed_and_breakfast:'hotel',guest_house:'hotel',hostel:'hotel',shopping_mall:'shopping',department_store:'shopping',market:'shopping',supermarket:'shopping',store:'shopping',gift_shop:'shopping',train_station:'travel',airport:'travel',bus_station:'travel',transit_station:'travel',zoo:'kids',amusement_park:'kids',aquarium:'kids',playground:'kids',park:'kids',museum:'kids',farm:'kids',tourist_attraction:'kids',national_park:'kids',water_park:'kids'};
const text=(v,max=300)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,max):'';
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:''}catch{return ''}};
const placeId=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{10,300}$/.test(v)?v:'';
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{8,64}$/.test(v)?v:undefined;
function bias(b){
 const lat=Number(b?.lat),lon=Number(b?.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return undefined;
 return {circle:{center:{latitude:lat,longitude:lon},radius:Math.min(Math.max(Number(b.radius)||30000,1000),50000)}};
}

// Google's answer → the planner's place shape (same fields PlaceCore renders). Never trusts Google's text as HTML.
export function toPlace(en,zh,photo,today){
 const lat=Number(en?.location?.latitude),lon=Number(en?.location?.longitude),id=placeId(en?.id);
 if(!id||!text(en?.displayName?.text))return null;
 const name=text(en.displayName.text,200),nameZh=text(zh?.displayName?.text,200),hours=(en.regularOpeningHours?.weekdayDescriptions||[]).map(d=>text(d,80)).filter(Boolean).slice(0,7).join('\n');
 const status={CLOSED_TEMPORARILY:'temporarily_closed',CLOSED_PERMANENTLY:'permanently_closed'}[en.businessStatus];
 const place={id:'google-'+id,googleId:id,name,address:text(en.formattedAddress),description:text(en.editorialSummary?.text,600),source:https(en.googleMapsUri)||'https://www.google.com/maps',googleUrl:https(en.googleMapsUri),checked:today,bookingNote:'Booking requirement not confirmed yet.',planning:{category:CATEGORY[en.primaryType]||''}};
 if(nameZh&&nameZh!==name)place.nameZh=nameZh;
 const addressZh=text(zh?.formattedAddress);if(addressZh&&addressZh!==place.address)place.addressZh=addressZh;
 if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)Object.assign(place,{lat,lon});
 if(hours)place.openingHours=hours;
 if(status)place.status=status;
 const website=https(en.websiteUri);if(website)place.website=website;
 const phone=text(en.nationalPhoneNumber,40);if(phone)place.phone=phone;
 if(Number.isFinite(en.rating)&&en.rating>=0&&en.rating<=5){place.rating=en.rating;place.ratingCount=Number.isInteger(en.userRatingCount)?en.userRatingCount:0}
 if(photo?.url){place.photo=photo.url;if(photo.credit)place.photoCredit=photo.credit}
 if(!place.description)delete place.description;
 return place;
}

export function createGoogleHandler({env,fetcher=fetch,now=()=>Date.now()}){
 const key=()=>String(env('GOOGLE_MAPS_API_KEY')||'').trim().replace(/^(['"])(.*)\1$/,'$2').trim();
 const origin=env('ALLOWED_ORIGIN')||'https://ragonic1-eng.github.io';
 const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'content-type,apikey','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin','Cache-Control':'no-store','Content-Type':'application/json'};
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:cors});
 async function rpc(name,body){
  const base=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');if(!base||!service)throw Error('BACKEND');
  const r=await fetcher(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('BACKEND');return r.json();
 }
 async function google(path,{method='GET',fields,body,query={}}={}){
  const url=new URL(API+path);for(const [k,v] of Object.entries(query))if(v!==undefined)url.searchParams.set(k,v);
  const headers={'X-Goog-Api-Key':key()};if(fields)headers['X-Goog-FieldMask']=fields;if(body)headers['Content-Type']='application/json';
  const r=await fetcher(url.href,{method,headers,body:body&&JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!r.ok){const e=Error(r.status===429?'GOOGLE_LIMIT':r.status===400||r.status===401||r.status===403?'GOOGLE_AUTH':'GOOGLE');e.detail='HTTP '+r.status+' '+(await r.text().catch(()=>'')).slice(0,300);throw e}
  return r.json();
 }
 async function allow(scope){const r=await rpc('orbit_claim_google',{p_scope:scope,p_limit:LIMITS[scope]});return r===true||r?.ok===true}
 const cached=async k=>{try{return await rpc('orbit_google_cache_get',{p_key:k})}catch{return null}};
 const remember=async(k,v)=>{try{await rpc('orbit_google_cache_put',{p_key:k,p_result:v})}catch{}};
 const today=()=>new Date(now()).toISOString().slice(0,10);

 async function details(id,session,region){
  const k='details|'+id,hit=await cached(k);if(hit?.place)return {place:hit.place,cached:true};
  if(!await allow('details'))return {status:429,error:'Today’s Google Maps limit is used up. Enter the details yourself or try again tomorrow.'};
  const [en,zh]=await Promise.all([
   google('places/'+encodeURIComponent(id),{fields:DETAIL_FIELDS,query:{languageCode:'en',regionCode:region,sessionToken:session}}),
   google('places/'+encodeURIComponent(id),{fields:'displayName,formattedAddress',query:{languageCode:'zh-TW',regionCode:region}}).catch(()=>null)]);
  let photo=null;const first=(en.photos||[]).find(p=>typeof p?.name==='string'&&/^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(p.name));
  if(first)try{const media=await google(first.name+'/media',{query:{maxWidthPx:'640',skipHttpRedirect:'true'}});const url=https(media?.photoUri);if(url)photo={url,credit:text(first.authorAttributions?.[0]?.displayName,100)}}catch{}
  const place=toPlace(en,zh,photo,today());if(!place)throw Error('GOOGLE');
  await remember(k,{place});return {place};
 }
 async function locate(query,region,near){
  const k='locate|'+region+'|'+query.normalize('NFKC').toLowerCase(),hit=await cached(k);if(hit&&'point' in hit)return {...hit,cached:true};
  if(!await allow('locate'))return {status:429,error:'Today’s Google Maps limit is used up.'};
  // IDs-only text search, then the cheapest details (location and address) for the best match.
  const found=await google('places:searchText',{method:'POST',fields:'places.id',body:{textQuery:query,regionCode:region,languageCode:'zh-TW',pageSize:1,...(bias(near)?{locationBias:bias(near)}:{})}});
  const id=placeId(found?.places?.[0]?.id);let point=null;
  if(id){const d=await google('places/'+encodeURIComponent(id),{fields:'id,location,formattedAddress',query:{languageCode:'zh-TW',regionCode:region}});const lat=Number(d?.location?.latitude),lon=Number(d?.location?.longitude);if(Number.isFinite(lat)&&Number.isFinite(lon))point={lat,lon,googleId:id,address:text(d.formattedAddress)}}
  await remember(k,{point});return {point};
 }

 return async req=>{
  const requestOrigin=req.headers.get('Origin');if(requestOrigin&&requestOrigin!==origin)return reply(403,{error:'This origin is not allowed.'});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method==='GET')return reply(200,{available:!!key()});
  if(req.method!=='POST')return reply(405,{error:'Use POST.'});
  if(!key())return reply(503,{error:'Google Maps search is not set up yet.',code:'NOT_CONFIGURED'});
  let action='';
  try{
   if(!req.headers.get('Content-Type')?.startsWith('application/json'))return reply(400,{error:'Expected JSON.'});
   const raw=await req.text();if(raw.length>2000)return reply(413,{error:'Request too large.'});
   let body;try{body=JSON.parse(raw)}catch{return reply(400,{error:'Invalid request.'})}
   action=String(body?.action||'');const region=REGIONS[body.country];
   if(action==='autocomplete'){
    const input=text(body.input,120);if(input.length<2)return reply(400,{error:'Type at least 2 characters.'});
    if(!await allow('autocomplete'))return reply(429,{error:'Today’s Google Maps search limit is used up. Try again tomorrow or enter the place yourself.'});
    const data=await google('places:autocomplete',{method:'POST',body:{input,sessionToken:token(body.sessionToken),languageCode:/[㐀-鿿]/.test(input)?'zh-TW':'en',...(region?{includedRegionCodes:[region]}:{}),...(bias(body.near)?{locationBias:bias(body.near)}:{})}});
    const suggestions=(data?.suggestions||[]).map(s=>s.placePrediction).filter(p=>placeId(p?.placeId)).slice(0,6).map(p=>({placeId:p.placeId,name:text(p.structuredFormat?.mainText?.text||p.text?.text,200),address:text(p.structuredFormat?.secondaryText?.text)})).filter(s=>s.name);
    return reply(200,{suggestions});
   }
   if(action==='details'){
    const id=placeId(body.placeId);if(!id)return reply(400,{error:'Unknown place.'});
    const result=await details(id,token(body.sessionToken),region);return reply(result.status||200,result);
   }
   if(action==='locate'){
    const query=text(body.query,200);if(query.length<2)return reply(400,{error:'Missing place.'});
    const result=await locate(query,region,body.near);return reply(result.status||200,result);
   }
   return reply(400,{error:'Unknown action.'});
  }catch(e){
   const code=e?.name==='TimeoutError'?'GOOGLE_TIMEOUT':['BACKEND','GOOGLE','GOOGLE_AUTH','GOOGLE_LIMIT'].includes(e?.message)?e.message:'UNEXPECTED';
   console.error(JSON.stringify({google:action,code,detail:String(e?.detail||(code==='UNEXPECTED'?e?.message:'')||'').replace(key()||'\u0000','[key]').slice(0,400)}));
   const message=code==='GOOGLE_AUTH'?'Google Maps rejected the key. Check that Places API (New) is enabled and billing is on.':code==='GOOGLE_LIMIT'?'Google Maps is busy. Try again in a minute.':'Google Maps search failed. Try again.';
   return reply(code==='GOOGLE_AUTH'?502:503,{error:message,code});
  }
 };
}
