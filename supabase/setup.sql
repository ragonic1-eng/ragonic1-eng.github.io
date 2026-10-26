-- Run once in your Supabase project's SQL Editor. No secret key is needed in the website.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.orbit_trips (
  id uuid primary key default gen_random_uuid(),
  key_hash bytea not null,
  revision bigint not null default 1,
  trip jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.orbit_trips enable row level security;
revoke all on public.orbit_trips from anon, authenticated;

create or replace function public.orbit_valid_trip(p_trip jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog, public as $$
declare d jsonb; c jsonb; b jsonb; ids text[] := '{}'; bid text[];
begin
  if p_trip is null or octet_length(p_trip::text)>2000000 or jsonb_typeof(p_trip->'days') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_trip->'days')<>7 then return false; end if;
  for d in select value from jsonb_array_elements(p_trip->'days') loop
    if jsonb_typeof(d->'name') is distinct from 'string' or jsonb_typeof(d->'region') is distinct from 'string'
       or coalesce(d->>'date','') !~ '^2026-12-(0[1-9]|[12][0-9]|3[01])$'
       or coalesce(d->>'start','') !~ '^\d+$' or coalesce(d->>'end','') !~ '^\d+$' then return false; end if;
    if (d->>'start')::numeric<0 or (d->>'end')::numeric>1440 or (d->>'end')::numeric<=(d->>'start')::numeric then return false; end if;
    if jsonb_typeof(d->'cards') is distinct from 'array' then return false; end if;
    if jsonb_array_length(d->'cards')>200 then return false; end if;
    for c in select value from jsonb_array_elements(d->'cards') loop
      if jsonb_typeof(c->'id') is distinct from 'string' or jsonb_typeof(c->'title') is distinct from 'string'
         or jsonb_typeof(c->'notes') is distinct from 'string' or coalesce(c->>'category','') not in ('kids','food','hotel','travel','shopping','break')
         or coalesce(c->>'duration','') !~ '^\d+$' then return false; end if;
      if c->>'id'=any(ids) or (c->>'duration')::numeric not between 1 and 1440 then return false; end if;
      ids := array_append(ids,c->>'id');
      if c ? 'branches' then
        if jsonb_typeof(c->'branches') is distinct from 'array' then return false; end if;
        if jsonb_array_length(c->'branches')>100 then return false; end if;
        bid := '{}';
        for b in select value from jsonb_array_elements(c->'branches') loop
          if jsonb_typeof(b->'id') is distinct from 'string' or jsonb_typeof(b->'title') is distinct from 'string'
             or jsonb_typeof(b->'notes') is distinct from 'string' or jsonb_typeof(b->'done') is distinct from 'boolean'
             or jsonb_typeof(b->'url') is distinct from 'string' or coalesce(b->>'type','') not in ('booking','bring','prepare','note') then return false; end if;
          if b->>'id'=any(bid) or ((b->>'url')<>'' and (b->>'url') !~ '^https?://') then return false; end if;
          bid := array_append(bid,b->>'id');
        end loop;
      end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end $$;
revoke all on function public.orbit_valid_trip(jsonb) from public,anon,authenticated;

create or replace function public.orbit_create_trip(p_trip jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare new_id uuid; edit_key text;
begin
  if not public.orbit_valid_trip(p_trip) then return jsonb_build_object('error','Invalid itinerary'); end if;
  -- Serializes creation-limit checks; ordinary editing is unaffected.
  perform pg_advisory_xact_lock(716284091);
  if (select count(*) from public.orbit_trips where created_at>now()-interval '1 hour')>=100 then
    return jsonb_build_object('error','Shared-trip creation limit reached. Try again later.');
  end if;
  edit_key := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.orbit_trips(key_hash,trip) values(extensions.digest(edit_key,'sha256'),p_trip) returning id into new_id;
  return jsonb_build_object('id',new_id,'key',edit_key,'revision',1);
end $$;

create or replace function public.orbit_load_trip(p_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare entry public.orbit_trips;
begin
  select * into entry from public.orbit_trips where id=p_id and key_hash=extensions.digest(p_key,'sha256');
  if not found then return jsonb_build_object('error','Trip unavailable or private link is incomplete.'); end if;
  return jsonb_build_object('revision',entry.revision,'trip',entry.trip);
end $$;

create or replace function public.orbit_save_trip(p_id uuid,p_key text,p_revision bigint,p_trip jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, extensions as $$
declare entry public.orbit_trips;
begin
  select * into entry from public.orbit_trips where id=p_id and key_hash=extensions.digest(p_key,'sha256') for update;
  if not found then return jsonb_build_object('error','Trip unavailable or private link is incomplete.'); end if;
  if entry.revision<>p_revision then
    return jsonb_build_object('conflict',true,'revision',entry.revision,'trip',entry.trip);
  end if;
  if not public.orbit_valid_trip(p_trip) then return jsonb_build_object('error','Invalid itinerary'); end if;
  update public.orbit_trips set trip=p_trip,revision=revision+1,updated_at=now() where id=p_id;
  return jsonb_build_object('revision',entry.revision+1);
end $$;

revoke all on function public.orbit_create_trip(jsonb) from public;
revoke all on function public.orbit_load_trip(uuid,text) from public;
revoke all on function public.orbit_save_trip(uuid,text,bigint,jsonb) from public;
grant execute on function public.orbit_create_trip(jsonb) to anon,authenticated;
grant execute on function public.orbit_load_trip(uuid,text) to anon,authenticated;
grant execute on function public.orbit_save_trip(uuid,text,bigint,jsonb) to anon,authenticated;
