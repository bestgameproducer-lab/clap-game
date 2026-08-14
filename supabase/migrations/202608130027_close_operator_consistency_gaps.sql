-- Close the remaining operator/data consistency gaps found by the complete
-- UI -> route -> RPC audit.  These checks live in the database so a stale tab
-- or a direct service call cannot bypass the same rules shown in the UI.

begin;

-- Supplemental phase notes describe one wedding stage only.  Clear them in
-- the same transaction as every real stage change (including voting/results)
-- so a failed second HTTP request cannot carry old instructions forward.
create or replace function clear_phase_note_on_stage_change()
returns trigger
language plpgsql
security invoker
set search_path=public
as $$
begin
  if new.stage is distinct from old.stage then
    new.phase_note:=null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_phase_note_on_stage_change on game_state;
create trigger clear_phase_note_on_stage_change
before update of stage on game_state
for each row execute function clear_phase_note_on_stage_change();

revoke all on function clear_phase_note_on_stage_change()
  from public,anon,authenticated,service_role;

-- Awards may include family/honor guests, but never a deactivated roster row.
-- Always check on write so an old inactive selection cannot later be published.
create or replace function guard_active_award_guest()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.winner_guest_id is not null
      and not exists(
        select 1 from guests g where g.id=new.winner_guest_id and g.active
      ) then
    raise exception using errcode='P0001',message='award_guest_inactive';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_active_award_guest on awards;
create trigger guard_active_award_guest
before insert or update on awards
for each row execute function guard_active_award_guest();

revoke all on function guard_active_award_guest()
  from public,anon,authenticated,service_role;

-- The task station remains an intentional recovery surface: staff can approve
-- assigned/rejected work after seeing proof.  It must nevertheless respect the
-- same act window as the guest and can never settle a hidden trickster record.
create or replace function complete_assignment_at_station(
  p_assignment_id uuid,p_actor text,
  p_reason text default '任务站现场核验通过'
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_task_stage text;
  v_task_category text;
  v_game_stage text;
begin
  perform assert_wedding_not_final();

  select t.stage,t.category,s.stage
  into v_task_stage,v_task_category,v_game_stage
  from assignments a
  join tasks t on t.id=a.task_id
  cross join game_state s
  where a.id=p_assignment_id and s.id=1;
  if not found then
    raise exception using errcode='P0002',message='assignment_not_found';
  end if;
  if v_task_category='hidden' then
    raise exception using errcode='P0001',message='station_hidden_assignment_forbidden';
  end if;
  if (v_task_stage='task_round_1' and not phase_one_interactions_open(v_game_stage))
      or (v_task_stage='task_round_2' and v_game_stage not in('task_round_2','banquet','group_game'))
      or (v_task_stage='group_game' and v_game_stage<>'group_game')
      or v_task_stage not in('task_round_1','task_round_2','group_game') then
    raise exception using errcode='P0001',message='assignment_stage_closed';
  end if;

  return complete_assignment_at_station_before_final_lock(
    p_assignment_id,p_actor,p_reason
  );
end;
$$;

revoke all on function complete_assignment_at_station(uuid,text,text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130027','operator.consistency_guards','game_state','1',
  jsonb_build_object(
    'phase_note_atomic',true,
    'award_guest_must_be_active',true,
    'station_stage_guarded',true,
    'station_hidden_assignments_forbidden',true
  ));

commit;
