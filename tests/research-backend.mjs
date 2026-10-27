import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,sanitizeResearch} from '../supabase/functions/_shared/research.mjs';
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
 const xTools=sanitizeResearch({output:{choices:[{message:{content:JSON.stringify({places:[place]})}}]},usage:{x_tools:{search:{search_results:[{url:source,title:'Venue'}]}}}});assert.equal(xTools.places[0].research,'Qwen');
});
test('QWEN_API_KEY, model and region overrides are honored',async()=>{
 const {handler,calls}=harness({env:{...secrets,DASHSCOPE_API_KEY:undefined,QWEN_API_KEY:'alt-key',QWEN_MODEL:'qwen-max',QWEN_BASE_URL:'https://dashscope.aliyuncs.com/'}});assert.equal((await handler(request())).status,200);
 const call=calls.find(c=>c.url.includes('dashscope'));assert.equal(call.url,'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');assert.equal(call.options.headers.Authorization,'Bearer alt-key');assert.equal(JSON.parse(call.options.body).model,'qwen-max');
});
test('provider failure cleans pending reservation and never leaks provider errors or keys',async()=>{
 for(const status of [401,429,500]){const {handler,calls}=harness({providerStatus:status});const r=await handler(request());assert.equal(r.status,503);assert.equal(JSON.parse(calls.at(-1).options.body).p_result,null);assert.ok(!(await r.text()).includes('test-provider-secret'))}
 const {handler}=harness({providerError:true});assert.ok(!(await(await handler(request())).text()).includes('test-provider-secret'));
});
