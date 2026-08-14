-- A signed Storage upload can finish after both reset cleanup scans.  Reconcile
-- any object outside the current run namespace into the durable cleanup record,
-- close registration, and make every registration read/write fail closed until
-- the operator retries cleanup.  Exact current-run paths are never backlogged.

begin;

create or replace function assert_rehearsal_storage_ready()
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_run_id uuid;
begin
  -- The shared transaction lock remains held after this helper returns, so the
  -- guarded registration RPC cannot overlap the reset that rotates run_id.
  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  select rehearsal_run_id into v_run_id from game_state where id=1 for share;
  if not found or v_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;
  if exists(
    select 1 from rehearsal_resets
    where cardinality(evidence_paths)>0 or cardinality(avatar_paths)>0
  ) or not rehearsal_storage_namespace_clean(v_run_id) then
    raise exception using errcode='P0001',message='rehearsal_storage_cleanup_pending';
  end if;
end;
$$;

create or replace function reconcile_rehearsal_storage_backlog(
  p_actor text
) returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_state game_state%rowtype;
  v_reset rehearsal_resets%rowtype;
  v_event_key uuid;
  v_evidence_paths text[]:='{}'::text[];
  v_avatar_paths text[]:='{}'::text[];
  v_merged_evidence text[]:='{}'::text[];
  v_merged_avatars text[]:='{}'::text[];
  v_new_evidence integer:=0;
  v_new_avatars integer:=0;
  v_registration_was_open boolean:=false;
begin
  if nullif(trim(coalesce(p_actor,'')),'') is null then
    raise exception using errcode='22023',message='actor_required';
  end if;

  perform pg_advisory_xact_lock_shared(hashtext('wedding-rehearsal-reset-v1'));
  select * into v_state from game_state where id=1 for update;
  if not found or v_state.rehearsal_run_id is null then
    raise exception using errcode='P0002',message='game_state_not_found';
  end if;

  select coalesce(array_agg(o.name order by o.name),'{}'::text[])
  into v_evidence_paths
  from storage.objects o
  where o.bucket_id='task-evidence'
    and o.name !~ ('^[0-9a-f-]{36}/'||v_state.rehearsal_run_id::text||'/[0-9a-f-]{36}[.]jpg$');

  select coalesce(array_agg(o.name order by o.name),'{}'::text[])
  into v_avatar_paths
  from storage.objects o
  where o.bucket_id='guest-avatars'
    and o.name !~ ('^[0-9a-f-]{36}/'||v_state.rehearsal_run_id::text||'[.]jpg$');

  if cardinality(v_evidence_paths)=0 and cardinality(v_avatar_paths)=0 then
    return jsonb_build_object(
      'pending',false,'event_key',null,
      'evidence_count',0,'avatar_count',0,
      'new_evidence_count',0,'new_avatar_count',0,
      'registration_closed',false
    );
  end if;

  select * into v_reset
  from rehearsal_resets
  order by created_at desc,id desc
  limit 1
  for update;

  if not found then
    -- Never synthesize a rehearsal_resets insert here: that table has a reset
    -- trigger which intentionally clears avatar pointers. Without a genuine
    -- reset record there is no safe automatic deletion target, so close the
    -- public entry point, expose an untracked backlog, and preserve every
    -- current-run database pointer for operator review.
    v_registration_was_open:=v_state.registration_open;
    if v_registration_was_open then
      update game_state set registration_open=false,updated_at=now() where id=1;
    end if;
    insert into audit_log(actor,action,target_type,target_id,details)
    values(trim(p_actor),'rehearsal.late_storage_untracked','game_state','1',
      jsonb_build_object(
        'evidence',cardinality(v_evidence_paths),
        'avatars',cardinality(v_avatar_paths),
        'registration_closed',v_registration_was_open,
        'current_run_preserved',v_state.rehearsal_run_id
      ));
    return jsonb_build_object(
      'pending',true,'event_key',null,
      'evidence_count',cardinality(v_evidence_paths),
      'avatar_count',cardinality(v_avatar_paths),
      'new_evidence_count',cardinality(v_evidence_paths),
      'new_avatar_count',cardinality(v_avatar_paths),
      'registration_closed',v_registration_was_open,
      'untracked_without_reset',true
    );
  else
    v_event_key:=v_reset.event_key;
    select coalesce(array_agg(distinct p order by p),'{}'::text[])
    into v_merged_evidence
    from unnest(coalesce(v_reset.evidence_paths,'{}'::text[])||v_evidence_paths) as p;
    select coalesce(array_agg(distinct p order by p),'{}'::text[])
    into v_merged_avatars
    from unnest(coalesce(v_reset.avatar_paths,'{}'::text[])||v_avatar_paths) as p;
    select count(*)::integer into v_new_evidence
    from unnest(v_evidence_paths) as p
    where not (p=any(coalesce(v_reset.evidence_paths,'{}'::text[])));
    select count(*)::integer into v_new_avatars
    from unnest(v_avatar_paths) as p
    where not (p=any(coalesce(v_reset.avatar_paths,'{}'::text[])));
    update rehearsal_resets
    set evidence_paths=v_merged_evidence,avatar_paths=v_merged_avatars
    where id=v_reset.id;
  end if;

  v_registration_was_open:=v_state.registration_open;
  if v_registration_was_open then
    update game_state set registration_open=false,updated_at=now() where id=1;
  end if;

  if v_new_evidence>0 or v_new_avatars>0 or v_registration_was_open then
    insert into audit_log(actor,action,target_type,target_id,details)
    values(trim(p_actor),'rehearsal.late_storage_reconciled','rehearsal_reset',v_event_key::text,
      jsonb_build_object(
        'new_evidence',v_new_evidence,
        'new_avatars',v_new_avatars,
        'pending_evidence',cardinality(v_merged_evidence),
        'pending_avatars',cardinality(v_merged_avatars),
        'registration_closed',v_registration_was_open,
        'current_run_preserved',v_state.rehearsal_run_id
      ));
  end if;

  return jsonb_build_object(
    'pending',true,'event_key',v_event_key,
    'evidence_count',cardinality(v_merged_evidence),
    'avatar_count',cardinality(v_merged_avatars),
    'new_evidence_count',v_new_evidence,
    'new_avatar_count',v_new_avatars,
    'registration_closed',v_registration_was_open
  );
