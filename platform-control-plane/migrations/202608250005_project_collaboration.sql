begin;

create table public.platform_project_members (
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  role text not null check (role in ('editor', 'viewer')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index platform_project_members_user_idx
  on public.platform_project_members (user_id, updated_at desc);

create table public.platform_project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  event_key uuid not null,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (invited_by_user_id, event_key),
  check (expires_at > created_at),
  check ((accepted_by_user_id is null) = (accepted_at is null))
);

create index platform_project_invitations_project_idx
  on public.platform_project_invitations (project_id, created_at desc);

create or replace function public.platform_project_access_role(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select case
    when p.owner_user_id = auth.uid() then 'owner'
    else (
      select m.role from public.platform_project_members m
      where m.project_id = p.id and m.user_id = auth.uid()
    )
  end
  from public.platform_projects p
  where p.id = p_project_id
$$;

revoke all on function public.platform_project_access_role(uuid) from public, anon;
grant execute on function public.platform_project_access_role(uuid) to authenticated;

alter table public.platform_project_members enable row level security;
alter table public.platform_project_invitations enable row level security;

create policy platform_project_members_participant_select
  on public.platform_project_members for select to authenticated
  using (public.platform_project_access_role(project_id) is not null);

create policy platform_project_invitations_owner_select
  on public.platform_project_invitations for select to authenticated
  using (public.platform_project_access_role(project_id) = 'owner');

create policy platform_projects_member_select
  on public.platform_projects for select to authenticated
  using (public.platform_project_access_role(id) in ('editor', 'viewer'));

create policy platform_versions_member_select
  on public.platform_project_versions for select to authenticated
  using (public.platform_project_access_role(project_id) in ('editor', 'viewer'));

create policy platform_entitlements_member_select
  on public.platform_entitlements for select to authenticated
  using (public.platform_project_access_role(project_id) in ('editor', 'viewer'));

create policy platform_reviews_member_select
  on public.platform_project_reviews for select to authenticated
  using (public.platform_project_access_role(project_id) in ('editor', 'viewer'));

revoke all on public.platform_project_members from public, anon;
revoke all on public.platform_project_invitations from public, anon;
revoke insert, update, delete on public.platform_project_members from authenticated;
revoke insert, update, delete on public.platform_project_invitations from authenticated;
grant select (project_id, user_id, email, role, invited_by_user_id, created_at, updated_at)
  on public.platform_project_members to authenticated;
grant select (id, project_id, role, accepted_by_user_id, accepted_at, expires_at, revoked_at, created_at)
  on public.platform_project_invitations to authenticated;

create or replace function public.platform_save_customized_project_draft_v3(
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
  p_story_note text,
  p_content_brief jsonb
)
returns table (
  id uuid,
  source_draft_id uuid,
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
  content_brief jsonb,
  current_version integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_owner uuid;
  v_project public.platform_projects%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_next_version integer;
  v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;

  if p_project_id is null then
    return query select saved.* from public.platform_save_customized_project_draft_v2(
      p_event_key, p_project_id, p_source_draft_id, p_template_id, p_template_version,
      p_plan_id, p_partner_one, p_partner_two, p_wedding_date, p_location,
      p_guest_count, p_theme_id, p_tone_id, p_modules, p_story_note, p_content_brief
    ) saved;
    return;
  end if;

  select p.owner_user_id into v_owner from public.platform_projects p where p.id = p_project_id;
  if v_owner = v_actor then
    return query select saved.* from public.platform_save_customized_project_draft_v2(
      p_event_key, p_project_id, p_source_draft_id, p_template_id, p_template_version,
      p_plan_id, p_partner_one, p_partner_two, p_wedding_date, p_location,
      p_guest_count, p_theme_id, p_tone_id, p_modules, p_story_note, p_content_brief
    ) saved;
    return;
  end if;

  if p_event_key is null or p_source_draft_id is null
    or p_template_id <> 'cupid-wedding-trial'
    or p_template_version !~ '^[0-9]{4}[.][0-9]{2}$'
    or p_plan_id not in ('buyout', 'subscription')
    or coalesce(char_length(p_partner_one), 0) > 120
    or coalesce(char_length(p_partner_two), 0) > 120
    or coalesce(char_length(p_location), 0) > 160
    or p_guest_count not in (40, 80, 120, 180)
    or p_theme_id not in ('estate', 'garden', 'night')
    or p_tone_id not in ('romantic', 'social', 'mystery')
    or p_modules is null or cardinality(p_modules) > 5
    or array_position(p_modules, null) is not null
    or not (p_modules <@ array['secret-missions', 'team-games', 'host-toolkit', 'live-scoreboard', 'finale-vote']::text[])
    or (select count(*) from unnest(p_modules) m(value)) <> (select count(distinct value) from unnest(p_modules) m(value))
    or coalesce(char_length(p_story_note), 0) > 2000
    or p_content_brief is null or jsonb_typeof(p_content_brief) <> 'object'
    or not (p_content_brief ?& array['language', 'interaction', 'guestMix', 'storyMoments', 'avoidTopics', 'boundariesConfirmed', 'hostNotes'])
    or p_content_brief ->> 'language' not in ('chinese', 'bilingual')
    or p_content_brief ->> 'interaction' not in ('gentle', 'balanced', 'immersive')
    or p_content_brief ->> 'guestMix' not in ('family', 'balanced', 'friends')
    or jsonb_typeof(p_content_brief -> 'storyMoments') <> 'string'
    or char_length(p_content_brief ->> 'storyMoments') > 2000
    or jsonb_typeof(p_content_brief -> 'avoidTopics') <> 'string'
    or char_length(p_content_brief ->> 'avoidTopics') > 1200
    or jsonb_typeof(p_content_brief -> 'boundariesConfirmed') <> 'boolean'
    or jsonb_typeof(p_content_brief -> 'hostNotes') <> 'string'
    or char_length(p_content_brief ->> 'hostNotes') > 2000
  then raise exception 'platform_project_invalid'; end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'draft_save' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version, p.plan_id,
      p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count, p.theme_id, p.tone_id,
      p.modules, p.story_note, p.content_brief, p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = p_project_id and public.platform_project_access_role(p.id) = 'editor';
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-collaborator-save:' || p_project_id::text, 0));
  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'draft_save' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version, p.plan_id,
      p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count, p.theme_id, p.tone_id,
      p.modules, p.story_note, p.content_brief, p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = p_project_id and public.platform_project_access_role(p.id) = 'editor';
    return;
  end if;
  select p.* into v_project from public.platform_projects p
  where p.id = p_project_id and p.source_draft_id = p_source_draft_id
    and public.platform_project_access_role(p.id) = 'editor'
  for update;
  if v_project.id is null then raise exception 'platform_project_not_owned'; end if;
  if v_project.status <> 'draft' then raise exception 'platform_project_locked'; end if;

  update public.platform_projects p set
    template_id = p_template_id, template_version = p_template_version, plan_id = p_plan_id,
    partner_one = coalesce(p_partner_one, ''), partner_two = coalesce(p_partner_two, ''),
    wedding_date = p_wedding_date, location = coalesce(p_location, ''), guest_count = p_guest_count,
    theme_id = p_theme_id, tone_id = p_tone_id, modules = p_modules,
    story_note = coalesce(p_story_note, ''), content_brief = p_content_brief,
    current_version = p.current_version + 1, updated_at = now()
  where p.id = v_project.id returning p.current_version into v_next_version;

  update public.platform_entitlements e set plan_id = p_plan_id, updated_at = now()
  where e.project_id = v_project.id and e.status = 'pending';

  select jsonb_build_object(
    'status', p.status, 'template_id', p.template_id, 'template_version', p.template_version,
    'plan_id', p.plan_id, 'partner_one', p.partner_one, 'partner_two', p.partner_two,
    'wedding_date', p.wedding_date, 'location', p.location, 'guest_count', p.guest_count,
    'theme_id', p.theme_id, 'tone_id', p.tone_id, 'modules', to_jsonb(p.modules),
    'story_note', p.story_note, 'content_brief', p.content_brief
  ) into v_snapshot from public.platform_projects p where p.id = v_project.id;

  insert into public.platform_project_versions (project_id, version, actor_user_id, snapshot, reason)
  values (v_project.id, v_next_version, v_actor, v_snapshot, 'customer_save');
  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (v_project.id, v_actor, 'project_draft_saved', v_next_version,
    jsonb_build_object('event_key', p_event_key, 'access_role', 'editor'));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, 'draft_save');

  return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version, p.plan_id,
    p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count, p.theme_id, p.tone_id,
    p.modules, p.story_note, p.content_brief, p.current_version, p.updated_at
    from public.platform_projects p where p.id = v_project.id;
end;
$$;

revoke all on function public.platform_save_customized_project_draft_v3(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from public, anon;
grant execute on function public.platform_save_customized_project_draft_v3(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) to authenticated;

create or replace function public.platform_create_project_invitation(
  p_event_key uuid, p_project_id uuid, p_role text, p_token_hash text
)
returns table (id uuid, project_id uuid, role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_invite public.platform_project_invitations%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null or p_role not in ('editor', 'viewer')
    or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
  then raise exception 'platform_invitation_invalid'; end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'invite_create' or v_receipt_project_id <> p_project_id then raise exception 'platform_event_conflict'; end if;
    return query select i.id, i.project_id, i.role, i.expires_at
      from public.platform_project_invitations i where i.invited_by_user_id = v_actor and i.event_key = p_event_key;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-invites:' || p_project_id::text, 0));
  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'invite_create' or v_receipt_project_id <> p_project_id then raise exception 'platform_event_conflict'; end if;
    return query select i.id, i.project_id, i.role, i.expires_at
      from public.platform_project_invitations i where i.invited_by_user_id = v_actor and i.event_key = p_event_key;
    return;
  end if;
  if public.platform_project_access_role(p_project_id) <> 'owner' then raise exception 'platform_project_not_owned'; end if;
  if (select count(*) from public.platform_project_invitations i
      where i.project_id = p_project_id and i.revoked_at is null and i.accepted_at is null and i.expires_at > now()) >= 10
  then raise exception 'platform_invitation_limit'; end if;

  insert into public.platform_project_invitations (
    project_id, role, token_hash, invited_by_user_id, event_key, expires_at
  ) values (
    p_project_id, p_role, decode(p_token_hash, 'hex'), v_actor, p_event_key, now() + interval '7 days'
  ) returning * into v_invite;
  insert into public.platform_audit_log (project_id, actor_user_id, action, metadata)
  values (p_project_id, v_actor, 'project_invitation_created',
    jsonb_build_object('invite_id', v_invite.id, 'role', p_role, 'event_key', p_event_key));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, p_project_id, 'invite_create');
  return query select v_invite.id, v_invite.project_id, v_invite.role, v_invite.expires_at;
end;
$$;

create or replace function public.platform_accept_project_invitation(
  p_event_key uuid, p_token_hash text
)
returns table (project_id uuid, role text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_invite public.platform_project_invitations%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_role text;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or v_email = ''
  then raise exception 'platform_invitation_invalid'; end if;
  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'invite_accept' then raise exception 'platform_event_conflict'; end if;
    return query select m.project_id, m.role from public.platform_project_members m
      where m.project_id = v_receipt_project_id and m.user_id = v_actor;
    return;
  end if;

  select i.* into v_invite from public.platform_project_invitations i
  where i.token_hash = decode(p_token_hash, 'hex') for update;
  if v_invite.id is null or v_invite.revoked_at is not null or v_invite.expires_at <= now()
  then raise exception 'platform_invitation_unavailable'; end if;
  if exists (select 1 from public.platform_projects p where p.id = v_invite.project_id and p.owner_user_id = v_actor)
  then raise exception 'platform_invitation_owner'; end if;
  if v_invite.accepted_at is not null then
    if v_invite.accepted_by_user_id <> v_actor then raise exception 'platform_invitation_unavailable'; end if;
    return query select m.project_id, m.role from public.platform_project_members m
      where m.project_id = v_invite.project_id and m.user_id = v_actor;
    return;
  end if;

  insert into public.platform_project_members (project_id, user_id, email, role, invited_by_user_id)
  values (v_invite.project_id, v_actor, v_email, v_invite.role, v_invite.invited_by_user_id)
  on conflict on constraint platform_project_members_pkey do update set
    email = excluded.email,
    role = case when platform_project_members.role = 'editor' or excluded.role = 'editor' then 'editor' else 'viewer' end,
    invited_by_user_id = excluded.invited_by_user_id,
    updated_at = now()
  returning platform_project_members.role into v_role;
  update public.platform_project_invitations set accepted_by_user_id = v_actor, accepted_at = now()
  where id = v_invite.id;
  insert into public.platform_audit_log (project_id, actor_user_id, action, metadata)
  values (v_invite.project_id, v_actor, 'project_invitation_accepted',
    jsonb_build_object('invite_id', v_invite.id, 'role', v_role, 'event_key', p_event_key));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_invite.project_id, 'invite_accept');
  return query select v_invite.project_id, v_role;
end;
$$;

create or replace function public.platform_revoke_project_invitation(
  p_event_key uuid, p_project_id uuid, p_invitation_id uuid
)
returns table (id uuid, revoked_at timestamptz)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_revoked_at timestamptz; v_receipt_project_id uuid; v_receipt_action text;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null or p_invitation_id is null then raise exception 'platform_invitation_invalid'; end if;
  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'invite_revoke' or v_receipt_project_id <> p_project_id then raise exception 'platform_event_conflict'; end if;
    return query select i.id, i.revoked_at from public.platform_project_invitations i where i.id = p_invitation_id;
    return;
  end if;
  if public.platform_project_access_role(p_project_id) <> 'owner' then raise exception 'platform_project_not_owned'; end if;
  update public.platform_project_invitations i set revoked_at = coalesce(i.revoked_at, now())
  where i.id = p_invitation_id and i.project_id = p_project_id and i.accepted_at is null
  returning i.revoked_at into v_revoked_at;
  if v_revoked_at is null then raise exception 'platform_invitation_unavailable'; end if;
  insert into public.platform_audit_log (project_id, actor_user_id, action, metadata)
  values (p_project_id, v_actor, 'project_invitation_revoked', jsonb_build_object('invite_id', p_invitation_id, 'event_key', p_event_key));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, p_project_id, 'invite_revoke');
  return query select p_invitation_id, v_revoked_at;
end;
$$;

create or replace function public.platform_remove_project_member(
  p_event_key uuid, p_project_id uuid, p_member_user_id uuid
)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_removed uuid; v_receipt_project_id uuid; v_receipt_action text;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null or p_member_user_id is null then raise exception 'platform_member_invalid'; end if;
  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'member_remove' or v_receipt_project_id <> p_project_id then raise exception 'platform_event_conflict'; end if;
    return query select p_member_user_id;
    return;
  end if;
  if public.platform_project_access_role(p_project_id) <> 'owner' then raise exception 'platform_project_not_owned'; end if;
  delete from public.platform_project_members m where m.project_id = p_project_id and m.user_id = p_member_user_id
  returning m.user_id into v_removed;
  if v_removed is null then raise exception 'platform_member_not_found'; end if;
  insert into public.platform_audit_log (project_id, actor_user_id, action, metadata)
  values (p_project_id, v_actor, 'project_member_removed', jsonb_build_object('member_user_id', v_removed, 'event_key', p_event_key));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, p_project_id, 'member_remove');
  return query select v_removed;
end;
$$;

revoke all on function public.platform_create_project_invitation(uuid, uuid, text, text) from public, anon;
revoke all on function public.platform_accept_project_invitation(uuid, text) from public, anon;
revoke all on function public.platform_revoke_project_invitation(uuid, uuid, uuid) from public, anon;
revoke all on function public.platform_remove_project_member(uuid, uuid, uuid) from public, anon;
grant execute on function public.platform_create_project_invitation(uuid, uuid, text, text) to authenticated;
grant execute on function public.platform_accept_project_invitation(uuid, text) to authenticated;
grant execute on function public.platform_revoke_project_invitation(uuid, uuid, uuid) to authenticated;
grant execute on function public.platform_remove_project_member(uuid, uuid, uuid) to authenticated;

commit;
