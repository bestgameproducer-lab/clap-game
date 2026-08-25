begin;

create table public.platform_commercial_quote_requests (
  id uuid primary key,
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  plan_id text not null check (plan_id in ('buyout', 'subscription')),
  commercial_snapshot jsonb not null check (
    jsonb_typeof(commercial_snapshot) = 'object'
    and commercial_snapshot ?& array[
      'templateId', 'templateVersion', 'planId', 'weddingDate', 'location',
      'guestCount', 'themeId', 'toneId', 'modules', 'deliveryScope'
    ]
    and commercial_snapshot - array[
      'templateId', 'templateVersion', 'planId', 'weddingDate', 'location',
      'guestCount', 'themeId', 'toneId', 'modules', 'deliveryScope'
    ] = '{}'::jsonb
  ),
  status text not null default 'requested' check (status in ('requested', 'superseded')),
  requested_at timestamptz not null default now(),
  superseded_at timestamptz,
  check ((status = 'requested') = (superseded_at is null))
);

create unique index platform_commercial_quote_requests_active_idx
  on public.platform_commercial_quote_requests (project_id)
  where status = 'requested';

create index platform_commercial_quote_requests_queue_idx
  on public.platform_commercial_quote_requests (status, requested_at);

alter table public.platform_commercial_quote_requests enable row level security;

create policy platform_commercial_quote_requests_member_select
  on public.platform_commercial_quote_requests for select to authenticated
  using (public.platform_project_access_role(project_id) is not null);

create policy platform_commercial_quote_requests_staff_select
  on public.platform_commercial_quote_requests for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_commercial_quote_requests from public, anon;
revoke insert, update, delete on public.platform_commercial_quote_requests from authenticated;
grant select (
  id, project_id, project_version, plan_id, commercial_snapshot,
  status, requested_at, superseded_at
) on public.platform_commercial_quote_requests to authenticated;

create or replace function public.platform_supersede_stale_quote_requests()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if old.template_id is distinct from new.template_id
    or old.template_version is distinct from new.template_version
    or old.plan_id is distinct from new.plan_id
    or old.wedding_date is distinct from new.wedding_date
    or old.location is distinct from new.location
    or old.guest_count is distinct from new.guest_count
    or old.theme_id is distinct from new.theme_id
    or old.tone_id is distinct from new.tone_id
    or old.modules is distinct from new.modules
    or old.delivery_scope is distinct from new.delivery_scope
  then
    update public.platform_commercial_quote_requests request set
      status = 'superseded',
      superseded_at = now()
    where request.project_id = new.id and request.status = 'requested';
  end if;
  return new;
end;
$$;

revoke all on function public.platform_supersede_stale_quote_requests() from public, anon, authenticated;

create trigger platform_projects_supersede_stale_quote_requests
after update of template_id, template_version, plan_id, wedding_date, location, guest_count, theme_id, tone_id, modules, delivery_scope
on public.platform_projects
for each row execute function public.platform_supersede_stale_quote_requests();

create or replace function public.platform_request_commercial_quote(
  p_event_key uuid,
  p_project_id uuid,
  p_project_version integer
)
returns table (
  quote_request_id uuid,
  project_id uuid,
  project_version integer,
  plan_id text,
  commercial_snapshot jsonb,
  status text,
  requested_at timestamptz,
  superseded_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.platform_projects%rowtype;
  v_entitlement_status text;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null or p_project_version is null or p_project_version < 1
  then raise exception 'platform_quote_request_invalid'; end if;

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'quote_request' or v_receipt_project_id <> p_project_id
    then raise exception 'platform_event_conflict'; end if;
    return query select request.id, request.project_id, request.project_version, request.plan_id,
      request.commercial_snapshot, request.status, request.requested_at, request.superseded_at
    from public.platform_commercial_quote_requests request where request.id = p_event_key;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-quote-request:' || p_project_id::text, 0));

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'quote_request' or v_receipt_project_id <> p_project_id
    then raise exception 'platform_event_conflict'; end if;
    return query select request.id, request.project_id, request.project_version, request.plan_id,
      request.commercial_snapshot, request.status, request.requested_at, request.superseded_at
    from public.platform_commercial_quote_requests request where request.id = p_event_key;
    return;
  end if;

  select project.* into v_project from public.platform_projects project
  where project.id = p_project_id and project.owner_user_id = v_actor
  for update;
  if v_project.id is null then raise exception 'platform_project_not_owned'; end if;
  if v_project.status not in ('draft', 'content_review', 'provisioning')
  then raise exception 'platform_quote_request_locked'; end if;
  if v_project.current_version <> p_project_version
  then raise exception 'platform_quote_request_stale'; end if;

  select entitlement.status into v_entitlement_status
  from public.platform_entitlements entitlement
  where entitlement.project_id = p_project_id;
  if v_entitlement_status is distinct from 'pending'
  then raise exception 'platform_quote_request_entitled'; end if;
  if exists (
    select 1 from public.platform_commercial_quote_requests request
    where request.project_id = p_project_id and request.status = 'requested'
  ) then raise exception 'platform_quote_request_exists'; end if;

  v_snapshot := jsonb_build_object(
    'templateId', v_project.template_id,
    'templateVersion', v_project.template_version,
    'planId', v_project.plan_id,
    'weddingDate', v_project.wedding_date,
    'location', v_project.location,
    'guestCount', v_project.guest_count,
    'themeId', v_project.theme_id,
    'toneId', v_project.tone_id,
    'modules', to_jsonb(v_project.modules),
    'deliveryScope', v_project.delivery_scope
  );

  insert into public.platform_commercial_quote_requests (
    id, project_id, project_version, requested_by_user_id, plan_id, commercial_snapshot
  ) values (
    p_event_key, p_project_id, p_project_version, v_actor, v_project.plan_id, v_snapshot
  );
  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    p_project_id, v_actor, 'commercial_quote_requested', p_project_version,
    jsonb_build_object('quote_request_id', p_event_key, 'plan_id', v_project.plan_id, 'event_key', p_event_key)
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, p_project_id, 'quote_request');

  return query select request.id, request.project_id, request.project_version, request.plan_id,
    request.commercial_snapshot, request.status, request.requested_at, request.superseded_at
  from public.platform_commercial_quote_requests request where request.id = p_event_key;
end;
$$;

revoke all on function public.platform_request_commercial_quote(uuid, uuid, integer)
  from public, anon;
grant execute on function public.platform_request_commercial_quote(uuid, uuid, integer)
  to authenticated;

commit;
