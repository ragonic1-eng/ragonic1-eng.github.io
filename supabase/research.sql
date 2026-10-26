-- Deploy after setup.sql. All counters/cache are private; only the edge function may call these RPCs.
create table if not exists public.orbit_research_cache (
 room_id uuid references public.orbit_trips(id) on delete cascade,
 query_hash text not null,
 result jsonb,
 updated_at timestamptz not null default now(),
 primary key(room_id, query_hash)
);
create table if not exists public.orbit_research_budget (
 budget_day date not null,
 scope text not null,
 used integer not null default 0,
 primary key(budget_day,scope)
);
alter table public.orbit_research_cache enable row level security;
alter table public.orbit_research_budget enable row level security;
revoke all on public.orbit_research_cache,public.orbit_research_budget from public,anon,authenticated;

create or replace function public.orbit_claim_research(p_id uuid,p_key text,p_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare cached public.orbit_research_cache; used_global integer; used_room integer; today date := (now() at time zone 'UTC')::date;
begin
 if p_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('status',400,'error','Invalid lookup.'); end if;
 if not exists(select 1 from public.orbit_trips where id=p_id and key_hash=extensions.digest(p_key,'sha256')) then
  return jsonb_build_object('status',401,'error','Open a valid private shared trip link to research places.');
 end if;
 perform pg_advisory_xact_lock(716284092);
 select * into cached from public.orbit_research_cache where room_id=p_id and query_hash=p_hash;
 if found then
  if cached.result is not null and cached.updated_at > now()-interval '24 hours' then return jsonb_build_object('cached',true,'result',cached.result); end if;
  if cached.result is null and cached.updated_at > now()-interval '90 seconds' then return jsonb_build_object('status',409,'error','This place is already being researched. Try again shortly.'); end if;
 end if;
 select coalesce(max(used),0) into used_global from public.orbit_research_budget where budget_day=today and scope='global';
 select coalesce(max(used),0) into used_room from public.orbit_research_budget where budget_day=today and scope=p_id::text;
 if used_global>=20 or used_room>=10 then return jsonb_build_object('status',429,'error','Daily research limit reached. Use map search or try again tomorrow (UTC).'); end if;
 insert into public.orbit_research_budget values(today,'global',1),(today,p_id::text,1)
 on conflict(budget_day,scope) do update set used=orbit_research_budget.used+1;
 insert into public.orbit_research_cache values(p_id,p_hash,null,now())
 on conflict(room_id,query_hash) do update set result=null,updated_at=now();
 delete from public.orbit_research_budget where budget_day<today-7;
 delete from public.orbit_research_cache where updated_at<now()-interval '2 days';
 return jsonb_build_object('claimed',true);
end $$;

create or replace function public.orbit_finish_research(p_id uuid,p_hash text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if p_result is null then delete from public.orbit_research_cache where room_id=p_id and query_hash=p_hash and result is null;
 else
  if octet_length(p_result::text)>50000 or jsonb_typeof(p_result->'places') is distinct from 'array' then raise exception 'Invalid result'; end if;
  update public.orbit_research_cache set result=p_result,updated_at=now() where room_id=p_id and query_hash=p_hash and result is null;
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.orbit_claim_research(uuid,text,text) from public,anon,authenticated;
revoke all on function public.orbit_finish_research(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.orbit_claim_research(uuid,text,text) to service_role;
grant execute on function public.orbit_finish_research(uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
