begin;

create or replace function public.platform_data_policy_is_valid(p_value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_value is not null
    and jsonb_typeof(p_value) = 'object'
    and p_value ?& array[
      'retentionWindow', 'projectArchiveBeforeDeletion', 'rosterAuthorityConfirmed',
      'guestNoticeConfirmed', 'isolatedRuntimeRequired'
    ]
    and (p_value - array[
      'retentionWindow', 'projectArchiveBeforeDeletion', 'rosterAuthorityConfirmed',
      'guestNoticeConfirmed', 'isolatedRuntimeRequired'
    ]) = '{}'::jsonb
    and jsonb_typeof(p_value -> 'retentionWindow') = 'string'
    and p_value ->> 'retentionWindow' in ('event_plus_7_days', 'event_plus_30_days', 'event_plus_90_days')
    and jsonb_typeof(p_value -> 'projectArchiveBeforeDeletion') = 'boolean'
    and jsonb_typeof(p_value -> 'rosterAuthorityConfirmed') = 'boolean'
    and jsonb_typeof(p_value -> 'guestNoticeConfirmed') = 'boolean'
    and p_value -> 'isolatedRuntimeRequired' = 'true'::jsonb;
$$;

revoke all on function public.platform_data_policy_is_valid(jsonb) from public, anon, authenticated;

alter table public.platform_projects
  add column data_policy jsonb not null default jsonb_build_object(
    'retentionWindow', 'event_plus_7_days',
    'projectArchiveBeforeDeletion', true,
    'rosterAuthorityConfirmed', false,
    'guestNoticeConfirmed', false,
    'isolatedRuntimeRequired', true
  );

alter table public.platform_projects
  add constraint platform_projects_data_policy_check
  check (public.platform_data_policy_is_valid(data_policy));

create or replace function public.platform_enrich_project_version_data_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (new.snapshot ? 'data_policy') then
    new.snapshot := new.snapshot || jsonb_build_object(
      'data_policy', (select p.data_policy from public.platform_projects p where p.id = new.project_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.platform_enrich_project_version_data_policy() from public, anon, authenticated;

create trigger platform_project_versions_data_policy
before insert on public.platform_project_versions
for each row execute function public.platform_enrich_project_version_data_policy();

create or replace function public.platform_require_confirmed_data_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('content_review', 'provisioning')
    and new.status is distinct from old.status
    and (
      not public.platform_data_policy_is_valid(new.data_policy)
      or coalesce((new.data_policy ->> 'rosterAuthorityConfirmed')::boolean, false) is not true
      or coalesce((new.data_policy ->> 'guestNoticeConfirmed')::boolean, false) is not true
      or coalesce((new.data_policy ->> 'isolatedRuntimeRequired')::boolean, false) is not true
    )
  then raise exception 'platform_project_not_ready'; end if;
  return new;
end;
$$;

revoke all on function public.platform_require_confirmed_data_policy() from public, anon, authenticated;

create trigger platform_projects_confirmed_data_policy
before update of status on public.platform_projects
for each row execute function public.platform_require_confirmed_data_policy();

create or replace function public.platform_save_customized_project_draft_v6(
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
  p_content_brief jsonb,
  p_template_content jsonb,
  p_delivery_scope jsonb,
  p_data_policy jsonb
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
  template_content jsonb,
  delivery_scope jsonb,
  data_policy jsonb,
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
  v_version integer;
  v_receipt_project_id uuid;
  v_receipt_action text;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or not public.platform_data_policy_is_valid(p_data_policy) then
    raise exception 'platform_project_invalid';
  end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'draft_save' or (p_project_id is not null and v_receipt_project_id <> p_project_id) then
      raise exception 'platform_event_conflict';
    end if;
    if coalesce(public.platform_project_access_role(v_receipt_project_id), '') not in ('owner', 'editor') then
      raise exception 'platform_project_not_owned';
    end if;
    return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version,
      p.plan_id, p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
      p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief, p.template_content,
      p.delivery_scope, p.data_policy, p.current_version, p.updated_at
      from public.platform_projects p where p.id = v_receipt_project_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-save-v6:' || v_actor::text || ':' || p_event_key::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'draft_save' or (p_project_id is not null and v_receipt_project_id <> p_project_id) then
      raise exception 'platform_event_conflict';
    end if;
    if coalesce(public.platform_project_access_role(v_receipt_project_id), '') not in ('owner', 'editor') then
      raise exception 'platform_project_not_owned';
    end if;
    return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version,
      p.plan_id, p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
      p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief, p.template_content,
      p.delivery_scope, p.data_policy, p.current_version, p.updated_at
      from public.platform_projects p where p.id = v_receipt_project_id;
    return;
  end if;

  select saved.id, saved.current_version into v_project_id, v_version
  from public.platform_save_customized_project_draft_v5(
    p_event_key, p_project_id, p_source_draft_id, p_template_id, p_template_version,
    p_plan_id, p_partner_one, p_partner_two, p_wedding_date, p_location,
    p_guest_count, p_theme_id, p_tone_id, p_modules, p_story_note, p_content_brief,
    p_template_content, p_delivery_scope
  ) saved;

  update public.platform_projects p set data_policy = p_data_policy
  where p.id = v_project_id;
  update public.platform_project_versions version set
    snapshot = version.snapshot || jsonb_build_object('data_policy', p_data_policy)
  where version.project_id = v_project_id and version.version = v_version;

  return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version,
    p.plan_id, p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
    p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief, p.template_content,
    p.delivery_scope, p.data_policy, p.current_version, p.updated_at
    from public.platform_projects p where p.id = v_project_id;
end;
$$;

revoke execute on function public.platform_save_customized_project_draft_v2(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from authenticated;
revoke execute on function public.platform_save_customized_project_draft_v3(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from authenticated;
revoke execute on function public.platform_save_customized_project_draft_v4(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb) from authenticated;
revoke execute on function public.platform_save_customized_project_draft_v5(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb, jsonb) from authenticated;
revoke all on function public.platform_save_customized_project_draft_v6(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.platform_save_customized_project_draft_v6(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb, jsonb, jsonb) to authenticated;

create or replace function public.platform_lock_provisioning_manifest(
  p_event_key uuid,
  p_project_id uuid
)
returns table (
  project_id uuid,
  project_version integer,
  manifest jsonb,
  manifest_hash text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.platform_projects%rowtype;
  v_snapshot jsonb;
  v_template_content jsonb;
  v_data_policy jsonb;
  v_manifest public.platform_provisioning_manifests%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_latest_decision text;
  v_latest_review_version integer;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if not public.platform_is_staff() then raise exception 'platform_staff_required'; end if;
  if p_event_key is null or p_project_id is null then raise exception 'platform_manifest_invalid'; end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'manifest_lock' or v_receipt_project_id <> p_project_id then raise exception 'platform_event_conflict'; end if;
    return query select m.project_id, m.project_version, m.manifest, m.manifest_hash, m.created_at
      from public.platform_provisioning_manifests m where m.project_id = p_project_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-manifest:' || p_project_id::text, 0));
  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'manifest_lock' or v_receipt_project_id <> p_project_id then raise exception 'platform_event_conflict'; end if;
    return query select m.project_id, m.project_version, m.manifest, m.manifest_hash, m.created_at
      from public.platform_provisioning_manifests m where m.project_id = p_project_id;
    return;
  end if;

  select p.* into v_project from public.platform_projects p where p.id = p_project_id for update;
  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if v_project.status <> 'provisioning' then raise exception 'platform_manifest_locked'; end if;

  select review.decision, review.project_version into v_latest_decision, v_latest_review_version
  from public.platform_project_reviews review where review.project_id = p_project_id
  order by review.review_round desc limit 1;
  if v_latest_decision <> 'approved' or v_latest_review_version <> v_project.current_version then
    raise exception 'platform_manifest_not_ready';
  end if;

  select version.snapshot into v_snapshot from public.platform_project_versions version
  where version.project_id = p_project_id and version.version = v_project.current_version;
  v_template_content := coalesce(v_snapshot -> 'template_content', v_project.template_content);
  v_data_policy := coalesce(v_snapshot -> 'data_policy', v_project.data_policy);
  if v_snapshot is null
    or v_snapshot ->> 'status' <> 'provisioning'
    or v_snapshot #>> '{review,decision}' <> 'approved'
    or btrim(coalesce(v_snapshot ->> 'partner_one', '')) = ''
    or btrim(coalesce(v_snapshot ->> 'partner_two', '')) = ''
    or coalesce(v_snapshot ->> 'wedding_date', '') = ''
    or btrim(coalesce(v_snapshot ->> 'location', '')) = ''
    or jsonb_typeof(v_snapshot -> 'modules') <> 'array'
    or jsonb_array_length(v_snapshot -> 'modules') = 0
    or not public.platform_template_content_is_valid(v_template_content)
    or not public.platform_data_policy_is_valid(v_data_policy)
    or coalesce((v_data_policy ->> 'rosterAuthorityConfirmed')::boolean, false) is not true
    or coalesce((v_data_policy ->> 'guestNoticeConfirmed')::boolean, false) is not true
  then raise exception 'platform_manifest_not_ready'; end if;

  v_manifest.manifest := jsonb_build_object(
    'schemaVersion', 'wedding-instance-config/v2',
    'source', jsonb_build_object(
      'projectId', v_project.id,
      'projectVersion', v_project.current_version,
      'templateId', v_snapshot ->> 'template_id',
      'templateVersion', v_snapshot ->> 'template_version'
    ),
    'wedding', jsonb_build_object(
      'displayName', btrim(v_snapshot ->> 'partner_one') || ' & ' || btrim(v_snapshot ->> 'partner_two'),
      'partnerOne', btrim(v_snapshot ->> 'partner_one'),
      'partnerTwo', btrim(v_snapshot ->> 'partner_two'),
      'date', v_snapshot ->> 'wedding_date',
      'location', btrim(v_snapshot ->> 'location'),
      'guestCapacity', (v_snapshot ->> 'guest_count')::integer
    ),
    'experience', jsonb_build_object(
      'theme', v_snapshot ->> 'theme_id',
      'tone', v_snapshot ->> 'tone_id',
      'modules', v_snapshot -> 'modules',
      'language', v_snapshot #>> '{content_brief,language}',
      'interaction', v_snapshot #>> '{content_brief,interaction}',
      'guestMix', v_snapshot #>> '{content_brief,guestMix}',
      'templateContent', v_template_content
    ),
    'delivery', jsonb_build_object(
      'plan', v_snapshot ->> 'plan_id',
      'dataPolicy', v_data_policy
    ),
    'safeguards', jsonb_build_object(
      'containsGuestRuntimeData', false,
      'containsCredentials', false,
      'containsPrivateStoryNotes', false
    )
  );
  if to_regprocedure('extensions.digest(bytea,text)') is not null then
    execute 'select encode(extensions.digest($1, $2), $3)' into v_manifest.manifest_hash
      using convert_to(v_manifest.manifest::text, 'UTF8'), 'sha256', 'hex';
  elsif to_regprocedure('digest(bytea,text)') is not null then
    execute 'select encode(digest($1, $2), $3)' into v_manifest.manifest_hash
      using convert_to(v_manifest.manifest::text, 'UTF8'), 'sha256', 'hex';
  elsif to_regprocedure('sha256(bytea)') is not null then
    execute 'select encode(sha256($1), $2)' into v_manifest.manifest_hash
      using convert_to(v_manifest.manifest::text, 'UTF8'), 'hex';
  else raise exception 'platform_manifest_hash_unavailable'; end if;

  insert into public.platform_provisioning_manifests (
    project_id, project_version, manifest, manifest_hash, locked_by_user_id
  ) values (
    v_project.id, v_project.current_version, v_manifest.manifest, v_manifest.manifest_hash, v_actor
  ) returning * into v_manifest;
  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (v_project.id, v_actor, 'provisioning_manifest_locked', v_project.current_version,
    jsonb_build_object('event_key', p_event_key, 'manifest_hash', v_manifest.manifest_hash));
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, 'manifest_lock');

  return query select v_manifest.project_id, v_manifest.project_version,
    v_manifest.manifest, v_manifest.manifest_hash, v_manifest.created_at;
end;
$$;

revoke all on function public.platform_lock_provisioning_manifest(uuid, uuid) from public, anon;
grant execute on function public.platform_lock_provisioning_manifest(uuid, uuid) to authenticated;

commit;
