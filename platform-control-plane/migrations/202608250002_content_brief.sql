begin;

alter table public.platform_projects
  add column content_brief jsonb not null default jsonb_build_object(
    'language', 'chinese',
    'interaction', 'balanced',
    'guestMix', 'balanced',
    'storyMoments', '',
    'avoidTopics', '',
    'boundariesConfirmed', false,
    'hostNotes', ''
  );

alter table public.platform_projects
  add constraint platform_projects_content_brief_check check (
    jsonb_typeof(content_brief) = 'object'
    and content_brief ?& array['language', 'interaction', 'guestMix', 'storyMoments', 'avoidTopics', 'boundariesConfirmed', 'hostNotes']
    and content_brief ->> 'language' in ('chinese', 'bilingual')
    and content_brief ->> 'interaction' in ('gentle', 'balanced', 'immersive')
    and content_brief ->> 'guestMix' in ('family', 'balanced', 'friends')
    and jsonb_typeof(content_brief -> 'storyMoments') = 'string'
    and char_length(content_brief ->> 'storyMoments') <= 2000
    and jsonb_typeof(content_brief -> 'avoidTopics') = 'string'
    and char_length(content_brief ->> 'avoidTopics') <= 1200
    and jsonb_typeof(content_brief -> 'boundariesConfirmed') = 'boolean'
    and jsonb_typeof(content_brief -> 'hostNotes') = 'string'
    and char_length(content_brief ->> 'hostNotes') <= 2000
  );

create or replace function public.platform_save_customized_project_draft(
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
  v_version integer;
begin
  if v_actor is null then
    raise exception 'platform_auth_required';
  end if;

  if p_content_brief is null
    or jsonb_typeof(p_content_brief) <> 'object'
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
  then
    raise exception 'platform_project_invalid';
  end if;

  select r.project_id into v_project_id
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_project_id is not null then
    return query
      select p.id, p.source_draft_id, p.status, p.template_id, p.template_version, p.plan_id,
        p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
        p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief,
        p.current_version, p.updated_at
      from public.platform_projects p
      where p.id = v_project_id and p.owner_user_id = v_actor;
    return;
  end if;

  select saved.id, saved.current_version into v_project_id, v_version
  from public.platform_save_project_draft(
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
    p_story_note
  ) saved;

  update public.platform_projects p
  set content_brief = p_content_brief
  where p.id = v_project_id and p.owner_user_id = v_actor;

  update public.platform_project_versions v
  set snapshot = v.snapshot || jsonb_build_object('content_brief', p_content_brief)
  where v.project_id = v_project_id and v.version = v_version and v.actor_user_id = v_actor;

  return query
    select p.id, p.source_draft_id, p.status, p.template_id, p.template_version, p.plan_id,
      p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
      p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief,
      p.current_version, p.updated_at
    from public.platform_projects p
    where p.id = v_project_id and p.owner_user_id = v_actor;
end;
$$;

revoke execute on function public.platform_save_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text) from authenticated;
revoke all on function public.platform_save_customized_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from public;
revoke all on function public.platform_save_customized_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) from anon;
grant execute on function public.platform_save_customized_project_draft(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb) to authenticated;

commit;
