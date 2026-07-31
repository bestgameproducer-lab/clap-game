-- Tricksters remain part of the story, but they no longer have a separate score.
-- Preserve the historical ledger for audit/reset compatibility and prevent any
-- new manual or automatic entries from being created.

begin;

create or replace function record_spy_point_event(
  p_guest_id uuid,
  p_reason text,
  p_note text,
  p_event_key uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  raise exception using errcode='P0001',message='trickster_scoring_disabled';
end;
$$;

revoke all on function record_spy_point_event(uuid,text,text,uuid,text)
  from public,anon,authenticated,service_role;

create or replace function settle_spy_results(p_voting_round integer,p_actor text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_completed integer:=0;
begin
  if p_voting_round<1 then
    raise exception using errcode='22023',message='voting_not_started';
  end if;

  update assignments a
  set status='approved',
      approved_at=coalesce(a.approved_at,now()),
      verified_at=coalesce(a.verified_at,now()),
      verification_note='最终揭晓已完成，恶作剧者身份由系统记录'
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
      jsonb_build_object('completed_assignments',v_completed,'trickster_scoring','disabled'));
  end if;

  return jsonb_build_object(
    'phase_two_trickster_assignments_completed',v_completed,
    'trickster_scoring','disabled'
  );
end;
$$;

-- The renamed legacy function contains the retired scoring implementation and
-- must remain unreachable even to service-role callers.
revoke all on function settle_spy_results_before_phase_two_assignment_v1(integer,text)
  from public,anon,authenticated,service_role;
revoke all on function settle_spy_results(integer,text)
  from public,anon,authenticated;
grant execute on function settle_spy_results(integer,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310020','trickster_scoring.disable','game_state','1',
  jsonb_build_object(
    'historical_ledger_preserved',true,
    'future_manual_scoring_disabled',true,
    'future_automatic_scoring_disabled',true
  ));

commit;
