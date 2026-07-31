-- A manual switch into act two is the official phase-one closing boundary.
-- Finalize the fifth heart/star players before the phase-two allocator validates
-- the ten relationship-derived roles.

begin;

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
    perform finalize_phase_one_content(p_actor);
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  end if;
  update game_state set stage=p_stage,voting_open=false,results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
    public_clue=null,timer_ends_at=null,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',jsonb_build_object('previous_stage',v_state.stage,'stage',p_stage,
    'phase_one_closes_at','task_round_2','phase_two_assignments_created',v_phase_two_count));
end;
$$;

revoke all on function set_game_stage(text,text) from public,anon,authenticated;
grant execute on function set_game_stage(text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310014','phase_two.finalize_order_fixed','game_state','1',jsonb_build_object(
  'finalize_before_unlock',true,'atomic_transition',true,'existing_runtime_preserved',true));

commit;
