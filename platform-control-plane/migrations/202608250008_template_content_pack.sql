begin;

create or replace function public.platform_template_content_is_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_question jsonb;
  v_opening text;
  v_without_known_variables text;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or not (p_value ?& array['teamOneName', 'teamTwoName', 'openingScript', 'quizQuestions'])
    or (p_value - array['teamOneName', 'teamTwoName', 'openingScript', 'quizQuestions']) <> '{}'::jsonb
    or jsonb_typeof(p_value -> 'teamOneName') <> 'string'
    or char_length(btrim(p_value ->> 'teamOneName')) not between 1 and 40
    or (p_value ->> 'teamOneName') ~ '[<>{}]'
    or jsonb_typeof(p_value -> 'teamTwoName') <> 'string'
    or char_length(btrim(p_value ->> 'teamTwoName')) not between 1 and 40
    or (p_value ->> 'teamTwoName') ~ '[<>{}]'
    or jsonb_typeof(p_value -> 'openingScript') <> 'string'
    or char_length(btrim(p_value ->> 'openingScript')) not between 1 and 800
    or (p_value ->> 'openingScript') ~ '[<>]'
    or jsonb_typeof(p_value -> 'quizQuestions') <> 'array'
    or jsonb_array_length(p_value -> 'quizQuestions') > 20
  then return false; end if;

  v_opening := p_value ->> 'openingScript';
  v_without_known_variables := regexp_replace(
    v_opening,
    '[{][{](partnerOne|partnerTwo|couple|location|weddingDate)[}][}]',
    '',
    'g'
  );
  if position('{{' in v_without_known_variables) > 0 or position('}}' in v_without_known_variables) > 0 then
    return false;
  end if;

  for v_question in select value from jsonb_array_elements(p_value -> 'quizQuestions')
  loop
    if jsonb_typeof(v_question) <> 'object'
      or not (v_question ?& array['prompt', 'answer'])
      or (v_question - array['prompt', 'answer']) <> '{}'::jsonb
      or jsonb_typeof(v_question -> 'prompt') <> 'string'
      or char_length(btrim(v_question ->> 'prompt')) not between 1 and 180
      or (v_question ->> 'prompt') ~ '[<>{}]'
      or jsonb_typeof(v_question -> 'answer') <> 'string'
      or v_question ->> 'answer' not in ('partnerOne', 'partnerTwo', 'both')
    then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.platform_template_content_is_valid(jsonb) from public, anon, authenticated;

alter table public.platform_projects
  add column template_content jsonb not null default jsonb_build_object(
    'teamOneName', '海岛组',
    'teamTwoName', '沙漠组',
    'openingScript', '欢迎来到 {{couple}} 的婚礼游戏。今晚请跟随主持人提示，一起完成属于你们的故事。',
    'quizQuestions', '[]'::jsonb
  );

alter table public.platform_projects
  add constraint platform_projects_template_content_check
  check (public.platform_template_content_is_valid(template_content));

create or replace function public.platform_enrich_project_version_template_content()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (new.snapshot ? 'template_content') then
    new.snapshot := new.snapshot || jsonb_build_object(
      'template_content', (select p.template_content from public.platform_projects p where p.id = new.project_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.platform_enrich_project_version_template_content() from public, anon, authenticated;

create trigger platform_project_versions_template_content
before insert on public.platform_project_versions
for each row execute function public.platform_enrich_project_version_template_content();

create or replace function public.platform_save_customized_project_draft_v4(
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
  p_template_content jsonb
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
  if p_event_key is null or not public.platform_template_content_is_valid(p_template_content) then
    raise exception 'platform_project_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-save-v4:' || v_actor::text || ':' || p_event_key::text, 0));
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
      p.current_version, p.updated_at
      from public.platform_projects p where p.id = v_receipt_project_id;
    return;
  end if;

  select saved.id, saved.current_version into v_project_id, v_version
  from public.platform_save_customized_project_draft_v3(
    p_event_key, p_project_id, p_source_draft_id, p_template_id, p_template_version,
    p_plan_id, p_partner_one, p_partner_two, p_wedding_date, p_location,
    p_guest_count, p_theme_id, p_tone_id, p_modules, p_story_note, p_content_brief
  ) saved;

  update public.platform_projects p set template_content = p_template_content
  where p.id = v_project_id;
  update public.platform_project_versions version set
    snapshot = version.snapshot || jsonb_build_object('template_content', p_template_content)
  where version.project_id = v_project_id and version.version = v_version;

  return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version,
    p.plan_id, p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
    p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief, p.template_content,
    p.current_version, p.updated_at
    from public.platform_projects p where p.id = v_project_id;
end;
$$;

revoke all on function public.platform_save_customized_project_draft_v4(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb) from public, anon;
grant execute on function public.platform_save_customized_project_draft_v4(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb) to authenticated;

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
  then raise exception 'platform_manifest_not_ready'; end if;

  v_manifest.manifest := jsonb_build_object(
    'schemaVersion', 'wedding-instance-config/v1',
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
    'delivery', jsonb_build_object('plan', v_snapshot ->> 'plan_id'),
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
