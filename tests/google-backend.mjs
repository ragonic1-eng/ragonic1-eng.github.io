import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoogleHandler,toPlace,LIMITS} from '../supabase/functions/_shared/google.mjs';
const secrets={GOOGLE_MAPS_API_KEY:'test-google-key',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret'};
const ID='ChIJ_strawberry_farm_1234';
const en={id:ID,displayName:{text:'Red Glazed Tile Strawberry Farm'},formattedAddress:'No. 96-6, Linliping, Dahu Township, Miaoli County, Taiwan 364',location:{latitude:24.3912,longitude:120.8721},googleMapsUri:'https://maps.google.com/?cid=123',regularOpeningHours:{weekdayDescriptions:['Monday: Closed','Tuesday: 9:00 AM – 5:30 PM']},websiteUri:'https://www.facebook.com/dahuRED',nationalPhoneNumber:'0972 055 042',rating:4.6,userRatingCount:812,businessStatus:'OPERATIONAL',primaryType:'farm',photos:[{name:`places/${ID}/photos/abc_DEF-1`,authorAttributions:[{displayName:'A visitor'}]}]};
const zh={displayName:{text:'紅色琉璃瓦草莓園'},formattedAddress:'364苗栗縣大湖鄉義和村淋漓坪96-6號'};
const request=(payload,origin='https://ragonic1-eng.github.io')=>new Request('https://backend.example',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
function harness({env=secrets,allow=true,cache=null,googleStatus=200}={}){
 const calls=[];
 const handler=createGoogleHandler({env:k=>env[k],now:()=>Date.parse('2026-10-27T00:00:00Z'),fetcher:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('orbit_claim_google'))return Response.json(allow);
  if(url.endsWith('orbit_google_cache_get'))return Response.json(cache);
  if(url.endsWith('orbit_google_cache_put'))return Response.json({ok:true});
  if(googleStatus!==200)return new Response('{"error":{"status":"PERMISSION_DENIED"}}',{status:googleStatus});
  if(url.includes('places:autocomplete'))return Response.json({suggestions:[{placePrediction:{placeId:ID,text:{text:'紅色琉璃瓦草莓園, 大湖鄉'},structuredFormat:{mainText:{text:'紅色琉璃瓦草莓園'},secondaryText:{text:'苗栗縣大湖鄉'}}}},{queryPrediction:{text:{text:'草莓園'}}}]});
  if(url.includes('/media'))return Response.json({photoUri:'https://lh3.googleusercontent.com/photo.jpg'});
  if(url.includes('places:searchText'))return Response.json({places:[{id:ID}]});
  if(url.includes('languageCode=zh-TW')&&options.headers['X-Goog-FieldMask']==='displayName,formattedAddress')return Response.json(zh);
  if(options.headers['X-Goog-FieldMask']==='id,location,formattedAddress')return Response.json({id:ID,location:en.location,formattedAddress:zh.formattedAddress});
  return Response.json(en);
 }});
 return {handler,calls,google:()=>calls.filter(c=>c.url.startsWith('https://places.googleapis.com/'))};
}
test('autocomplete sends the key only to Google, limits it to Taiwan, and returns plain suggestions',async()=>{
 const {handler,google}=harness();const r=await handler(request({action:'autocomplete',input:'紅色琉璃瓦',country:'tw',sessionToken:'abcd1234abcd1234'}));
 assert.equal(r.status,200);const data=await r.json();assert.deepEqual(data.suggestions,[{placeId:ID,name:'紅色琉璃瓦草莓園',address:'苗栗縣大湖鄉'}]);
 const [call]=google();assert.equal(call.options.headers['X-Goog-Api-Key'],'test-google-key');const sent=JSON.parse(call.options.body);
 assert.deepEqual(sent.includedRegionCodes,['tw']);assert.equal(sent.sessionToken,'abcd1234abcd1234');assert.equal(sent.languageCode,'zh-TW');
 assert.ok(!JSON.stringify(data).includes('test-google-key'));
});
test('details become a planner place with Chinese name, pin, hours, rating, photo and the Google Maps link, then are cached',async()=>{
 const {handler,calls,google}=harness();const data=await(await handler(request({action:'details',placeId:ID,country:'tw',sessionToken:'abcd1234abcd1234'}))).json();
 const p=data.place;assert.equal(p.name,'Red Glazed Tile Strawberry Farm');assert.equal(p.nameZh,'紅色琉璃瓦草莓園');assert.equal(p.addressZh,zh.formattedAddress);
 assert.equal(p.lat,24.3912);assert.equal(p.googleUrl,'https://maps.google.com/?cid=123');assert.equal(p.rating,4.6);assert.equal(p.ratingCount,812);
 assert.equal(p.photo,'https://lh3.googleusercontent.com/photo.jpg');assert.equal(p.photoCredit,'A visitor');assert.match(p.openingHours,/Tuesday: 9:00 AM/);assert.equal(p.planning.category,'kids');
 assert.equal(google().length,3);assert.ok(google()[0].url.includes('sessionToken=abcd1234abcd1234'));assert.ok(calls.some(c=>c.url.endsWith('orbit_google_cache_put')));
});
test('cached details and pins skip Google entirely',async()=>{
 const {handler,google}=harness({cache:{place:{name:'Cached farm'}}});assert.equal((await(await handler(request({action:'details',placeId:ID}))).json()).place.name,'Cached farm');
 const pin=harness({cache:{point:{lat:1,lon:2}}});assert.equal((await(await pin.handler(request({action:'locate',query:'紅色琉璃瓦草莓園'}))).json()).point.lat,1);
 assert.equal(google().length+pin.google().length,0);
});
test('locate uses an IDs-only text search, then the cheapest details for the pin',async()=>{
 const {handler,google}=harness();const data=await(await handler(request({action:'locate',query:'紅色琉璃瓦草莓園 苗栗縣大湖鄉',country:'tw'}))).json();
 assert.deepEqual(data.point,{lat:24.3912,lon:120.8721,googleId:ID,address:zh.formattedAddress});
 const [search,detail]=google();assert.equal(search.options.headers['X-Goog-FieldMask'],'places.id');assert.equal(detail.options.headers['X-Goog-FieldMask'],'id,location,formattedAddress');
});
test('daily caps, bad origins, bad ids and a missing key never reach Google',async()=>{
 const capped=harness({allow:false});for(const body of [{action:'autocomplete',input:'farm'},{action:'details',placeId:ID},{action:'locate',query:'farm'}])assert.equal((await capped.handler(request(body))).status,429);
 assert.equal(capped.google().length,0);
 const {handler,google}=harness();assert.equal((await handler(request({action:'autocomplete',input:'farm'},'https://bad.example'))).status,403);
 assert.equal((await handler(request({action:'details',placeId:'../../evil'}))).status,400);assert.equal((await handler(request({action:'nope'}))).status,400);assert.equal(google().length,0);
 const missing=harness({env:{}});assert.equal((await missing.handler(new Request('https://backend.example'))).status,200);assert.equal((await(await missing.handler(new Request('https://backend.example'))).json()).available,false);
 const r=await missing.handler(request({action:'autocomplete',input:'farm'}));assert.equal(r.status,503);assert.equal((await r.json()).code,'NOT_CONFIGURED');
 assert.deepEqual(LIMITS,{autocomplete:300,details:30,locate:150});
});
test('a rejected key is reported clearly without leaking it',async()=>{
 const {handler}=harness({googleStatus:403});const r=await handler(request({action:'autocomplete',input:'farm'}));assert.equal(r.status,502);const data=await r.json();
 assert.equal(data.code,'GOOGLE_AUTH');assert.match(data.error,/Places API \(New\)/);assert.ok(!JSON.stringify(data).includes('test-google-key'));
});
test('toPlace ignores unsafe links and closed places are flagged',()=>{
 const p=toPlace({...en,googleMapsUri:'javascript:alert(1)',websiteUri:'http://plain.example',businessStatus:'CLOSED_TEMPORARILY'},null,null,'2026-10-27');
 assert.equal(p.googleUrl,'');assert.equal(p.website,undefined);assert.equal(p.status,'temporarily_closed');assert.equal(p.nameZh,undefined);
 assert.equal(toPlace({displayName:{text:'No id'}},null,null,'2026-10-27'),null);
});
