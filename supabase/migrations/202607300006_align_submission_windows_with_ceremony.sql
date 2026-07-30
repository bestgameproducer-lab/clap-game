begin;

create or replace function phase_one_interactions_open(p_stage text)
returns boolean
language sql
immutable
set search_path=public
as $$
  select p_stage in ('registration','waiting','task_round_2','group_game');
$$;

create or replace function submit_assignment(
  p_assignment_id uuid,
  p_guest_id uuid,
  p_completion_note text
) returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task_stage text;
  v_game_stage text;
begin
  if length(trim(coalesce(p_completion_note,'')))>500 then
    raise exception using errcode='22023',message='completion_note_too_long';
  end if;

  select stage into v_game_stage from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  select t.stage into v_task_stage
  from assignments a join tasks t on t.id=a.task_id
  where a.id=p_assignment_id and a.guest_id=p_guest_id and a.status in ('assigned','rejected')
  for update of a;
  if not found then raise exception using errcode='P0001',message='assignment_not_assignable'; end if;

  if not (
    (v_task_stage='task_round_1' and phase_one_interactions_open(v_game_stage))
    or (v_task_stage='task_round_2' and v_game_stage in ('task_round_2','group_game'))
    or (v_task_stage='group_game' and v_game_stage='group_game')
  ) then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;

  update assignments set
    status='submitted',submitted_at=now(),
    completion_note=trim(coalesce(p_completion_note,'')),
    rejected_at=null,rejection_reason=null,
    verification_note='',verified_by=null,verified_at=null
  where id=p_assignment_id;
end;
$$;


