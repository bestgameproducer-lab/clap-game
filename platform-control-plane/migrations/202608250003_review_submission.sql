begin;

alter table public.platform_mutation_receipts
  add column action text not null default 'draft_save'
  check (char_length(action) between 1 and 80);

create or replace function public.platform_save_customized_project_draft_v2(
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
  v_project_id uuid;
  v_action text;
begin
  if v_actor is null then
    raise exception 'platform_auth_required';
  end if;

  select r.project_id, r.action into v_project_id, v_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_project_id is not null then
    if v_action <> 'draft_save' then raise exception 'platform_event_conflict'; end if;
    return query
      select p.id, p.source_draft_id, p.status, p.template_id, p.template_version, p.plan_id,
        p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
        p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief,
        p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = v_project_id and p.owner_user_id = v_actor;
    return;
  end if;

  return query
    select saved.*
    from public.platform_save_customized_project_draft(
      p_event_key,
      p_project_id,
      p_source_draft_id,
      p_template_id,
      p_template_version,
      p_plan_id,
      p_partner_one,
      p_partner_two,
      p_wedding_date,
      p_location,
      p_guest_count,
      p_theme_id,
      p_tone_id,
      p_modules,
      p_story_note,
      p_content_brief
    ) saved;
end;
$$;

revoke execute on function public.platform_save_customized_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from authenticated;
revoke all on function public.platform_save_customized_project_draft_v2(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from public;
revoke all on function public.platform_save_customized_project_draft_v2(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from anon;
grant execute on function public.platform_save_customized_project_draft_v2(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) to authenticated;

create or replace function public.platform_submit_project_for_review(
  p_event_key uuid,
  p_project_id uuid
)
returns table (
  id uuid,
  status text,
  current_version integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.platform_projects%rowtype;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_next_version integer;
  v_snapshot jsonb;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null then raise exception 'platform_project_invalid'; end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_receipt_project_id is not null then
    if v_receipt_action <> 'submit_review' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select p.id, p.status, p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = p_project_id and p.owner_user_id = v_actor;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_actor::text || ':review:' || p_project_id::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_receipt_project_id is not null then
    if v_receipt_action <> 'submit_review' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select p.id, p.status, p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = p_project_id and p.owner_user_id = v_actor;
    return;
  end if;

  select p.* into v_project
  from public.platform_projects p
  where p.id = p_project_id and p.owner_user_id = v_actor
  for update;

  if v_project.id is null then raise exception 'platform_project_not_owned'; end if;
  if v_project.status <> 'draft' then raise exception 'platform_project_locked'; end if;
  if btrim(v_project.partner_one) = ''
    or btrim(v_project.partner_two) = ''
    or v_project.wedding_date is null
    or btrim(v_project.location) = ''
    or cardinality(v_project.modules) = 0
    or btrim(coalesce(v_project.content_brief ->> 'storyMoments', '')) = ''
    or coalesce((v_project.content_brief ->> 'boundariesConfirmed')::boolean, false) is not true
  then
    raise exception 'platform_project_not_ready';
  end if;

  update public.platform_projects p set
    status = 'content_review',
    current_version = p.current_version + 1,
    updated_at = now()
  where p.id = v_project.id
  returning p.current_version into v_next_version;

  select jsonb_build_object(
    'status', p.status,
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
    'story_note', p.story_note,
    'content_brief', p.content_brief
  ) into v_snapshot
  from public.platform_projects p where p.id = v_project.id;

  insert into public.platform_project_versions (project_id, version, actor_user_id, snapshot, reason)
  values (v_project.id, v_next_version, v_actor, v_snapshot, 'content_review');

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (v_project.id, v_actor, 'project_submitted_for_review', v_next_version, jsonb_build_object('event_key', p_event_key));

  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, 'submit_review');

  return query select p.id, p.status, p.current_version, p.updated_at
    from public.platform_projects p where p.id = v_project.id and p.owner_user_id = v_actor;
end;
$$;

revoke all on function public.platform_submit_project_for_review(uuid, uuid) from public;
revoke all on function public.platform_submit_project_for_review(uuid, uuid) from anon;
grant execute on function public.platform_submit_project_for_review(uuid, uuid) to authenticated;

commit;
