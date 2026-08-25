begin;

create table public.platform_customer_delivery_events (
  release_event_id uuid primary key references public.platform_runtime_release_events(id) on delete cascade,
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  action text not null check (action in ('release', 'hold')),
  project_version integer not null check (project_version > 0),
  customer_message text not null check (char_length(btrim(customer_message)) between 4 and 500),
  created_at timestamptz not null default now()
);

create index platform_customer_delivery_events_project_created_idx
  on public.platform_customer_delivery_events (project_id, created_at);

insert into public.platform_customer_delivery_events (
  release_event_id, project_id, action, project_version, customer_message, created_at
)
select
  event.id,
  event.project_id,
  event.action,
  event.project_version,
  case when event.action = 'release'
    then '平台工作人员已记录项目进入正式运行。'
    else '平台工作人员已记录项目暂停正式运行。'
  end,
  event.created_at
from public.platform_runtime_release_events event
on conflict (release_event_id) do nothing;

alter table public.platform_customer_delivery_events enable row level security;

create policy platform_customer_delivery_events_member_select
  on public.platform_customer_delivery_events for select to authenticated
  using (public.platform_project_access_role(project_id) is not null);

create policy platform_customer_delivery_events_staff_select
  on public.platform_customer_delivery_events for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_customer_delivery_events from public, anon;
revoke insert, update, delete on public.platform_customer_delivery_events from authenticated;
grant select (
  release_event_id, project_id, action, project_version, customer_message, created_at
) on public.platform_customer_delivery_events to authenticated;

create or replace function public.platform_record_runtime_release_v2(
  p_event_key uuid,
  p_project_id uuid,
  p_action text,
  p_checklist jsonb,
  p_note text,
  p_customer_message text
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
  customer_message text,
  recorded_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_release record;
  v_customer_message text := btrim(coalesce(p_customer_message, ''));
  v_saved_customer_message text;
begin
  if char_length(v_customer_message) not between 4 and 500
    or v_customer_message ~* 'https?://'
    or v_customer_message ~* '(^|[^0-9a-f])[0-9a-f]{64}([^0-9a-f]|$)'
    or v_customer_message ~* '(^|[^A-Za-z0-9])(preview|production|deploy(ment)?)[.:][A-Za-z0-9._:-]+'
    or v_customer_message ~* '(postgres(ql)?|mysql|mongodb(\+srv)?)://[^[:space:]/:@]+:[^[:space:]@]+@'
    or v_customer_message ~ '(sb_secret_|sk_(live|test)_|sk-(live-|test-)?)[A-Za-z0-9_-]{12,}'
    or v_customer_message ~ 'eyJ[A-Za-z0-9_-]{10,}[.]eyJ[A-Za-z0-9_-]{10,}[.][A-Za-z0-9_-]{10,}'
  then raise exception 'platform_runtime_release_invalid'; end if;

  select * into v_release from public.platform_record_runtime_release(
    p_event_key, p_project_id, p_action, p_checklist, p_note
  );
  if v_release.release_event_id is null then
    raise exception 'platform_runtime_release_missing';
  end if;

  insert into public.platform_customer_delivery_events (
    release_event_id, project_id, action, project_version, customer_message, created_at
  ) values (
    v_release.release_event_id,
    v_release.project_id,
    v_release.action,
    v_release.project_version,
    v_customer_message,
    v_release.recorded_at
  ) on conflict on constraint platform_customer_delivery_events_pkey do nothing;

  select event.customer_message into v_saved_customer_message
  from public.platform_customer_delivery_events event
  where event.release_event_id = v_release.release_event_id;

  return query select
    v_release.release_event_id,
    v_release.project_id,
    v_release.project_status,
    v_release.instance_id,
    v_release.action,
    v_release.project_version,
    v_release.manifest_hash,
    v_release.target_origin,
    v_release.deployment_ref,
    v_release.note,
    v_saved_customer_message,
    v_release.recorded_at;
end;
$$;

revoke execute on function public.platform_record_runtime_release(uuid, uuid, text, jsonb, text)
  from authenticated;
revoke all on function public.platform_record_runtime_release_v2(uuid, uuid, text, jsonb, text, text)
  from public, anon;
grant execute on function public.platform_record_runtime_release_v2(uuid, uuid, text, jsonb, text, text)
  to authenticated;

commit;
