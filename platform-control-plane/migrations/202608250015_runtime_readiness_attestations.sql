begin;

alter table public.platform_runtime_instances
  add column ready_by_user_id uuid references auth.users(id) on delete set null,
  add column ready_at timestamptz;

alter table public.platform_runtime_instances
  add constraint platform_runtime_instances_attested_status_check
  check (
    (status = 'registered' and verified_at is null and ready_at is null)
    or (status = 'verified' and verified_at is not null and ready_at is null)
    or (status = 'ready' and verified_at is not null and ready_at is not null)
    or status in ('suspended', 'archived')
  ) not valid;

grant select (verified_at, ready_at) on public.platform_runtime_instances to authenticated;

create table public.platform_runtime_instance_attestations (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.platform_runtime_instances(id) on delete cascade,
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  stage text not null check (stage in ('verification', 'readiness')),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),
  note text not null check (char_length(btrim(note)) between 4 and 1000),
  attested_by_user_id uuid references auth.users(id) on delete set null,
  event_key uuid not null,
  created_at timestamptz not null default now(),
  unique (instance_id, stage),
  unique (attested_by_user_id, event_key)
);

create index platform_runtime_attestations_project_created_idx
  on public.platform_runtime_instance_attestations (project_id, created_at);

alter table public.platform_runtime_instance_attestations enable row level security;

create policy platform_runtime_attestations_staff_select
  on public.platform_runtime_instance_attestations for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_runtime_instance_attestations from public, anon;
revoke insert, update, delete on public.platform_runtime_instance_attestations from authenticated;
grant select (id, instance_id, project_id, stage, note, created_at)
  on public.platform_runtime_instance_attestations to authenticated;

