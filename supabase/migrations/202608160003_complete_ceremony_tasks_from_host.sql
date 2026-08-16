-- Ceremony missions are host-confirmed and intentionally have no guest-side
-- submission. Completing the trusted ceremony checklist must therefore also
-- submit, approve and score the assignment in one transaction.

begin;

create or replace function update_ceremony_assignment(
  p_assignment_id uuid,p_ceremony_status text,p_ring_variant text,p_actor text
) returns void
language plpgsql security definer set search_path=public as $$
declare
  v_status text;
begin
  perform assert_wedding_not_final();
  perform update_ceremony_assignment_before_final_lock(
    p_assignment_id,p_ceremony_status,p_ring_variant,p_actor
  );

  if p_ceremony_status='COMPLETED' then
    select status into v_status from assignments
    where id=p_assignment_id for update;

    if v_status in ('assigned','rejected') then
      update assignments
      set status='submitted',submitted_at=coalesce(submitted_at,now()),
        rejection_reason=null
      where id=p_assignment_id;
      v_status:='submitted';
    end if;

    if v_status='submitted' then
      perform approve_assignment_with_verification(
        p_assignment_id,p_actor,'由主持人确认仪式任务已完成。'
      );
    elsif v_status<>'approved' then
      raise exception using errcode='P0001',message='ceremony_assignment_not_completable';
    end if;
  end if;
end;
$$;

revoke all on function update_ceremony_assignment(uuid,text,text,text)
  from public,anon,authenticated,service_role;

commit;
