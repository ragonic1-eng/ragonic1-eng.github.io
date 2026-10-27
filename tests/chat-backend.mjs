import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatHandler,cleanTrip,cleanMessages,cleanReply} from '../supabase/functions/_shared/chat.mjs';
const env={DASHSCOPE_API_KEY:'relay-secret',QWEN_BASE_URL:'https://infistar.ai/v1',GOOGLE_MAPS_API_KEY:'google-secret',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'};
const trip={today:'2026-12-08',selectedDay:1,days:[{date:'2026-12-07',name:'Arrive',region:'Taoyuan',cards:[{id:'hotel-1',title:'Jolley Hotel',start:'20:00',end:'23:00',category:'hotel',place:{name:'Jolley Hotel',lat:25.04,lon:121.53}}]},{date:'2026-12-08',name:'Dahu',region:'Miaoli',cards:[{id:'farm-1',title:'Strawberry farm',start:'10:00',end:'12:00',category:'kids',notes:'x'.repeat(500)}]}]};
const body={roomId:'11111111-1111-1111-1111-111111111111',roomKey:'a'.repeat(64),messages:[{role:'user',text:'What is near the farm?'}],trip};
const request=(payload=body,origin='https://ragonic1-eng.github.io')=>new Request('https://x.example',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
const tool=(name,input,id='t1')=>({type:'tool_use',id,name,input});
function harness({turns,claim={ok:true},env:e=env,google={places:[{id:'ChIJ_cafe_123456',displayName:{text:'SUHU Café'},formattedAddress:'Dahu',location:{latitude:24.38,longitude:120.86},rating:4.7,userRatingCount:1884,googleMapsUri:'https://maps.google.com/?cid=1'}]}}){
 const calls=[];turns=[...turns];
 const handler=createChatHandler({env:k=>e[k],now:()=>Date.parse('2026-12-08T02:00:00Z'),fetcher:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('orbit_claim_chat'))return Response.json(claim);
  if(url.endsWith('orbit_claim_google'))return Response.json(true);
  if(url.endsWith('orbit_google_cache_get'))return Response.json(null);
  if(url.endsWith('orbit_google_cache_put'))return Response.json({ok:true});
  if(url.includes('places:searchText'))return Response.json(google);
  if(url.endsWith('/v1/messages')){const t=turns.shift();return t instanceof Response?t:Response.json(t)}
  throw Error('unexpected '+url);
 }});
 return {handler,calls,claude:()=>calls.filter(c=>c.url.endsWith('/v1/messages')).map(c=>JSON.parse(c.options.body))};
}
test('a question runs Google search as a tool, then returns a cleaned reply with map and places',async()=>{
 const {handler,calls,claude}=harness({turns:[
  {stop_reason:'tool_use',content:[{type:'text',text:'Let me look.'},tool('find_places',{query:'cafe',near:{lat:24.38,lon:120.86},radiusKm:5})]},
  {stop_reason:'tool_use',content:[tool('reply',{text:'Try **SUHU Café**.',map:{title:'Near the farm',points:[{name:'SUHU Café',lat:24.38,lon:120.86,kind:'suggestion'},{name:'Bad',lat:999,lon:0}]},places:[{name:'SUHU Café',lat:24.38,lon:120.86,googleId:'ChIJ_cafe_123456',googleUrl:'https://maps.google.com/?cid=1',rating:4.7,why:'Close by'}]},'t2')]}]});
 const r=await handler(request());assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.text,'Try **SUHU Café**.');assert.equal(data.map.points.length,1);assert.equal(data.places[0].googleId,'ChIJ_cafe_123456');assert.equal(data.places[0].id,'google-ChIJ_cafe_123456');
 const [first,second]=claude();assert.equal(first.model,'claude-opus-5-5');assert.ok(first.tools.some(t=>t.name==='find_places')&&first.tools.some(t=>t.name==='web_search'));
 assert.ok(first.system.includes('"hotel-1"')&&!first.system.includes('a'.repeat(64)),'trip goes in, trip key never does');
 const result=second.messages.at(-1).content[0];assert.equal(result.type,'tool_result');assert.equal(result.tool_use_id,'t1');assert.match(result.content,/SUHU Café/);
 const google=calls.find(c=>c.url.includes('searchText'));assert.equal(google.options.headers['X-Goog-Api-Key'],'google-secret');assert.equal(JSON.parse(google.options.body).locationBias.circle.radius,5000);
 assert.equal(calls.find(c=>c.url.endsWith('/v1/messages')).url,'https://infistar.ai/v1/messages');assert.ok(!JSON.stringify(data).includes('secret'));
});
test('proposed changes are filtered to valid operations on real cards',async()=>{
 const reply=cleanReply({text:'ok',changeSummary:'Tidy up',changes:[
  {op:'add',day:1,start:'14:00',title:'Picnic',duration:60,category:'food',place:{name:'Park',lat:24.3,lon:120.8,googleUrl:'javascript:alert(1)'}},
  {op:'move',cardId:'farm-1',day:0,start:'09:30'},{op:'remove',cardId:'nope'},{op:'add',day:9,start:'10:00',title:'x',duration:30},{op:'update',cardId:'farm-1'},
  {op:'update',cardId:'hotel-1',duration:90},{op:'drop_table'},{op:'add',day:1,start:'25:00',title:'Late',duration:30}]},cleanTrip(trip));
 assert.deepEqual(reply.changes.map(c=>c.op),['add','move','update']);assert.equal(reply.changes[0].place.googleUrl,undefined);assert.equal(reply.changeSummary,'Tidy up');
});
test('trip and messages are trimmed and must end with a question',()=>{
 const t=cleanTrip(trip);assert.equal(t.days[1].label,'Day 2 · Tue 8 Dec');assert.equal(cleanReply({text:'Nice spot [1]. Rated well [12].'},t).text,'Nice spot. Rated well.');assert.equal(t.days[1].cards[0].notes.length,160);assert.equal(t.selectedDay,1);
 assert.equal(cleanMessages([{role:'assistant',text:'hi'}]),null);
 assert.deepEqual(cleanMessages([{role:'assistant',text:'hi'},{role:'user',text:'a'},{role:'user',text:'b'}]),[{role:'user',content:'a\n\nb'}]);
});
test('plain-text answers are accepted, and the 2026 search tool falls back to the older one',async()=>{
 const {handler,claude}=harness({turns:[new Response('{"error":"unknown tool"}',{status:400}),{stop_reason:'end_turn',content:[{type:'text',text:'Hello!'}]}]});
 const data=await(await handler(request())).json();assert.equal(data.text,'Hello!');
 assert.deepEqual(claude().map(b=>b.tools.at(-1).type),['web_search_20260209','web_search_20250305']);
});
test('an empty reply call is asked for again instead of showing nothing',async()=>{
 const {handler,claude}=harness({turns:[{stop_reason:'tool_use',content:[tool('reply',{},'r1')]},{stop_reason:'tool_use',content:[tool('reply',{text:'Second try works.'},'r2')]}]});
 const data=await(await handler(request())).json();assert.equal(data.text,'Second try works.');
 const retry=claude()[1].messages.at(-1).content[0];assert.equal(retry.tool_use_id,'r1');assert.equal(retry.is_error,true);
});
test('bad origins, bad trip links, quotas and missing setup stop before any AI call',async()=>{
 const {handler,claude}=harness({turns:[]});
 assert.equal((await handler(request(body,'https://evil.example'))).status,403);
 assert.equal((await handler(request({...body,roomKey:'x'}))).status,401);
 assert.equal((await handler(request({...body,messages:[]}))).status,400);
 const capped=harness({turns:[],claim:{status:429,error:'Orbit has answered a lot today.'}});assert.equal((await capped.handler(request())).status,429);
 const missing=harness({turns:[],env:{...env,QWEN_BASE_URL:''}});assert.equal((await missing.handler(request())).status,503);
 assert.equal(claude().length+capped.claude().length+missing.claude().length,0);
});
test('provider failures give a friendly error without leaking keys',async()=>{
 const {handler}=harness({turns:[new Response('relay-secret bad',{status:500})]});const r=await handler(request());assert.equal(r.status,503);const data=await r.json();
 assert.match(data.error,/couldn’t answer/);assert.ok(!JSON.stringify(data).includes('relay-secret'));
});
