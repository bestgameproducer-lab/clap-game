-- Private four-digit guest codes and atomic, balanced secret-card drawing.
alter table guests add column if not exists drawn_at timestamptz;

drop function if exists claim_guest_by_login(text, text, text, timestamptz);

create or replace function claim_guest_by_login(
  p_invitation_code text,
  p_login_name text,
  p_claim_code text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (guest_id uuid, guest_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_state game_state%rowtype;
  v_guest guests%rowtype;
  v_normalized_login text;
begin
  select * into v_state from game_state where game_state.id = 1 for update;
  if not v_state.registration_open then
    raise exception using errcode = 'P0001', message = 'registration_closed';
  end if;
  if v_state.invitation_code_hash is null
     or crypt(p_invitation_code, v_state.invitation_code_hash) <> v_state.invitation_code_hash then
    raise exception using errcode = '28000', message = 'invalid_invitation_code';
  end if;
  if p_claim_code !~ '^[0-9]{4}$' then
    raise exception using errcode = '22023', message = 'invalid_claim_code';
  end if;

  v_normalized_login := lower(regexp_replace(trim(p_login_name), '\s+', ' ', 'g'));
  select * into v_guest
  from guests
  where lower(regexp_replace(trim(login_name), '\s+', ' ', 'g')) = v_normalized_login
  for update;

  if not found then raise exception using errcode = 'P0002', message = 'invalid_login_name'; end if;
  if v_guest.claimed_at is not null then
    raise exception using errcode = '23505', message = 'guest_already_claimed';
  end if;
  if v_guest.claim_code_hash is null
     or crypt(p_claim_code, v_guest.claim_code_hash) <> v_guest.claim_code_hash then
    raise exception using errcode = '28000', message = 'invalid_claim_code';
  end if;

  update guests set claimed_at = now() where id = v_guest.id;
  insert into guest_sessions (guest_id, token_hash, expires_at)
  values (v_guest.id, p_token_hash, p_expires_at);
  return query select v_guest.id, v_guest.name;
end;
$$;

revoke all on function claim_guest_by_login(text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function claim_guest_by_login(text, text, text, text, timestamptz) to service_role;

insert into tasks (title, description, points, role_scope)
select seed.title, seed.description, seed.points, seed.role_scope
from (values
  ('秘密关键词', '在自然聊天中，让三位宾客分别说出“缘分”这个词。不要直接要求他们照读。', 20, 'guest'),
  ('合影挑战', '邀请两位原本不熟悉的宾客一起合影，并说出一句给新人的祝福。', 20, 'guest'),
  ('回忆收集', '向两位宾客收集他们与新人的一段小回忆，稍后分享给主办方。', 20, 'guest'),
  ('祝福传递', '悄悄发起一条不少于四人的祝福接力，每人只说一个短句。', 20, 'guest'),
  ('轻微干扰', '在不影响婚礼流程的前提下，让一位队友误以为今天会有临时加赛。', 30, 'spy'),
  ('错误线索', '自然地抛出一条无伤大雅的错误线索，并让至少一位队友认真讨论它。', 30, 'spy'),
  ('秘密引导', '不暴露身份，引导两位队友主动讨论谁最像恶作剧者。', 25, 'helper'),
  ('线索信使', '找到一位暂时落单的队友，提醒对方留意任务中的异常行为。', 25, 'helper')
) as seed(title, description, points, role_scope)
where not exists (select 1 from tasks where tasks.title = seed.title);

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
begin
  -- Serialize all draws so team and role capacities cannot be exceeded.
  perform pg_advisory_xact_lock(hashtext('wedding-secret-card-draw-v1'));
  select * into v_guest from guests where id = p_guest_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'guest_not_found'; end if;
  if v_guest.claimed_at is null then
    raise exception using errcode = '28000', message = 'guest_not_claimed';
  end if;

  if v_guest.drawn_at is not null then
    select a.* into v_assignment
    from assignments a
    where a.guest_id = v_guest.id
    order by a.created_at desc
    limit 1;
    if not found then raise exception using errcode = 'P0001', message = 'draw_assignment_missing'; end if;
    select * into v_task from tasks where id = v_assignment.task_id;
    return query select v_guest.team, v_guest.role, v_task.id, v_task.title,
      v_task.description, v_task.points, v_guest.drawn_at;
    return;
  end if;

  select available.team_name into v_team
  from (
    select candidate.team_name, count(g.id) as used_slots
    from (values ('玫瑰组'), ('月桂组'), ('星辰组'), ('琥珀组')) candidate(team_name)
    left join guests g on g.drawn_at is not null and g.team = candidate.team_name
    group by candidate.team_name
    having count(g.id) < 8
  ) available
  order by available.used_slots, random()
  limit 1;
  if v_team is null then raise exception using errcode = 'P0001', message = 'draw_capacity_full'; end if;

  select slots.role_name into v_role
  from (
    select 'spy'::text as role_name
    from generate_series(1, greatest(0, 1 - (select count(*)::integer from guests where drawn_at is not null and team = v_team and role = 'spy')))
    union all
    select 'helper'::text
    from generate_series(1, greatest(0, 1 - (select count(*)::integer from guests where drawn_at is not null and team = v_team and role = 'helper')))
    union all
    select 'guest'::text
    from generate_series(1, greatest(0, 6 - (select count(*)::integer from guests where drawn_at is not null and team = v_team and role = 'guest')))
  ) slots
  order by random()
  limit 1;
  if v_role is null then raise exception using errcode = 'P0001', message = 'draw_role_capacity_full'; end if;

  select * into v_task
  from tasks
  where role_scope = v_role
  order by random()
  limit 1;
  if not found then
    select * into v_task from tasks where role_scope = 'all' order by random() limit 1;
  end if;
  if not found then raise exception using errcode = 'P0001', message = 'draw_task_missing'; end if;

  update guests
  set team = v_team, role = v_role, drawn_at = now()
  where id = v_guest.id
  returning * into v_guest;

  insert into assignments (guest_id, task_id)
  values (v_guest.id, v_task.id)
  returning * into v_assignment;

  insert into audit_log (actor, action, target_type, target_id, details)
  values ('guest:' || v_guest.id::text, 'guest.card_draw', 'guest', v_guest.id::text,
    jsonb_build_object('team', v_team, 'role', v_role, 'assignment_id', v_assignment.id));

  return query select v_guest.team, v_guest.role, v_task.id, v_task.title,
    v_task.description, v_task.points, v_guest.drawn_at;
end;
$$;

revoke all on function draw_guest_card(uuid) from public, anon, authenticated;
grant execute on function draw_guest_card(uuid) to service_role;
