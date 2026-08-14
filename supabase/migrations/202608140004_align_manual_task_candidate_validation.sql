begin;

-- Keep the authoritative validator aligned with the task candidates shown by
-- both staff consoles. Only explicit, non-hidden demo tasks may pass through
-- the manual assignment RPCs.
create or replace function validate_manual_task_assignment(
  p_guest_id uuid,
  p_task_id uuid,
  p_exclude_assignment_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guest guests%rowtype;
  v_task tasks%rowtype;
  v_state game_state%rowtype;
  v_used integer;
begin
  select * into v_guest from guests where id=p_guest_id for update;
  if not found or not v_guest.active then
    raise exception using errcode='P0002',message='guest_not_found';
  end if;
  if not v_guest.uses_app or v_guest.participation_mode<>'ACTIVE_PLAYER'
      or not v_guest.eligible_for_mission or v_guest.drawn_at is null then
    raise exception using errcode='P0001',message='manual_task_guest_ineligible';
  end if;

  select * into v_task from tasks where id=p_task_id for update;
  if not found or not v_task.active then
    raise exception using errcode='P0002',message='task_not_found';
  end if;
  if v_task.mission_code is not null or v_task.formal_allowed
      or coalesce(v_task.mission_code,'') ~* '^P[12]-' then
    raise exception using errcode='P0001',message='official_task_manual_assignment_forbidden';
  end if;
  if not v_task.is_demo or v_task.category='hidden' then
    raise exception using errcode='P0001',message='manual_task_not_demo';
  end if;

  select * into v_state from game_state where id=1 for share;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;
  if v_state.task_catalog_mode='live' then
    raise exception using errcode='P0001',message='live_custom_task_assignment_forbidden';
  end if;
  if v_task.role_scope not in('all',v_guest.role)
      or v_task.story_role_scope not in('NONE',v_guest.story_role) then
    raise exception using errcode='P0001',message='manual_task_role_ineligible';
  end if;
  if v_task.stage='task_round_1' and not phase_one_interactions_open(v_state.stage) then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  elsif v_task.stage='task_round_2' and v_state.stage not in('task_round_2','banquet','group_game') then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  elsif v_task.stage='group_game' and v_state.stage<>'group_game' then
    raise exception using errcode='P0001',message='manual_task_stage_closed';
  end if;

  if v_task.max_assignments is not null then
    select count(*)::integer into v_used from assignments a
    where a.task_id=v_task.id and a.status<>'cancelled'
      and a.id is distinct from p_exclude_assignment_id;
    if v_used>=v_task.max_assignments then
      raise exception using errcode='P0001',message='manual_task_capacity_full';
    end if;
  end if;
end;
$$;

revoke all on function validate_manual_task_assignment(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608140004','manual_task.validator_aligned','game_state','1',jsonb_build_object(
  'demo_required',true,
  'hidden_manual_assignment_forbidden',true,
  'replacement_capacity_excludes_current_assignment',true
));

commit;
