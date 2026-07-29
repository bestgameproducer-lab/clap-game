-- Optional local-only example data. Apply after every migration.
-- Guests set their own four-digit PIN on first login; no password or legacy login code is seeded.
insert into guests (
  name,login_name,team,role,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes
)
select seed.*
from (values
  ('测试宾客 A','Test Guest A','玫瑰组','guest',true,true,'测试桌',false,true,true,'仅用于本地彩排'),
  ('测试宾客 B','Test Guest B','玫瑰组','spy',true,true,'测试桌',false,false,true,'仅用于本地彩排'),
  ('测试宾客 C','Test Guest C','月桂组','helper',true,true,'测试桌',false,false,true,'仅用于本地彩排')
) as seed(name,login_name,team,role,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes)
where not exists (
  select 1 from guests g
  where lower(regexp_replace(trim(g.login_name),'\s+',' ','g'))=lower(seed.login_name)
);

insert into tasks (title,description,verification_method,points,role_scope,category,stage,active)
select seed.*
from (values
  ('示例 · 秘密关键词','在不显得刻意的情况下，让三位宾客听到你说“月亮”。','由任务站询问三位听到关键词的宾客。',1,'guest','standard','task_round_1',true),
  ('示例 · 轻微干扰','自然地说服本组更换一次答案，但不要暴露你的身份。','由任务站记录被影响的题目和一名队友证言。',2,'spy','standard','task_round_1',true),
  ('示例 · 线索信使','提醒两位队友留意任务中的异常行为。','由任务站记录两位收到提醒的队友姓名。',2,'helper','standard','task_round_1',true)
) as seed(title,description,verification_method,points,role_scope,category,stage,active)
where not exists (select 1 from tasks t where t.title=seed.title);

insert into clues (title,content,level,active)
select seed.*
from (values
  ('示例线索一','间谍不在姓名首字母为 C 的宾客中。',1,true),
  ('示例线索二','间谍所在组不是当前积分最高的小组。',1,true)
) as seed(title,content,level,active)
where not exists (select 1 from clues c where c.title=seed.title);

update game_state set registration_open=true,stage='registration',voting_open=false,results_visible=false,updated_at=now()
where id=1;
