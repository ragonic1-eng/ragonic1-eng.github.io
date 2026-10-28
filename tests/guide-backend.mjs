import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,sanitizeGuide} from '../supabase/functions/_shared/research.mjs';
const env={DASHSCOPE_API_KEY:'relay-secret',QWEN_BASE_URL:'https://infistar.ai/v1',SUPABASE_URL:'https://p.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-secret'};
const body={roomId:'11111111-1111-1111-1111-111111111111',roomKey:'a'.repeat(64),action:'guide',query:'紅色琉璃瓦草莓園, 苗栗縣大湖鄉',country:'tw',date:'2026-12-08'};
const request=b=>new Request('https://x.example',{method:'POST',headers:{Origin:'https://ragonic1-eng.github.io','Content-Type':'application/json'},body:JSON.stringify(b)});
const guide={kids:['Pick strawberries from waist-high racks','Café has strawberry waffles'],adults:['Bright café with farm views'],costs:['Picking about NT$400–650 per jin (ref_1)','Free entry'],watchOut:['Weekend queues after 11:00','Closes on random days in season'],timing:['Go before 10:30 on a weekday'],sources:['ref_1','https://evil.example/not-searched']};
const claude={stop_reason:'end_turn',content:[{type:'web_search_tool_result',content:[{type:'web_search_result',url:'https://flyblog.cc/dahu-red/',title:'Dahu RED review'}]},{type:'text',text:JSON.stringify(guide)}]};
function harness({claudeReply=claude,chat}={}){
 const calls=[];
 const handler=createHandler({env:k=>env[k],fetcher:async(url,o={})=>{calls.push({url,o});
  if(url.endsWith('orbit_claim_research'))return Response.json({claimed:true});
  if(url.endsWith('orbit_finish_research'))return Response.json({ok:true});
  if(url.endsWith('/v1/messages'))return claudeReply instanceof Response?claudeReply:Response.json(claudeReply);
  if(url.endsWith('/chat/completions'))return new Response('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(chat)}}]})+'\n\ndata: [DONE]\n');
  throw Error(url)}});
 return {handler,calls};
}
test('a guide is researched with web search, keeps only searched sources, and is cached for the trip',async()=>{
 const {handler,calls}=harness();const data=await(await handler(request(body))).json();
 assert.deepEqual(data.guide.kids,guide.kids);assert.equal(data.guide.verified,true);assert.deepEqual(data.guide.sources,[{url:'https://flyblog.cc/dahu-red/',title:'Dahu RED review'}]);
 const sent=JSON.parse(calls.find(c=>c.url.endsWith('/v1/messages')).o.body);assert.match(sent.system,/2-year-old and a 6-year-old/);assert.match(sent.system,/tourist traps/);assert.match(sent.system,/Never invent prices/);
 assert.equal(JSON.parse(sent.messages[0].content).visitDate,'2026-12-08');
 const finish=JSON.parse(calls.find(c=>c.url.endsWith('orbit_finish_research')).o.body);assert.ok(finish.p_result.guide);
});
test('without web results, a guide from AI knowledge is labelled unverified and has no links',async()=>{
 const {handler}=harness({claudeReply:new Response('{}',{status:500}),chat:guide});const data=await(await handler(request(body))).json();
 assert.equal(data.guide.verified,false);assert.deepEqual(data.guide.sources,[]);assert.deepEqual(data.guide.costs,guide.costs);
});
test('a thin or empty answer is rejected rather than shown',()=>{
 const one={output:{choices:[{message:{content:JSON.stringify({kids:['x']})}}]}};assert.throws(()=>sanitizeGuide(one,{verified:false}),/INVALID_RESULT/);
 const noSources={output:{choices:[{message:{content:JSON.stringify(guide)}}]}};assert.throws(()=>sanitizeGuide(noSources,{verified:true}),/NO_SOURCES/);
});

test('a guide whose answer cites nothing lists the pages the search read; guides from memory never quote prices',async()=>{
 const uncited={...claude,content:[claude.content[0],{type:'text',text:JSON.stringify({...guide,sources:[]})}]};
 const {handler}=harness({claudeReply:uncited});const data=await(await handler(request(body))).json();
 assert.equal(data.guide.verified,true);assert.deepEqual(data.guide.sources.map(s=>s.url),['https://flyblog.cc/dahu-red/']);
 const h=harness({claudeReply:new Response('{}',{status:500}),chat:guide});await h.handler(request(body));
 const sent=JSON.parse(h.calls.find(c=>c.url.endsWith('/chat/completions')).o.body);assert.match(sent.messages[0].content,/give no amounts at all/);
});
