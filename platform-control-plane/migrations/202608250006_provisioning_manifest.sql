begin;

create table public.platform_provisioning_manifests (
  project_id uuid primary key references public.platform_projects(id) on delete cascade,
  project_version integer not null check (project_version > 0),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  manifest_hash text not null check (manifest_hash ~ '^[0-9a-f]{64}$'),
  locked_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, project_version)
);

alter table public.platform_provisioning_manifests enable row level security;

create policy platform_provisioning_manifests_staff_select
  on public.platform_provisioning_manifests for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_provisioning_manifests from public, anon;
revoke insert, update, delete on public.platform_provisioning_manifests from authenticated;
grant select (project_id, project_version, manifest, manifest_hash, created_at)
  on public.platform_provisioning_manifests to authenticated;

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
    if v_receipt_action <> 'manifest_lock' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select m.project_id, m.project_version, m.manifest, m.manifest_hash, m.created_at
      from public.platform_provisioning_manifests m where m.project_id = p_project_id;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-manifest:' || p_project_id::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> 'manifest_lock' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    return query select m.project_id, m.project_version, m.manifest, m.manifest_hash, m.created_at
      from public.platform_provisioning_manifests m where m.project_id = p_project_id;
    return;
  end if;

  select p.* into v_project from public.platform_projects p
  where p.id = p_project_id for update;
  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if v_project.status <> 'provisioning' then raise exception 'platform_manifest_locked'; end if;

  select review.decision, review.project_version
  into v_latest_decision, v_latest_review_version
  from public.platform_project_reviews review
  where review.project_id = p_project_id
  order by review.review_round desc limit 1;
  if v_latest_decision <> 'approved' or v_latest_review_version <> v_project.current_version then
    raise exception 'platform_manifest_not_ready';
  end if;

  select version.snapshot into v_snapshot
  from public.platform_project_versions version
  where version.project_id = p_project_id and version.version = v_project.current_version;
  if v_snapshot is null
    or v_snapshot ->> 'status' <> 'provisioning'
    or v_snapshot #>> '{review,decision}' <> 'approved'
    or btrim(coalesce(v_snapshot ->> 'partner_one', '')) = ''
    or btrim(coalesce(v_snapshot ->> 'partner_two', '')) = ''
    or coalesce(v_snapshot ->> 'wedding_date', '') = ''
    or btrim(coalesce(v_snapshot ->> 'location', '')) = ''
    or jsonb_typeof(v_snapshot -> 'modules') <> 'array'
    or jsonb_array_length(v_snapshot -> 'modules') = 0
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
      'guestMix', v_snapshot #>> '{content_brief,guestMix}'
    ),
    'delivery', jsonb_build_object('plan', v_snapshot ->> 'plan_id'),
    'safeguards', jsonb_build_object(
      'containsGuestRuntimeData', false,
      'containsCredentials', false,
      'containsPrivateStoryNotes', false
    )
  );
  if to_regprocedure('extensions.digest(bytea,text)') is not null then
    execute 'select encode(extensions.digest($1, $2), $3)'
      into v_manifest.manifest_hash
      using convert_to(v_manifest.manifest::text, 'UTF8'), 'sha256', 'hex';
  elsif to_regprocedure('digest(bytea,text)') is not null then
    execute 'select encode(digest($1, $2), $3)'
      into v_manifest.manifest_hash
      using convert_to(v_manifest.manifest::text, 'UTF8'), 'sha256', 'hex';
  elsif to_regprocedure('sha256(bytea)') is not null then
    execute 'select encode(sha256($1), $2)'
      into v_manifest.manifest_hash
      using convert_to(v_manifest.manifest::text, 'UTF8'), 'hex';
  else
    raise exception 'platform_manifest_hash_unavailable';
  end if;

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
