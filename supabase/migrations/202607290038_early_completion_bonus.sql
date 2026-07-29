-- The first three initial-task finishers receive the documented extra personal point.
alter table assignments add column if not exists early_bonus_points integer not null default 0;

do $$ begin
  alter table assignments add constraint assignments_early_bonus_points_check
    check (early_bonus_points in (0,1));
exception when duplicate_object then null;
end $$;

-- Backfill an already completed rehearsal or live round exactly once without rewriting history.
do $$
declare v_assignment record;
begin
  for v_assignment in
    select id,guest_id,completion_rank from assignments
    where is_initial and status='approved' and completion_rank between 1 and 3 and early_bonus_points=0
    order by completion_rank,id for update
  loop
    update assignments set early_bonus_points=1 where id=v_assignment.id;
    insert into points_ledger(guest_id,amount,reason,actor)
    values(v_assignment.guest_id,1,'首轮任务前三名额外奖励','migration:202607290038');
    update guests set points=points+1 where id=v_assignment.guest_id;
    insert into audit_log(actor,action,target_type,target_id,details)
    values('migration:202607290038','assignment.early_bonus','assignment',v_assignment.id::text,
      jsonb_build_object('guest_id',v_assignment.guest_id,'completion_rank',v_assignment.completion_rank,'points',1,'backfill',true));
  end loop;
end $$;

create or replace function approve_assignment_with_verification(
  p_assignment_id uuid,
  p_actor text,
  p_verification_note text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
  v_guest_id uuid;
  v_rank integer;
  v_bonus_awarded integer:=0;
begin
  if nullif(trim(p_verification_note),'') is null or length(trim(p_verification_note))>500 then
    raise exception using errcode='22023',message='verification_note_required';
  end if;

  v_result:=approve_assignment(p_assignment_id,p_actor,trim(p_verification_note));
  select guest_id,completion_rank into v_guest_id,v_rank from assignments where id=p_assignment_id;

  if v_rank between 1 and 3 then
    update assignments set early_bonus_points=1
    where id=p_assignment_id and early_bonus_points=0
    returning guest_id into v_guest_id;
    if found then
      insert into points_ledger(guest_id,amount,reason,actor)
      values(v_guest_id,1,'首轮任务前三名额外奖励',p_actor);
      update guests set points=points+1 where id=v_guest_id;
      insert into audit_log(actor,action,target_type,target_id,details)
      values(p_actor,'assignment.early_bonus','assignment',p_assignment_id::text,
        jsonb_build_object('guest_id',v_guest_id,'completion_rank',v_rank,'points',1,'backfill',false));
      v_bonus_awarded:=1;
    end if;
  end if;

  update assignments set
    verification_note=trim(p_verification_note),verified_by=p_actor,verified_at=now()
  where id=p_assignment_id;
  return v_result||jsonb_build_object('early_bonus_points',v_bonus_awarded);
end;
$$;

revoke all on function approve_assignment_with_verification(uuid,text,text) from public,anon,authenticated;
grant execute on function approve_assignment_with_verification(uuid,text,text) to service_role;
