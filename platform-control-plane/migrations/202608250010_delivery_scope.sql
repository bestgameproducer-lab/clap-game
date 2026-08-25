begin;

create or replace function public.platform_delivery_scope_is_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_service jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or not (p_value ?& array['customizationLevel', 'supportMode', 'rehearsalMode', 'services', 'serviceNotes'])
    or (p_value - array['customizationLevel', 'supportMode', 'rehearsalMode', 'services', 'serviceNotes']) <> '{}'::jsonb
    or jsonb_typeof(p_value -> 'customizationLevel') <> 'string'
    or p_value ->> 'customizationLevel' not in ('template', 'guided', 'bespoke')
    or jsonb_typeof(p_value -> 'supportMode') <> 'string'
    or p_value ->> 'supportMode' not in ('self_service', 'remote_guided', 'managed')
    or jsonb_typeof(p_value -> 'rehearsalMode') <> 'string'
    or p_value ->> 'rehearsalMode' not in ('self_check', 'remote_walkthrough', 'full_rehearsal')
    or jsonb_typeof(p_value -> 'services') <> 'array'
    or jsonb_array_length(p_value -> 'services') not between 1 and 6
    or jsonb_typeof(p_value -> 'serviceNotes') <> 'string'
    or char_length(p_value ->> 'serviceNotes') > 1000
  then return false; end if;

  for v_service in select value from jsonb_array_elements(p_value -> 'services')
  loop
    if jsonb_typeof(v_service) <> 'string'
      or v_service #>> '{}' not in (
        'brand-adaptation', 'content-workshop', 'guest-import',
        'host-runbook', 'wedding-day-support', 'archive-export'
      )
    then return false; end if;
  end loop;

  if (
    select count(*) from jsonb_array_elements_text(p_value -> 'services') service(value)
  ) <> (
    select count(distinct value) from jsonb_array_elements_text(p_value -> 'services') service(value)
  ) then return false; end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.platform_delivery_scope_is_valid(jsonb) from public, anon, authenticated;

alter table public.platform_projects
  add column delivery_scope jsonb not null default jsonb_build_object(
    'customizationLevel', 'guided',
    'supportMode', 'remote_guided',
    'rehearsalMode', 'full_rehearsal',
    'services', jsonb_build_array('brand-adaptation', 'content-workshop', 'host-runbook', 'archive-export'),
    'serviceNotes', ''
  );

alter table public.platform_projects
  add constraint platform_projects_delivery_scope_check
  check (public.platform_delivery_scope_is_valid(delivery_scope));

create or replace function public.platform_enrich_project_version_delivery_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not (new.snapshot ? 'delivery_scope') then
    new.snapshot := new.snapshot || jsonb_build_object(
      'delivery_scope', (select p.delivery_scope from public.platform_projects p where p.id = new.project_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.platform_enrich_project_version_delivery_scope() from public, anon, authenticated;

create trigger platform_project_versions_delivery_scope
before insert on public.platform_project_versions
for each row execute function public.platform_enrich_project_version_delivery_scope();

create or replace function public.platform_save_customized_project_draft_v5(
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
  p_delivery_scope jsonb
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
  if p_event_key is null or not public.platform_delivery_scope_is_valid(p_delivery_scope) then
    raise exception 'platform_project_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-save-v5:' || v_actor::text || ':' || p_event_key::text, 0));
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
      p.delivery_scope, p.current_version, p.updated_at
      from public.platform_projects p where p.id = v_receipt_project_id;
    return;
  end if;

  select saved.id, saved.current_version into v_project_id, v_version
  from public.platform_save_customized_project_draft_v4(
    p_event_key, p_project_id, p_source_draft_id, p_template_id, p_template_version,
    p_plan_id, p_partner_one, p_partner_two, p_wedding_date, p_location,
    p_guest_count, p_theme_id, p_tone_id, p_modules, p_story_note, p_content_brief,
    p_template_content
  ) saved;

  update public.platform_projects p set delivery_scope = p_delivery_scope
  where p.id = v_project_id;
  update public.platform_project_versions version set
    snapshot = version.snapshot || jsonb_build_object('delivery_scope', p_delivery_scope)
  where version.project_id = v_project_id and version.version = v_version;

  return query select p.id, p.source_draft_id, p.status, p.template_id, p.template_version,
    p.plan_id, p.partner_one, p.partner_two, p.wedding_date, p.location, p.guest_count,
    p.theme_id, p.tone_id, p.modules, p.story_note, p.content_brief, p.template_content,
    p.delivery_scope, p.current_version, p.updated_at
    from public.platform_projects p where p.id = v_project_id;
end;
$$;

revoke all on function public.platform_save_customized_project_draft_v5(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.platform_save_customized_project_draft_v5(uuid, uuid, uuid, text, text, text, text, text, date, text, integer, text, text, text[], text, jsonb, jsonb, jsonb) to authenticated;

commit;
