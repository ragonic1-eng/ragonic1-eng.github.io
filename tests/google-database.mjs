// npm install --prefix /tmp/orbit-research-db-test @electric-sql/pglite
import {PGlite} from '/tmp/orbit-research-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions;
create function extensions.digest(text,text) returns bytea language sql immutable as 'select decode(md5($1),''hex'')';
create table public.orbit_trips(id uuid primary key,key_hash bytea);`);
await db.exec(await readFile(new URL('../supabase/research.sql',import.meta.url),'utf8'));
// Safe to rerun on every deploy.
for(let i=0;i<2;i++)await db.exec(await readFile(new URL('../supabase/google.sql',import.meta.url),'utf8'));
const claim=async(scope,limit)=>(await db.query('select public.orbit_claim_google($1,$2) as ok',[scope,limit])).rows[0].ok;
// The daily cap allows exactly `limit` calls per scope; scopes are counted separately; unknown scopes are refused.
for(let i=0;i<3;i++)assert.equal(await claim('details',3),true);
assert.equal(await claim('details',3),false);assert.equal(await claim('locate',3),true);assert.equal(await claim('other',3),false);
assert.equal((await db.query(`select used from orbit_research_budget where scope='google-details'`)).rows[0].used,3);
// Cache: details expire after 7 days, pins after 30.
const put=(k,v)=>db.query('select public.orbit_google_cache_put($1,$2::jsonb)',[k,JSON.stringify(v)]);
const get=async k=>(await db.query('select public.orbit_google_cache_get($1) as r',[k])).rows[0].r;
await put('details|A',{place:{name:'A'}});await put('locate|tw|a',{point:{lat:1,lon:2}});
assert.deepEqual(await get('details|A'),{place:{name:'A'}});
await db.exec(`update orbit_google_cache set updated_at=now()-interval '8 days'`);
assert.equal(await get('details|A'),null);assert.deepEqual(await get('locate|tw|a'),{point:{lat:1,lon:2}});
await db.exec(`update orbit_google_cache set updated_at=now()-interval '31 days'`);assert.equal(await get('locate|tw|a'),null);
// Only the edge function's service role may call these.
for(const role of ['anon','authenticated']){
 const fns=(await db.query(`select p.proname from pg_proc p where p.proname like 'orbit_%google%' and has_function_privilege($1,p.oid,'execute')`,[role])).rows;
 assert.deepEqual(fns,[],role);
 assert.equal((await db.query(`select has_table_privilege($1,'public.orbit_google_cache','select') as ok`,[role])).rows[0].ok,false);
}
console.log('google database tests passed');
