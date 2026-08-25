begin;

create table if not exists public.platform_projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_draft_id uuid not null,
  status text not null default 'draft' check (status in ('draft', 'content_review', 'provisioning', 'rehearsal', 'ready', 'live', 'archived')),
  template_id text not null check (char_length(template_id) between 1 and 80),
  template_version text not null check (char_length(template_version) between 1 and 40),
  plan_id text not null check (plan_id in ('buyout', 'subscription')),
  partner_one text not null default '' check (char_length(partner_one) <= 120),
  partner_two text not null default '' check (char_length(partner_two) <= 120),
  wedding_date date,
  location text not null default '' check (char_length(location) <= 160),
  guest_count integer not null check (guest_count in (40, 80, 120, 180)),
  theme_id text not null check (theme_id in ('estate', 'garden', 'night')),
  tone_id text not null check (tone_id in ('romantic', 'social', 'mystery')),
  modules text[] not null default '{}'::text[] check (
    cardinality(modules) <= 5
    and array_position(modules, null) is null
    and modules <@ array['secret-missions', 'team-games', 'host-toolkit', 'live-scoreboard', 'finale-vote']::text[]
  ),
  story_note text not null default '' check (char_length(story_note) <= 2000),
  current_version integer not null default 0 check (current_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, source_draft_id)
);

create index if not exists platform_projects_owner_updated_idx
  on public.platform_projects (owner_user_id, updated_at desc);

create table if not exists public.platform_project_versions (
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  version integer not null check (version > 0),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  reason text not null default 'customer_save' check (reason in ('customer_save', 'content_review', 'provisioning', 'operator_restore')),
  created_at timestamptz not null default now(),
  primary key (project_id, version)
);

create index if not exists platform_project_versions_actor_idx
  on public.platform_project_versions (actor_user_id, created_at desc);

create table if not exists public.platform_entitlements (
  project_id uuid primary key references public.platform_projects(id) on delete cascade,
  plan_id text not null check (plan_id in ('buyout', 'subscription')),
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  source text not null default 'unassigned' check (source in ('unassigned', 'operator', 'payment_provider')),
  active_from timestamptz,
  active_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (active_until is null or active_from is null or active_until > active_from)
);

create table if not exists public.platform_audit_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.platform_projects(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (char_length(action) between 1 and 80),
  target_version integer,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists platform_audit_log_project_created_idx
  on public.platform_audit_log (project_id, created_at desc);

create table if not exists public.platform_mutation_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_key uuid not null,
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, event_key)
);

alter table public.platform_projects enable row level security;
alter table public.platform_project_versions enable row level security;
alter table public.platform_entitlements enable row level security;
alter table public.platform_audit_log enable row level security;
alter table public.platform_mutation_receipts enable row level security;

create policy platform_projects_owner_select
  on public.platform_projects for select to authenticated
  using (owner_user_id = auth.uid());

create policy platform_versions_owner_select
  on public.platform_project_versions for select to authenticated
  using (exists (
    select 1 from public.platform_projects p
    where p.id = platform_project_versions.project_id and p.owner_user_id = auth.uid()
  ));

create policy platform_entitlements_owner_select
  on public.platform_entitlements for select to authenticated
  using (exists (
    select 1 from public.platform_projects p
    where p.id = platform_entitlements.project_id and p.owner_user_id = auth.uid()
  ));

create policy platform_audit_owner_select
  on public.platform_audit_log for select to authenticated
  using (exists (
    select 1 from public.platform_projects p
    where p.id = platform_audit_log.project_id and p.owner_user_id = auth.uid()
  ));

revoke all on public.platform_projects from public, anon;
revoke all on public.platform_project_versions from public, anon;
revoke all on public.platform_entitlements from public, anon;
revoke all on public.platform_audit_log from public, anon;
revoke all on public.platform_mutation_receipts from public, anon;

revoke insert, update, delete on public.platform_projects from authenticated;
revoke insert, update, delete on public.platform_project_versions from authenticated;
revoke insert, update, delete on public.platform_entitlements from authenticated;
revoke insert, update, delete on public.platform_audit_log from authenticated;
revoke all on public.platform_mutation_receipts from authenticated;

grant select on public.platform_projects to authenticated;
grant select on public.platform_project_versions to authenticated;
grant select on public.platform_entitlements to authenticated;
grant select on public.platform_audit_log to authenticated;

