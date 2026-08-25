begin;

create or replace function public.platform_reject_archived_project_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_project_status text;
begin
  select project.status into v_project_status
  from public.platform_projects project
  where project.id = new.project_id
  for key share;
  if v_project_status = 'archived' then raise exception 'platform_project_archived'; end if;
  return new;
end;
$$;

revoke all on function public.platform_reject_archived_project_invitation()
  from public, anon, authenticated;

create trigger platform_project_invitations_block_archived
before insert on public.platform_project_invitations
for each row execute function public.platform_reject_archived_project_invitation();

create or replace function public.platform_set_draft_project_archive_state(
  p_event_key uuid,
  p_project_id uuid,
  p_action text,
  p_confirmed boolean
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
  v_entitlement_status text;
  v_expected_status text;
  v_next_status text;
  v_expected_receipt_action text;
  v_receipt_project_id uuid;
  v_receipt_action text;
  v_revoked_invitation_count integer := 0;
begin
  if v_actor is null then raise exception 'platform_auth_required'; end if;
  if p_event_key is null or p_project_id is null or p_confirmed is not true
    or p_action not in ('archive', 'restore')
  then raise exception 'platform_project_archive_invalid'; end if;

  v_expected_status := case p_action when 'archive' then 'draft' else 'archived' end;
  v_next_status := case p_action when 'archive' then 'archived' else 'draft' end;
  v_expected_receipt_action := 'project_' || p_action;

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> v_expected_receipt_action or v_receipt_project_id <> p_project_id
    then raise exception 'platform_event_conflict'; end if;
    return query select project.id, project.status, project.current_version, project.updated_at
    from public.platform_projects project
    where project.id = p_project_id and project.owner_user_id = v_actor;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('platform-project-archive:' || p_project_id::text, 0));

  select receipt.project_id, receipt.action into v_receipt_project_id, v_receipt_action
  from public.platform_mutation_receipts receipt
  where receipt.actor_user_id = v_actor and receipt.event_key = p_event_key;
  if v_receipt_project_id is not null then
    if v_receipt_action <> v_expected_receipt_action or v_receipt_project_id <> p_project_id
    then raise exception 'platform_event_conflict'; end if;
    return query select project.id, project.status, project.current_version, project.updated_at
    from public.platform_projects project
    where project.id = p_project_id and project.owner_user_id = v_actor;
    return;
  end if;

  select project.* into v_project
  from public.platform_projects project
  where project.id = p_project_id and project.owner_user_id = v_actor
  for update;
  if v_project.id is null then raise exception 'platform_project_not_owned'; end if;
  if v_project.status <> v_expected_status then raise exception 'platform_project_archive_locked'; end if;

  select entitlement.status into v_entitlement_status
  from public.platform_entitlements entitlement
  where entitlement.project_id = p_project_id;
  if v_entitlement_status is distinct from 'pending'
  then raise exception 'platform_project_archive_entitled'; end if;
  if exists (
    select 1 from public.platform_runtime_instances instance
    where instance.project_id = p_project_id
  ) then raise exception 'platform_project_archive_runtime_exists'; end if;

  if p_action = 'archive' then
    update public.platform_project_invitations invitation set revoked_at = now()
    where invitation.project_id = p_project_id
      and invitation.accepted_at is null and invitation.revoked_at is null;
    get diagnostics v_revoked_invitation_count = row_count;

    with stale_requests as (
      update public.platform_commercial_quote_requests request set
        status = 'superseded',
        superseded_at = now()
      where request.project_id = p_project_id and request.status = 'requested'
      returning request.id
    )
    update public.platform_commercial_quotes quote set
      status = 'superseded',
      closed_at = now()
    where quote.quote_request_id in (select stale.id from stale_requests stale)
      and quote.status = 'offered';
  end if;

  update public.platform_projects project set
    status = v_next_status,
    updated_at = now()
  where project.id = p_project_id
  returning project.* into v_project;

  insert into public.platform_audit_log (project_id, actor_user_id, action, target_version, metadata)
  values (
    p_project_id, v_actor, v_expected_receipt_action, v_project.current_version,
    jsonb_build_object(
      'event_key', p_event_key,
      'from_status', v_expected_status,
      'to_status', v_next_status,
      'revoked_invitation_count', v_revoked_invitation_count,
      'deletes_project_data', false
    )
  );
  insert into public.platform_mutation_receipts (actor_user_id, event_key, project_id, action)
  values (v_actor, p_event_key, p_project_id, v_expected_receipt_action);

  return query select v_project.id, v_project.status, v_project.current_version, v_project.updated_at;
end;
$$;

revoke all on function public.platform_set_draft_project_archive_state(uuid, uuid, text, boolean)
  from public, anon;
grant execute on function public.platform_set_draft_project_archive_state(uuid, uuid, text, boolean)
  to authenticated;

commit;
