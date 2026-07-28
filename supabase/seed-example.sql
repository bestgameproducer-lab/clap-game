-- Replace these sample names, codes, teams, and tasks with your real wedding data.
insert into guests (name, login_code, team, role) values
('测试宾客A', '1024', '沙漠组', 'guest'),
('测试宾客B', '2048', '太平洋组', 'spy'),
('测试宾客C', '4096', '沙漠组', 'guest')
on conflict do nothing;

insert into tasks (title, description, points, role_scope) values
('秘密关键词', '在不显得刻意的情况下，让三位宾客听到你说“月亮”。', 10, 'all'),
('合影挑战', '邀请两位不同组的宾客与你完成一张有趣合影。', 10, 'guest'),
('轻微干扰', '自然地说服本组更换一次答案，但不要暴露你的身份。', 15, 'spy')
on conflict do nothing;

-- Assign the first eligible task to each sample guest.
insert into assignments (guest_id, task_id)
select g.id, t.id
from guests g
join lateral (
  select id from tasks
  where role_scope = 'all' or role_scope = g.role
  order by created_at
  limit 1
) t on true
on conflict do nothing;

insert into clues (content) values
('间谍不在姓名首字母为 C 的宾客中。'),
('间谍所在组不是当前积分最高的小组。')
on conflict do nothing;
