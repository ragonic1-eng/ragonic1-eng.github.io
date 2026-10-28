// npm install --prefix /tmp/orbit-research-db-test @electric-sql/pglite
import {PGlite} from '/tmp/orbit-research-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions;
-- A deterministic digest stub tests capability matching, not pgcrypto cryptography.
create function extensions.digest(text,text) returns bytea language sql immutable as 'select decode(md5($1),''hex'')';
create table public.orbit_trips(id uuid primary key,key_hash bytea);`);
await db.exec(await readFile(new URL('../supabase/research.sql',import.meta.url),'utf8'));
// Repeat migration to verify deploys are safe to rerun.
await db.exec(await readFile(new URL('../supabase/research.sql',import.meta.url),'utf8'));
const ids=[1,2,3].map(n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`),key='a'.repeat(64);
for(const id of ids)await db.query(`insert into orbit_trips values($1,extensions.digest($2,'sha256'))`,[id,key]);
const hash=n=>n.toString(16).padStart(64,'0');
const claim=async(id,k,h)=>(await db.query('select orbit_claim_research($1,$2,$3) as r',[id,k,h])).rows[0].r;
assert.equal((await claim(ids[0],'wrong',hash(1))).status,401);
assert.equal((await claim(ids[0],key,hash(1))).claimed,true);
assert.equal((await claim(ids[0],key,hash(1))).status,409);
await db.query('select orbit_finish_research($1,$2,$3)',[ids[0],hash(1),JSON.stringify({places:[],message:'No match'})]);
assert.equal((await claim(ids[0],key,hash(1))).cached,true);
for(let n=2;n<=80;n++)assert.equal((await claim(ids[0],key,hash(n))).claimed,true);
assert.equal((await claim(ids[0],key,hash(81))).status,429);
assert.equal((await claim(ids[0],key,hash(1))).cached,true);
// Plan checks are cached as evaluation objects.
await db.query('select orbit_finish_research($1,$2,$3)',[ids[0],hash(2),JSON.stringify({evaluation:{verdict:'good'}})]);assert.equal((await claim(ids[0],key,hash(2))).result.evaluation.verdict,'good')
// Family guides are cached as guide objects.
await db.query('select orbit_finish_research($1,$2,$3)',[ids[0],hash(3),JSON.stringify({guide:{kids:['Feed the sheep']}})]);assert.deepEqual((await claim(ids[0],key,hash(3))).result.guide.kids,['Feed the sheep']);;
for(let n=1;n<=70;n++)assert.equal((await claim(ids[1],key,hash(n))).claimed,true);
assert.equal((await claim(ids[2],key,hash(1))).status,429);
await db.exec('set role anon');
await assert.rejects(()=>db.query('select orbit_claim_research($1,$2,$3)',[ids[0],key,hash(1)]),/permission denied/);
await assert.rejects(()=>db.query('select * from orbit_research_cache'),/permission denied/);
await db.exec('reset role');
await db.close();console.log('PASS: migration/redeploy, private capability checks, in-flight deduplication, 24h cache, per-trip and global daily quotas, cache despite quota, denied public access');
