begin;

create table public.platform_fulfillment_plans (
  project_id uuid primary key references public.platform_projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  lane text not null check (lane in ('standard_auto', 'custom_service')),
  status text not null check (status in ('awaiting_payment', 'manual_setup')),
  runtime_model text not null check (runtime_model in ('managed_isolated', 'bespoke_isolated')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (lane = 'standard_auto' and status = 'awaiting_payment' and runtime_model = 'managed_isolated')
    or (lane = 'custom_service' and status = 'manual_setup' and runtime_model = 'bespoke_isolated')
  )
);

alter table public.platform_fulfillment_plans enable row level security;

create policy platform_fulfillment_plans_member_select
  on public.platform_fulfillment_plans for select to authenticated
  using (public.platform_project_access_role(project_id) is not null);

create policy platform_fulfillment_plans_staff_select
  on public.platform_fulfillment_plans for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_fulfillment_plans from public, anon;
revoke insert, update, delete on public.platform_fulfillment_plans from authenticated;
grant select (project_id, project_version, lane, status, runtime_model, created_at)
  on public.platform_fulfillment_plans to authenticated;

create or replace function public.platform_plan_project_fulfillment(
  p_event_key uuid,
  p_project_id uuid
)
returns table (
  project_id uuid,
  project_version integer,
  manifest_hash text,
  lane text,
  status text,
  runtime_model text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.platform_projects%rowtype;
  v_manifest public.platform_provisioning_manifests%rowtype;
  v_plan public.platform_fulfillment_plans%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_lane text;
  v_status text;
  v_runtime_model text;
begin
  if v_actor is null or not public.platform_is_staff() then
    raise exception 'platform_staff_required';
  end if;
  if p_event_key is null or p_project_id is null then
    raise exception 'platform_fulfillment_plan_invalid';
  end if;

  select receipt.project_id, receipt.action
    into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'fulfillment_plan' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select plan.* into v_plan
    from public.platform_fulfillment_plans plan
    where plan.project_id = p_project_id;
    if v_plan.project_id is null then raise exception 'platform_event_conflict'; end if;
    return query select v_plan.project_id, v_plan.project_version, v_plan.manifest_hash,
      v_plan.lane, v_plan.status, v_plan.runtime_model, v_plan.created_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-fulfillment-plan:' || p_project_id::text, 0));

  select receipt.project_id, receipt.action
    into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'fulfillment_plan' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select plan.* into v_plan
    from public.platform_fulfillment_plans plan
    where plan.project_id = p_project_id;
    if v_plan.project_id is null then raise exception 'platform_event_conflict'; end if;
    return query select v_plan.project_id, v_plan.project_version, v_plan.manifest_hash,
      v_plan.lane, v_plan.status, v_plan.runtime_model, v_plan.created_at;
    return;
  end if;

  select project.* into v_project
  from public.platform_projects project
  where project.id = p_project_id
  for update;
  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if v_project.status <> 'provisioning' then raise exception 'platform_fulfillment_plan_locked'; end if;

  select manifest.* into v_manifest
  from public.platform_provisioning_manifests manifest
  where manifest.project_id = p_project_id;
  if v_manifest.project_id is null or v_manifest.project_version <> v_project.current_version then
    raise exception 'platform_fulfillment_manifest_required';
  end if;
  if exists (
    select 1 from public.platform_runtime_instances instance
    where instance.project_id = p_project_id
  ) then raise exception 'platform_fulfillment_runtime_exists'; end if;
  if exists (
    select 1 from public.platform_fulfillment_plans plan
    where plan.project_id = p_project_id
  ) then raise exception 'platform_fulfillment_plan_exists'; end if;

  if v_project.delivery_scope ->> 'customizationLevel' = 'template'
    and v_project.delivery_scope ->> 'supportMode' = 'self_service'
    and v_project.delivery_scope ->> 'rehearsalMode' = 'self_check'
    and not (v_project.delivery_scope -> 'services' ?| array['content-workshop', 'wedding-day-support'])
    and btrim(v_project.delivery_scope ->> 'serviceNotes') = ''
  then
    v_lane := 'standard_auto';
    v_status := 'awaiting_payment';
    v_runtime_model := 'managed_isolated';
  else
    v_lane := 'custom_service';
    v_status := 'manual_setup';
    v_runtime_model := 'bespoke_isolated';
  end if;

  insert into public.platform_fulfillment_plans (
    project_id, project_version, manifest_hash, lane, status, runtime_model, created_by_user_id
  ) values (
    v_project.id, v_project.current_version, v_manifest.manifest_hash,
    v_lane, v_status, v_runtime_model, v_actor
  ) returning * into v_plan;

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    v_project.id, v_actor, 'fulfillment_plan_created', v_project.current_version,
    jsonb_build_object(
      'event_key', p_event_key,
      'lane', v_lane,
      'status', v_status,
      'runtime_model', v_runtime_model,
      'manifest_hash', v_manifest.manifest_hash,
      'creates_cloud_resources', false,
      'activates_entitlement', false
    )
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, 'fulfillment_plan');

  return query select v_plan.project_id, v_plan.project_version, v_plan.manifest_hash,
    v_plan.lane, v_plan.status, v_plan.runtime_model, v_plan.created_at;
end;
$$;

revoke all on function public.platform_plan_project_fulfillment(uuid, uuid) from public, anon;
grant execute on function public.platform_plan_project_fulfillment(uuid, uuid) to authenticated;

create or replace function public.platform_require_fulfillment_plan_for_runtime()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.platform_fulfillment_plans plan
    where plan.project_id = new.project_id
      and plan.project_version = new.project_version
      and plan.manifest_hash = new.manifest_hash
  ) then
    raise exception 'platform_fulfillment_plan_required';
  end if;
  return new;
end;
$$;

revoke all on function public.platform_require_fulfillment_plan_for_runtime() from public, anon, authenticated;

create trigger platform_runtime_instances_require_fulfillment_plan
before insert on public.platform_runtime_instances
for each row execute function public.platform_require_fulfillment_plan_for_runtime();

commit;
