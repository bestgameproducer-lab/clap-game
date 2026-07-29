-- Controlled presets, idempotent initial cards, and ranked first-round rewards.
alter table guests add column if not exists team_locked boolean not null default false;
alter table guests add column if not exists role_locked boolean not null default false;

alter table assignments add column if not exists is_initial boolean not null default false;
alter table assignments add column if not exists completion_rank integer;
alter table assignments add column if not exists reward_task_id uuid references tasks(id) on delete set null;
alter table assignments add column if not exists reward_clue_id uuid references clues(id) on delete set null;

with first_assignments as (
  select distinct on (a.guest_id) a.id
  from assignments a
  join guests g on g.id = a.guest_id
  where g.drawn_at is not null
  order by a.guest_id, a.created_at, a.id
)
update assignments a set is_initial = true
from first_assignments f where a.id = f.id and not a.is_initial;

with ranked_approvals as (
  select id, row_number() over (order by approved_at, id)::integer as rank
  from assignments
  where is_initial and status = 'approved'
)
update assignments a set completion_rank = r.rank
from ranked_approvals r where a.id = r.id and a.completion_rank is null;

create unique index if not exists assignments_one_initial_per_guest_idx
on assignments (guest_id) where is_initial;

alter table game_state add column if not exists upgrade_reward_limit integer not null default 10;
alter table game_state add column if not exists clue_reward_limit integer not null default 3;

do $$ begin
  alter table game_state add constraint game_state_reward_limits_check check (
    upgrade_reward_limit between 0 and 32 and clue_reward_limit between 0 and upgrade_reward_limit
  );
exception when duplicate_object then null;
end $$;

