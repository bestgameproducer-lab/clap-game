-- Keep team challenge scores inside the real team-game stage, and align the
-- trickster signal with the same ceremony pause used by every other first-act
-- interaction. Registration/waiting are playable; the ceremony itself is not.

begin;

-- The wrappers must keep retries idempotent even if a venue-network response
-- arrives after the host has already advanced the stage. A matching event may
-- return its stored total; only a new event is subject to the stage gate.
create or replace function team_score_event_retry_total(
  p_team text,
  p_amount integer,
  p_reason text,
  p_event_key uuid
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  v_existing team_points_ledger%rowtype;
  v_total integer;
begin
  if p_event_key is null then return null; end if;
  perform pg_advisory_xact_lock(hashtext('staff-score:'||p_event_key::text));
  select * into v_existing from team_points_ledger where event_key=p_event_key;
  if not found then return null; end if;
  if v_existing.team is distinct from p_team
      or v_existing.amount is distinct from p_amount
      or v_existing.reason is distinct from trim(p_reason) then
    raise exception using errcode='P0001',message='score_event_conflict';
  end if;
  select coalesce(sum(amount),0)::integer into v_total
  from team_points_ledger where team=p_team;
  return v_total;
end;
$$;

alter function adjust_staff_team_points(text,integer,text,text,uuid)
  rename to adjust_staff_team_points_before_group_game_lock;
revoke all on function adjust_staff_team_points_before_group_game_lock(text,integer,text,text,uuid)
  from public,anon,authenticated,service_role;

create function adjust_staff_team_points(
  p_team text,
  p_amount integer,
  p_actor text,
  p_reason text,
  p_event_key uuid
) returns integer
language plpgsql
security definer
set search_path=public
as $$
declare v_stage text; v_retry_total integer;
begin
  v_retry_total:=team_score_event_retry_total(p_team,p_amount,p_reason,p_event_key);
  if v_retry_total is not null then return v_retry_total; end if;
  perform assert_wedding_not_final();
  select stage into v_stage from game_state where id=1 for update;
  if v_stage is distinct from 'group_game' then
    raise exception using errcode='P0001',message='team_score_stage_closed';
  end if;
  return adjust_staff_team_points_before_group_game_lock(
    p_team,p_amount,p_actor,p_reason,p_event_key
  );
end;
$$;

alter function adjust_host_team_points(text,integer,text,uuid,text)
  rename to adjust_host_team_points_before_group_game_lock;
revoke all on function adjust_host_team_points_before_group_game_lock(text,integer,text,uuid,text)
  from public,anon,authenticated,service_role;

create function adjust_host_team_points(
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
declare v_stage text; v_retry_total integer;
begin
  v_retry_total:=team_score_event_retry_total(p_team,p_amount,p_reason,p_event_key);
  if v_retry_total is not null then return v_retry_total; end if;
  perform assert_wedding_not_final();
  select stage into v_stage from game_state where id=1 for update;
  if v_stage is distinct from 'group_game' then
    raise exception using errcode='P0001',message='team_score_stage_closed';
  end if;
  return adjust_host_team_points_before_group_game_lock(
    p_team,p_amount,p_reason,p_event_key,p_actor
  );
end;
$$;

-- Persist the exact selected clue ids in the immutable settlement audit. The
-- task station can then repeat a failed delivery without treating an unrelated
-- later manual grant as if it had belonged to the team settlement.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.settle_phase_two_team_clues(text)'::regprocedure
  ) into v_definition;
  v_updated:=replace(
    v_definition,
    $old$'rank',v_team.team_rank,'score',v_team.score,'clue_count',v_clue_count,
      'recipient_clue_rows_created',v_inserted$old$,
    $new$'rank',v_team.team_rank,'score',v_team.score,'clue_count',v_clue_count,
      'clue_ids',to_jsonb(v_clue_ids),'recipient_clue_rows_created',v_inserted$new$
  );
  if v_updated=v_definition
      or position($needle$'clue_ids',to_jsonb(v_clue_ids)$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='team_clue_audit_snapshot_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

-- Migration 202608030002 made the trickster mission cross-act, but its stage
-- list accidentally opened the ceremony and closed registration/waiting.
-- Patch the implementations now living behind the final-result wrappers.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.request_player_connection_before_final_lock(uuid,text,text)'::regprocedure
  ) into v_definition;
  v_updated:=replace(
    v_definition,
    $old$if v_stage not in('task_round_1','ceremony_end','task_round_2','banquet','group_game') then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;$old$,
    $new$if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;$new$
  );
  if v_updated=v_definition
      or position($needle$not phase_one_interactions_open(v_stage)$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='trickster_request_window_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

-- A team match alone is not enough for a targeted clue. If an organizer
-- changed the preset trickster after preparing the library, never allow the
-- retired target's clue to be manually granted to the current team.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.grant_guest_clue(uuid,uuid,text)'::regprocedure
  ) into v_definition;
  v_updated:=replace(
    v_definition,
    $old$  if v_guest.team not in ('海岛组','沙漠组') or v_clue.team_scope is distinct from v_guest.team then
    raise exception using errcode='P0001',message='clue_team_mismatch';
  end if;
  insert into guest_clues(guest_id,clue_id,granted_by)$old$,
    $new$  if v_guest.team not in ('海岛组','沙漠组') or v_clue.team_scope is distinct from v_guest.team then
    raise exception using errcode='P0001',message='clue_team_mismatch';
  end if;
  if v_clue.spy_guest_id is not null and (
    (select count(*) from guests spy
      where spy.active and spy.uses_app
        and spy.participation_mode='ACTIVE_PLAYER' and spy.phase_two_eligible
        and spy.drawn_at is not null and spy.role='spy' and not spy.is_hidden_spy
        and spy.team=v_guest.team)<>1
    or not exists(
      select 1 from guests spy
      where spy.id=v_clue.spy_guest_id and spy.active and spy.uses_app
        and spy.participation_mode='ACTIVE_PLAYER' and spy.phase_two_eligible
        and spy.drawn_at is not null and spy.role='spy' and not spy.is_hidden_spy
        and spy.team=v_guest.team
    )
  ) then
    raise exception using errcode='P0001',message='clue_spy_mismatch';
  end if;
  insert into guest_clues(guest_id,clue_id,granted_by)$new$
  );
  if v_updated=v_definition
      or position($needle$message='clue_spy_mismatch'$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='manual_clue_spy_scope_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.accept_player_connection_before_final_lock(uuid,uuid)'::regprocedure
  ) into v_definition;
  v_updated:=replace(
    v_definition,
    $old$if v_relation.relationship_type='TRICKSTER_CONNECTION'
      and v_stage not in('task_round_1','ceremony','ceremony_end','task_round_2','banquet','group_game') then
    raise exception using errcode='P0001',message='trickster_connection_stage_closed';
  end if;$old$,
    $new$if v_relation.relationship_type='TRICKSTER_CONNECTION'
      and not phase_one_interactions_open(v_stage) then
    raise exception using errcode='P0001',message='trickster_connection_stage_closed';
  end if;$new$
  );
  if v_updated=v_definition
      or position($needle$and not phase_one_interactions_open(v_stage)$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='trickster_accept_window_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

revoke all on function adjust_staff_team_points(text,integer,text,text,uuid)
  from public,anon,authenticated;
revoke all on function adjust_host_team_points(text,integer,text,uuid,text)
  from public,anon,authenticated;
revoke all on function team_score_event_retry_total(text,integer,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function adjust_staff_team_points(text,integer,text,text,uuid)
  to service_role;
grant execute on function adjust_host_team_points(text,integer,text,uuid,text)
  to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130015','runtime.stage_boundaries_hardened','game_state','1',jsonb_build_object(
  'team_scoring_stage','group_game',
  'trickster_signal_open_stages',jsonb_build_array('registration','waiting','ceremony_end','task_round_2','banquet','group_game'),
  'ceremony_paused',true,
  'team_clue_audit_snapshot',true,
  'manual_clue_current_spy_guard',true,
  'final_result_lock_preserved',true
));

commit;
