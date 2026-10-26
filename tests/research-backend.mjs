import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,sanitizeResearch} from '../supabase/functions/_shared/research.mjs';
const source='https://venue.example/visit';
const place={name:'Example farm',nameZh:'示範農場',address:'1 Farm Road',description:'A family farm.',descriptionZh:'親子農場。',source,bookingUrl:source,bookingNote:'Tickets available on arrival.',bookingNoteZh:'可現場購票。'};
const content=[{type:'web_search_tool_result',content:[{type:'web_search_result',url:source,title:'Venue visitor information'}]},{type:'tool_use',name:'submit_places',input:{places:[place]}}];
const body={roomId:'11111111-1111-1111-1111-111111111111',roomKey:'a'.repeat(64),query:'Example farm',country:'tw'};
const secrets={ANTHROPIC_API_KEY:'test-provider-secret',SUPABASE_URL:'https://project.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-server-secret'};
const request=(payload=body,origin='https://ragonic1-eng.github.io')=>new Request('https://backend.example',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)});
function harness({claim={claimed:true},providerStatus=200,providerContent=content,providerError=false,env=secrets}={}){
 const calls=[];
 const handler=createHandler({env:k=>env[k],fetcher:async(url,options)=>{calls.push({url,options});if(url.endsWith('orbit_claim_research'))return Response.json(claim);if(url.endsWith('orbit_finish_research'))return Response.json({ok:true});if(providerError)throw Error('test-provider-secret');return Response.json({content:providerContent,stop_reason:'tool_use'},{status:providerStatus})}});
 return {handler,calls};
}
test('valid research uses the server key, strips private trip credentials from Claude, and caches sourced bilingual results',async()=>{
 const {handler,calls}=harness();const r=await handler(request());assert.equal(r.status,200);const data=await r.json();assert.equal(data.places[0].nameZh,'示範農場');assert.equal(data.places[0].sources[0].url,source);
 const call=calls.find(c=>c.url.includes('anthropic'));assert.equal(call.options.headers['x-api-key'],secrets.ANTHROPIC_API_KEY);assert.ok(!call.options.body.includes(body.roomKey));assert.ok(!call.options.body.includes(body.roomId));assert.equal(JSON.parse(call.options.body).tools[0].max_uses,3);assert.equal(JSON.parse(call.options.body).model,'claude-sonnet-4-6');assert.equal(calls.length,3);assert.ok(!JSON.stringify(data).includes('test-provider-secret'));
});
test('wrong origin, bad capabilities, and oversized bodies never incur API usage',async()=>{
 const {handler,calls}=harness();assert.equal((await handler(request(body,'https://bad.example'))).status,403);assert.equal((await handler(request({...body,roomKey:'wrong'}))).status,401);assert.equal((await handler(request({...body,query:'x'.repeat(4000)}))).status,413);assert.equal(calls.length,0);
});
test('invalid rooms, concurrency reservations, and persisted quotas are honored before the provider call',async()=>{
 for(const status of [401,409,429]){const {handler,calls}=harness({claim:{status,error:'Cannot research'}});assert.equal((await handler(request())).status,status);assert.equal(calls.length,1)}
 const {handler,calls}=harness({claim:{}});assert.equal((await handler(request())).status,503);assert.equal(calls.length,1);
});
test('cache bypasses Claude and missing key gives an actionable response',async()=>{
 const {handler,calls}=harness({claim:{cached:true,result:{places:[place],message:'Cached'}}});const data=await(await handler(request())).json();assert.equal(data.cached,true);assert.equal(calls.length,1);
 const missing=harness({env:{}});assert.equal((await missing.handler(request())).status,503);assert.equal(missing.calls.length,0);
});
test('unsupported source URLs reject results; unresearched booking links are removed',()=>{
 assert.throws(()=>sanitizeResearch([{type:'tool_use',name:'submit_places',input:{places:[place]}}]));
 const bad=structuredClone(content);bad[1].input.places[0].source='https://invented.example';assert.throws(()=>sanitizeResearch(bad));
 const link=structuredClone(content);link[1].input.places[0].bookingUrl='javascript:alert(1)';assert.equal(sanitizeResearch(link).places[0].bookingUrl,'');
});
test('provider failure cleans pending reservation and never leaks provider errors or keys',async()=>{
 for(const status of [401,429,500]){const {handler,calls}=harness({providerStatus:status});const r=await handler(request());assert.equal(r.status,503);assert.equal(JSON.parse(calls.at(-1).options.body).p_result,null);assert.ok(!(await r.text()).includes('test-provider-secret'))}
 const {handler}=harness({providerError:true});assert.ok(!(await(await handler(request())).text()).includes('test-provider-secret'));
});
