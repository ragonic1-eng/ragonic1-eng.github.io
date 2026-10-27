import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,sanitizeResearch,cleanPlan,sanitizeEvaluation} from '../supabase/functions/_shared/research.mjs';
const source='https://venue.example/visit';
const place={name:'Example farm',nameZh:'示範農場',address:'1 Farm Road',description:'A family farm.',descriptionZh:'親子農場。',source,bookingUrl:source,bookingNote:'Tickets available on arrival.',bookingNoteZh:'可現場購票。'};
const qwen=(places,results=[{index:1,url:source,title:'Venue visitor information'}])=>({output:{choices:[{finish_reason:'stop',message:{role:'assistant',content:'```json\n'+JSON.stringify({places})+'\n```'}}],search_info:{search_results:results}}});
const content=qwen([place]);
const body={roomId:'11111111-1111-1111-1111-111111111111',roomKey:'a'.repeat(64),query:'Example farm',country:'tw'};
const secrets={DASHSCOPE_API_KEY:'test-provider-secret',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret'};
const request=(payload=body,origin='https://ragonic1-eng.github.io')=>new Request('https://backend.example',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
function harness({claim={claimed:true},providerStatus=200,providerContent=content,providerError=false,env=secrets}={}){
 const calls=[];
 const handler=createHandler({env:k=>env[k],fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('orbit_claim_research'))return Response.json(claim);if(url.endsWith('orbit_finish_research'))return Response.json({ok:true});if(providerError)throw Error('test-provider-secret');return Response.json(providerContent,{status:providerStatus})}});
 return {handler,calls};
}
test('valid research uses the server key, strips private trip credentials from Qwen, and caches sourced bilingual results',async()=>{
 const {handler,calls}=harness();const r=await handler(request());assert.equal(r.status,200);const data=await r.json();assert.equal(data.places[0].nameZh,'示範農場');assert.equal(data.places[0].sources[0].url,source);
 const call=calls.find(c=>c.url.includes('dashscope'));assert.equal(call.options.headers.Authorization,'Bearer '+secrets.DASHSCOPE_API_KEY);assert.ok(!call.options.body.includes(body.roomKey));assert.ok(!call.options.body.includes(body.roomId));const sent=JSON.parse(call.options.body);assert.equal(sent.parameters.enable_search,true);assert.equal(sent.parameters.search_options.enable_source,true);assert.equal(sent.model,'qwen-plus');assert.equal(calls.length,3);assert.ok(!JSON.stringify(data).includes('test-provider-secret'));
});
test('wrong origin, bad capabilities, and oversized bodies never incur API usage',async()=>{
 const {handler,calls}=harness();assert.equal((await handler(request(body,'https://bad.example'))).status,403);assert.equal((await handler(request({...body,roomKey:'wrong'}))).status,401);assert.equal((await handler(request({...body,query:'x'.repeat(4000)}))).status,413);assert.equal(calls.length,0);
});
test('invalid rooms, concurrency reservations, and persisted quotas are honored before the provider call',async()=>{
 for(const status of [401,409,429]){const {handler,calls}=harness({claim:{status,error:'Cannot research'}});assert.equal((await handler(request())).status,status);assert.equal(calls.length,1)}
 const {handler,calls}=harness({claim:{}});assert.equal((await handler(request())).status,503);assert.equal(calls.length,1);
});
test('cache bypasses Qwen and missing key gives an actionable response',async()=>{
 const {handler,calls}=harness({claim:{cached:true,result:{places:[place],message:'Cached'}}});const data=await(await handler(request())).json();assert.equal(data.cached,true);assert.equal(calls.length,1);
 const missing=harness({env:{}});assert.equal((await missing.handler(request())).status,503);assert.equal(missing.calls.length,0);
});
test('unsupported source URLs reject results; unresearched booking links are removed; reference numbers resolve',()=>{
 assert.throws(()=>sanitizeResearch(qwen([place],[])));
 assert.throws(()=>sanitizeResearch({output:{choices:[{message:{content:'not json'}}],search_info:{search_results:[{index:1,url:source}]}}}));
 assert.throws(()=>sanitizeResearch(qwen([{...place,source:'https://invented.example'}])));
 assert.equal(sanitizeResearch(qwen([{...place,bookingUrl:'javascript:alert(1)'}])).places[0].bookingUrl,'');
 const byRef=sanitizeResearch(qwen([{...place,source:'ref_1',bookingUrl:'[ref_9]'}]));assert.equal(byRef.places[0].source,source);assert.equal(byRef.places[0].bookingUrl,'');
 const xTools=sanitizeResearch({output:{choices:[{message:{content:JSON.stringify({places:[place]})}}]},usage:{x_tools:{search:{search_results:[{url:source,title:'Venue'}]}}}});assert.equal(xTools.places[0].research,'Orbit');
});
test('QWEN_API_KEY, model and region overrides are honored',async()=>{
 const {handler,calls}=harness({env:{...secrets,DASHSCOPE_API_KEY:undefined,QWEN_API_KEY:'alt-key',QWEN_MODEL:'qwen-max',QWEN_BASE_URL:'https://dashscope.aliyuncs.com/'}});assert.equal((await handler(request())).status,200);
 const call=calls.find(c=>c.url.includes('dashscope'));assert.equal(call.url,'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');assert.equal(call.options.headers.Authorization,'Bearer alt-key');assert.equal(JSON.parse(call.options.body).model,'qwen-max');
});
test('provider failure cleans pending reservation and never leaks provider errors or keys',async()=>{
 for(const status of [401,429,500]){const {handler,calls}=harness({providerStatus:status});const r=await handler(request());assert.equal(r.status,503);assert.equal(JSON.parse(calls.at(-1).options.body).p_result,null);assert.ok(!(await r.text()).includes('test-provider-secret'))}
 const {handler}=harness({providerError:true});assert.ok(!(await(await handler(request())).text()).includes('test-provider-secret'));
});
test('research keeps opening hours and tolerates omitted optional fields',()=>{
 const {bookingNoteZh,...partial}=place;const r=sanitizeResearch(qwen([{...partial,openingHours:'Daily 09:00–17:00'}]));assert.equal(r.places[0].openingHours,'Daily 09:00–17:00');assert.equal(r.places[0].bookingNoteZh,'');assert.equal(r.places[0].openingHoursZh,'');
});
const plan={place:{name:'Example farm',address:'1 Farm Road',openingHours:'Daily 09:00–17:00'},date:'2026-12-08',start:'14:00',end:'15:30',previous:{title:'Hotel checkout',place:'Chao Motels',leaveAt:'13:00',travelMinutes:25,km:14.2},next:{title:'Dinner',place:'Night market',startsAt:'17:00',travelMinutes:70,km:60,estimated:true}};
const evalReply=obj=>({output:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(obj)}}]}});
test('plan checks send only the cleaned neighbouring stops, skip web search, and return a bounded verdict',async()=>{
 const {handler,calls}=harness({providerContent:evalReply({verdict:'tight',headline:'Doable, but leave on time.',reasons:['70 min drive to dinner','x'.repeat(900)],suggestion:'Shorten the visit by 15 minutes.'})});
 const r=await handler(request({roomId:body.roomId,roomKey:body.roomKey,action:'evaluate',plan:{...plan,secret:'leak',notes:'private'}}));assert.equal(r.status,200);const data=await r.json();
 assert.equal(data.evaluation.verdict,'tight');assert.equal(data.evaluation.reasons.length,2);assert.ok(data.evaluation.reasons[1].length<=240);
 const sent=JSON.parse(calls.find(c=>c.url.includes('dashscope')).options.body);assert.equal(sent.parameters.enable_search,undefined);const content=sent.input.messages[1].content;assert.ok(!content.includes('leak')&&!content.includes('private')&&!content.includes(body.roomKey));assert.equal(JSON.parse(content).next.travelMinutes,70);
 assert.equal(JSON.parse(calls.at(-1).options.body).p_result.evaluation.verdict,'tight');
});
test('plan checks reject incomplete plans before any paid call and refuse invalid verdicts',async()=>{
 const {handler,calls}=harness();assert.equal((await handler(request({roomId:body.roomId,roomKey:body.roomKey,action:'evaluate',plan:{place:{name:'X'}}}))).status,400);assert.equal(calls.length,0);
 assert.equal(cleanPlan({...plan,start:'25:00'}),null);assert.equal(cleanPlan({...plan,previous:{travelMinutes:-4}}).previous.travelMinutes,null);
 const bad=harness({providerContent:evalReply({verdict:'perfect',headline:'Yes'})});const r=await bad.handler(request({roomId:body.roomId,roomKey:body.roomKey,action:'evaluate',plan}));assert.equal(r.status,503);assert.match((await r.json()).error,/could not check/);
});
test('QWEN_BASE_URL copied with an API path still reaches the native endpoint',async()=>{
 for(const value of ['https://dashscope.aliyuncs.com/compatible-mode/v1','https://dashscope.aliyuncs.com/api/v1/',' https://dashscope.aliyuncs.com ','https://dashscope.aliyuncs.com/v1']){const {handler,calls}=harness({env:{...secrets,QWEN_BASE_URL:value}});assert.equal((await handler(request())).status,200);assert.equal(calls.find(c=>c.url.includes('dashscope')).url,'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation')}
});
test('research returns bounded planning hints for the activity form',()=>{
 const r=sanitizeResearch(qwen([{...place,category:'food',visitMinutes:100,tips:'Go early to avoid queues.'}]));assert.deepEqual(r.places[0].planning,{category:'food',visitMinutes:105,tips:'Go early to avoid queues.',tipsZh:''});
 const bad=sanitizeResearch(qwen([{...place,category:'casino',visitMinutes:'all day',tips:7}]));assert.deepEqual(bad.places[0].planning,{category:'',visitMinutes:null,tips:'',tipsZh:''});
});
test('plan checks accept common verdict phrasings and wrapped or loosely shaped replies',()=>{
 const reply=obj=>({output:{choices:[{message:{content:typeof obj==='string'?obj:JSON.stringify(obj)}}]}});
 assert.equal(sanitizeEvaluation(reply({verdict:'Not recommended',headline:'Too far.'})).evaluation.verdict,'not_recommended');
 assert.equal(sanitizeEvaluation(reply({verdict:'Doable',summary:'Leave on time.',reasons:'Traffic after 17:00',suggestion:['Go earlier']})).evaluation.reasons[0],'Traffic after 17:00');
 assert.equal(sanitizeEvaluation(reply('Here you go:\n```json\n{"evaluation":{"verdict":"GOOD","headline":"Fits well."}}\n```')).evaluation.verdict,'good');
 assert.throws(()=>sanitizeEvaluation(reply({verdict:'maybe',headline:'Hmm'})),/INVALID_RESULT/);
});
test('failures return a short code and log the provider reason without keys',async()=>{
 const logged=[],original=console.error;console.error=m=>logged.push(String(m));
 try{
  const {handler}=harness({providerStatus:400,providerContent:{code:'InvalidParameter',message:'bad model test-provider-secret'}});
  const r=await handler(request());const data=await r.json();assert.equal(r.status,503);assert.equal(data.code,'PROVIDER');assert.ok(!JSON.stringify(data).includes('InvalidParameter'));
  assert.ok(logged.some(l=>l.includes('InvalidParameter')&&l.includes('HTTP 400 from dashscope-intl.aliyuncs.com')));assert.ok(!logged.join('').includes('test-provider-secret'));assert.ok(!logged.join('').includes(body.roomKey));
 }finally{console.error=original}
});
