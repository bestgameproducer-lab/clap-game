-- A team may legitimately finish a challenge with zero points. Recording that
-- result must still create a ledger row so pre-vote settlement can distinguish
-- an explicit zero from a score that the operator forgot to enter.

begin;

create or replace function adjust_team_points(p_team text,p_amount integer,p_actor text,p_reason text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_total integer;
begin
  if p_team not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount is null or abs(p_amount)>1000 then raise exception using errcode='22023',message='invalid_point_amount'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))>200 then raise exception using errcode='22023',message='reason_required'; end if;
  perform 1 from game_state where id=1 for update;
  if (select team_clues_settled_at is not null from game_state where id=1) then
    raise exception using errcode='P0001',message='team_scores_already_settled';
  end if;
  insert into team_points_ledger(team,amount,reason,actor) values(p_team,p_amount,trim(p_reason),p_actor);
  select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'team.points_adjust','team',p_team,jsonb_build_object(
    'amount',p_amount,'total',v_total,'reason',trim(p_reason),'explicit_zero',p_amount=0));
  return v_total;
end;
$$;

create or replace function adjust_host_team_points(
  p_team text,p_amount integer,p_reason text,p_event_key uuid,p_actor text
) returns integer language plpgsql security definer set search_path=public as $$
declare v_existing team_points_ledger%rowtype; v_total integer;
begin
  if p_event_key is null then raise exception using errcode='22023',message='score_event_key_required'; end if;
  if p_team not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_amount is null or p_amount not between 0 and 100 then raise exception using errcode='22023',message='invalid_host_score_amount'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>200 then raise exception using errcode='22023',message='score_reason_required'; end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;
  perform pg_advisory_xact_lock(hashtext('host-score:'||p_event_key::text));
  select * into v_existing from team_points_ledger where event_key=p_event_key;
  if found then
    if v_existing.team<>p_team or v_existing.amount<>p_amount or v_existing.reason<>trim(p_reason) then raise exception using errcode='P0001',message='score_event_conflict'; end if;
    select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
    return v_total;
  end if;
  perform 1 from game_state where id=1 for update;
  if (select team_clues_settled_at is not null from game_state where id=1) then
    raise exception using errcode='P0001',message='team_scores_already_settled';
  end if;
  insert into team_points_ledger(team,amount,reason,event_key,actor)
  values(p_team,p_amount,trim(p_reason),p_event_key,p_actor);
  select coalesce(sum(amount),0)::integer into v_total from team_points_ledger where team=p_team;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'host.team_points_add','team',p_team,jsonb_build_object(
    'amount',p_amount,'total',v_total,'reason',trim(p_reason),'event_key',p_event_key,
    'explicit_zero',p_amount=0));
  return v_total;
end;
$$;

revoke all on function adjust_team_points(text,integer,text,text) from public,anon,authenticated;
revoke all on function adjust_host_team_points(text,integer,text,uuid,text) from public,anon,authenticated;
grant execute on function adjust_team_points(text,integer,text,text) to service_role;
grant execute on function adjust_host_team_points(text,integer,text,uuid,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608080003','team_score.explicit_zero_enabled','game_state','1',jsonb_build_object(
  'runtime_preserved',true,'zero_creates_ledger_record',true,'settlement_gate_compatible',true));

commit;
