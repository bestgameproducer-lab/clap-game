begin;

alter function public.platform_template_content_is_valid(jsonb)
  rename to platform_template_content_v2_is_valid;

revoke all on function public.platform_template_content_v2_is_valid(jsonb) from public, anon, authenticated;

create or replace function public.platform_template_content_is_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_override jsonb;
  v_base jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or not (p_value ?& array[
      'teamOneName', 'teamTwoName', 'openingScript', 'quizQuestions',
      'quickQuizQuestions', 'charadesWords', 'missionCopyOverrides'
    ])
    or (p_value - array[
      'teamOneName', 'teamTwoName', 'openingScript', 'quizQuestions',
      'quickQuizQuestions', 'charadesWords', 'missionCopyOverrides'
    ]) <> '{}'::jsonb
  then return false; end if;

  v_base := p_value - 'missionCopyOverrides';
  if not public.platform_template_content_v2_is_valid(v_base)
    or jsonb_typeof(p_value -> 'missionCopyOverrides') <> 'array'
    or jsonb_array_length(p_value -> 'missionCopyOverrides') > 10
  then return false; end if;

  for v_override in select value from jsonb_array_elements(p_value -> 'missionCopyOverrides')
  loop
    if jsonb_typeof(v_override) <> 'object'
      or not (v_override ?& array['missionCode', 'title', 'description'])
      or (v_override - array['missionCode', 'title', 'description']) <> '{}'::jsonb
      or jsonb_typeof(v_override -> 'missionCode') <> 'string'
      or v_override ->> 'missionCode' not in (
        'P1-CER-001', 'P1-CER-002', 'P1-BOUQUET-001', 'P1-SOCIAL-001', 'P1-SOCIAL-002',
        'P2-SOCIAL-001', 'P2-SOCIAL-002', 'P2-SOCIAL-003', 'P2-SOCIAL-004', 'P2-CEREMONY-001'
      )
      or jsonb_typeof(v_override -> 'title') <> 'string'
      or char_length(btrim(v_override ->> 'title')) not between 1 and 60
      or (v_override ->> 'title') ~ '[<>{}]'
      or jsonb_typeof(v_override -> 'description') <> 'string'
      or char_length(btrim(v_override ->> 'description')) not between 1 and 500
      or (v_override ->> 'description') ~ '[<>{}]'
    then return false; end if;
  end loop;

  if (
    select count(*) from jsonb_array_elements(p_value -> 'missionCopyOverrides') item(value)
  ) <> (
    select count(distinct value ->> 'missionCode') from jsonb_array_elements(p_value -> 'missionCopyOverrides') item(value)
  ) then return false; end if;

  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.platform_template_content_is_valid(jsonb) from public, anon, authenticated;

alter table public.platform_projects
  drop constraint platform_projects_template_content_check;

update public.platform_projects
set template_content = template_content || jsonb_build_object('missionCopyOverrides', '[]'::jsonb)
where not (template_content ? 'missionCopyOverrides');

update public.platform_project_versions
set snapshot = jsonb_set(
  snapshot,
  '{template_content}',
  (snapshot -> 'template_content') || jsonb_build_object(
    'quickQuizQuestions', coalesce(snapshot #> '{template_content,quickQuizQuestions}', jsonb_build_array(
      jsonb_build_object('prompt', '一年有多少个月？', 'answer', '12 个月'),
      jsonb_build_object('prompt', '彩虹通常有几种颜色？', 'answer', '7 种')
    )),
    'charadesWords', coalesce(snapshot #> '{template_content,charadesWords}', jsonb_build_array('交换戒指', '手捧花', '蜜月旅行', '婚礼蛋糕', '干杯', '拍合照')),
    'missionCopyOverrides', coalesce(snapshot #> '{template_content,missionCopyOverrides}', '[]'::jsonb)
  )
)
where jsonb_typeof(snapshot -> 'template_content') = 'object'
  and not (snapshot -> 'template_content' ? 'missionCopyOverrides');

alter table public.platform_projects alter column template_content set default jsonb_build_object(
  'teamOneName', '海岛组',
  'teamTwoName', '沙漠组',
  'openingScript', '欢迎来到 {{couple}} 的婚礼游戏。今晚请跟随主持人提示，一起完成属于你们的故事。',
  'quizQuestions', '[]'::jsonb,
  'quickQuizQuestions', jsonb_build_array(
    jsonb_build_object('prompt', '一年有多少个月？', 'answer', '12 个月'),
    jsonb_build_object('prompt', '彩虹通常有几种颜色？', 'answer', '7 种')
  ),
  'charadesWords', jsonb_build_array('交换戒指', '手捧花', '蜜月旅行', '婚礼蛋糕', '干杯', '拍合照'),
  'missionCopyOverrides', '[]'::jsonb
);

alter table public.platform_projects
  add constraint platform_projects_template_content_check
  check (public.platform_template_content_is_valid(template_content));

commit;
