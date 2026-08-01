-- Restore the organizer-approved fixed ceremony cast after the random-trickster
-- roster repair unlocked every competitive guest role.  Only undrawn cards are
-- changed so an in-progress wedding is never rewritten by this migration.

begin;

update guests
set story_role='OFFICIANT',ceremony_eligible=true,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='yifan yu';

update guests
set story_role='GROOM_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='siran li';

update guests
set story_role='BRIDE_CHEERLEADER',ceremony_eligible=true,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name)='moshuang xu';

-- The two lucky-star cards are ordinary-role presets.  They must remain outside
-- the random trickster pool even though their story_role is intentionally NONE.
update guests
set story_role='NONE',ceremony_eligible=false,role='guest',role_locked=true,
  eligible_for_secret_role=false
where drawn_at is null and lower(login_name) in('feifei xie','luyi sun');

create or replace function configure_guest_game_profile(p_guest_id uuid,p_team text,p_role text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_guest guests%rowtype;
begin
  if trim(p_team) not in ('海岛组','沙漠组') then raise exception using errcode='22023',message='invalid_team'; end if;
  if p_role not in ('guest','spy') then raise exception using errcode='22023',message='invalid_role'; end if;
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v4'));
  select * into v_guest from guests where id=p_guest_id for update;
  if not found then raise exception using errcode='P0002',message='guest_not_found'; end if;
  if v_guest.drawn_at is not null then raise exception using errcode='P0001',message='guest_card_already_drawn'; end if;
  if not v_guest.phase_two_eligible then raise exception using errcode='P0001',message='phase_two_guest_ineligible'; end if;
  if p_role='spy' and (v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role) then
    raise exception using errcode='P0001',message='fixed_story_role_conflict';
  end if;
  if p_role='spy' and exists(select 1 from guests g where g.id<>p_guest_id and g.active and g.phase_two_eligible
      and g.team=trim(p_team) and g.role='spy' and not g.is_hidden_spy and (g.drawn_at is not null or g.role_locked)) then
    raise exception using errcode='P0001',message='preset_spy_team_conflict';
  end if;
  update guests set team=trim(p_team),role=p_role,team_locked=true,
    role_locked=(p_role='spy' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role)
  where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.profile_configure','guest',p_guest_id::text,jsonb_build_object(
    'team',trim(p_team),'role',p_role,'team_locked',true,
    'role_locked',p_role='spy' or v_guest.story_role<>'NONE' or not v_guest.eligible_for_secret_role));
end; $$;

revoke all on function configure_guest_game_profile(uuid,text,text,text) from public,anon,authenticated;
grant execute on function configure_guest_game_profile(uuid,text,text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608010003','phase_one.fixed_ceremony_cast_restored','game_state','1',jsonb_build_object(
  'fixed_officiant','Yifan Yu','fixed_groom_cheerleader','Siran Li',
  'fixed_bride_cheerleader','Moshuang Xu','fixed_lucky_stars',jsonb_build_array('Feifei Xie','Luyi Sun'),
  'undrawn_only',true,'completed_draws_preserved',true));

commit;
