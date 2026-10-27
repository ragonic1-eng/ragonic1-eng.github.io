import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatHandler,cleanTrip,cleanMessages,cleanReply,cleanNote,addMemory,updateMemory} from '../supabase/functions/_shared/chat.mjs';
const env={DASHSCOPE_API_KEY:'relay-secret',QWEN_BASE_URL:'https://infistar.ai/v1',GOOGLE_MAPS_API_KEY:'google-secret',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'};
const trip={today:'2026-12-08',selectedDay:1,days:[{date:'2026-12-07',name:'Arrive',region:'Taoyuan',cards:[{id:'hotel-1',title:'Jolley Hotel',start:'20:00',end:'23:00',category:'hotel',place:{name:'Jolley Hotel',lat:25.04,lon:121.53}}]},{date:'2026-12-08',name:'Dahu',region:'Miaoli',cards:[{id:'farm-1',title:'Strawberry farm',start:'10:00',end:'12:00',category:'kids',notes:'x'.repeat(500)}]}]};
const body={roomId:'11111111-1111-1111-1111-111111111111',roomKey:'a'.repeat(64),messages:[{role:'user',text:'What is near the farm?'}],trip};
const request=(payload=body,origin='https://ragonic1-eng.github.io')=>new Request('https://x.example',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
const tool=(name,input,id='t1')=>({type:'tool_use',id,name,input});
let knowledgeReply=null;
function harness({turns,claim={ok:true},env:e=env,google={places:[{id:'ChIJ_cafe_123456',displayName:{text:'SUHU Café'},formattedAddress:'Dahu',location:{latitude:24.38,longitude:120.86},rating:4.7,userRatingCount:1884,googleMapsUri:'https://maps.google.com/?cid=1'}]}}){
 const calls=[];turns=[...turns];
 const handler=createChatHandler({env:k=>e[k],now:()=>Date.parse('2026-12-08T02:00:00Z'),fetcher:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('orbit_claim_chat'))return Response.json(claim);
  if(url.endsWith('orbit_claim_google'))return Response.json(true);
  if(url.endsWith('orbit_google_cache_get'))return Response.json(null);
  if(url.endsWith('orbit_google_cache_put'))return Response.json({ok:true});
  if(url.includes('places:searchText'))return Response.json(google);
  if(url.includes('orbit-knowledge.md'))return knowledgeReply?knowledgeReply():new Response('# Orbit knowledge\nThe kids love capybaras.');
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
test('the knowledge file is read once, capped, and kept for 5 minutes; Orbit still answers if it is unreachable',async()=>{
 const turn=()=>({stop_reason:'tool_use',content:[tool('reply',{text:'ok'})]});
 const h=harness({turns:[turn(),turn()]});await h.handler(request());await h.handler(request());
 assert.equal(h.calls.filter(c=>c.url.includes('orbit-knowledge.md')).length,1);assert.match(h.claude()[0].system,/<knowledge>\n# Orbit knowledge\nThe kids love capybaras.\n<\/knowledge>/);
 knowledgeReply=()=>new Response('x'.repeat(50000));const big=harness({turns:[turn()]});await big.handler(request());assert.equal(big.claude()[0].system.match(/x+/g).find(m=>m.length>1000).length,30000);
 knowledgeReply=()=>new Response('gone',{status:404});const down=harness({turns:[turn()]});assert.equal((await down.handler(request())).status,200);assert.ok(!down.claude()[0].system.includes('<knowledge>'));knowledgeReply=null;
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

// --- Passive memory ---
const FILE='# Orbit knowledge\n\n## The family\n\n- Two kids.\n\n## Remembered from chats\n\n- The 2-year-old naps around 13:00–15:00. (remembered 2026-10-20)\n';
function memoryHarness({token='gh-secret',conflicts=0,claim={ok:true},file=FILE,turns=[]}={}){
 const calls=[];let current=file;turns=[...turns];
 const handler=createChatHandler({env:k=>({...env,ORBIT_GITHUB_TOKEN:token})[k],now:()=>Date.parse('2026-10-27T02:00:00Z'),fetcher:async(url,options={})=>{
  calls.push({url,options});
  if(url.endsWith('orbit_claim_memory'))return Response.json(claim);
  if(url.endsWith('orbit_claim_chat'))return Response.json({ok:true});
  if(url.includes('orbit-knowledge.md')&&url.includes('raw.githubusercontent'))return new Response(current);
  if(url.endsWith('/v1/messages'))return Response.json(turns.shift());
  if(url.startsWith('https://api.github.com/')){
   if(options.method==='GET')return Response.json({sha:'sha-'+calls.length,content:Buffer.from(current).toString('base64')});
   if(conflicts-->0)return new Response('{}',{status:409});
   current=Buffer.from(JSON.parse(options.body).content,'base64').toString('utf8');return Response.json({content:{}});
  }
  throw Error('unexpected '+url);
 }});
 return {handler,calls,file:()=>current,github:()=>calls.filter(c=>c.url.startsWith('https://api.github.com/'))};
}
const answer=input=>({stop_reason:'tool_use',content:[tool('reply',input)]});
const forget=note=>request({roomId:body.roomId,roomKey:body.roomKey,action:'forget',note});
test('notes Orbit picks up are saved without asking, replacing the note they supersede, in one commit',async()=>{
 const h=memoryHarness({turns:[answer({text:'Got it.',remember:['The 2-year-old naps around 14:00–16:00.','Both kids dislike spicy food.'],replaces:['The 2-year-old naps around 13:00–15:00. (remembered 2026-10-20)']})]});
 const data=await(await h.handler(request())).json();
 assert.deepEqual(data.remembered,['The 2-year-old naps around 14:00–16:00.','Both kids dislike spicy food.']);assert.deepEqual(data.forgot,['The 2-year-old naps around 13:00–15:00.']);assert.equal(data.remember,undefined);
 assert.ok(!h.file().includes('13:00–15:00'));assert.match(h.file(),/- The 2-year-old naps around 14:00–16:00\. \(remembered 2026-10-27\)\n- Both kids dislike spicy food\. \(remembered 2026-10-27\)\n$/);
 const puts=h.github().filter(c=>c.options.method==='PUT');assert.equal(puts.length,1);const sent=JSON.parse(puts[0].options.body);assert.equal(sent.branch,'main');assert.match(sent.message,/^Orbit remembers: The 2-year-old naps around 14:00/);
 assert.equal(puts[0].options.headers.Authorization,'Bearer gh-secret');assert.match(h.github()[0].url,/contents\/orbit-knowledge.md\?ref=main$/);
});
test('Undo forgets a remembered note; conflicts retry once; nothing new means no commit',async()=>{
 const h=memoryHarness({conflicts:1});const r=await h.handler(forget('The 2-year-old naps around 13:00–15:00.'));assert.deepEqual(await r.json(),{forgotten:true,note:'The 2-year-old naps around 13:00–15:00.'});
 assert.ok(!h.file().includes('naps'));assert.equal(h.github().length,4);
 const same=memoryHarness({turns:[answer({text:'ok',remember:['The 2-year-old naps around 13:00–15:00.']})]});const data=await(await same.handler(request())).json();
 assert.equal(data.remembered,undefined);assert.equal(same.github().filter(c=>c.options.method==='PUT').length,0);
});
test('memory problems never break the answer, and private-looking notes are dropped',async()=>{
 const off=memoryHarness({token:'',turns:[answer({text:'Hi',remember:['Likes ducks.']})]});const a=await(await off.handler(request())).json();assert.equal(a.text,'Hi');assert.deepEqual(a.memoryOff,['Likes ducks.']);assert.equal(off.github().length,0);
 const capped=memoryHarness({claim:{status:429,error:'Plenty today'},turns:[answer({text:'Hi',remember:['Likes ducks.']})]});const b=await(await capped.handler(request())).json();assert.equal(b.text,'Hi');assert.match(b.memoryError,/plenty today/);assert.equal(capped.github().length,0);
 const full=memoryHarness({file:FILE+'x'.repeat(29900),turns:[answer({text:'Hi',remember:['Likes ducks a lot.']})]});assert.match((await(await full.handler(request())).json()).memoryError,/full/);
 const priv=memoryHarness({turns:[answer({text:'Hi',remember:['Call 0912 345 678','mail a@b.com']})]});const c=await(await priv.handler(request())).json();assert.equal(c.remembered,undefined);assert.equal(priv.github().length,0);
 const bad=memoryHarness();assert.equal((await bad.handler(request({action:'forget',roomId:body.roomId,roomKey:'nope',note:'x y z'}))).status,401);assert.equal(bad.github().length,0);
});
test('notes are cleaned and the remembered section is updated in place',()=>{
 assert.deepEqual(cleanNote('## <b>Loves</b> `ducks`'),{note:'bLoves/b ducks'});assert.equal(cleanNote('Skip Hobbit Valley until 2026-12-08, naps 13:00–15:00').note,'Skip Hobbit Valley until 2026-12-08, naps 13:00–15:00');
 for(const n of ['Booking ABC12345678 ok','see https://x.com','x'])assert.ok(cleanNote(n).error,n);
 const once=addMemory('# K\n\n## Places\n- a\n','A','2026-10-27'),twice=addMemory(once,'B','2026-10-28');assert.equal(twice.split('## Remembered from chats').length,2);assert.match(twice,/- A \(remembered 2026-10-27\)\n- B \(remembered 2026-10-28\)\n$/);
 const mid=updateMemory('# K\n\n## Remembered from chats\n\n- A (remembered x)\n- B (remembered x)\n\n## Later\n- A (remembered x)\n',{add:['C'],remove:['A']},'d');assert.equal(mid,'# K\n\n## Remembered from chats\n\n- B (remembered x)\n- C (remembered d)\n\n## Later\n- A (remembered x)\n');
 const reply=cleanReply({text:'ok',remember:['The kids love capybaras.','Phone 0912345678','x','Third'],replaces:['Old note. (remembered 2026-10-01)','']},cleanTrip(trip));assert.deepEqual(reply.remember,['The kids love capybaras.']);assert.deepEqual(reply.replaces,['Old note.']);
});