create or replace function public.platform_runtime_checklist_is_valid(p_stage text, p_checklist jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_stage
    when 'verification' then
      jsonb_typeof(p_checklist) = 'object'
      and p_checklist ?& array[
        'publicOriginOpened', 'manifestHashMatched', 'isolatedDataStoreConfirmed',
        'staffAccessConfirmed', 'noSecretsConfirmed'
      ]
      and (p_checklist - array[
        'publicOriginOpened', 'manifestHashMatched', 'isolatedDataStoreConfirmed',
        'staffAccessConfirmed', 'noSecretsConfirmed'
      ]) = '{}'::jsonb
      and p_checklist -> 'publicOriginOpened' = 'true'::jsonb
      and p_checklist -> 'manifestHashMatched' = 'true'::jsonb
      and p_checklist -> 'isolatedDataStoreConfirmed' = 'true'::jsonb
      and p_checklist -> 'staffAccessConfirmed' = 'true'::jsonb
      and p_checklist -> 'noSecretsConfirmed' = 'true'::jsonb
    when 'readiness' then
      jsonb_typeof(p_checklist) = 'object'
      and p_checklist ?& array[
        'mobileGuestFlowPassed', 'operatorFlowPassed',
        'stageTransitionsPassed', 'fallbackMaterialsReady'
      ]
      and (p_checklist - array[
        'mobileGuestFlowPassed', 'operatorFlowPassed',
        'stageTransitionsPassed', 'fallbackMaterialsReady'
      ]) = '{}'::jsonb
      and p_checklist -> 'mobileGuestFlowPassed' = 'true'::jsonb
      and p_checklist -> 'operatorFlowPassed' = 'true'::jsonb
      and p_checklist -> 'stageTransitionsPassed' = 'true'::jsonb
      and p_checklist -> 'fallbackMaterialsReady' = 'true'::jsonb
    else false
  end;
$$;

revoke all on function public.platform_runtime_checklist_is_valid(text, jsonb) from public, anon, authenticated;

create or replace function public.platform_attest_runtime_instance(
  p_event_key uuid,
  p_project_id uuid,
  p_stage text,
  p_checklist jsonb,
  p_note text
)
returns table (
  instance_id uuid,
  project_id uuid,
  instance_status text,
  verified_at timestamptz,
  ready_at timestamptz,
  attestation_id uuid,
  stage text,
  note text,
  attested_at timestamptz
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
  v_attestation public.platform_runtime_instance_attestations%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_expected_action text;
  v_entitlement_status text;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if not public.platform_is_staff() then raise exception 'platform_staff_required'; end if;
  if p_stage not in ('verification', 'readiness')
    or p_event_key is null or p_project_id is null
    or not public.platform_runtime_checklist_is_valid(p_stage, p_checklist)
    or char_length(v_note) not between 4 and 1000
    or v_note ~* '(postgres(ql)?|mysql|mongodb(\+srv)?)://[^[:space:]/:@]+:[^[:space:]@]+@'
    or v_note ~ '(sb_secret_|sk_(live|test)_|sk-(live-|test-)?)[A-Za-z0-9_-]{12,}'
    or v_note ~ 'eyJ[A-Za-z0-9_-]{10,}[.]eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}'
  then raise exception 'platform_instance_attestation_invalid'; end if;
  v_expected_action := case when p_stage = 'verification' then 'instance_verification' else 'instance_readiness' end;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> v_expected_action or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select a.* into v_attestation from public.platform_runtime_instance_attestations a
    where a.attested_by_user_id = v_actor and a.event_key = p_event_key;
    select instance.* into v_instance from public.platform_runtime_instances instance
    where instance.project_id = p_project_id;
    return query select v_instance.id, v_instance.project_id, v_instance.status,
      v_instance.verified_at, v_instance.ready_at, v_attestation.id,
      v_attestation.stage, v_attestation.note, v_attestation.created_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-instance-attestation:' || p_project_id::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> v_expected_action or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select a.* into v_attestation from public.platform_runtime_instance_attestations a
    where a.attested_by_user_id = v_actor and a.event_key = p_event_key;
    select instance.* into v_instance from public.platform_runtime_instances instance
    where instance.project_id = p_project_id;
    return query select v_instance.id, v_instance.project_id, v_instance.status,
      v_instance.verified_at, v_instance.ready_at, v_attestation.id,
      v_attestation.stage, v_attestation.note, v_attestation.created_at;
    return;
  end if;

  select p.* into v_project from public.platform_projects p where p.id = p_project_id for update;
  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if v_project.status <> 'provisioning' then raise exception 'platform_instance_attestation_out_of_order'; end if;

  select instance.* into v_instance from public.platform_runtime_instances instance
  where instance.project_id = p_project_id for update;
  if v_instance.id is null then raise exception 'platform_instance_not_found'; end if;

  select m.* into v_manifest from public.platform_provisioning_manifests m
  where m.project_id = p_project_id;
  select e.status into v_entitlement_status from public.platform_entitlements e
  where e.project_id = p_project_id;
  if v_manifest.project_id is null
    or v_manifest.project_version <> v_project.current_version
    or v_manifest.project_version <> v_instance.project_version
    or v_manifest.manifest_hash <> v_instance.manifest_hash
    or v_entitlement_status <> 'active'
  then raise exception 'platform_instance_attestation_prerequisite'; end if;

  if (p_stage = 'verification' and v_instance.status <> 'registered')
    or (p_stage = 'readiness' and v_instance.status <> 'verified')
  then raise exception 'platform_instance_attestation_out_of_order'; end if;
  if p_stage = 'readiness' and not exists (
    select 1 from public.platform_runtime_instance_attestations a
    where a.instance_id = v_instance.id and a.stage = 'verification'
  ) then raise exception 'platform_instance_attestation_prerequisite'; end if;
  if exists (
    select 1 from public.platform_runtime_instance_attestations a
    where a.instance_id = v_instance.id and a.stage = p_stage
  ) then raise exception 'platform_instance_attestation_exists'; end if;

  insert into public.platform_runtime_instance_attestations (
    instance_id, project_id, stage, checklist, note, attested_by_user_id, event_key
  ) values (
    v_instance.id, v_project.id, p_stage, p_checklist, v_note, v_actor, p_event_key
  ) returning * into v_attestation;

  if p_stage = 'verification' then
    update public.platform_runtime_instances instance set
      status = 'verified', verified_by_user_id = v_actor, verified_at = now(), updated_at = now()
    where instance.id = v_instance.id returning * into v_instance;
  else
    update public.platform_runtime_instances instance set
      status = 'ready', ready_by_user_id = v_actor, ready_at = now(), updated_at = now()
    where instance.id = v_instance.id returning * into v_instance;
    update public.platform_projects p set status = 'ready', updated_at = now()
    where p.id = v_project.id;
  end if;

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    v_project.id, v_actor,
    case when p_stage = 'verification' then 'runtime_instance_verified' else 'runtime_instance_ready' end,
    v_project.current_version,
    jsonb_build_object('event_key', p_event_key, 'instance_id', v_instance.id, 'attestation_id', v_attestation.id)
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, v_expected_action);

  return query select v_instance.id, v_instance.project_id, v_instance.status,
    v_instance.verified_at, v_instance.ready_at, v_attestation.id,
    v_attestation.stage, v_attestation.note, v_attestation.created_at;
end;
$$;

revoke all on function public.platform_attest_runtime_instance(uuid, uuid, text, jsonb, text) from public, anon;
grant execute on function public.platform_attest_runtime_instance(uuid, uuid, text, jsonb, text) to authenticated;

commit;
