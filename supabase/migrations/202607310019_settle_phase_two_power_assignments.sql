-- Extra-vote and super-lucky cards are system-settled and have no guest submit
-- action. Close their assignment cards at final reveal after their effects have
-- been applied by the existing voting settlement.

begin;

alter function settle_voting_results(integer,text)
  rename to settle_voting_results_before_power_assignment_v1;

create or replace function settle_voting_results(p_voting_round integer,p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
  v_completed integer:=0;
begin
  v_result:=settle_voting_results_before_power_assignment_v1(p_voting_round,p_actor);

  update assignments a
  set status='approved',
      approved_at=coalesce(a.approved_at,now()),
      verified_at=coalesce(a.verified_at,now()),
      verification_note='最终揭晓已完成，系统能力已自动结算'
  from tasks t,phase_two_profiles p
  where a.task_id=t.id
    and a.guest_id=p.guest_id
    and (
      (p.primary_mission='EXTRA_VOTE' and t.mission_code='P2-POWER-001')
      or (p.primary_mission='SUPER_LUCKY' and t.mission_code='P2-LUCKY-001')
    )
    and a.status<>'approved';
  get diagnostics v_completed=row_count;

  if v_completed>0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.power_assignments_complete','voting_round',p_voting_round::text,
      jsonb_build_object('completed_assignments',v_completed));
  end if;

  return v_result||jsonb_build_object('phase_two_power_assignments_completed',v_completed);
end;
$$;

revoke all on function settle_voting_results_before_power_assignment_v1(integer,text)
  from public,anon,authenticated,service_role;
revoke all on function settle_voting_results(integer,text) from public,anon,authenticated;
grant execute on function settle_voting_results(integer,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310019','phase_two.power_assignment_settlement','game_state','1',
  jsonb_build_object('existing_runtime_preserved',true,'result_boundary','settle_voting_results'));

commit;
