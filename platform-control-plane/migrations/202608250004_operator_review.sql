begin;

alter table public.platform_project_versions
  drop constraint platform_project_versions_actor_user_id_fkey;
alter table public.platform_project_versions
  alter column actor_user_id drop not null;
alter table public.platform_project_versions
  add constraint platform_project_versions_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;

alter table public.platform_audit_log
  drop constraint platform_audit_log_actor_user_id_fkey;
alter table public.platform_audit_log
  alter column actor_user_id drop not null;
alter table public.platform_audit_log
  add constraint platform_audit_log_actor_user_id_fkey
  foreign key (actor_user_id) references auth.users(id) on delete set null;

create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('operator', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_staff enable row level security;

create policy platform_staff_self_select
  on public.platform_staff for select to authenticated
  using (user_id = auth.uid() and active);

revoke all on public.platform_staff from public, anon;
revoke insert, update, delete on public.platform_staff from authenticated;
grant select on public.platform_staff to authenticated;

create or replace function public.platform_is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.active
  )
$$;

revoke all on function public.platform_is_staff() from public;
revoke all on function public.platform_is_staff() from anon;
grant execute on function public.platform_is_staff() to authenticated;

create policy platform_projects_staff_select
  on public.platform_projects for select to authenticated
  using (public.platform_is_staff());

create policy platform_versions_staff_select
  on public.platform_project_versions for select to authenticated
  using (public.platform_is_staff());

create policy platform_entitlements_staff_select
  on public.platform_entitlements for select to authenticated
  using (public.platform_is_staff());

create policy platform_audit_staff_select
  on public.platform_audit_log for select to authenticated
  using (public.platform_is_staff());

create table public.platform_project_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.platform_projects(id) on delete cascade,
  review_round integer not null check (review_round > 0),
  project_version integer not null check (project_version > 0),
  reviewer_user_id uuid references auth.users(id) on delete set null,
  event_key uuid not null,
  decision text not null check (decision in ('approved', 'changes_requested')),
  resulting_status text not null check (resulting_status in ('draft', 'provisioning')),
  note text not null default '' check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (project_id, review_round),
  unique (reviewer_user_id, event_key),
  check (decision <> 'changes_requested' or btrim(note) <> '')
);

create index platform_project_reviews_project_created_idx
  on public.platform_project_reviews (project_id, created_at desc);

alter table public.platform_project_reviews enable row level security;

create policy platform_project_reviews_owner_select
  on public.platform_project_reviews for select to authenticated
  using (exists (
    select 1 from public.platform_projects p
    where p.id = platform_project_reviews.project_id and p.owner_user_id = auth.uid()
  ));

create policy platform_project_reviews_staff_select
  on public.platform_project_reviews for select to authenticated
  using (public.platform_is_staff());

revoke all on public.platform_project_reviews from public, anon;
revoke insert, update, delete on public.platform_project_reviews from authenticated;
grant select on public.platform_project_reviews to authenticated;

create or replace function public.platform_review_project(
  p_event_key uuid,
  p_project_id uuid,
  p_decision text,
  p_note text
)
returns table (
  id uuid,
  status text,
  current_version integer,
  review_id uuid,
  decision text,
  note text,
  reviewed_at timestamptz
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
  v_review public.platform_project_reviews%rowtype;
  v_review_round integer;
  v_next_version integer;
  v_next_status text;
  v_reason text;
  v_snapshot jsonb;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if not public.platform_is_staff() then raise exception 'platform_staff_required'; end if;
  if p_event_key is null or p_project_id is null
    or p_decision is null or p_decision not in ('approved', 'changes_requested')
    or char_length(v_note) > 2000
    or (p_decision = 'changes_requested' and v_note = '')
  then
    raise exception 'platform_review_invalid';
  end if;

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_receipt_project_id is not null then
    if v_receipt_action <> 'operator_review' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select review.* into v_review
    from public.platform_project_reviews review
    where review.reviewer_user_id = v_actor and review.event_key = p_event_key;
    return query select v_review.project_id, v_review.resulting_status, v_review.project_version,
      v_review.id, v_review.decision, v_review.note, v_review.created_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-review:' || p_project_id::text, 0));

  select r.project_id, r.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts r
  where r.actor_user_id = v_actor and r.event_key = p_event_key;

  if v_receipt_project_id is not null then
    if v_receipt_action <> 'operator_review' or v_receipt_project_id <> p_project_id then
      raise exception 'platform_event_conflict';
    end if;
    select review.* into v_review
    from public.platform_project_reviews review
    where review.reviewer_user_id = v_actor and review.event_key = p_event_key;
    return query select v_review.project_id, v_review.resulting_status, v_review.project_version,
      v_review.id, v_review.decision, v_review.note, v_review.created_at;
    return;
  end if;

  select p.* into v_project
  from public.platform_projects p
  where p.id = p_project_id
  for update;

  if v_project.id is null then raise exception 'platform_project_not_found'; end if;
  if v_project.status <> 'content_review' then raise exception 'platform_project_locked'; end if;

  select coalesce(max(review.review_round), 0) + 1 into v_review_round
  from public.platform_project_reviews review
  where review.project_id = v_project.id;

  v_next_status := case when p_decision = 'approved' then 'provisioning' else 'draft' end;
  v_reason := case when p_decision = 'approved' then 'provisioning' else 'content_review' end;

  update public.platform_projects p set
    status = v_next_status,
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
    'content_brief', p.content_brief,
    'review', jsonb_build_object('decision', p_decision, 'note', v_note, 'round', v_review_round)
  ) into v_snapshot
  from public.platform_projects p where p.id = v_project.id;

  insert into public.platform_project_versions (project_id, version, actor_user_id, snapshot, reason)
  values (v_project.id, v_next_version, v_actor, v_snapshot, v_reason);

  insert into public.platform_project_reviews (
    project_id, review_round, project_version, reviewer_user_id,
    event_key, decision, resulting_status, note
  ) values (
    v_project.id, v_review_round, v_next_version, v_actor,
    p_event_key, p_decision, v_next_status, v_note
  ) returning * into v_review;

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    v_project.id,
    v_actor,
    case when p_decision = 'approved' then 'project_review_approved' else 'project_review_changes_requested' end,
    v_next_version,
    jsonb_build_object('event_key', p_event_key, 'review_id', v_review.id, 'review_round', v_review_round)
  );

  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, v_project.id, 'operator_review');

  return query select v_project.id, v_next_status, v_next_version,
    v_review.id, v_review.decision, v_review.note, v_review.created_at;
end;
$$;

revoke all on function public.platform_review_project(uuid, uuid, text, text) from public;
revoke all on function public.platform_review_project(uuid, uuid, text, text) from anon;
grant execute on function public.platform_review_project(uuid, uuid, text, text) to authenticated;

commit;
