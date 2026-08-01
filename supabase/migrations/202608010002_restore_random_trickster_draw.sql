-- Keep fixed teams without accidentally fixing every competitive player as a guest.
-- A locked spy remains a deliberate preset; selecting the default guest option means
-- that the role is decided by the transactional draw function.
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
  if p_role='spy' and exists(select 1 from guests g where g.id<>p_guest_id and g.active and g.phase_two_eligible
      and g.team=trim(p_team) and g.role='spy' and not g.is_hidden_spy and (g.drawn_at is not null or g.role_locked)) then
    raise exception using errcode='P0001',message='preset_spy_team_conflict';
  end if;
  update guests set team=trim(p_team),role=p_role,team_locked=true,role_locked=(p_role='spy') where id=p_guest_id;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'guest.profile_configure','guest',p_guest_id::text,jsonb_build_object(
    'team',trim(p_team),'role',p_role,'team_locked',true,'role_locked',p_role='spy'));
end; $$;

-- Repair the undrawn production roster created by the former combined lock.
update guests
set role_locked=false
where active and phase_two_eligible and drawn_at is null and role='guest' and role_locked;

-- Remove only unmistakable rehearsal placeholders. Real clues and all granted clue
-- history remain untouched.
with removed as (
  delete from clues c
  where not exists(select 1 from guest_clues gc where gc.clue_id=c.id)
    and (
      (c.title='11' and c.content='1111')
      or (c.title='22' and c.content='2222')
      or (c.title='33' and c.content='3333')
      or (c.title='任务线索' and c.content='间谍是人')
    )
  returning id
)
insert into audit_log(actor,action,target_type,target_id,details)
select 'migration:202608010002','rehearsal.placeholder_clues_removed','clues','batch',
  jsonb_build_object('count',count(*)) from removed;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608010002','guest.random_trickster_draw_restored','game_state','1',
  jsonb_build_object('teams_preserved',true,'preset_spies_preserved',true,'default_roles_unlocked',true));
