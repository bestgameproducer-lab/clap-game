-- Remove any surviving rehearsal assignment that is outside the approved
-- 23-task wedding manifest, and make the live boundary exact. Earlier guards
-- rejected only mission_code IS NULL; a legacy task with an obsolete non-null
-- code (for example an old rehearsal mission) could otherwise remain visible.

begin;

create or replace function is_official_wedding_mission_code(p_code text)
returns boolean
language sql
immutable
security invoker
set search_path=public
as $$
  select coalesce(p_code,'')=any(array[
    'P1-CER-001','P1-CER-002','P1-CER-003','P1-CER-004',
    'P1-HEART-001','P1-STAR-001','P1-SOCIAL-001','P1-SOCIAL-002',
    'P1-BONUS-001','P1-TRICKSTER-001','P1-FAMILY-001',
    'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004',
    'P2-CEREMONY-001','P2-HEART-001','P2-STAR-001','P2-LONELY-001',
    'P2-GUIDE-001','P2-TRICKSTER-001','P2-POWER-001','P2-LUCKY-001'
  ]::text[])
$$;

revoke all on function is_official_wedding_mission_code(text)
  from public,anon,authenticated,service_role;

-- Cancel only unfinished runtime rows. Approved history remains immutable and
-- disappears on the next explicit rehearsal reset with all other assignments.
with retired as (
  update assignments a
  set status='cancelled',cancelled_at=coalesce(a.cancelled_at,now()),
      rejection_reason='正式婚礼只保留已确认的 23 项任务'
  from tasks t,game_state state
  where state.id=1 and state.task_catalog_mode='live'
    and a.task_id=t.id and a.status in('assigned','submitted','rejected')
    and not is_official_wedding_mission_code(t.mission_code)
  returning a.id,a.guest_id,a.task_id,t.mission_code,t.title
), summary as (
  select count(*)::integer count,
    coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id',id,'guest_id',guest_id,'task_id',task_id,
      'mission_code',mission_code,'title',title
    ) order by id),'[]'::jsonb) assignments
  from retired
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608130025','assignment.nonofficial_live_retired',
  'assignments','batch',jsonb_build_object(
    'count',count,'assignments',assignments,
    'official_manifest_count',23,'approved_history_preserved',true
  )
from summary;

create or replace function guard_live_custom_task_catalog()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select task_catalog_mode from game_state where id=1)='live'
      and not is_official_wedding_mission_code(new.mission_code) then
    raise exception using errcode='P0001',message='live_custom_task_catalog_locked';
  end if;
  return new;
end;
$$;

create or replace function guard_live_custom_task_assignment()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select task_catalog_mode from game_state where id=1)='live'
      and exists(
        select 1 from tasks t where t.id=new.task_id
          and not is_official_wedding_mission_code(t.mission_code)
      ) then
    raise exception using errcode='P0001',message='live_custom_task_assignment_forbidden';
  end if;
  return new;
end;
$$;

revoke all on function guard_live_custom_task_catalog()
  from public,anon,authenticated,service_role;
revoke all on function guard_live_custom_task_assignment()
  from public,anon,authenticated,service_role;

commit;
