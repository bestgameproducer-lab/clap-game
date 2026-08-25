begin;

alter table public.platform_commercial_quote_requests
  add constraint platform_commercial_quote_requests_id_project_key unique (id, project_id);

create table public.platform_commercial_quotes (
  id uuid primary key,
  quote_request_id uuid not null,
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  plan_id text not null check (plan_id in ('buyout', 'subscription')),
  amount_minor bigint not null check (amount_minor between 1 and 1000000000),
  currency text not null check (currency in ('USD', 'CNY')),
  billing_interval text not null check (billing_interval in ('one_time', 'monthly', 'annual')),
  valid_until date not null,
  service_summary text not null check (char_length(btrim(service_summary)) between 4 and 1000),
  terms_summary text not null check (char_length(btrim(terms_summary)) between 20 and 4000),
  status text not null default 'offered' check (status in ('offered', 'superseded', 'withdrawn')),
  offered_by_user_id uuid references auth.users(id) on delete set null,
  offered_at timestamptz not null default now(),
  closed_at timestamptz,
  foreign key (quote_request_id, project_id)
    references public.platform_commercial_quote_requests(id, project_id) on delete cascade,
  check ((plan_id = 'buyout' and billing_interval = 'one_time')
    or (plan_id = 'subscription' and billing_interval in ('monthly', 'annual'))),
  check ((status = 'offered') = (closed_at is null))
);

create unique index platform_commercial_quotes_active_request_idx
  on public.platform_commercial_quotes (quote_request_id)
  where status = 'offered';

create index platform_commercial_quotes_project_offered_idx
  on public.platform_commercial_quotes (project_id, offered_at desc);

alter table public.platform_commercial_quotes enable row level security;

create policy platform_commercial_quotes_member_select
  on public.platform_commercial_quotes for select to authenticated
  using (public.platform_project_access_role(project_id) is not null);

create policy platform_commercial_quotes_staff_select
  on public.platform_commercial_quotes for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_commercial_quotes from public, anon;
revoke insert, update, delete on public.platform_commercial_quotes from authenticated;
grant select (
  id, quote_request_id, project_id, project_version, plan_id, amount_minor, currency,
  billing_interval, valid_until, service_summary, terms_summary, status, offered_at, closed_at
) on public.platform_commercial_quotes to authenticated;

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
    with stale_requests as (
      update public.platform_commercial_quote_requests request set
        status = 'superseded',
        superseded_at = now()
      where request.project_id = new.id and request.status = 'requested'
      returning request.id
    )
    update public.platform_commercial_quotes quote set
      status = 'superseded',
      closed_at = now()
    where quote.quote_request_id in (select stale.id from stale_requests stale)
      and quote.status = 'offered';
  end if;
  return new;
end;
$$;

