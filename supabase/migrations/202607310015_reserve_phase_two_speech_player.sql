-- Yirui Zhang has the fixed act-two dinner speech. Reserve this player from
-- the trickster and relationship-role pools, and reserve one competitive
-- first-meeting photo slot so the act-two profile remains mutually exclusive.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef('public.draw_guest_card(uuid)'::regprocedure) into v_definition;
  v_updated:=replace(v_definition,
    $q$if v_guest.team='家人组' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role or v_guest.role_locked then$q$,
    $q$if v_guest.team='家人组' or lower(v_guest.login_name)='yirui zhang' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role or v_guest.role_locked then$q$);
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='speech_player_role_reservation_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(v_definition,
    $q$elsif lower(v_guest.login_name) in('feifei xie','luyi sun') then
    select * into v_task from tasks where active and not is_demo and mission_code='P1-BONUS-001' limit 1;$q$,
    $q$elsif lower(v_guest.login_name)='yirui zhang' then
    select * into v_task from tasks where active and not is_demo and mission_code='P1-SOCIAL-001' limit 1;
  elsif lower(v_guest.login_name) in('feifei xie','luyi sun') then
    select * into v_task from tasks where active and not is_demo and mission_code='P1-BONUS-001' limit 1;$q$);
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='speech_player_task_reservation_patch_failed';
  end if;
  v_definition:=v_updated;

  v_updated:=replace(v_definition,
    $q$case when t.mission_code='P1-SOCIAL-001' then 2 else 1 end)$q$,
    $q$case when t.mission_code='P1-SOCIAL-001' then
            case when exists(select 1 from guests speech_player where speech_player.active
              and speech_player.phase_two_eligible and speech_player.drawn_at is null
              and lower(speech_player.login_name)='yirui zhang') then 1 else 2 end
          else 1 end)$q$);
  if v_updated=v_definition then
    raise exception using errcode='P0001',message='speech_player_photo_slot_patch_failed';
  end if;
  if position($q$lower(v_guest.login_name)='yirui zhang'$q$ in v_updated)=0
      or position($q$speech_player.phase_two_eligible$q$ in v_updated)=0 then
    raise exception using errcode='P0001',message='speech_player_reservation_incomplete';
  end if;
  execute v_updated;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607310015','phase_two.speech_player_reserved','game_state','1',jsonb_build_object(
  'fixed_speech_player','Yirui Zhang','first_act_task','P1-SOCIAL-001',
  'relationship_role_excluded',true,'trickster_excluded',true,'existing_draws_preserved',true));

commit;
