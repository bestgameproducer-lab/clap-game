-- Model the wedding dinner as its own real-world stage. The preceding
-- task_round_2 stage remains the deliberate release point for round-two tasks.

begin;

alter table game_state drop constraint if exists game_state_stage_check;
alter table game_state add constraint game_state_stage_check check (
  stage in ('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game','voting','results')
);

alter table host_segments drop constraint if exists host_segments_stage_check;
alter table host_segments add constraint host_segments_stage_check check (
  stage in ('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game','voting','results')
);

create or replace function phase_one_interactions_open(p_stage text)
returns boolean language sql immutable set search_path=public as $$
  select p_stage in ('registration','waiting','ceremony_end','task_round_2','banquet','group_game');
$$;

create or replace function set_game_stage(p_stage text,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
declare v_state game_state%rowtype; v_phase_two_count integer:=0;
begin
  if p_stage not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game','voting','results') then
    raise exception using errcode='22023',message='invalid_game_stage';
  end if;
  if p_stage in ('voting','results') then raise exception using errcode='P0001',message='use_voting_controls'; end if;
  select * into v_state from game_state where id=1 for update;
  if not found then raise exception using errcode='P0002',message='game_state_not_found'; end if;

  -- Round two is allocated once during the wedding prelude. Moving between the
  -- prelude, dinner, and team challenge must never allocate it again.
  if p_stage='task_round_2'
      and v_state.stage not in ('task_round_2','banquet','group_game','voting','results') then
    perform finalize_phase_one_content(p_actor);
    v_phase_two_count:=unlock_phase_two_missions(p_actor);
  end if;

  update game_state set stage=p_stage,voting_open=false,results_visible=false,
    voting_closed_at=case when v_state.voting_open then now() else voting_closed_at end,
    results_published_at=null,current_host_segment_id=null,display_title=null,display_body=null,
    public_clue=null,timer_ends_at=null,updated_at=now() where id=1;
  insert into audit_log(actor,action,target_type,target_id,details)
  values(p_actor,'game_state.stage','game_state','1',jsonb_build_object(
    'previous_stage',v_state.stage,'stage',p_stage,'phase_one_closes_at','task_round_2',
    'ceremony_end_resumes_phase_one',p_stage='ceremony_end','banquet_stage',p_stage='banquet',
    'phase_two_assignments_created',v_phase_two_count));
end;
$$;

-- Preserve the latest implementations and extend only their game-stage guards.
do $$
declare v_definition text;
begin
  v_definition:=pg_get_functiondef('public.submit_assignment(uuid,uuid,text)'::regprocedure);
  if position($q$in ('task_round_2','banquet','group_game')$q$ in v_definition)=0 then
    if position($q$in ('task_round_2','group_game')$q$ in v_definition)=0 then
      raise exception 'submit_assignment stage guard not found';
    end if;
    execute replace(v_definition,$q$in ('task_round_2','group_game')$q$,$q$in ('task_round_2','banquet','group_game')$q$);
  end if;

  v_definition:=pg_get_functiondef('public.submit_phase_two_dilemma(uuid,text)'::regprocedure);
  if position($q$not in ('task_round_2','banquet','group_game')$q$ in v_definition)=0 then
    if position($q$not in ('task_round_2','group_game')$q$ in v_definition)=0 then
      raise exception 'submit_phase_two_dilemma stage guard not found';
    end if;
    execute replace(v_definition,$q$not in ('task_round_2','group_game')$q$,$q$not in ('task_round_2','banquet','group_game')$q$);
  end if;

  v_definition:=pg_get_functiondef('public.submit_phase_two_copy_choice(uuid,uuid)'::regprocedure);
  if position($q$not in ('task_round_2','banquet','group_game')$q$ in v_definition)=0 then
    if position($q$not in ('task_round_2','group_game')$q$ in v_definition)=0 then
      raise exception 'submit_phase_two_copy_choice stage guard not found';
    end if;
    execute replace(v_definition,$q$not in ('task_round_2','group_game')$q$,$q$not in ('task_round_2','banquet','group_game')$q$);
  end if;

  v_definition:=pg_get_functiondef('public.redeem_hidden_task_code(uuid,text,text)'::regprocedure);
  if position($q$not in ('task_round_2','banquet','group_game')$q$ in v_definition)=0 then
    if position($q$not in ('task_round_2','group_game')$q$ in v_definition)=0 then
      raise exception 'redeem_hidden_task_code stage guard not found';
    end if;
    execute replace(v_definition,$q$not in ('task_round_2','group_game')$q$,$q$not in ('task_round_2','banquet','group_game')$q$);
  end if;

  v_definition:=pg_get_functiondef('public.finalize_phase_one_content(text)'::regprocedure);
  if position($q$not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game')$q$ in v_definition)=0 then
    if position($q$not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','group_game')$q$ in v_definition)=0 then
      raise exception 'finalize_phase_one_content stage guard not found';
    end if;
    execute replace(v_definition,
      $q$not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','group_game')$q$,
      $q$not in ('registration','waiting','task_round_1','ceremony_end','task_round_2','banquet','group_game')$q$);
  end if;
end;
$$;

revoke all on function phase_one_interactions_open(text) from public,anon,authenticated;
revoke all on function set_game_stage(text,text) from public,anon,authenticated;
grant execute on function set_game_stage(text,text) to service_role;

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202608010008','game_stage.banquet_added','game_state','1',jsonb_build_object(
  'existing_stage_preserved',true,'round_two_release_stage','task_round_2',
  'dinner_stage','banquet','round_two_actions_remain_open',true));

commit;