insert into tasks (title, description, points, role_scope, category, stage)
select seed.title, seed.description, seed.points, seed.role_scope, seed.category, seed.stage
from (values
  ('新朋友合影', '找到一位今天第一次见面的宾客，互相介绍后完成一张自然合影。', 20, 'guest', 'standard', 'task_round_1'),
  ('跨组碰杯', '与另一组的一位宾客碰杯，并互相说一句给新人的祝福。饮料不限。', 20, 'guest', 'standard', 'task_round_1'),
  ('婚礼封面照', '帮助一位宾客拍摄一张像婚礼杂志封面的照片。', 20, 'guest', 'standard', 'task_round_1'),
  ('五年故事', '找到一位认识新人超过五年的宾客，请对方分享一段简短回忆。', 20, 'guest', 'standard', 'task_round_1'),
  ('同月生日', '找到一位与你生日月份相同的宾客，并记住对方的名字。', 20, 'guest', 'standard', 'task_round_1'),
  ('城市交换', '找到一位来自不同城市的宾客，互相推荐当地最喜欢的一样食物。', 20, 'guest', 'standard', 'task_round_1'),
  ('爱的关键词', '在自然聊天中，让两位宾客分别说出“缘分”或“幸福”中的一个词。', 20, 'guest', 'standard', 'task_round_1'),
  ('最佳摄影师', '主动帮一位宾客拍一张满意的照片，并让对方确认可以作为任务证明。', 20, 'guest', 'standard', 'task_round_1'),
  ('祝福收藏家', '收集三位宾客各一句不重复的新婚祝福。', 20, 'guest', 'standard', 'task_round_1'),
  ('跨组击掌', '与另外两组的宾客各完成一次击掌，并记住他们的名字。', 20, 'guest', 'standard', 'task_round_1'),
  ('婚礼侦察员', '拍下一处你认为最有婚礼氛围的细节，并向任务站说明原因。', 20, 'guest', 'standard', 'task_round_1'),
  ('温柔照顾', '在不打扰流程的情况下，主动帮助一位宾客解决一件小事。', 20, 'guest', 'standard', 'task_round_1'),
  ('长辈祝福', '邀请一位长辈分享一句婚姻建议，并认真听完。', 20, 'guest', 'standard', 'task_round_1'),
  ('甜蜜发现', '找到现场一个与爱心有关的装饰细节，并与它合影。', 20, 'guest', 'standard', 'task_round_1'),
  ('新人关键词', '找到一位知道新人第一次约会故事的宾客，并听完故事的一部分。', 20, 'guest', 'standard', 'task_round_1'),
  ('安静的掌声', '在合适的仪式节点主动带领身边宾客鼓掌，但不要打断主持人。', 20, 'guest', 'ceremony', 'task_round_1'),
  ('疑云制造', '在不影响婚礼流程的前提下，提出一个看似合理但并不关键的可疑观察。', 30, 'spy', 'standard', 'task_round_1'),
  ('方向偏移', '团队讨论时自然提出一个替代方向，并让队友认真考虑至少一次。', 30, 'spy', 'standard', 'task_round_1'),
  ('低调反对', '在不引起反感的情况下，对一次团队判断提出温和的不同意见。', 30, 'spy', 'standard', 'task_round_1'),
  ('无害误会', '让一位队友短暂误会某个游戏规则，随后在主持人说明前自然结束话题。', 30, 'spy', 'standard', 'task_round_1'),
  ('观察提醒', '私下提醒一位队友留意某种可疑行为，但不要点名任何人。', 25, 'helper', 'standard', 'task_round_1'),
  ('讨论引导', '让至少两位队友分别说出他们目前怀疑的人以及理由。', 25, 'helper', 'standard', 'task_round_1'),
  ('线索守护', '帮助一位较少参与讨论的队友理解当前线索，不要替对方做判断。', 25, 'helper', 'standard', 'task_round_1'),
  ('温柔纠偏', '当团队明显偏离事实时，用一个问题把讨论带回已知线索。', 25, 'helper', 'standard', 'task_round_1'),
  ('三组同框', '找到另外三个不同组别的宾客，完成一张四组同框合影。', 35, 'all', 'upgrade', 'task_round_2'),
  ('电影海报', '邀请两位宾客共同设计动作，拍一张“婚礼电影海报”。', 35, 'all', 'upgrade', 'task_round_2'),
  ('五人签名', '在任务站提供的纸张上收集五位宾客的签名。', 35, 'all', 'upgrade', 'task_round_2'),
  ('共同记忆', '找到两位分别认识新郎和新娘的宾客，让他们各分享一段回忆。', 35, 'all', 'upgrade', 'task_round_2'),
  ('秘密口令', '将主办方给你的秘密口令准确传递给指定宾客，不要让旁人听见。', 35, 'all', 'upgrade', 'task_round_2'),
  ('团队队长', '在下一次团队讨论中负责确认每个人都至少表达一次意见。', 35, 'all', 'upgrade', 'task_round_2'),
  ('爱心拼图', '找到持有与你配对关键词的宾客，一起到任务站完成验证。', 35, 'all', 'upgrade', 'task_round_2'),
  ('婚礼记者', '采访三位不同组别的宾客，用三句话总结今天最打动他们的时刻。', 35, 'all', 'upgrade', 'task_round_2'),
  ('团队记录员', '在团队挑战中记录最终答案，并在提交前向全队复述确认。', 30, 'all', 'group', 'group_game'),
  ('十秒提醒', '团队挑战倒数十秒时，提醒全队进行最后一次答案确认。', 30, 'all', 'group', 'group_game'),
  ('意见收集者', '团队挑战中邀请至少两位尚未发言的队友表达意见。', 30, 'all', 'group', 'group_game'),
  ('最终答题人', '在团队达成一致后，代表本组提交或说出最终答案。', 30, 'all', 'group', 'group_game'),
  ('友好挑战', '本轮结束后向另一队发起一次轻松友好的祝贺或挑战。', 30, 'all', 'group', 'group_game'),
  ('讨论总结', '在团队讨论结束前，用一句话总结本组选择及主要理由。', 30, 'all', 'group', 'group_game'),
  ('隐藏补给', '找到婚礼情报站附近的秘密标记，并向工作人员说出标记上的口令。', 40, 'all', 'hidden', 'task_round_2'),
  ('孤独丘比特奖', '如果配对任务直到指定时间仍未完成，前往任务站领取补偿挑战。', 40, 'all', 'hidden', 'task_round_2')
) as seed(title, description, points, role_scope, category, stage)
where not exists (select 1 from tasks where tasks.title = seed.title);

