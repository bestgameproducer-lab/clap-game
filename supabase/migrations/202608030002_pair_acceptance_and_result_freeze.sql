-- Make connection invitations one-tap for the recipient, bind the two
-- awakening roles to their actual first-act symbol outcome, freeze competitive
-- team scores at clue settlement, and unlock a double ballot for a trickster
-- only after their true mission is completed.

begin;

alter table game_state add column if not exists team_score_snapshot jsonb;

create or replace function accept_player_connection(p_guest_id uuid,p_relationship_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_relation player_relationships%rowtype;
  v_stage text;
  v_mechanic text;
  v_unlocked text;
begin
  select stage into v_stage from game_state where id=1 for share;
  select * into v_relation from player_relationships where id=p_relationship_id for update;
  if not found then raise exception using errcode='P0002',message='relationship_not_found'; end if;
  if p_guest_id not in(v_relation.player_a_id,v_relation.player_b_id) then
    raise exception using errcode='28000',message='relationship_forbidden';
  end if;
  if v_relation.status<>'PENDING' then raise exception using errcode='P0001',message='relationship_not_accepting'; end if;
  if (p_guest_id=v_relation.player_a_id and v_relation.player_a_confirmed)
      or (p_guest_id=v_relation.player_b_id and v_relation.player_b_confirmed) then
    raise exception using errcode='P0001',message='relationship_already_confirmed';
  end if;
  if v_relation.relationship_type in('CUPID_ALLIANCE','STAR_ALLIANCE')
      and not phase_one_interactions_open(v_stage) then
    raise exception using errcode='P0001',message='symbol_connection_stage_closed';
  end if;
  if v_relation.relationship_type='TRICKSTER_CONNECTION'
      and v_stage not in('task_round_1','ceremony','ceremony_end','task_round_2','banquet','group_game') then
    raise exception using errcode='P0001',message='trickster_connection_stage_closed';
  end if;

  update player_relationships set
    player_a_confirmed=player_a_confirmed or p_guest_id=player_a_id,
    player_b_confirmed=player_b_confirmed or p_guest_id=player_b_id
  where id=v_relation.id returning * into v_relation;

  if v_relation.player_a_confirmed and v_relation.player_b_confirmed then
    update player_relationships set status='ACTIVE',activated_at=now()
    where id=v_relation.id returning * into v_relation;
    if v_relation.relationship_type in('CUPID_ALLIANCE','STAR_ALLIANCE') then
      v_mechanic:=case when v_relation.relationship_type='CUPID_ALLIANCE' then 'HEART_MATCH' else 'STAR_MATCH' end;
      v_unlocked:=case when v_relation.relationship_type='CUPID_ALLIANCE' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
      update symbol_pairing_assignments set status='PAIRED',
        partner_guest_id=case when guest_id=v_relation.player_a_id then v_relation.player_b_id else v_relation.player_a_id end,
        pending_relationship_id=null,updated_at=now()
      where guest_id in(v_relation.player_a_id,v_relation.player_b_id) and pending_relationship_id=v_relation.id;
      update guests set unlocked_role=v_unlocked where id in(v_relation.player_a_id,v_relation.player_b_id);
      perform complete_system_mission(v_relation.player_a_id,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
      perform complete_system_mission(v_relation.player_b_id,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
    elsif v_relation.relationship_type='TRICKSTER_CONNECTION' then
      perform complete_system_mission(v_relation.player_a_id,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
      perform complete_system_mission(v_relation.player_b_id,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
    else raise exception using errcode='22023',message='invalid_relationship_type';
    end if;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('guest:'||p_guest_id::text,'relationship.accept','player_relationship',v_relation.id::text,
      jsonb_build_object('relationship_type',v_relation.relationship_type,'activated',true));
  end if;
  return jsonb_build_object('relationshipType',v_relation.relationship_type,'status',v_relation.status);
end;
$$;

-- The trickster signal is not divided into acts. Keep heart/star pairing on
-- the first-act window while allowing a trickster to use any remaining
-- verification attempts until the final vote begins.
do $migration$
declare v_definition text; v_updated text;
begin
  select pg_get_functiondef('public.request_player_connection(uuid,text,text)'::regprocedure) into v_definition;
  v_updated:=replace(v_definition,
    $old$elsif p_relationship_type='TRICKSTER_CONNECTION' then
    if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;$old$,
    $new$elsif p_relationship_type='TRICKSTER_CONNECTION' then
    if v_stage not in('task_round_1','ceremony_end','task_round_2','banquet','group_game') then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;$new$);
  if v_updated=v_definition or position($needle$v_stage not in('task_round_1','ceremony_end','task_round_2','banquet','group_game')$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='trickster_connection_window_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

-- A rejected trickster invitation must be recoverable without revealing either
-- side. Symbol rejection keeps its existing pairing cleanup.
create or replace function reject_player_connection(p_guest_id uuid,p_relationship_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_relation player_relationships%rowtype;
begin
  select * into v_relation from player_relationships where id=p_relationship_id for update;
  if not found then raise exception using errcode='P0002',message='relationship_not_found'; end if;
  if p_guest_id not in(v_relation.player_a_id,v_relation.player_b_id) then raise exception using errcode='28000',message='relationship_forbidden'; end if;
  if v_relation.status<>'PENDING' or v_relation.relationship_type not in('CUPID_ALLIANCE','STAR_ALLIANCE','TRICKSTER_CONNECTION') then
    raise exception using errcode='P0001',message='relationship_not_rejectable';
  end if;
  update player_relationships set status='REJECTED' where id=v_relation.id;
  if v_relation.relationship_type in('CUPID_ALLIANCE','STAR_ALLIANCE') then
    update symbol_pairing_assignments set status='AVAILABLE',pending_relationship_id=null,updated_at=now()
    where guest_id in(v_relation.player_a_id,v_relation.player_b_id) and pending_relationship_id=v_relation.id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_guest_id::text,'relationship.reject','player_relationship',v_relation.id::text,
    jsonb_build_object('relationship_type',v_relation.relationship_type));
end;
$$;

-- Fail atomically if a future phase-two generator ever attempts to awaken a
-- player who was not the final unpaired holder of the matching first-act icon.
create or replace function enforce_phase_two_awakening_origin()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.primary_mission='TEAM_CAPTAIN' and not exists(
    select 1 from symbol_pairing_assignments s
    where s.guest_id=new.guest_id and s.symbol='STAR' and s.status='UNPAIRED_FINAL'
  ) then raise exception using errcode='P0001',message='guiding_star_origin_invalid'; end if;
  if new.primary_mission='COPY_SCORE' and not exists(
    select 1 from symbol_pairing_assignments s
    where s.guest_id=new.guest_id and s.symbol='HEART' and s.status='UNPAIRED_FINAL'
  ) then raise exception using errcode='P0001',message='lonely_cupid_origin_invalid'; end if;
  return new;
end;
$$;
drop trigger if exists phase_two_awakening_origin on phase_two_profiles;
create trigger phase_two_awakening_origin before insert or update of guest_id,primary_mission
on phase_two_profiles for each row execute function enforce_phase_two_awakening_origin();

create or replace function unlock_phase_two_missions(p_actor text)
returns integer language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from phase_two_profiles p where p.primary_mission='TEAM_CAPTAIN' and not exists(
      select 1 from symbol_pairing_assignments s where s.guest_id=p.guest_id and s.symbol='STAR' and s.status='UNPAIRED_FINAL')) then
    raise exception using errcode='P0001',message='guiding_star_origin_invalid';
  end if;
  if exists(select 1 from phase_two_profiles p where p.primary_mission='COPY_SCORE' and not exists(
      select 1 from symbol_pairing_assignments s where s.guest_id=p.guest_id and s.symbol='HEART' and s.status='UNPAIRED_FINAL')) then
    raise exception using errcode='P0001',message='lonely_cupid_origin_invalid';
  end if;
  if not exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where t.stage='task_round_2' and t.mission_code like 'P2-%') then
    delete from phase_two_dilemmas;
    delete from phase_two_copy_choices;
  end if;
  return unlock_phase_two_missions_assignments_v1(p_actor);
end;
$$;

-- Snapshot a round that was already settled before this migration, then patch
-- the settlement function so every future round captures the same immutable
-- two-team total at the exact clue-award boundary.
update game_state set team_score_snapshot=(
  select jsonb_object_agg(expected.team,coalesce(t.total,0))
  from (values('海岛组'::text),('沙漠组'::text)) expected(team)
  left join (select team,sum(amount)::integer total from team_points_ledger
    where team in('海岛组','沙漠组') group by team) t using(team)
) where id=1 and team_clues_settled_at is not null and team_score_snapshot is null;

do $migration$
declare v_definition text; v_updated text;
begin
  select pg_get_functiondef('public.settle_phase_two_team_clues(text)'::regprocedure) into v_definition;
  v_updated:=replace(v_definition,
    'update game_state set team_clues_settled_at=now(),updated_at=now() where id=1;',
    $patch$update game_state set team_clues_settled_at=now(),
      team_score_snapshot=(select jsonb_object_agg(expected.team,coalesce(t.total,0))
        from (values('海岛组'::text),('沙漠组'::text)) expected(team)
        left join (select team,sum(amount)::integer total from team_points_ledger
          where team in('海岛组','沙漠组') group by team) t using(team)),
      updated_at=now() where id=1;$patch$);
  if v_updated=v_definition or position('team_score_snapshot=' in v_updated)=0 then
    raise exception using errcode='P0001',message='team_score_snapshot_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

create or replace function reset_team_score_snapshot_after_rehearsal()
returns trigger language plpgsql security definer set search_path=public as $$
begin update game_state set team_score_snapshot=null where id=1; return new; end;
$$;
drop trigger if exists rehearsal_reset_team_score_snapshot on rehearsal_resets;
create trigger rehearsal_reset_team_score_snapshot after insert on rehearsal_resets
for each row execute function reset_team_score_snapshot_after_rehearsal();

create or replace function cast_team_vote(p_voter_guest_id uuid,p_target_guest_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_voter_team text; v_target_team text; v_weight integer:=1; v_state game_state%rowtype;
begin
  if p_voter_guest_id=p_target_guest_id then raise exception using errcode='22023',message='self_vote'; end if;
  select * into v_state from game_state where id=1 for share;
  if not coalesce(v_state.voting_open,false) then raise exception using errcode='P0001',message='voting_closed'; end if;
  select team into v_voter_team from guests where id=p_voter_guest_id and active and drawn_at is not null;
  select team into v_target_team from guests where id=p_target_guest_id and active and drawn_at is not null;
  if v_voter_team is null or v_target_team is null then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_voter_team<>v_target_team then raise exception using errcode='22023',message='cross_team_vote'; end if;
  if exists(select 1 from phase_two_profiles where guest_id=p_voter_guest_id
      and primary_mission='EXTRA_VOTE' and unlocked_at is not null)
      or exists(select 1 from assignments a join tasks t on t.id=a.task_id join guests g on g.id=a.guest_id
        where a.guest_id=p_voter_guest_id and a.status='approved' and t.mission_code='P2-TRICKSTER-001' and g.role='spy')
    then v_weight:=2; end if;
  begin
    insert into votes(voter_guest_id,target_guest_id,voting_round,vote_weight)
    values(p_voter_guest_id,p_target_guest_id,v_state.voting_round,v_weight);
  exception when unique_violation then raise exception using errcode='P0001',message='vote_already_cast'; end;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_voter_guest_id::text,'vote.cast','vote',p_voter_guest_id::text,
    jsonb_build_object('target_id',p_target_guest_id,'voting_round',v_state.voting_round,'weighted',v_weight=2));
end;
$$;

revoke all on function accept_player_connection(uuid,uuid) from public,anon,authenticated;
revoke all on function reject_player_connection(uuid,uuid) from public,anon,authenticated;
revoke all on function enforce_phase_two_awakening_origin() from public,anon,authenticated;
revoke all on function unlock_phase_two_missions(text) from public,anon,authenticated;
revoke all on function reset_team_score_snapshot_after_rehearsal() from public,anon,authenticated;
revoke all on function cast_team_vote(uuid,uuid) from public,anon,authenticated;
grant execute on function accept_player_connection(uuid,uuid) to service_role;
grant execute on function reject_player_connection(uuid,uuid) to service_role;
grant execute on function unlock_phase_two_missions(text) to service_role;
grant execute on function cast_team_vote(uuid,uuid) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608030002','relationship_and_result_boundaries_fixed','game_state','1',jsonb_build_object(
  'one_tap_relationship_acceptance',true,'awakening_origin_enforced',true,
  'team_score_snapshot',true,'trickster_completed_vote_weight',2,'runtime_preserved',true));

commit;
