-- Private host script and answer library. Only explicitly public fields are copied to game_state.
create table if not exists host_segments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  stage text not null check (stage in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results')),
  public_prompt text not null check (length(trim(public_prompt)) between 1 and 1000),
  host_notes text not null default '' check (length(host_notes) <= 2000),
  correct_answer text not null default '' check (length(correct_answer) <= 2000),
  public_clue text not null default '' check (length(public_clue) <= 500),
  timer_minutes integer not null default 0 check (timer_minutes between 0 and 120),
  sort_order integer not null default 100 check (sort_order between 0 and 9999),
  ready boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not ready or length(trim(correct_answer)) > 0)
);

alter table host_segments enable row level security;
revoke all on host_segments from public, anon, authenticated;
create index if not exists host_segments_active_order_idx on host_segments (active, sort_order, created_at);

alter table game_state add column if not exists current_host_segment_id uuid references host_segments(id) on delete set null;

insert into host_segments (title, stage, public_prompt, host_notes, correct_answer, public_clue, timer_minutes, sort_order, ready)
select seed.title, seed.stage, seed.public_prompt, seed.host_notes, seed.correct_answer, seed.public_clue, seed.timer_minutes, seed.sort_order, seed.ready
from (values
  ('爱情档案解密 · 规则', 'group_game', '根据照片和主持人的问题，逐步还原新人故事。答对继续，答错则答题权转交下一组。', '展示第一张新人照片，确认各组答题顺序。不要在公开屏幕写入答案。', '由主持人确认规则已宣读', '', 2, 100, true),
  ('爱情档案解密 · 故事题', 'group_game', '请判断屏幕上的新人故事陈述是否正确。', '请在此填写照片背景、转交答题权的顺序和补充故事。', '请替换为真实答案后再勾选“允许发布”', '', 2, 110, false),
  ('连续知识挑战 · 规则', 'group_game', '每组需要连续答对指定数量的问题；答错后立即轮到下一组。', '第一轮建议连续答对 3 题，决胜轮可增加到 5 题。', '由主持人确认规则已宣读', '', 8, 200, true),
  ('连续知识挑战 · 题目', 'group_game', '请回答主持人刚刚读出的题目。', '请填写题目出处、可接受答案和判分口径。', '请替换为真实答案后再勾选“允许发布”', '', 1, 210, false),
  ('婚礼资源竞拍 · 规则', 'group_game', '各组使用有限的丘比特金币竞拍提示、额外回答机会或特殊道具。', '每组初始 10 枚金币。记录每次成交价，避免口头账目混乱。', '由主持人确认规则已宣读', '', 8, 300, true),
  ('婚礼资源竞拍 · 拍品', 'group_game', '本轮拍品即将揭晓，请各组准备竞价。', '填写拍品真实效果、代价和最高可接受报价。', '请替换为拍品真实效果后再勾选“允许发布”', '', 1, 310, false),
  ('最终间谍讨论', 'voting', '请在队内讨论最可疑的人，并准备姓名、理由和一次具体行为作为依据。', '讨论结束后在后台开启投票。公开屏幕不得显示真实身份。', '投票前不公布正确答案', '', 5, 400, true)
) as seed(title, stage, public_prompt, host_notes, correct_answer, public_clue, timer_minutes, sort_order, ready)
where not exists (select 1 from host_segments h where h.title = seed.title);

create or replace function save_host_segment(
  p_segment_id uuid,
  p_title text,
  p_stage text,
  p_public_prompt text,
  p_host_notes text,
  p_correct_answer text,
  p_public_clue text,
  p_timer_minutes integer,
  p_sort_order integer,
  p_ready boolean,
  p_actor text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if nullif(trim(p_title), '') is null or length(trim(p_title)) > 120 then raise exception using errcode='22023', message='invalid_host_title'; end if;
  if p_stage not in ('registration','waiting','task_round_1','task_round_2','group_game','voting','results') then raise exception using errcode='22023', message='invalid_game_stage'; end if;
  if nullif(trim(p_public_prompt), '') is null or length(trim(p_public_prompt)) > 1000 then raise exception using errcode='22023', message='invalid_public_prompt'; end if;
  if length(coalesce(p_host_notes,'')) > 2000 or length(coalesce(p_correct_answer,'')) > 2000 or length(coalesce(p_public_clue,'')) > 500 then raise exception using errcode='22023', message='host_content_too_long'; end if;
  if p_timer_minutes < 0 or p_timer_minutes > 120 or p_sort_order < 0 or p_sort_order > 9999 then raise exception using errcode='22023', message='invalid_host_order_or_timer'; end if;
  if p_ready and nullif(trim(coalesce(p_correct_answer,'')), '') is null then raise exception using errcode='22023', message='host_answer_required'; end if;

  if p_segment_id is null then
    insert into host_segments (title,stage,public_prompt,host_notes,correct_answer,public_clue,timer_minutes,sort_order,ready)
    values (trim(p_title),p_stage,trim(p_public_prompt),trim(coalesce(p_host_notes,'')),trim(coalesce(p_correct_answer,'')),trim(coalesce(p_public_clue,'')),p_timer_minutes,p_sort_order,p_ready)
    returning id into v_id;
  else
    update host_segments set title=trim(p_title),stage=p_stage,public_prompt=trim(p_public_prompt),host_notes=trim(coalesce(p_host_notes,'')),correct_answer=trim(coalesce(p_correct_answer,'')),public_clue=trim(coalesce(p_public_clue,'')),timer_minutes=p_timer_minutes,sort_order=p_sort_order,ready=p_ready,updated_at=now()
    where id=p_segment_id and active returning id into v_id;
    if v_id is null then raise exception using errcode='P0002', message='host_segment_not_found'; end if;
  end if;
  insert into audit_log (actor,action,target_type,target_id,details)
  values (p_actor,'host_segment.save','host_segment',v_id::text,jsonb_build_object('title',trim(p_title),'stage',p_stage,'ready',p_ready));
  return v_id;
end;
$$;

revoke all on function save_host_segment(uuid,text,text,text,text,text,text,integer,integer,boolean,text) from public, anon, authenticated;
grant execute on function save_host_segment(uuid,text,text,text,text,text,text,integer,integer,boolean,text) to service_role;

create or replace function publish_host_segment(p_segment_id uuid, p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_segment host_segments%rowtype;
begin
  select * into v_segment from host_segments where id=p_segment_id and active for update;
  if not found then raise exception using errcode='P0002', message='host_segment_not_found'; end if;
  if not v_segment.ready then raise exception using errcode='P0001', message='host_segment_not_ready'; end if;
  update game_state set current_host_segment_id=v_segment.id,stage=v_segment.stage,display_title=v_segment.title,
    display_body=v_segment.public_prompt,public_clue=nullif(v_segment.public_clue,''),
    timer_ends_at=case when v_segment.timer_minutes=0 then null else now()+make_interval(mins=>v_segment.timer_minutes) end,
    updated_at=now() where id=1;
  insert into audit_log (actor,action,target_type,target_id,details)
  values (p_actor,'host_segment.publish','host_segment',v_segment.id::text,
          jsonb_build_object('title',v_segment.title,'stage',v_segment.stage,'timer_minutes',v_segment.timer_minutes));
end;
$$;

revoke all on function publish_host_segment(uuid,text) from public, anon, authenticated;
grant execute on function publish_host_segment(uuid,text) to service_role;
