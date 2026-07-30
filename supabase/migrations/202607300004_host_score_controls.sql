-- Minimal host score desk: audited, idempotent team and personal additions.

begin;

alter table points_ledger add column if not exists event_key uuid;
alter table team_points_ledger add column if not exists event_key uuid;

create unique index if not exists points_ledger_event_key_unique
on points_ledger(event_key) where event_key is not null;

create unique index if not exists team_points_ledger_event_key_unique
on team_points_ledger(event_key) where event_key is not null;

create or replace function adjust_host_team_points(
  p_team text,
  p_amount integer,
  p_reason text,
  p_event_key uuid,
  p_actor text
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing team_points_ledger%rowtype;
  v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_team not in ('玫瑰组','月桂组','星辰组','琥珀组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount not between 1 and 100 then raise exception using errcode='22023',message='invalid_host_score_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then
    raise exception using errcode='22023',message='score_reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('host-score:'||p_event_key::text));
  select * into v_existing from team_points_ledger where event_key=p_event_key;
  if found then
    if v_existing.team<>p_team or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then
      raise exception using errcode='P0001',message='score_event_conflict';
    end if;
    select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
    return v_total;
  end if;

  insert into team_points_ledger(team,amount,reason,event_key,actor)
  values(p_team,p_amount,trim(p_reason),p_event_key,p_actor);
  select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.team_points_add','team',p_team,jsonb_build_object(
    'amount',p_amount,'total',v_total,'reason',trim(p_reason),'event_key',p_event_key));
  return v_total;
end;
$$;

create or replace function adjust_host_guest_points(
  p_guest_id uuid,
  p_amount integer,
  p_reason text,
  p_event_key uuid,
  p_actor text
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing points_ledger%rowtype;
  v_guest guests%rowtype;
  v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_amount not between 1 and 100 then raise exception using errcode='22023',message='invalid_host_score_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then
    raise exception using errcode='22023',message='score_reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('host-score:'||p_event_key::text));
  select * into v_existing from points_ledger where event_key=p_event_key;
  if found then
    if v_existing.guest_id<>p_guest_id or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then
      raise exception using errcode='P0001',message='score_event_conflict';
    end if;
    select points into v_total from guests where id=p_guest_id;
    return v_total;
  end if;

  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if not v_guest.active or not v_guest.uses_app or not v_guest.eligible_for_personal_score then
    raise exception using errcode='P0001',message='guest_not_personal_score_eligible';
  end if;

  v_total:=v_guest.points+p_amount;
  update guests set points=v_total where id=p_guest_id;
  insert into points_ledger(guest_id,amount,reason,event_key,actor)
  values(p_guest_id,p_amount,trim(p_reason),p_event_key,p_actor);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.guest_points_add','guest',p_guest_id::text,jsonb_build_object(
    'amount',p_amount,'before',v_guest.points,'after',v_total,'reason',trim(p_reason),'event_key',p_event_key));
  return v_total;
end;
$$;

revoke all on function adjust_host_team_points(text,integer,text,uuid,text) from public,anon,authenticated;
revoke all on function adjust_host_guest_points(uuid,integer,text,uuid,text) from public,anon,authenticated;
grant execute on function adjust_host_team_points(text,integer,text,uuid,text) to service_role;
grant execute on function adjust_host_guest_points(uuid,integer,text,uuid,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607300004','host.score_desk_enabled','game_state','1',jsonb_build_object(
  'team_points',true,'personal_points',true,'idempotent',true,'other_host_modules_exposed',false));

commit;
