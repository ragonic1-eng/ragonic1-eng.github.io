-- Deploy after research.sql. Google Maps usage caps and a shared cache; only the google-places edge function may call these.
create table if not exists public.orbit_google_cache (
 cache_key text primary key,
 result jsonb not null,
 updated_at timestamptz not null default now()
);
alter table public.orbit_google_cache enable row level security;
revoke all on public.orbit_google_cache from public,anon,authenticated;

-- Counts one call against today's cap for a scope; false once the cap is reached.
create or replace function public.orbit_claim_google(p_scope text,p_limit integer)
returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare today date := (now() at time zone 'UTC')::date; used_now integer;
begin
 if p_scope not in ('autocomplete','details','locate','nearby') or p_limit<1 then return false; end if;
 insert into public.orbit_research_budget values(today,'google-'||p_scope,1)
 on conflict(budget_day,scope) do update set used=orbit_research_budget.used+1 where orbit_research_budget.used<p_limit
 returning used into used_now;
 return used_now is not null;
end $$;

-- Place details are kept a week (hours change); pins for 30 days, as Google's terms allow for coordinates.
create or replace function public.orbit_google_cache_get(p_key text)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select result from public.orbit_google_cache
 where cache_key=p_key and updated_at > now()-(case when p_key like 'details|%' then interval '7 days' else interval '30 days' end);
$$;
create or replace function public.orbit_google_cache_put(p_key text,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if length(p_key)>400 or octet_length(p_result::text)>20000 then raise exception 'Invalid cache entry'; end if;
 insert into public.orbit_google_cache values(p_key,p_result,now()) on conflict(cache_key) do update set result=excluded.result,updated_at=now();
 delete from public.orbit_google_cache where updated_at<now()-interval '30 days';
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.orbit_claim_google(text,integer) from public,anon,authenticated;
revoke all on function public.orbit_google_cache_get(text) from public,anon,authenticated;
revoke all on function public.orbit_google_cache_put(text,jsonb) from public,anon,authenticated;
grant execute on function public.orbit_claim_google(text,integer) to service_role;
grant execute on function public.orbit_google_cache_get(text) to service_role;
grant execute on function public.orbit_google_cache_put(text,jsonb) to service_role;
notify pgrst,'reload schema';