create or replace function public.platform_offer_commercial_quote(
  p_event_key uuid,
  p_quote_request_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_billing_interval text,
  p_valid_until date,
  p_service_summary text,
  p_terms_summary text
)
returns table (
  quote_id uuid,
  quote_request_id uuid,
  project_id uuid,
  project_version integer,
  plan_id text,
  amount_minor bigint,
  currency text,
  billing_interval text,
  valid_until date,
  service_summary text,
  terms_summary text,
  status text,
  offered_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_request public.platform_commercial_quote_requests%rowtype;
  v_project_status text;
  v_entitlement_status text;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_service_summary text := btrim(coalesce(p_service_summary, ''));
  v_terms_summary text := btrim(coalesce(p_terms_summary, ''));
begin
  if v_actor is null or not public.platform_is_staff() then raise exception 'platform_staff_required'; end if;
  if p_event_key is null or p_quote_request_id is null
    or p_amount_minor is null or p_amount_minor not between 1 and 1000000000
    or p_currency not in ('USD', 'CNY')
    or p_billing_interval not in ('one_time', 'monthly', 'annual')
    or p_valid_until is null or p_valid_until < current_date + 1 or p_valid_until > current_date + 90
    or char_length(v_service_summary) not between 4 and 1000
    or char_length(v_terms_summary) not between 20 and 4000
    or v_service_summary ~ '[<>]' or v_terms_summary ~ '[<>]'
    or v_service_summary ~* 'https?://' or v_terms_summary ~* 'https?://'
    or v_service_summary ~* '(postgres(ql)?|mysql|mongodb(\+srv)?)://[^[:space:]/:@]+:[^[:space:]@]+@'
    or v_terms_summary ~* '(postgres(ql)?|mysql|mongodb(\+srv)?)://[^[:space:]/:@]+:[^[:space:]@]+@'
    or v_service_summary ~ '(sb_secret_|sk_(live|test)_|sk-(live-|test-)?)[A-Za-z0-9_-]{12,}'
    or v_terms_summary ~ '(sb_secret_|sk_(live|test)_|sk-(live-|test-)?)[A-Za-z0-9_-]{12,}'
  then raise exception 'platform_commercial_quote_invalid'; end if;

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'commercial_quote_offer' or not exists (
      select 1 from public.platform_commercial_quotes quote
      where quote.id = p_event_key and quote.quote_request_id = p_quote_request_id
        and quote.project_id = v_receipt_project_id
    )
    then raise exception 'platform_event_conflict'; end if;
    return query select quote.id, quote.quote_request_id, quote.project_id, quote.project_version,
      quote.plan_id, quote.amount_minor, quote.currency, quote.billing_interval, quote.valid_until,
      quote.service_summary, quote.terms_summary, quote.status, quote.offered_at
    from public.platform_commercial_quotes quote where quote.id = p_event_key;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-commercial-quote:' || p_quote_request_id::text, 0));

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'commercial_quote_offer' or not exists (
      select 1 from public.platform_commercial_quotes quote
      where quote.id = p_event_key and quote.quote_request_id = p_quote_request_id
        and quote.project_id = v_receipt_project_id
    )
    then raise exception 'platform_event_conflict'; end if;
    return query select quote.id, quote.quote_request_id, quote.project_id, quote.project_version,
      quote.plan_id, quote.amount_minor, quote.currency, quote.billing_interval, quote.valid_until,
      quote.service_summary, quote.terms_summary, quote.status, quote.offered_at
    from public.platform_commercial_quotes quote where quote.id = p_event_key;
    return;
  end if;

  select request.* into v_request from public.platform_commercial_quote_requests request
  where request.id = p_quote_request_id for update;
  if v_request.id is null then raise exception 'platform_quote_request_not_found'; end if;
  if v_request.status <> 'requested' then raise exception 'platform_quote_request_stale'; end if;
  if (v_request.plan_id = 'buyout' and p_billing_interval <> 'one_time')
    or (v_request.plan_id = 'subscription' and p_billing_interval not in ('monthly', 'annual'))
  then raise exception 'platform_commercial_quote_invalid'; end if;

  select project.status into v_project_status from public.platform_projects project
  where project.id = v_request.project_id;
  if v_project_status not in ('draft', 'content_review', 'provisioning')
  then raise exception 'platform_commercial_quote_locked'; end if;
  select entitlement.status into v_entitlement_status from public.platform_entitlements entitlement
  where entitlement.project_id = v_request.project_id;
  if v_entitlement_status is distinct from 'pending'
  then raise exception 'platform_commercial_quote_entitled'; end if;

  update public.platform_commercial_quotes quote set status = 'superseded', closed_at = now()
  where quote.quote_request_id = p_quote_request_id and quote.status = 'offered';

  insert into public.platform_commercial_quotes (
    id, quote_request_id, project_id, project_version, plan_id,
    amount_minor, currency, billing_interval, valid_until,
    service_summary, terms_summary, offered_by_user_id
  ) values (
    p_event_key, v_request.id, v_request.project_id, v_request.project_version, v_request.plan_id,
    p_amount_minor, p_currency, p_billing_interval, p_valid_until,
    v_service_summary, v_terms_summary, v_actor
  );
  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    v_request.project_id, v_actor, 'commercial_quote_offered', v_request.project_version,
    jsonb_build_object('quote_id', p_event_key, 'quote_request_id', v_request.id,
      'currency', p_currency, 'billing_interval', p_billing_interval, 'event_key', p_event_key)
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_request.project_id, 'commercial_quote_offer');

  return query select quote.id, quote.quote_request_id, quote.project_id, quote.project_version,
    quote.plan_id, quote.amount_minor, quote.currency, quote.billing_interval, quote.valid_until,
    quote.service_summary, quote.terms_summary, quote.status, quote.offered_at
  from public.platform_commercial_quotes quote where quote.id = p_event_key;
end;
$$;

revoke all on function public.platform_offer_commercial_quote(uuid, uuid, bigint, text, text, date, text, text)
  from public, anon;
grant execute on function public.platform_offer_commercial_quote(uuid, uuid, bigint, text, text, date, text, text)
  to authenticated;

commit;