create or replace function request_player_connection(p_guest_id uuid,p_target_code text,p_relationship_type text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_stage text; v_max_attempts integer; v_guest guests%rowtype; v_target guests%rowtype;
  v_a uuid; v_b uuid; v_is_a boolean; v_relation player_relationships%rowtype;
  v_symbol text; v_expected_role text; v_attempts integer; v_mechanic text; v_unlocked text;
begin
  select stage,trickster_max_attempts into v_stage,v_max_attempts from game_state where id=1 for share;
  select * into v_guest from guests where id=p_guest_id and active and drawn_at is not null for update;
  if not found then raise exception using errcode='P0002',message='connection_guest_not_ready'; end if;
  select * into v_target from guests where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code)) for update;
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=v_guest.id then raise exception using errcode='22023',message='connection_self_target'; end if;
  if v_guest.id::text<v_target.id::text then v_a:=v_guest.id;v_b:=v_target.id;v_is_a:=true;
  else v_a:=v_target.id;v_b:=v_guest.id;v_is_a:=false; end if;

  if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
    if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='symbol_connection_stage_closed'; end if;
    v_symbol:=case when p_relationship_type='CUPID_ALLIANCE' then 'HEART' else 'STAR' end;
    v_expected_role:=case when v_symbol='HEART' then 'HEART_HOLDER' else 'STAR_HOLDER' end;
    if v_guest.story_role<>v_expected_role or v_target.story_role<>v_expected_role then
      raise exception using errcode='P0001',message='symbol_holder_required';
    end if;
    if exists(select 1 from symbol_pairing_assignments where guest_id in(v_guest.id,v_target.id) and status in('PAIRED','UNPAIRED_FINAL')) then
      raise exception using errcode='P0001',message='symbol_player_unavailable';
    end if;
    if exists(select 1 from player_relationships r where r.relationship_type=p_relationship_type and r.status='PENDING'
      and (r.player_a_id in(v_guest.id,v_target.id) or r.player_b_id in(v_guest.id,v_target.id))
      and not(r.player_a_id=v_a and r.player_b_id=v_b)) then
      raise exception using errcode='P0001',message='symbol_pending_conflict';
    end if;
  elsif p_relationship_type='TRICKSTER_CONNECTION' then
    if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='trickster_connection_stage_closed'; end if;
    if v_guest.role<>'spy' then raise exception using errcode='28000',message='trickster_connection_forbidden'; end if;
    if not exists(select 1 from trickster_signal_attempts where guest_id=v_guest.id and target_guest_id=v_target.id) then
      select count(*)::integer into v_attempts from trickster_signal_attempts where guest_id=v_guest.id;
      if v_attempts>=v_max_attempts then raise exception using errcode='P0001',message='trickster_attempt_limit'; end if;
      insert into trickster_signal_attempts(guest_id,target_guest_id,matched) values(v_guest.id,v_target.id,v_target.role='spy');
      insert into audit_log(actor,action,target_type,target_id,details)
      values('guest:'||v_guest.id::text,'trickster.signal_attempt','guest',v_guest.id::text,
        jsonb_build_object('target_guest_id',v_target.id,'matched',v_target.role='spy','attempt_limit',v_max_attempts));
    end if;
    if v_target.role<>'spy' then return jsonb_build_object('relationshipType',p_relationship_type,'status','NO_MATCH','maxAttempts',v_max_attempts); end if;
  else
    raise exception using errcode='22023',message='invalid_relationship_type';
  end if;

  insert into player_relationships(relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status)
  values(p_relationship_type,v_a,v_b,v_is_a,not v_is_a,'PENDING')
  on conflict(relationship_type,player_a_id,player_b_id) do update set
    player_a_confirmed=case when player_relationships.status='REJECTED' then excluded.player_a_confirmed else player_relationships.player_a_confirmed or excluded.player_a_confirmed end,
    player_b_confirmed=case when player_relationships.status='REJECTED' then excluded.player_b_confirmed else player_relationships.player_b_confirmed or excluded.player_b_confirmed end,
    status=case when player_relationships.status='REJECTED' then 'PENDING' else player_relationships.status end,
    activated_at=case when player_relationships.status='REJECTED' then null else player_relationships.activated_at end
  returning * into v_relation;

  if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
    update symbol_pairing_assignments set status='PENDING',pending_relationship_id=v_relation.id,updated_at=now()
    where guest_id in(v_a,v_b) and status in('AVAILABLE','PENDING');
  end if;
  if v_relation.player_a_confirmed and v_relation.player_b_confirmed and v_relation.status='PENDING' then
    update player_relationships set status='ACTIVE',activated_at=now() where id=v_relation.id returning * into v_relation;
    if p_relationship_type in ('CUPID_ALLIANCE','STAR_ALLIANCE') then
      v_mechanic:=case when p_relationship_type='CUPID_ALLIANCE' then 'HEART_MATCH' else 'STAR_MATCH' end;
      v_unlocked:=case when p_relationship_type='CUPID_ALLIANCE' then 'CUPID_ALLIANCE' else 'STAR_ALLIANCE' end;
      update symbol_pairing_assignments set status='PAIRED',partner_guest_id=case when guest_id=v_a then v_b else v_a end,
        pending_relationship_id=null,updated_at=now() where guest_id in(v_a,v_b);
      update guests set unlocked_role=v_unlocked where id in(v_a,v_b);
      perform complete_system_mission(v_a,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
      perform complete_system_mission(v_b,v_mechanic,'system:symbol-match','图案伙伴已双向确认');
    else
      perform complete_system_mission(v_a,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
      perform complete_system_mission(v_b,'TRICKSTER_SIGNAL','system:trickster-connection','暗号匹配，双方已确认');
    end if;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('system:relationship','relationship.activate','player_relationship',v_relation.id::text,
      jsonb_build_object('relationship_type',p_relationship_type,'player_a_id',v_a,'player_b_id',v_b));
  end if;
  return jsonb_build_object('relationshipType',p_relationship_type,'status',v_relation.status,'maxAttempts',v_max_attempts);
end; $$;


create or replace function record_cupid_helper_action(p_helper_guest_id uuid,p_trickster_guest_id uuid,p_note text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_stage text;
begin
  select stage into v_stage from game_state where id=1 for share;
  if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='helper_action_stage_closed'; end if;
  if char_length(trim(coalesce(p_note,''))) not between 1 and 500 then raise exception using errcode='22023',message='helper_note_invalid'; end if;
  if not exists(select 1 from guests where id=p_helper_guest_id and hidden_role='CUPID_HELPER' and active) then
    raise exception using errcode='28000',message='helper_action_forbidden';
  end if;
  if not exists(select 1 from guests where id=p_trickster_guest_id and role='spy' and active) then
    raise exception using errcode='P0002',message='trickster_not_found';
  end if;
  insert into cupid_helper_actions(helper_guest_id,trickster_guest_id,note) values(p_helper_guest_id,p_trickster_guest_id,trim(p_note)) returning id into v_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_helper_guest_id::text,'helper.action_record','cupid_helper_action',v_id::text,jsonb_build_object('trickster_guest_id',p_trickster_guest_id));
  return v_id;
end; $$;


create or replace function request_assignment_mutual_confirmation(
  p_assignment_id uuid,p_owner_guest_id uuid,p_target_code text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_assignment assignments%rowtype; v_target guests%rowtype; v_id uuid; v_stage text; v_code text;
begin
  select stage into v_stage from game_state where id=1 for share;
  if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='mutual_confirmation_stage_closed'; end if;
  select a.* into v_assignment from assignments a join tasks t on t.id=a.task_id
  where a.id=p_assignment_id and a.guest_id=p_owner_guest_id and a.status in('assigned','rejected') for update of a;
  if not found then raise exception using errcode='P0002',message='mutual_assignment_not_found'; end if;
  select mission_code into v_code from tasks where id=v_assignment.task_id;
  if v_code<>'P1-SOCIAL-001' then raise exception using errcode='P0001',message='mutual_confirmation_not_supported'; end if;
  select * into v_target from guests where active and drawn_at is not null and upper(player_code)=upper(trim(p_target_code));
  if not found then raise exception using errcode='P0002',message='connection_target_not_found'; end if;
  if v_target.id=p_owner_guest_id then raise exception using errcode='22023',message='connection_self_target'; end if;
  if (select count(*) from assignment_mutual_confirmations where confirmer_guest_id=v_target.id and status='ACTIVE')>=2 then
    raise exception using errcode='P0001',message='mutual_confirmer_limit';
  end if;
  insert into assignment_mutual_confirmations(assignment_id,owner_guest_id,confirmer_guest_id,status)
  values(p_assignment_id,p_owner_guest_id,v_target.id,'PENDING')
  on conflict(assignment_id) do update set confirmer_guest_id=excluded.confirmer_guest_id,status='PENDING',responded_at=null,created_at=now()
  where assignment_mutual_confirmations.status='REJECTED'
  returning id into v_id;
  if v_id is null then raise exception using errcode='P0001',message='mutual_confirmation_pending'; end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_owner_guest_id::text,'assignment.mutual_request','assignment_mutual_confirmation',v_id::text,
    jsonb_build_object('assignment_id',p_assignment_id,'confirmer_guest_id',v_target.id));
  return v_id;
end; $$;


create or replace function respond_assignment_mutual_confirmation(
  p_confirmation_id uuid,p_confirmer_guest_id uuid,p_accept boolean
) returns void language plpgsql security definer set search_path=public as $$
declare v_confirmation assignment_mutual_confirmations%rowtype; v_stage text;
begin
  select stage into v_stage from game_state where id=1 for share;
  if not phase_one_interactions_open(v_stage) then raise exception using errcode='P0001',message='mutual_confirmation_stage_closed'; end if;
  select * into v_confirmation from assignment_mutual_confirmations where id=p_confirmation_id for update;
  if not found then raise exception using errcode='P0002',message='mutual_confirmation_not_found'; end if;
  if v_confirmation.confirmer_guest_id<>p_confirmer_guest_id then raise exception using errcode='28000',message='mutual_confirmation_forbidden'; end if;
  if v_confirmation.status<>'PENDING' then raise exception using errcode='P0001',message='mutual_confirmation_already_handled'; end if;
  update assignment_mutual_confirmations set status=case when p_accept then 'ACTIVE' else 'REJECTED' end,responded_at=now()
  where id=v_confirmation.id;
  if p_accept then
    update assignments set status='submitted',submitted_at=now(),completion_note='由另一位宾客在软件中确认完成' where id=v_confirmation.assignment_id and status in('assigned','rejected');
    perform approve_assignment(v_confirmation.assignment_id,'system:mutual-confirmation','双方已在软件中确认任务完成');
    update assignments set verification_note='双方已在软件中确认任务完成',verified_by='system:mutual-confirmation',verified_at=now()
    where id=v_confirmation.assignment_id;
  end if;
  insert into audit_log(actor,action,target_type,target_id,details)
  values('guest:'||p_confirmer_guest_id::text,'assignment.mutual_respond','assignment_mutual_confirmation',v_confirmation.id::text,
    jsonb_build_object('assignment_id',v_confirmation.assignment_id,'accepted',p_accept));
end; $$;


create or replace function finalize_phase_one_content(p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_symbol text; v_total integer; v_paired integer; v_pending integer; v_last uuid; v_mechanic text; v_unlocked text; v_cancelled integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-phase-one-finalize-v1'));
  if (select stage from game_state where id=1 for update) not in ('registration','waiting','task_round_1','task_round_2','group_game') then
    raise exception using errcode='P0001',message='phase_one_not_active';
  end if;
  foreach v_symbol in array array['HEART','STAR'] loop
    select count(*)::integer,count(*) filter(where status='PAIRED')::integer,count(*) filter(where status='PENDING')::integer
      into v_total,v_paired,v_pending from symbol_pairing_assignments where symbol=v_symbol;
    if v_total<>5 then raise exception using errcode='P0001',message='symbol_pairing_count_invalid'; end if;
    if v_paired<>4 or v_pending<>0 then raise exception using errcode='P0001',message='symbol_pairing_incomplete'; end if;
    select guest_id into v_last from symbol_pairing_assignments where symbol=v_symbol and status='AVAILABLE' for update;
    if not found then raise exception using errcode='P0001',message='symbol_final_player_missing'; end if;
    v_mechanic:=case when v_symbol='HEART' then 'HEART_MATCH' else 'STAR_MATCH' end;
    v_unlocked:=case when v_symbol='HEART' then 'LONELY_CUPID' else 'GUIDING_STAR' end;
    update symbol_pairing_assignments set status='UNPAIRED_FINAL',finalized_at=now(),updated_at=now() where guest_id=v_last;
    update guests set unlocked_role=v_unlocked where id=v_last;
    perform complete_system_mission(v_last,v_mechanic,'system:phase-one-finalize','阶段结束：最后一位图案玩家自动完成任务');
  end loop;
  update assignments a set status='cancelled',cancelled_at=now(),rejection_reason=null
  from tasks t where t.id=a.task_id and t.stage='task_round_1' and t.category<>'ceremony'
    and a.status in('assigned','rejected');
  get diagnostics v_cancelled=row_count;
  update game_state set phase_one_completed_at=now(),updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'phase_one.finalize','game_state','1',jsonb_build_object('cancelled_assignments',v_cancelled));
  return jsonb_build_object('cancelledAssignments',v_cancelled,'heartFinalized',true,'starFinalized',true);
end; $$;


create or replace function set_game_stage(p_stage text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_state game_state%rowtype; v_phase_two_count integer:=0;
begin
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then
    raise exception using errcode='22023',message='invalid_game_stage';
  end if;
  if p_stage in ('voting','results') then raise exception using errcode='P0001',message='use_voting_controls'; end if;
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if p_stage='task_round_2' and v_state.stage not in ('task_round_2','group_game','voting','results') then
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  end if;
  update game_state set stage=p_stage,voting_open=false,results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
    public_clue=null,timer_ends_at=null,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',jsonb_build_object('previous_stage',v_state.stage,'stage',p_stage,
    'phase_one_closes_at','voting','phase_two_assignments_created',v_phase_two_count));
end; $$;


create or replace function set_game_flag(p_field text,p_value boolean,p_actor text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
begin
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  if p_field='voting_open' then
    if p_value and not v_state.voting_open then
      if v_state.stage not in ('group_game','voting','results') then
        raise exception using errcode='P0001',message='voting_stage_not_ready';
      end if;
      if not exists(select 1 from guests where active and drawn_at is not null) then
        raise exception using errcode='P0001',message='no_drawn_guests';
      end if;
      if v_state.phase_one_completed_at is null then
        perform finalize_phase_one_content(p_actor);
      end if;
      update game_state set
        registration_open=false,
        voting_open=true,
        results_visible=false,
        stage='voting',
        voting_round=voting_round+1,
        voting_opened_at=now(),
        voting_closed_at=null,
        results_published_at=null,
        current_host_segment_id=null,
        display_title=null,
        display_body=null,
        public_clue=null,
        timer_ends_at=null,
        updated_at=now()
      where id=1;
    elsif not p_value and v_state.voting_open then
      update game_state set voting_open=false,voting_closed_at=coalesce(voting_closed_at,now()),updated_at=now() where id=1;
    end if;
  elsif p_field='results_visible' then
    if p_value then
      if v_state.voting_round<1 then raise exception using errcode='P0001',message='voting_not_started'; end if;
      update game_state set
        voting_open=false,
        results_visible=true,
        stage='results',
        voting_closed_at=coalesce(voting_closed_at,now()),
        results_published_at=coalesce(results_published_at,now()),
        current_host_segment_id=null,
        display_title=null,
        display_body=null,
        public_clue=null,
        timer_ends_at=null,
        updated_at=now()
      where id=1;
      perform settle_voting_results(v_state.voting_round,p_actor);
      perform settle_spy_results(v_state.voting_round,p_actor);
    else
      update game_state set
        results_visible=false,
        stage=case when stage='results' then 'voting' else stage end,
        results_published_at=null,
        current_host_segment_id=null,
        display_title=null,
        display_body=null,
        public_clue=null,
        timer_ends_at=null,
        updated_at=now()
      where id=1;
    end if;
  elsif p_field='scoreboard_visible' then
    update game_state set scoreboard_visible=p_value,updated_at=now() where id=1;
  else
    raise exception using errcode='22023',message='invalid_game_flag';
  end if;

  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.'||p_field,'game_state','1',jsonb_build_object(
    'value',p_value,
    'previous_stage',v_state.stage,
    'stage',(select stage from game_state where id=1),
    'voting_round',(select voting_round from game_state where id=1)
  ));
end;
$$;


revoke all on function phase_one_interactions_open(text) from public,anon,authenticated;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607300006','game.ceremony_submission_windows','game_state','1',
  jsonb_build_object(
    'before_ceremony',jsonb_build_array('registration','waiting'),
    'ceremony_paused','task_round_1',
    'after_ceremony',jsonb_build_array('task_round_2','group_game'),
    'phase_one_closes_at','voting'
  ));

commit;
