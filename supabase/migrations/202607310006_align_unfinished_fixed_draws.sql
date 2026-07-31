-- Align two unfinished rehearsal draws with the organizer's final fixed cast.
-- Fail closed if either old assignment has already produced score history.

begin;

do $$
declare v_guest guests%rowtype; v_assignment assignments%rowtype; v_expected_code text;
begin
  for v_guest in select * from guests where lower(login_name) in('siran li','feifei xie') for update loop
    v_expected_code:=case lower(v_guest.login_name)
      when 'siran li' then 'P1-CER-003' when 'feifei xie' then 'P1-BONUS-001' end;
    if v_guest.drawn_at is not null then
      select a.* into v_assignment from assignments a where a.guest_id=v_guest.id and a.is_initial for update;
      if not found then raise exception using errcode='P0001',message='fixed_draw_assignment_missing'; end if;
      if (select mission_code from tasks where id=v_assignment.task_id)<>v_expected_code then
        if v_assignment.status<>'assigned' or v_assignment.evidence_path is not null
            or v_assignment.completion_note is not null
            or exists(select 1 from points_ledger where assignment_id=v_assignment.id) then
          raise exception using errcode='P0001',message='fixed_draw_runtime_conflict';
        end if;
        update assignments set task_id=(select id from tasks where mission_code=v_expected_code) where id=v_assignment.id;
      end if;
    end if;
  end loop;
end;
$$;

update guests set story_role='GROOM_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,
  eligible_for_secret_role=false where lower(login_name)='siran li';
update guests set story_role='NONE',ceremony_eligible=false,role='guest',role_locked=true,
  eligible_for_secret_role=false where lower(login_name)='feifei xie';

do $$
declare v_guest_id uuid;
begin
  select id into v_guest_id from guests where lower(login_name)='feifei xie' and drawn_at is not null;
  if v_guest_id is not null and exists(select 1 from assignments a join tasks t on t.id=a.task_id
      where a.guest_id=v_guest_id and a.is_initial and t.mission_code='P1-BONUS-001' and a.status in('assigned','rejected')) then
    perform complete_system_mission(v_guest_id,'INSTANT_BONUS','system:instant-bonus','丘比特幸运星自动奖励');
  end if;
end;
$$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310006','phase_one.fixed_draw_alignment','game_state','1',jsonb_build_object(
  'unfinished_only',true,'score_history_rewritten',false,'runtime_reset',false));

commit;