end;
$$;

-- Preserve the current registration implementations behind server-internal
-- names, then add the Storage safety gate without duplicating authentication,
-- throttling, invitation-code, or returning-login behavior.
alter function registration_guest_list(text)
  rename to registration_guest_list_before_storage_guard;
revoke all on function registration_guest_list_before_storage_guard(text)
  from public,anon,authenticated,service_role;
create function registration_guest_list(p_invitation_code text)
returns table(id uuid,name text,team text,claimed boolean)
language plpgsql
security definer
set search_path=public
as $$
begin
  perform assert_rehearsal_storage_ready();
  return query
  select * from registration_guest_list_before_storage_guard(p_invitation_code);
end;
$$;

alter function claim_guest_by_login(text,text,text,text,timestamptz,text)
  rename to claim_guest_by_login_before_storage_guard;
revoke all on function claim_guest_by_login_before_storage_guard(text,text,text,text,timestamptz,text)
  from public,anon,authenticated,service_role;
create function claim_guest_by_login(
  p_invitation_code text,
  p_login_name text,
  p_claim_code text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_attempt_key text
) returns table(
  guest_id uuid,
  guest_name text,
  account_created boolean,
  auth_status text,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path=public
as $$
begin
  perform assert_rehearsal_storage_ready();
  return query
  select * from claim_guest_by_login_before_storage_guard(
    p_invitation_code,p_login_name,p_claim_code,p_token_hash,p_expires_at,p_attempt_key
  );
end;
$$;

revoke all on function assert_rehearsal_storage_ready()
  from public,anon,authenticated,service_role;
revoke all on function reconcile_rehearsal_storage_backlog(text)
  from public,anon,authenticated;
revoke all on function registration_guest_list(text)
  from public,anon,authenticated;
revoke all on function claim_guest_by_login(text,text,text,text,timestamptz,text)
  from public,anon,authenticated;

grant execute on function reconcile_rehearsal_storage_backlog(text) to service_role;
grant execute on function registration_guest_list(text) to service_role;
grant execute on function claim_guest_by_login(text,text,text,text,timestamptz,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608130020','rehearsal.late_storage_guard_enabled','game_state','1',jsonb_build_object(
  'registration_list_guarded',true,
  'registration_claim_guarded',true,
  'admin_reconciliation_rpc',true,
  'current_run_objects_preserved',true
));

commit;
