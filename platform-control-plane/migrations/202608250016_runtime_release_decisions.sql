begin;

create table public.platform_runtime_release_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  instance_id uuid not null references public.platform_runtime_instances(id) on delete cascade,
  action text not null check (action in ('release', 'hold')),
  project_version integer not null check (project_version > 0),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  target_origin text not null check (char_length(target_origin) between 12 and 300),
  deployment_ref text not null check (char_length(deployment_ref) between 1 and 120),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  note text not null check (char_length(btrim(note)) between 4 and 1000),
  released_by_user_id uuid references auth.users(id) on delete set null,
  event_key uuid not null,
  created_at timestamptz not null default now(),
  unique (released_by_user_id, event_key)
);

create index platform_runtime_release_events_project_created_idx
  on public.platform_runtime_release_events (project_id, created_at);

alter table public.platform_runtime_release_events enable row level security;

create policy platform_runtime_release_events_staff_select
  on public.platform_runtime_release_events for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_runtime_release_events from public, anon;
revoke insert, update, delete on public.platform_runtime_release_events from authenticated;
grant select (
  id, project_id, instance_id, action, project_version, manifest_hash,
  target_origin, deployment_ref, note, created_at
) on public.platform_runtime_release_events to authenticated;

create or replace function public.platform_runtime_release_checklist_is_valid(
  p_action text,
  p_checklist jsonb
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_action
    when 'release' then
      jsonb_typeof(p_checklist) = 'object'
      and p_checklist ?& array[
        'readyStateReviewed', 'ownerApprovalConfirmed', 'publicEntryVerified',
        'supportContactsConfirmed', 'rollbackProcedureConfirmed', 'dataDeadlineRecorded'
      ]
      and (p_checklist - array[
        'readyStateReviewed', 'ownerApprovalConfirmed', 'publicEntryVerified',
        'supportContactsConfirmed', 'rollbackProcedureConfirmed', 'dataDeadlineRecorded'
      ]) = '{}'::jsonb
      and p_checklist -> 'readyStateReviewed' = 'true'::jsonb
      and p_checklist -> 'ownerApprovalConfirmed' = 'true'::jsonb
      and p_checklist -> 'publicEntryVerified' = 'true'::jsonb
      and p_checklist -> 'supportContactsConfirmed' = 'true'::jsonb
      and p_checklist -> 'rollbackProcedureConfirmed' = 'true'::jsonb
      and p_checklist -> 'dataDeadlineRecorded' = 'true'::jsonb
    when 'hold' then
      jsonb_typeof(p_checklist) = 'object'
      and p_checklist ?& array['externalAccessRestricted', 'ownerNotified', 'incidentRecorded']
      and (p_checklist - array['externalAccessRestricted', 'ownerNotified', 'incidentRecorded']) = '{}'::jsonb
      and p_checklist -> 'externalAccessRestricted' = 'true'::jsonb
      and p_checklist -> 'ownerNotified' = 'true'::jsonb
      and p_checklist -> 'incidentRecorded' = 'true'::jsonb
    else false
  end;
$$;

revoke all on function public.platform_runtime_release_checklist_is_valid(text, jsonb)
  from public, anon, authenticated;

create or replace function public.platform_record_runtime_release(
  p_event_key uuid,
  p_project_id uuid,
  p_action text,
  p_checklist jsonb,
  p_note text
)
returns table (
  release_event_id uuid,
  project_id uuid,
  project_status text,
  instance_id uuid,
  action text,
  project_version integer,
  manifest_hash text,
  target_origin text,
  deployment_ref text,
  note text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.platform_projects%rowtype;
  v_instance public.platform_runtime_instances%rowtype;
  v_manifest public.platform_provisioning_manifests%rowtype;
  v_release public.platform_runtime_release_events%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_expected_action text;
  v_entitlement_status text;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if not public.platform_is_staff() then raise exception 'platform_staff_required'; end if;
  if p_action not in ('release', 'hold')
    or p_event_key is null or p_project_id is null
    or not public.platform_runtime_release_checklist_is_valid(p_action, p_checklist)
    or char_length(v_note) not between 4 and 1000
    or v_note ~* '(postgres(ql)?|mysql|mongodb(\+srv)?)://[^[:space:]/:@]+:[^[:space:]@]+@'
    or v_note ~ '(sb_secret_|sk_(live|test)_|sk-(live-|test-)?)[A-Za-z0-9_-]{12,}'
    or v_note ~ 'eyJ[A-Za-z0-9_-]{10,}[.]eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}'
  then raise exception 'platform_runtime_release_invalid'; end if;
  v_expected_action := case when p_action = 'release' then 'runtime_release' else 'runtime_hold' end;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> v_expected_action or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select event.* into v_release from public.platform_runtime_release_events event
    where event.released_by_user_id = v_actor and event.event_key = p_event_key;
    select p.* into v_project from public.platform_projects p where p.id = p_project_id;
    return query select v_release.id, v_release.project_id, v_project.status,
      v_release.instance_id, v_release.action, v_release.project_version,
      v_release.manifest_hash, v_release.target_origin, v_release.deployment_ref,
      v_release.note, v_release.created_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-runtime-release:' || p_project_id::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> v_expected_action or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select event.* into v_release from public.platform_runtime_release_events event
    where event.released_by_user_id = v_actor and event.event_key = p_event_key;
    select p.* into v_project from public.platform_projects p where p.id = p_project_id;
    return query select v_release.id, v_release.project_id, v_project.status,
      v_release.instance_id, v_release.action, v_release.project_version,
      v_release.manifest_hash, v_release.target_origin, v_release.deployment_ref,
      v_release.note, v_release.created_at;
    return;
  end if;

  select p.* into v_project from public.platform_projects p
  where p.id = p_project_id for update;
  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if (p_action = 'release' and v_project.status <> 'ready')
    or (p_action = 'hold' and v_project.status <> 'live')
  then raise exception 'platform_runtime_release_out_of_order'; end if;

  select instance.* into v_instance from public.platform_runtime_instances instance
  where instance.project_id = p_project_id for update;
  if v_instance.id is null then raise exception 'platform_runtime_release_prerequisite'; end if;

  select m.* into v_manifest from public.platform_provisioning_manifests m
  where m.project_id = p_project_id;
  if p_action = 'release' then
    select e.status into v_entitlement_status from public.platform_entitlements e
    where e.project_id = p_project_id;
    if v_instance.status <> 'ready'
      or v_instance.ready_at is null
      or v_manifest.project_id is null
      or v_manifest.project_version <> v_project.current_version
      or v_manifest.project_version <> v_instance.project_version
      or v_manifest.manifest_hash <> v_instance.manifest_hash
      or v_entitlement_status <> 'active'
      or not exists (
        select 1 from public.platform_runtime_instance_attestations a
        where a.instance_id = v_instance.id and a.stage = 'verification'
      )
      or not exists (
        select 1 from public.platform_runtime_instance_attestations a
        where a.instance_id = v_instance.id and a.stage = 'readiness'
      )
    then raise exception 'platform_runtime_release_prerequisite'; end if;
  elsif not exists (
    select 1 from public.platform_runtime_release_events event
    where event.project_id = p_project_id and event.action = 'release'
  ) then raise exception 'platform_runtime_release_prerequisite'; end if;

  insert into public.platform_runtime_release_events (
    project_id, instance_id, action, project_version, manifest_hash,
    target_origin, deployment_ref, checklist, note, released_by_user_id, event_key
  ) values (
    v_project.id, v_instance.id, p_action, v_project.current_version, v_instance.manifest_hash,
    v_instance.target_origin, v_instance.deployment_ref, p_checklist, v_note, v_actor, p_event_key
  ) returning * into v_release;

  update public.platform_projects p set
    status = case when p_action = 'release' then 'live' else 'ready' end,
    updated_at = now()
  where p.id = v_project.id returning * into v_project;

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    v_project.id, v_actor,
    case when p_action = 'release' then 'runtime_release_confirmed' else 'runtime_release_held' end,
    v_project.current_version,
    jsonb_build_object(
      'event_key', p_event_key,
      'release_event_id', v_release.id,
      'instance_id', v_instance.id,
      'manifest_hash', v_instance.manifest_hash
    )
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, v_expected_action);

  return query select v_release.id, v_release.project_id, v_project.status,
    v_release.instance_id, v_release.action, v_release.project_version,
    v_release.manifest_hash, v_release.target_origin, v_release.deployment_ref,
    v_release.note, v_release.created_at;
end;
$$;

revoke all on function public.platform_record_runtime_release(uuid, uuid, text, jsonb, text)
  from public, anon;
grant execute on function public.platform_record_runtime_release(uuid, uuid, text, jsonb, text)
  to authenticated;

commit;