create or replace function public.platform_save_project_draft(
  p_event_key uuid,
  p_project_id uuid,
  p_source_draft_id uuid,
  p_template_id text,
  p_template_version text,
  p_plan_id text,
  p_partner_one text,
  p_partner_two text,
  p_wedding_date date,
  p_location text,
  p_guest_count integer,
  p_theme_id text,
  p_tone_id text,
  p_modules text[],
  p_story_note text
)
returns table (
  id uuid,
  status text,
  template_id text,
  template_version text,
  plan_id text,
  partner_one text,
  partner_two text,
  wedding_date date,
  location text,
  guest_count integer,
  theme_id text,
  tone_id text,
  modules text[],
  story_note text,
  current_version integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_status text;
  v_next_version integer;
  v_snapshot jsonb;
begin
  if v_actor is null then
    raise exception 'platform_auth_required';
  end if;

  if p_event_key is null or p_source_draft_id is null
    or p_template_id is null or p_template_id <> 'cupid-wedding-trial'
    or p_template_version is null or p_template_version !~ '^[0-9]{4}[.][0-9]{2}$'
    or p_plan_id is null or p_plan_id not in ('buyout', 'subscription')
    or coalesce(char_length(p_partner_one), 0) > 120
    or coalesce(char_length(p_partner_two), 0) > 120
    or coalesce(char_length(p_location), 0) > 160
    or p_guest_count is null or p_guest_count not in (40, 80, 120, 180)
    or p_theme_id is null or p_theme_id not in ('estate', 'garden', 'night')
    or p_tone_id is null or p_tone_id not in ('romantic', 'social', 'mystery')
    or p_modules is null
    or cardinality(p_modules) > 5
    or array_position(p_modules, null) is not null
    or not (p_modules <@ array['secret-missions', 'team-games', 'host-toolkit', 'live-scoreboard', 'finale-vote']::text[])
    or (select count(*) from unnest(p_modules) as m(value)) <> (select count(distinct value) from unnest(p_modules) as m(value))
    or coalesce(char_length(p_story_note), 0) > 2000
  then
    raise exception 'platform_project_invalid';
  end if;

  select r.project_id into v_project_id
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_project_id is not null then
    return query
      select p.id, p.status, p.template_id, p.template_version, p.plan_id,
        p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
        p.theme_id, p.tone_id, p.modules, p.story_note, p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = v_project_id and p.owner_user_id = v_actor;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':' || p_source_draft_id::text, 0));

  if p_project_id is not null then
    select p.id, p.status into v_project_id, v_status
    from public.platform_projects p
    where p.id = p_project_id and p.owner_user_id = v_actor and p.source_draft_id = p_source_draft_id
    for update;
    if v_project_id is null then raise exception 'platform_project_not_owned'; end if;
  else
    select p.id, p.status into v_project_id, v_status
    from public.platform_projects p
    where p.owner_user_id = v_actor and p.source_draft_id = p_source_draft_id
    for update;
  end if;

  if v_project_id is null then
    insert into public.platform_projects (
      owner_user_id, source_draft_id, template_id, template_version, plan_id,
      partner_one, partner_two, wedding_date, location, guest_count,
      theme_id, tone_id, modules, story_note, current_version
    ) values (
      v_actor, p_source_draft_id, p_template_id, p_template_version, p_plan_id,
      coalesce(p_partner_one, ''), coalesce(p_partner_two, ''), p_wedding_date, coalesce(p_location, ''), p_guest_count,
      p_theme_id, p_tone_id, p_modules, coalesce(p_story_note, ''), 1
    ) returning platform_projects.id into v_project_id;
    v_next_version := 1;

    insert into public.platform_entitlements (project_id, plan_id)
    values (v_project_id, p_plan_id);
  else
    if v_status <> 'draft' then raise exception 'platform_project_locked'; end if;
    update public.platform_projects p set
      template_id = p_template_id,
      template_version = p_template_version,
      plan_id = p_plan_id,
      partner_one = coalesce(p_partner_one, ''),
      partner_two = coalesce(p_partner_two, ''),
      wedding_date = p_wedding_date,
      location = coalesce(p_location, ''),
      guest_count = p_guest_count,
      theme_id = p_theme_id,
      tone_id = p_tone_id,
      modules = p_modules,
      story_note = coalesce(p_story_note, ''),
      current_version = p.current_version + 1,
      updated_at = now()
    where p.id = v_project_id
    returning p.current_version into v_next_version;

    update public.platform_entitlements e set
      plan_id = p_plan_id,
      updated_at = now()
    where e.project_id = v_project_id and e.status = 'pending';
  end if;

  select jsonb_build_object(
    'template_id', p.template_id,
    'template_version', p.template_version,
    'plan_id', p.plan_id,
    'partner_one', p.partner_one,
    'partner_two', p.partner_two,
    'wedding_date', p.wedding_date,
    'location', p.location,
    'guest_count', p.guest_count,
    'theme_id', p.theme_id,
    'tone_id', p.tone_id,
    'modules', to_jsonb(p.modules),
    'story_note', p.story_note
  ) into v_snapshot
  from public.platform_projects p where p.id = v_project_id;

  insert into public.platform_project_versions (project_id, version, actor_user_id, snapshot)
  values (v_project_id, v_next_version, v_actor, v_snapshot);

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (v_project_id, v_actor, 'project_draft_saved', v_next_version, jsonb_build_object('event_key', p_event_key));

  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id)
  values (v_actor, p_event_key, v_project_id);

  return query
    select p.id, p.status, p.template_id, p.template_version, p.plan_id,
      p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
      p.theme_id, p.tone_id, p.modules, p.story_note, p.current_version, p.updated_at
    from public.platform_projects p
    where p.id = v_project_id and p.owner_user_id = v_actor;
end;
$$;

revoke all on function public.platform_save_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text) from public;
revoke all on function public.platform_save_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text) from anon;
grant execute on function public.platform_save_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text) to authenticated;

commit;
