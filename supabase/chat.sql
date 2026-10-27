-- Deploy after research.sql. Orbit chat allowance: 40 questions per trip and 120 per project each UTC day.
-- Only the orbit-chat edge function (service role) may call this.
create or replace function public.orbit_claim_chat(p_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare today date := (now() at time zone 'UTC')::date; used_global integer; used_room integer;
begin
 if not exists(select 1 from public.orbit_trips where id=p_id and key_hash=extensions.digest(p_key,'sha256')) then
  return jsonb_build_object('status',401,'error','Open a valid private shared trip link to chat with Orbit.');
 end if;
 perform pg_advisory_xact_lock(716284093);
 select coalesce(max(used),0) into used_global from public.orbit_research_budget where budget_day=today and scope='chat';
 select coalesce(max(used),0) into used_room from public.orbit_research_budget where budget_day=today and scope='chat:'||p_id::text;
 if used_global>=120 or used_room>=40 then return jsonb_build_object('status',429,'error','Orbit has answered a lot today. Try again tomorrow (UTC).'); end if;
 insert into public.orbit_research_budget values(today,'chat',1),(today,'chat:'||p_id::text,1)
 on conflict(budget_day,scope) do update set used=orbit_research_budget.used+1;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.orbit_claim_chat(uuid,text) from public,anon,authenticated;
grant execute on function public.orbit_claim_chat(uuid,text) to service_role;
notify pgrst,'reload schema';

-- Orbit memory updates (automatic notes and undos): 20 per trip and 60 per project each UTC day.
create or replace function public.orbit_claim_memory(p_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare today date := (now() at time zone 'UTC')::date; used_global integer; used_room integer;
begin
 if not exists(select 1 from public.orbit_trips where id=p_id and key_hash=extensions.digest(p_key,'sha256')) then
  return jsonb_build_object('status',401,'error','Open a valid private shared trip link to save notes for Orbit.');
 end if;
 perform pg_advisory_xact_lock(716284094);
 select coalesce(max(used),0) into used_global from public.orbit_research_budget where budget_day=today and scope='memory';
 select coalesce(max(used),0) into used_room from public.orbit_research_budget where budget_day=today and scope='memory:'||p_id::text;
 if used_global>=60 or used_room>=20 then return jsonb_build_object('status',429,'error','Orbit has saved plenty of notes today. Try again tomorrow, or edit orbit-knowledge.md directly.'); end if;
 insert into public.orbit_research_budget values(today,'memory',1),(today,'memory:'||p_id::text,1)
 on conflict(budget_day,scope) do update set used=orbit_research_budget.used+1;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.orbit_claim_memory(uuid,text) from public,anon,authenticated;
grant execute on function public.orbit_claim_memory(uuid,text) to service_role;
notify pgrst,'reload schema';
