-- Remove Chen Tianran and Chen Ziyou from the formal wedding roster while
-- preserving approved history, evidence and points. Their shared account and
-- dedicated first-act task are retired, not deleted.

begin;

alter table tasks disable trigger guard_retired_and_official_task_catalog;
alter table tasks disable trigger guard_live_custom_task_catalog;
alter table assignments disable trigger guard_live_custom_task_assignment;

with target_guests as (
  select id
  from guests
  where lower(regexp_replace(trim(login_name),'\s+',' ','g')) in(
    'tianran chen','ziyou chen','tianran chen & ziyou chen'
  )
), retired_assignments as (
  update assignments a
  set status='cancelled',
      cancelled_at=coalesce(a.cancelled_at,now()),
      rejection_reason='宾客名单调整：陈天然与陈子宥已移出正式名单'
  where a.guest_id in(select id from target_guests)
    and a.status in('assigned','submitted','rejected')
  returning a.id
), revoked_sessions as (
  delete from guest_sessions
  where guest_id in(select id from target_guests)
  returning guest_id
), retired_guests as (
  update guests
  set active=false,
      uses_app=false,
      eligible_for_mission=false,
      eligible_for_secret_role=false,
      eligible_for_personal_score=false,
      phase_two_eligible=false,
      staff_notes=case
        when coalesce(staff_notes,'') like '%已移出正式名单%' then staff_notes
        when trim(coalesce(staff_notes,''))='' then '陈天然与陈子宥已移出正式名单'
        else staff_notes||'；陈天然与陈子宥已移出正式名单'
      end
  where id in(select id from target_guests)
  returning id
), retired_task as (
  update tasks
  set active=false,formal_allowed=false
  where mission_code='P1-FAMILY-001'
    and (active or formal_allowed)
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select
  'migration:202608190001',
  'guest.joint_family_account_retired',
  'guest_group',
  'tianran-ziyou',
  jsonb_build_object(
    'guest_rows_retired',(select count(*) from retired_guests),
    'sessions_revoked',(select count(*) from revoked_sessions),
    'unfinished_assignments_cancelled',(select count(*) from retired_assignments),
    'dedicated_tasks_retired',(select count(*) from retired_task),
    'approved_history_preserved',true,
    'points_preserved',true,
    'new_physical_guest_count',32,
    'new_login_account_count',32
  );

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
    'P1-BONUS-001','P1-TRICKSTER-001',
    'P2-SOCIAL-001','P2-SOCIAL-002','P2-SOCIAL-003','P2-SOCIAL-004',
    'P2-CEREMONY-001','P2-HEART-001','P2-STAR-001','P2-LONELY-001',
    'P2-GUIDE-001','P2-TRICKSTER-001','P2-POWER-001','P2-LUCKY-001'
  ]::text[])
$$;

revoke all on function is_official_wedding_mission_code(text)
  from public,anon,authenticated,service_role;

do $catalog_gate$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.formal_wedding_catalog_ready()'::regprocedure)
  into v_definition;
  v_updated:=regexp_replace(
    v_definition,
    E'\\n[[:space:]]*\\(''P1-FAMILY-001''[^\\n]*\\),?',
    '',
    'g'
  );
  v_updated:=regexp_replace(
    v_updated,
    E'\\(select count\\(\\*\\) from expected\\)[[:space:]]*=[[:space:]]*23',
    '(select count(*) from expected)=22',
    'g'
  );
  if v_updated=v_definition or position('P1-FAMILY-001' in v_updated)>0 then
    raise exception using errcode='P0001',message='retired_family_catalog_patch_failed';
  end if;
  execute v_updated;
end;
$catalog_gate$;

do $roster_gate$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.formal_wedding_roster_ready()'::regprocedure)
  into v_definition;
  v_updated:=regexp_replace(
    v_definition,
    E'\\n[[:space:]]*\\(''tianran chen & ziyou chen''[^\\n]*\\),?',
    '',
    'g'
  );
  v_updated:=regexp_replace(
    v_updated,
    E'\\(select count\\(\\*\\) from expected\\)[[:space:]]*=[[:space:]]*33',
    '(select count(*) from expected)=32',
    'g'
  );
  v_updated:=regexp_replace(
    v_updated,
    E'\\(select count\\(\\*\\) from guests where active\\)[[:space:]]*=[[:space:]]*33',
    '(select count(*) from guests where active)=32',
    'g'
  );
  if v_updated=v_definition or position('tianran chen & ziyou chen' in lower(v_updated))>0 then
    raise exception using errcode='P0001',message='retired_family_roster_patch_failed';
  end if;
  execute v_updated;
end;
$roster_gate$;

alter table assignments enable trigger guard_live_custom_task_assignment;
alter table tasks enable trigger guard_live_custom_task_catalog;
alter table tasks enable trigger guard_retired_and_official_task_catalog;

do $verify$
begin
  if not formal_wedding_catalog_ready() then
    raise exception using errcode='P0001',message='formal_catalog_not_ready_after_family_retirement';
  end if;
  if not formal_wedding_roster_ready() then
    raise exception using errcode='P0001',message='formal_roster_not_ready_after_family_retirement';
  end if;
end;
$verify$;

commit;
