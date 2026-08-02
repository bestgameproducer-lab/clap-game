-- Add the confirmed Chinese display names without changing stable login names,
-- guest ids, sessions, roles, assignments, or any live scoring data.

begin;

with desired_names(login_name, display_name) as (
  values
    ('Tang-Ling Yeh', '葉瑭翎 Tang-Ling Yeh'),
    ('Feifei Xie', '謝菲菲 Feifei Xie'),
    ('Anrong', '陈安融 Anrong'),
    ('Zimin Jin', '金紫民 Zimin Jin'),
    ('Yi Ren', '任易 Yi Ren')
)
update guests g
set name = d.display_name
from desired_names d
where lower(g.login_name) = lower(d.login_name)
  and g.name is distinct from d.display_name;

do $$
declare v_named integer;
begin
  select count(*) into v_named
  from guests g
  join (
    values
      ('Tang-Ling Yeh', '葉瑭翎 Tang-Ling Yeh'),
      ('Feifei Xie', '謝菲菲 Feifei Xie'),
      ('Anrong', '陈安融 Anrong'),
      ('Zimin Jin', '金紫民 Zimin Jin'),
      ('Yi Ren', '任易 Yi Ren')
  ) as d(login_name, display_name)
    on lower(g.login_name) = lower(d.login_name)
   and g.name = d.display_name;

  if v_named <> 5 then
    raise exception using errcode = 'P0001', message = 'guest_chinese_display_name_patch_failed';
  end if;
end $$;

insert into audit_log(actor, action, target_type, target_id, details)
values(
  'migration:202608020005',
  'guest.display_names_updated',
  'guests',
  'batch',
  jsonb_build_object('count', 5, 'login_names_preserved', true, 'runtime_preserved', true)
);

commit;
