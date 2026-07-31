-- Production enables a safe-update guard for service-role statements. Keep the
-- destructive rehearsal reset explicit so the guard accepts each intentional
-- whole-table runtime cleanup while preserving the existing transaction.

create or replace function reset_final_mission_story_runtime()
returns trigger language plpgsql set search_path=public as $$
begin
  delete from player_relationships where true;
  delete from trickster_signal_attempts where true;
  update heart_slots set guest_id=null,assigned_at=null where true;
  update guests set unlocked_role='NONE' where true;
  return new;
end;
$$;

create or replace function reset_rehearsal_data(
  p_confirmation text,
  p_backup_confirmed boolean,
  p_reason text,
  p_event_key uuid,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_existing rehearsal_resets%rowtype;
  v_summary jsonb;
  v_evidence_paths text[];
begin
  if p_event_key is null then raise exception using errcode='22023',message='reset_event_key_required'; end if;
  select * into v_existing from rehearsal_resets where event_key=p_event_key;
  if found then return v_existing.summary; end if;
  if p_confirmation<>'RESET WEDDING' then raise exception using errcode='22023',message='reset_confirmation_invalid'; end if;
  if not coalesce(p_backup_confirmed,false) then raise exception using errcode='22023',message='reset_backup_required'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 300 then
    raise exception using errcode='22023',message='reset_reason_required';
  end if;
  if nullif(trim(coalesce(p_actor,'')),'') is null then raise exception using errcode='22023',message='actor_required'; end if;

  perform pg_advisory_xact_lock(hashtext('wedding-rehearsal-reset-v1'));
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  v_summary:=preview_rehearsal_reset();
  select coalesce(array_agg(evidence_path order by evidence_path),'{}'::text[])
  into v_evidence_paths from assignments where evidence_path is not null;

  update game_state set
    registration_open=false,
    voting_open=false,
    scoreboard_visible=false,
    results_visible=false,
    updated_at=now()
  where id=1;

  update hidden_task_codes set claimed_by=null,claimed_at=null,assignment_id=null
  where claimed_by is not null or claimed_at is not null or assignment_id is not null;

  delete from cupid_helper_actions where true;
  delete from assignment_mutual_confirmations where true;
  delete from symbol_pairing_assignments where true;
  delete from player_relationships where true;
  delete from trickster_signal_attempts where true;
  update heart_slots set guest_id=null,assigned_at=null where true;

  delete from result_rewards where true;
  delete from votes where true;
  delete from guest_clues where true;
  delete from points_ledger where true;
  delete from team_points_ledger where true;
  delete from spy_points_ledger where true;
  delete from team_resource_ledger where true;
  delete from assignments where true;
  delete from guest_sessions where true;
  delete from guest_login_throttles where true;

  update team_resources set balance=10,updated_at=now() where true;
  update awards set winner_guest_id=null,winner_team=null,reason='',published=false,updated_at=now() where true;
  update guests set
    team=case when team_locked then team else '未分组' end,
    role=case when is_hidden_spy then 'guest' when role_locked then role else 'guest' end,
    is_hidden_spy=false,
    unlocked_role='NONE',
    special_card_revealed_at=null,
    points=0,
    claim_code_hash=null,
    claimed_at=null,
    drawn_at=null
  where true;
  update game_state set
    registration_open=false,stage='registration',voting_open=false,voting_round=0,
    results_visible=false,scoreboard_visible=false,phase_note=null,
    display_title=null,display_body=null,public_clue=null,timer_ends_at=null,
    current_host_segment_id=null,voting_opened_at=null,voting_closed_at=null,
    results_published_at=null,phase_one_completed_at=null,updated_at=now()
  where id=1;

  insert into rehearsal_resets(event_key,actor,reason,summary,evidence_paths)
  values(p_event_key,p_actor,trim(p_reason),v_summary,v_evidence_paths);
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'rehearsal.reset','game_state','1',
    jsonb_build_object(
      'reason',trim(p_reason),
      'backup_confirmed',true,
      'public_controls_closed_automatically',
        (v_state.registration_open or v_state.voting_open or v_state.scoreboard_visible),
      'summary',v_summary
    ));
  return v_summary;
end;
$$;

revoke all on function reset_final_mission_story_runtime() from public,anon,authenticated;
revoke all on function reset_rehearsal_data(text,boolean,text,uuid,text) from public,anon,authenticated;
grant execute on function reset_rehearsal_data(text,boolean,text,uuid,text) to service_role;
