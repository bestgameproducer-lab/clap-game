begin;

alter table public.platform_commercial_quotes
  add constraint platform_commercial_quotes_id_project_key unique (id, project_id);

create table public.platform_quote_proceed_requests (
  quote_id uuid primary key,
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  requested_by_user_id uuid references auth.users(id) on delete set null,
  acknowledged_no_payment boolean not null check (acknowledged_no_payment is true),
  status text not null default 'requested' check (status in ('requested', 'superseded')),
  requested_at timestamptz not null default now(),
  superseded_at timestamptz,
  foreign key (quote_id, project_id)
    references public.platform_commercial_quotes(id, project_id) on delete cascade,
  check ((status = 'requested') = (superseded_at is null))
);

create index platform_quote_proceed_requests_queue_idx
  on public.platform_quote_proceed_requests (status, requested_at);

alter table public.platform_quote_proceed_requests enable row level security;

create policy platform_quote_proceed_requests_member_select
  on public.platform_quote_proceed_requests for select to authenticated
  using (public.platform_project_access_role(project_id) is not null);

create policy platform_quote_proceed_requests_staff_select
  on public.platform_quote_proceed_requests for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_quote_proceed_requests from public, anon;
revoke insert, update, delete on public.platform_quote_proceed_requests from authenticated;
grant select (quote_id, project_id, project_version, acknowledged_no_payment, status, requested_at, superseded_at)
  on public.platform_quote_proceed_requests to authenticated;

create or replace function public.platform_supersede_quote_proceed_request()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if old.status = 'offered' and new.status <> 'offered' then
    update public.platform_quote_proceed_requests proceed set
      status = 'superseded',
      superseded_at = now()
    where proceed.quote_id = new.id and proceed.status = 'requested';
  end if;
  return new;
end;
$$;

revoke all on function public.platform_supersede_quote_proceed_request() from public, anon, authenticated;

create trigger platform_commercial_quotes_supersede_proceed_request
after update of status on public.platform_commercial_quotes
for each row execute function public.platform_supersede_quote_proceed_request();

create or replace function public.platform_request_quote_proceed(
  p_event_key uuid,
  p_project_id uuid,
  p_quote_id uuid,
  p_acknowledged_no_payment boolean
)
returns table (
  quote_id uuid,
  project_id uuid,
  project_version integer,
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
  v_quote public.platform_commercial_quotes%rowtype;
  v_request_status text;
  v_entitlement_status text;
  v_receipt_project_id uuid;
  v_receipt_action text;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null or p_quote_id is null
    or p_acknowledged_no_payment is not true
  then raise exception 'platform_quote_proceed_invalid'; end if;

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'quote_proceed_request' or v_receipt_project_id <> p_project_id
      or not exists (
        select 1 from public.platform_quote_proceed_requests proceed
        where proceed.quote_id = p_quote_id and proceed.project_id = p_project_id
      )
    then raise exception 'platform_event_conflict'; end if;
    return query select proceed.quote_id, proceed.project_id, proceed.project_version,
      proceed.status, proceed.requested_at, proceed.superseded_at
    from public.platform_quote_proceed_requests proceed where proceed.quote_id = p_quote_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-quote-proceed:' || p_quote_id::text, 0));

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'quote_proceed_request' or v_receipt_project_id <> p_project_id
      or not exists (
        select 1 from public.platform_quote_proceed_requests proceed
        where proceed.quote_id = p_quote_id and proceed.project_id = p_project_id
      )
    then raise exception 'platform_event_conflict'; end if;
    return query select proceed.quote_id, proceed.project_id, proceed.project_version,
      proceed.status, proceed.requested_at, proceed.superseded_at
    from public.platform_quote_proceed_requests proceed where proceed.quote_id = p_quote_id;
    return;
  end if;

  select project.* into v_project from public.platform_projects project
  where project.id = p_project_id and project.owner_user_id = v_actor for update;
  if v_project.id is null then raise exception 'platform_project_not_owned'; end if;
  if v_project.status not in ('draft', 'content_review', 'provisioning')
  then raise exception 'platform_quote_proceed_locked'; end if;

  select quote.* into v_quote from public.platform_commercial_quotes quote
  where quote.id = p_quote_id and quote.project_id = p_project_id for update;
  if v_quote.id is null then raise exception 'platform_commercial_quote_not_found'; end if;
  if v_quote.status <> 'offered' or v_quote.valid_until < current_date
  then raise exception 'platform_commercial_quote_unavailable'; end if;
  select request.status into v_request_status from public.platform_commercial_quote_requests request
  where request.id = v_quote.quote_request_id;
  if v_request_status is distinct from 'requested'
  then raise exception 'platform_commercial_quote_unavailable'; end if;
  select entitlement.status into v_entitlement_status from public.platform_entitlements entitlement
  where entitlement.project_id = p_project_id;
  if v_entitlement_status is distinct from 'pending'
  then raise exception 'platform_quote_proceed_entitled'; end if;
  if exists (select 1 from public.platform_quote_proceed_requests proceed where proceed.quote_id = p_quote_id)
  then raise exception 'platform_quote_proceed_exists'; end if;

  insert into public.platform_quote_proceed_requests (
    quote_id, project_id, project_version, requested_by_user_id, acknowledged_no_payment
  ) values (
    p_quote_id, p_project_id, v_quote.project_version, v_actor, true
  );
  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    p_project_id, v_actor, 'quote_proceed_requested', v_quote.project_version,
    jsonb_build_object('quote_id', p_quote_id, 'event_key', p_event_key, 'acknowledged_no_payment', true)
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, p_project_id, 'quote_proceed_request');

  return query select proceed.quote_id, proceed.project_id, proceed.project_version,
    proceed.status, proceed.requested_at, proceed.superseded_at
  from public.platform_quote_proceed_requests proceed where proceed.quote_id = p_quote_id;
end;
$$;

revoke all on function public.platform_request_quote_proceed(uuid, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.platform_request_quote_proceed(uuid, uuid, uuid, boolean)
  to authenticated;

commit;
