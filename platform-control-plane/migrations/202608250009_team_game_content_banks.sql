begin;

alter function public.platform_template_content_is_valid(jsonb)
  rename to platform_template_content_v1_is_valid;

revoke all on function public.platform_template_content_v1_is_valid(jsonb) from public, anon, authenticated;

create or replace function public.platform_template_content_is_valid(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_question jsonb;
  v_word jsonb;
  v_base jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'object'
    or not (p_value ?& array[
      'teamOneName', 'teamTwoName', 'openingScript', 'quizQuestions',
      'quickQuizQuestions', 'charadesWords'
    ])
    or (p_value - array[
      'teamOneName', 'teamTwoName', 'openingScript', 'quizQuestions',
      'quickQuizQuestions', 'charadesWords'
    ]) <> '{}'::jsonb
  then return false; end if;

  v_base := p_value - array['quickQuizQuestions', 'charadesWords'];
  if not public.platform_template_content_v1_is_valid(v_base)
    or jsonb_typeof(p_value -> 'quickQuizQuestions') <> 'array'
    or jsonb_array_length(p_value -> 'quickQuizQuestions') > 30
    or jsonb_typeof(p_value -> 'charadesWords') <> 'array'
    or jsonb_array_length(p_value -> 'charadesWords') > 80
  then return false; end if;

  for v_question in select value from jsonb_array_elements(p_value -> 'quickQuizQuestions')
  loop
    if jsonb_typeof(v_question) <> 'object'
      or not (v_question ?& array['prompt', 'answer'])
      or (v_question - array['prompt', 'answer']) <> '{}'::jsonb
      or jsonb_typeof(v_question -> 'prompt') <> 'string'
      or char_length(btrim(v_question ->> 'prompt')) not between 1 and 180
      or (v_question ->> 'prompt') ~ '[<>{}]'
      or jsonb_typeof(v_question -> 'answer') <> 'string'
      or char_length(btrim(v_question ->> 'answer')) not between 1 and 120
      or (v_question ->> 'answer') ~ '[<>{}]'
    then return false; end if;
  end loop;

  for v_word in select value from jsonb_array_elements(p_value -> 'charadesWords')
  loop
    if jsonb_typeof(v_word) <> 'string'
      or char_length(btrim(v_word #>> '{}')) not between 1 and 40
      or (v_word #>> '{}') ~ '[<>{}]'
    then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.platform_template_content_is_valid(jsonb) from public, anon, authenticated;

alter table public.platform_projects
  drop constraint platform_projects_template_content_check;

update public.platform_projects set template_content = template_content || jsonb_build_object(
  'quickQuizQuestions', jsonb_build_array(
    jsonb_build_object('prompt', '一年有多少个月？', 'answer', '12 个月'),
    jsonb_build_object('prompt', '彩虹通常有几种颜色？', 'answer', '7 种')
  ),
  'charadesWords', jsonb_build_array('交换戒指', '手捧花', '蜜月旅行', '婚礼蛋糕', '干杯', '拍合照')
)
where not (template_content ?& array['quickQuizQuestions', 'charadesWords']);

alter table public.platform_projects alter column template_content set default jsonb_build_object(
  'teamOneName', '海岛组',
  'teamTwoName', '沙漠组',
  'openingScript', '欢迎来到 {{couple}} 的婚礼游戏。今晚请跟随主持人提示，一起完成属于你们的故事。',
  'quizQuestions', '[]'::jsonb,
  'quickQuizQuestions', jsonb_build_array(
    jsonb_build_object('prompt', '一年有多少个月？', 'answer', '12 个月'),
    jsonb_build_object('prompt', '彩虹通常有几种颜色？', 'answer', '7 种')
  ),
  'charadesWords', jsonb_build_array('交换戒指', '手捧花', '蜜月旅行', '婚礼蛋糕', '干杯', '拍合照')
);

alter table public.platform_projects
  add constraint platform_projects_template_content_check
  check (public.platform_template_content_is_valid(template_content));

commit;
