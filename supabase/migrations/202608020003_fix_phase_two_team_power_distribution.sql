-- Guarantee one double-vote power card per competitive team while preserving
-- the rule that first-round photo recipients are preferred for non-photo cards.
-- Existing unlocked rounds are not replayed or rewritten.

begin;

do $migration$
declare
  v_definition text;
  v_updated text;
  v_old_block text:=$old$
  -- The three non-photo power cards absorb prior photo recipients first.
  with candidates as(
    select g.id,row_number() over(order by exists(
      select 1 from assignments a join tasks t on t.id=a.task_id where a.guest_id=g.id
        and a.is_initial and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')) desc,random()) n
    from guests g where g.active and g.phase_two_eligible and g.drawn_at is not null
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id) limit 2)
  insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
  select g.id,g.team,'EXTRA_VOTE',true,false,false,'',g.points,now() from candidates c join guests g on g.id=c.id;
  if (select count(*) from phase_two_profiles where primary_mission='EXTRA_VOTE')<>2 then
    raise exception using errcode='P0001',message='phase_two_extra_vote_unavailable';
  end if;
$old$;
  v_new_block text:=$new$
  -- Reserve one double-vote card per team. Within each team, prefer a player
  -- who had a first-round photo task so that their second-round card is not
  -- another photo task.
  foreach v_team in array array['海岛组','沙漠组'] loop
    insert into phase_two_profiles(guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,phase_one_points_snapshot,updated_at)
    select g.id,g.team,'EXTRA_VOTE',true,false,false,'',g.points,now() from guests g
    where g.active and g.phase_two_eligible and g.drawn_at is not null and g.team=v_team
      and not exists(select 1 from phase_two_profiles p where p.guest_id=g.id)
    order by exists(
      select 1 from assignments a join tasks t on t.id=a.task_id where a.guest_id=g.id
        and a.is_initial and t.mission_code in('P1-SOCIAL-001','P1-SOCIAL-002')) desc,random()
    limit 1;
    if not found then
      raise exception using errcode='P0001',message='phase_two_extra_vote_unavailable';
    end if;
  end loop;
$new$;
  v_old_validation text:=$old$
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.is_captain)<>1) then
$old$;
  v_new_validation text:=$new$
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='TRICKSTER')<>1
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.primary_mission='EXTRA_VOTE')<>1
      or (select count(*) from phase_two_profiles p where p.team=expected.team and p.is_captain)<>1) then
$new$;
begin
  select pg_get_functiondef(
    'public.unlock_phase_two_missions_assignments_v1(text)'::regprocedure
  ) into v_definition;

  v_updated:=replace(v_definition,v_old_block,v_new_block);
  v_updated:=replace(v_updated,v_old_validation,v_new_validation);

  if v_updated=v_definition
      or position(v_old_block in v_updated)>0
      or position(v_new_block in v_updated)=0
      or position(v_new_validation in v_updated)=0 then
    raise exception using
      errcode='P0001',
      message='phase_two_team_power_distribution_patch_failed';
  end if;
  execute v_updated;
end;
$migration$;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608020003','phase_two.team_power_distribution_fixed','game_state','1',jsonb_build_object(
  'extra_vote_per_team',1,'photo_recipients_preferred',true,'existing_runtime_preserved',true));

commit;
