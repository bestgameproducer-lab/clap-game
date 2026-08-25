begin;

create table public.platform_runtime_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.platform_projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  target_origin text not null unique check (
    char_length(target_origin) between 12 and 300
    and target_origin ~ '^https://[a-z0-9][a-z0-9.-]*[.][a-z]{2,63}(:[0-9]{1,5})?$'
    and position('..' in target_origin) = 0
  ),
  deployment_ref text not null check (
    char_length(deployment_ref) between 1 and 120
    and deployment_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  ),
  status text not null default 'registered'
    check (status in ('registered', 'verified', 'ready', 'suspended', 'archived')),
  registered_by_user_id uuid references auth.users(id) on delete set null,
  verified_by_user_id uuid references auth.users(id) on delete set null,
  registered_at timestamptz not null default now(),
  verified_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'registered' and verified_at is null) or status <> 'registered')
);

alter table public.platform_runtime_instances enable row level security;

create policy platform_runtime_instances_staff_select
  on public.platform_runtime_instances for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_runtime_instances from public, anon;
revoke insert, update, delete on public.platform_runtime_instances from authenticated;
grant select (
  id, project_id, project_version, manifest_hash, target_origin,
  deployment_ref, status, registered_at, verified_at, updated_at
) on public.platform_runtime_instances to authenticated;

create or replace function public.platform_register_runtime_instance(
  p_event_key uuid,
  p_project_id uuid,
  p_target_origin text,
  p_deployment_ref text
)
returns table (
  id uuid,
  project_id uuid,
  project_version integer,
  manifest_hash text,
  target_origin text,
  deployment_ref text,
  status text,
  registered_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.platform_projects%rowtype;
  v_manifest public.platform_provisioning_manifests%rowtype;
  v_instance public.platform_runtime_instances%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_entitlement_status text;
  v_target_origin text := lower(btrim(coalesce(p_target_origin, '')));
  v_deployment_ref text := btrim(coalesce(p_deployment_ref, ''));
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if not public.platform_is_staff() then raise exception 'platform_staff_required'; end if;
  if p_event_key is null or p_project_id is null
    or char_length(v_target_origin) not between 12 and 300
    or v_target_origin !~ '^https://[a-z0-9][a-z0-9.-]*[.][a-z]{2,63}(:[0-9]{1,5})?$'
    or position('..' in v_target_origin) <> 0
    or char_length(v_deployment_ref) not between 1 and 120
    or v_deployment_ref !~ '^[A-Za-z0-9][A-Za-z0-9._:-]*$'
  then raise exception 'platform_instance_invalid'; end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'instance_register' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select instance.id, instance.project_id, instance.project_version,
      instance.manifest_hash, instance.target_origin, instance.deployment_ref,
      instance.status, instance.registered_at
      from public.platform_runtime_instances instance where instance.project_id = p_project_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-instance:' || p_project_id::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'instance_register' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select instance.id, instance.project_id, instance.project_version,
      instance.manifest_hash, instance.target_origin, instance.deployment_ref,
      instance.status, instance.registered_at
      from public.platform_runtime_instances instance where instance.project_id = p_project_id;
    return;
  end if;

  select p.* into v_project from public.platform_projects p
  where p.id = p_project_id for update;
  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if v_project.status <> 'provisioning' then raise exception 'platform_instance_project_locked'; end if;

  select m.* into v_manifest from public.platform_provisioning_manifests m
  where m.project_id = p_project_id;
  if v_manifest.project_id is null or v_manifest.project_version <> v_project.current_version then
    raise exception 'platform_instance_manifest_required';
  end if;

  select e.status into v_entitlement_status from public.platform_entitlements e
  where e.project_id = p_project_id;
  if v_entitlement_status <> 'active' then raise exception 'platform_instance_entitlement_required'; end if;

  if exists (select 1 from public.platform_runtime_instances instance where instance.project_id = p_project_id) then
    raise exception 'platform_instance_already_registered';
  end if;
  if exists (select 1 from public.platform_runtime_instances instance where instance.target_origin = v_target_origin) then
    raise exception 'platform_instance_target_in_use';
  end if;

  insert into public.platform_runtime_instances (
    project_id, project_version, manifest_hash, target_origin, deployment_ref, registered_by_user_id
  ) values (
    v_project.id, v_manifest.project_version, v_manifest.manifest_hash,
    v_target_origin, v_deployment_ref, v_actor
  ) returning * into v_instance;

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (v_project.id, v_actor, 'runtime_instance_registered', v_manifest.project_version,
    jsonb_build_object(
      'event_key', p_event_key,
      'manifest_hash', v_manifest.manifest_hash,
      'target_origin', v_target_origin,
      'deployment_ref', v_deployment_ref
    ));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, 'instance_register');

  return query select v_instance.id, v_instance.project_id, v_instance.project_version,
    v_instance.manifest_hash, v_instance.target_origin, v_instance.deployment_ref,
    v_instance.status, v_instance.registered_at;
end;
$$;

revoke all on function public.platform_register_runtime_instance(uuid, uuid, text, text) from public, anon;
grant execute on function public.platform_register_runtime_instance(uuid, uuid, text, text) to authenticated;

commit;
