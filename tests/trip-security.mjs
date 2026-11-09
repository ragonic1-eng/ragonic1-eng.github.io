// npm install --prefix /tmp/orbit-research-db-test @electric-sql/pglite
// Runs the real setup.sql (with pgcrypto): only trusted trips (the family's) may use Orbit and Google; anyone can still
// make a shared trip, but slowly, and a new one is never trusted automatically.
import {PGlite} from '/tmp/orbit-research-db-test/node_modules/@electric-sql/pglite/dist/index.js';
import {pgcrypto} from '/tmp/orbit-research-db-test/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const sql=name=>readFile(new URL('../supabase/'+name,import.meta.url),'utf8');
const db=new PGlite({extensions:{pgcrypto}});
await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions;`);
// The live database before this change: no "trusted" column; one trip the family edits, one never-edited test trip.
await db.exec(`create extension pgcrypto with schema extensions;
create table public.orbit_trips(id uuid primary key default gen_random_uuid(),key_hash bytea not null,revision bigint not null default 1,trip jsonb not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now());`);
const family='00000000-0000-0000-0000-00000000000f',test='00000000-0000-0000-0000-00000000000e',key='a'.repeat(64);
await db.query(`insert into orbit_trips(id,key_hash,revision,trip,created_at) values($1,extensions.digest($3,'sha256'),57,'{}',now()-interval '30 days'),($2,extensions.digest($3,'sha256'),1,'{}',now()-interval '30 days')`,[family,test,key]);
for(let i=0;i<2;i++)for(const f of ['setup.sql','research.sql','google.sql','chat.sql'])await db.exec(await sql(f));
const trusted=async id=>(await db.query('select trusted from orbit_trips where id=$1',[id])).rows[0].trusted;
assert.equal(await trusted(family),true,'the family trip keeps Orbit');assert.equal(await trusted(test),false,'a never-edited trip does not');
const chat=async(id,k=key)=>(await db.query('select orbit_claim_chat($1,$2) as r',[id,k])).rows[0].r;
const research=async(id,k=key)=>(await db.query('select orbit_claim_research($1,$2,$3) as r',[id,k,'1'.repeat(64)])).rows[0].r;
const memory=async(id,k=key)=>(await db.query('select orbit_claim_memory($1,$2) as r',[id,k])).rows[0].r;
const ok=async(id,k=key)=>(await db.query('select orbit_trusted_trip($1,$2) as r',[id,k])).rows[0].r;
assert.equal((await chat(family)).ok,true);assert.equal((await research(family)).claimed,true);assert.equal((await memory(family)).ok,true);assert.equal(await ok(family),true);
assert.equal((await chat(family,'b'.repeat(64))).status,401,'the right link is still needed');assert.equal(await ok(family,'b'.repeat(64)),false);
for(const r of [await chat(test),await research(test),await memory(test)]){assert.equal(r.status,403);assert.match(r.error,/family’s own trip link/)}
// A stranger can create a trip from the public site, but it can't use Orbit or Google, even after many saves and redeploys.
await db.exec('set role anon');
const made=(await db.query(`select orbit_create_trip($1) as r`,[JSON.stringify({days:Array.from({length:7},(_,i)=>({name:'D',region:'R',date:`2026-12-0${i+1}`,start:540,end:1200,cards:[]}))})])).rows[0].r;
assert.ok(made.id&&made.key,JSON.stringify(made));
await assert.rejects(()=>db.query('select orbit_trusted_trip($1,$2)',[made.id,made.key]),/permission denied/);
await assert.rejects(()=>db.query('select trusted from orbit_trips'),/permission denied/);
await db.exec('reset role');
await db.query('update orbit_trips set revision=500 where id=$1',[made.id]);for(const f of ['setup.sql','chat.sql'])await db.exec(await sql(f));
assert.equal(await trusted(made.id),false,'trust is only granted once, when the column is added');assert.equal((await chat(made.id,made.key)).status,403);
// The owner can switch a new trip on with one SQL line.
await db.query('update orbit_trips set trusted=true where id=$1',[made.id]);assert.equal((await chat(made.id,made.key)).ok,true);
// Creating shared trips is limited to 10 an hour (and 30 a day), so the database can't be flooded.
await db.exec('set role anon');
const create=async()=>(await db.query(`select orbit_create_trip($1) as r`,[JSON.stringify({days:Array.from({length:7},(_,i)=>({name:'D',region:'R',date:`2026-12-0${i+1}`,start:540,end:1200,cards:[]}))})])).rows[0].r;
for(let i=0;i<9;i++)assert.ok((await create()).id);
assert.match((await create()).error,/limit reached/);
await db.exec('reset role');
await db.close();console.log('trip security tests passed');
