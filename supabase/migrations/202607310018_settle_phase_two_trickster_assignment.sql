-- Close the informational second-act trickster cards at the same atomic reveal
-- boundary that settles private trickster rewards. The cards have no guest-side
-- submit action, so leaving them assigned makes a completed game look unfinished.

begin;

alter function settle_spy_results(integer,text)
  rename to settle_spy_results_before_phase_two_assignment_v1;

create or replace function settle_spy_results(p_voting_round integer,p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
  v_completed integer:=0;
begin
  v_result:=settle_spy_results_before_phase_two_assignment_v1(p_voting_round,p_actor);

  update assignments a
  set status='approved',
      approved_at=coalesce(a.approved_at,now()),
      verified_at=coalesce(a.verified_at,now()),
      verification_note='最终揭晓已完成，恶作剧者结果由系统结算'
  from tasks t,phase_two_profiles p
  where a.task_id=t.id
    and a.guest_id=p.guest_id
    and t.mission_code='P2-TRICKSTER-001'
    and p.primary_mission='TRICKSTER'
    and a.status<>'approved';
  get diagnostics v_completed=row_count;

  if v_completed>0 then
    insert into audit_log(actor,action,target_type,target_id,details)
    values(p_actor,'phase_two.trickster_assignments_complete','voting_round',p_voting_round::text,
      jsonb_build_object('completed_assignments',v_completed));
  end if;

  return v_result||jsonb_build_object('phase_two_trickster_assignments_completed',v_completed);
end;
$$;

revoke all on function settle_spy_results_before_phase_two_assignment_v1(integer,text)
  from public,anon,authenticated,service_role;
revoke all on function settle_spy_results(integer,text) from public,anon,authenticated;
grant execute on function settle_spy_results(integer,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310018','phase_two.trickster_assignment_settlement','game_state','1',
  jsonb_build_object('existing_runtime_preserved',true,'result_boundary','settle_spy_results'));

commit;
