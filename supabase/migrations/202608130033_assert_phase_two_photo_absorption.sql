-- Make the official first-act-photo absorption invariant explicit.  The
-- current catalog has three ordinary competitive photo assignments: Yirui's
-- reserved P1-SOCIAL-001 plus two random social photos.  Yirui is consumed by
-- DINNER_SPEECH before ability allocation, so only two photo holders can
-- remain.  One EXTRA_VOTE per team, followed by the globally selected
-- SUPER_LUCKY, absorbs those two holders for every reachable team split.
--
-- 032 already made EXTRA_VOTE team-safe. This migration adds fail-closed,
-- named checks around that proof so catalog drift or unexpected historical
-- assignments can no longer surface later as a misleading generic coverage
-- error. No current profile, assignment, task, score, clue, vote, or guest row
-- is modified.

begin;

do $allocator_guard_patch$
declare
  v_definition text;
  v_updated text;
  v_next text;
begin
  select pg_get_functiondef(
    'public.unlock_phase_two_missions_assignments_v1(text)'::regprocedure
  ) into v_definition;

  v_updated:=replace(
    v_definition,
    $old$  if not found then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable';
  end if;

  -- The relationship outcome, not a profile preset or any previous browser$old$,
    $new$  if not found then
    raise exception using errcode='P0001',message='phase_two_yirui_speech_unavailable';
  end if;

  -- The formal first act has exactly three ordinary competitive photo
  -- assignments. Yirui owns one and has just been absorbed by DINNER_SPEECH,
  -- leaving at most two for the three ability slots below.
  if not exists(
      select 1 from assignments a
      join tasks t on t.id=a.task_id
      join guests g on g.id=a.guest_id
      where a.is_initial and g.active and g.phase_two_eligible
        and lower(g.login_name)='yirui zhang'
        and t.mission_code='P1-SOCIAL-001'
    ) or (select count(*) from assignments a
      join tasks t on t.id=a.task_id
      join guests g on g.id=a.guest_id
      where a.is_initial and g.active and g.phase_two_eligible and g.role='guest'
        and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002'))<>3 then
    raise exception using errcode='P0001',message='phase_two_first_act_photo_contract_invalid';
  end if;

  -- The relationship outcome, not a profile preset or any previous browser$new$
  );
  if v_updated=v_definition
      or position($needle$phase_two_first_act_photo_contract_invalid$needle$ in v_updated)=0 then
    raise exception using errcode='P0001',message='phase_two_photo_contract_guard_patch_failed';
  end if;

  v_next:=replace(
    v_updated,
    $old$  if not found then
    raise exception using errcode='P0001',message='phase_two_lucky_unavailable';
  end if;

  -- The four photography missions are assigned only to the remaining players$old$,
    $new$  if not found then
    raise exception using errcode='P0001',message='phase_two_lucky_unavailable';
  end if;

  -- EXTRA_VOTE prefers a photo holder inside each team and SUPER_LUCKY then
  -- prefers any photo holder globally. Given the three-photo contract above
  -- and Yirui's fixed profile, no first-act photographer may remain.
  if exists(
    select 1 from guests g
    where g.active and g.uses_app and g.participation_mode='ACTIVE_PLAYER'
      and g.phase_two_eligible and g.drawn_at is not null and not g.is_hidden_spy
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
      and exists(
        select 1 from assignments a join tasks t on t.id=a.task_id
        where a.guest_id=g.id and a.is_initial
          and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')
      )
  ) then
    raise exception using errcode='P0001',message='phase_two_photo_absorption_incomplete';
  end if;

  -- The four photography missions are assigned only to the remaining players$new$
  );
  if v_next=v_updated
      or position($needle$phase_two_photo_absorption_incomplete$needle$ in v_next)=0 then
    raise exception using errcode='P0001',message='phase_two_photo_absorption_guard_patch_failed';
  end if;

  execute v_next;
end;
$allocator_guard_patch$;

-- CREATE OR REPLACE preserves the intentionally private execution boundary,
-- but state it again so the migration remains self-auditing.
revoke all on function unlock_phase_two_missions_assignments_v1(text)
  from public,anon,authenticated,service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values(
  'migration:202608130033',
  'phase_two.photo_absorption_invariant_guarded',
  'game_state',
  '1',
  jsonb_build_object(
    'ordinary_first_act_photo_count',3,
    'fixed_speech_photo_absorbed_first',true,
    'remaining_photo_upper_bound',2,
    'team_extra_vote_slots',2,
    'global_lucky_slots',1,
    'current_runtime_rows_untouched',true
  )
);

commit;