create or replace function configure_guest_game_profile(
  p_guest_id uuid,
  p_team text,
  p_role text,
  p_actor text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if trim(p_team) not in ('玫瑰组','月桂组','星辰组','琥珀组') then
    raise exception using errcode = '22023', message = 'invalid_team';
  end if;
  if p_role not in ('guest','spy','helper') then
    raise exception using errcode = '22023', message = 'invalid_role';
  end if;
  update guests
  set team = trim(p_team), role = p_role, team_locked = true, role_locked = true
  where id = p_guest_id and drawn_at is null;
  if not found then
    if exists (select 1 from guests where id = p_guest_id) then
      raise exception using errcode = 'P0001', message = 'guest_card_already_drawn';
    end if;
    raise exception using errcode = 'P0002', message = 'guest_not_found';
  end if;
  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'guest.profile_configure', 'guest', p_guest_id::text,
          jsonb_build_object('team', trim(p_team), 'role', p_role, 'locked', true));
end;
$$;

revoke all on function configure_guest_game_profile(uuid, text, text, text) from public, anon, authenticated;
grant execute on function configure_guest_game_profile(uuid, text, text, text) to service_role;

create or replace function draw_guest_card(p_guest_id uuid)
returns table (
  guest_team text,
  guest_role text,
  task_id uuid,
  task_title text,
  task_description text,
  task_points integer,
  card_drawn_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest guests%rowtype;
  v_team text;
  v_role text;
  v_task tasks%rowtype;
  v_assignment assignments%rowtype;
  v_capacity integer;
begin
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select * into v_guest from guests where id = p_guest_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'guest_not_found'; end if;
  if v_guest.claimed_at is null then raise exception using errcode = '28000', message = 'guest_not_claimed'; end if;

  if v_guest.drawn_at is not null then
    select a.* into v_assignment from assignments a
    where a.guest_id = v_guest.id and a.is_initial limit 1;
    if not found then raise exception using errcode = 'P0001', message = 'draw_assignment_missing'; end if;
    select * into v_task from tasks where id = v_assignment.task_id;
    return query select v_guest.team, v_guest.role, v_task.id, v_task.title, v_task.description, v_task.points, v_guest.drawn_at;
    return;
  end if;

  if v_guest.team_locked then
    v_team := v_guest.team;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team = v_team;
    if v_team not in ('玫瑰组','月桂组','星辰组','琥珀组') or v_capacity >= 8 then
      raise exception using errcode = 'P0001', message = 'draw_preset_capacity_full';
    end if;
  else
    select available.team_name into v_team
    from (
      select candidate.team_name, count(g.id) as used_slots
      from (values ('玫瑰组'), ('月桂组'), ('星辰组'), ('琥珀组')) candidate(team_name)
      left join guests g on g.drawn_at is not null and g.team = candidate.team_name
      group by candidate.team_name having count(g.id) < 8
    ) available order by available.used_slots, random() limit 1;
    if v_team is null then raise exception using errcode = 'P0001', message = 'draw_capacity_full'; end if;
  end if;

  if v_guest.role_locked then
    v_role := v_guest.role;
    select count(*)::integer into v_capacity from guests where drawn_at is not null and team = v_team and role = v_role;
    if (v_role in ('spy','helper') and v_capacity >= 1) or (v_role = 'guest' and v_capacity >= 6) then
      raise exception using errcode = 'P0001', message = 'draw_preset_role_capacity_full';
    end if;
  else
    select slots.role_name into v_role
    from (
      select 'spy'::text as role_name from generate_series(1, greatest(0, 1 - (select count(*)::integer from guests where drawn_at is not null and team = v_team and role = 'spy')))
      union all
      select 'helper'::text from generate_series(1, greatest(0, 1 - (select count(*)::integer from guests where drawn_at is not null and team = v_team and role = 'helper')))
      union all
      select 'guest'::text from generate_series(1, greatest(0, 6 - (select count(*)::integer from guests where drawn_at is not null and team = v_team and role = 'guest')))
    ) slots order by random() limit 1;
    if v_role is null then raise exception using errcode = 'P0001', message = 'draw_role_capacity_full'; end if;
  end if;

  select * into v_task from tasks
  where active and stage = 'task_round_1' and category = 'standard' and role_scope = v_role
  order by random() limit 1;
  if not found then
    select * into v_task from tasks
    where active and stage = 'task_round_1' and category = 'standard' and role_scope = 'all'
    order by random() limit 1;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'draw_task_missing'; end if;

  update guests set team = v_team, role = v_role, drawn_at = now() where id = v_guest.id returning * into v_guest;
  insert into assignments (guest_id, task_id, is_initial) values (v_guest.id, v_task.id, true) returning * into v_assignment;
  insert into audit_log (actor, action, target_type, target_id, details)
  values ('guest:' || v_guest.id::text, 'guest.card_draw', 'guest', v_guest.id::text,
    jsonb_build_object('team', v_team, 'role', v_role, 'assignment_id', v_assignment.id,
      'team_locked', v_guest.team_locked, 'role_locked', v_guest.role_locked));
  return query select v_guest.team, v_guest.role, v_task.id, v_task.title, v_task.description, v_task.points, v_guest.drawn_at;
end;
$$;

revoke all on function draw_guest_card(uuid) from public, anon, authenticated;
grant execute on function draw_guest_card(uuid) to service_role;

create or replace function approve_assignment(
  p_assignment_id uuid,
  p_actor text,
  p_reason text default '任务审核通过'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assignment assignments%rowtype;
  v_points integer;
  v_total integer;
  v_rank integer;
  v_role text;
  v_upgrade_limit integer;
  v_clue_limit integer;
  v_reward_task_id uuid;
  v_reward_assignment_id uuid;
  v_reward_clue_id uuid;
begin
  if nullif(trim(p_reason), '') is null then raise exception using errcode = '22023', message = 'reason_required'; end if;
  if exists (select 1 from assignments where id = p_assignment_id and is_initial) then
    perform pg_advisory_xact_lock(hashtext('wedding-initial-approval-rank-v1'));
  end if;

  select * into v_assignment from assignments where id = p_assignment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'assignment_not_found'; end if;
  if v_assignment.status <> 'submitted' then raise exception using errcode = 'P0001', message = 'assignment_not_submitted'; end if;

  select points into v_points from tasks where id = v_assignment.task_id;
  insert into points_ledger (guest_id, assignment_id, amount, reason, actor)
  values (v_assignment.guest_id, v_assignment.id, v_points, trim(p_reason), p_actor);
  update guests set points = points + v_points where id = v_assignment.guest_id returning points, role into v_total, v_role;
  update assignments set status = 'approved', approved_at = now() where id = v_assignment.id;

  if v_assignment.is_initial then
    select upgrade_reward_limit, clue_reward_limit into v_upgrade_limit, v_clue_limit from game_state where id = 1;
    select count(*)::integer into v_rank from assignments where is_initial and status = 'approved';
    update assignments set completion_rank = v_rank where id = v_assignment.id;

    if v_rank <= v_upgrade_limit then
      select t.id into v_reward_task_id from tasks t
      where t.active and t.category = 'upgrade' and t.stage = 'task_round_2'
        and t.role_scope in ('all', v_role)
        and not exists (select 1 from assignments a where a.guest_id = v_assignment.guest_id and a.task_id = t.id)
      order by random() limit 1;
      if v_reward_task_id is not null then
        insert into assignments (guest_id, task_id) values (v_assignment.guest_id, v_reward_task_id)
        returning id into v_reward_assignment_id;
        update assignments set reward_task_id = v_reward_task_id where id = v_assignment.id;
      end if;
    end if;

    if v_rank <= v_clue_limit then
      select c.id into v_reward_clue_id from clues c
      where c.active and not exists (
        select 1 from guest_clues gc where gc.guest_id = v_assignment.guest_id and gc.clue_id = c.id
      ) order by random() limit 1;
      if v_reward_clue_id is not null then
        insert into guest_clues (guest_id, clue_id, granted_by)
        values (v_assignment.guest_id, v_reward_clue_id, p_actor);
        update assignments set reward_clue_id = v_reward_clue_id where id = v_assignment.id;
      end if;
    end if;
  end if;

  insert into audit_log (actor, action, target_type, target_id, details)
  values (p_actor, 'assignment.approve', 'assignment', v_assignment.id::text,
    jsonb_build_object('guest_id', v_assignment.guest_id, 'points', v_points, 'reason', trim(p_reason),
      'completion_rank', v_rank, 'reward_assignment_id', v_reward_assignment_id, 'reward_clue_id', v_reward_clue_id));
  return jsonb_build_object('points_awarded', v_points, 'guest_total', v_total,
    'completion_rank', v_rank, 'reward_assignment_id', v_reward_assignment_id, 'reward_clue_id', v_reward_clue_id);
end;
$$;

revoke all on function approve_assignment(uuid, text, text) from public, anon, authenticated;
grant execute on function approve_assignment(uuid, text, text) to service_role;
