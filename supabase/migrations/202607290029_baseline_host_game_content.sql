-- Ready-to-use neutral content for the knowledge round and resource auction.
-- Couple-specific story questions intentionally remain organizer-authored.
insert into host_segments(title,stage,public_prompt,host_notes,correct_answer,public_clue,timer_minutes,sort_order,ready,active)
select seed.title,'group_game',seed.prompt,seed.notes,seed.answer,'',1,seed.sort_order,true,true
from (values
  ('连续知识挑战 · 01','澳大利亚的首都是哪座城市？','接受中文或英文城市名。','堪培拉 / Canberra',220),
  ('连续知识挑战 · 02','太阳系中距离太阳最近的行星是哪一颗？','只接受行星名称。','水星 / Mercury',221),
  ('连续知识挑战 · 03','世界上面积最大的海洋是哪一个？','“太平洋”即可。','太平洋 / Pacific Ocean',222),
  ('连续知识挑战 · 04','《罗密欧与朱丽叶》的作者是谁？','接受常见中文译名或英文姓名。','威廉·莎士比亚 / William Shakespeare',223),
  ('连续知识挑战 · 05','名画《蒙娜丽莎》的作者是谁？','接受“达·芬奇”。','列奥纳多·达·芬奇 / Leonardo da Vinci',224),
  ('连续知识挑战 · 06','黄金的化学元素符号是什么？','需要说出两个字母。','Au',225),
  ('连续知识挑战 · 07','人的心脏通常有几个腔室？','回答数字即可。','4 个',226),
  ('连续知识挑战 · 08','一个直角是多少度？','回答数字即可。','90 度',227),
  ('连续知识挑战 · 09','闰年通常有多少天？','回答数字即可。','366 天',228),
  ('连续知识挑战 · 10','日本的首都是哪座城市？','接受中文或英文城市名。','东京 / Tokyo',229)
) as seed(title,prompt,notes,answer,sort_order)
where not exists(select 1 from host_segments existing where existing.title=seed.title);

insert into host_segments(title,stage,public_prompt,host_notes,correct_answer,public_clue,timer_minutes,sort_order,ready,active)
select seed.title,'group_game',seed.prompt,seed.notes,seed.effect,'',1,seed.sort_order,true,true
from (values
  ('资源竞拍 · 排除选项','拍品：下一题可排除一个错误选项。现在开始竞价。','成交后记录金币，再由主持人在下一题读出一个可排除选项。','仅下一题有效；主持人排除一个确定错误的选项。',320),
  ('资源竞拍 · 额外回答','拍品：下一题答错后可再回答一次。现在开始竞价。','必须先扣除成交金币；第二次答案仍需在题目时间内给出。','仅下一题有效；首次答错不转交，允许立即再答一次。',321),
  ('资源竞拍 · 照片回看','拍品：可额外查看爱情档案照片五秒。现在开始竞价。','确认投影只显示公开照片，不要显示主持答案。','成交队伍可额外查看当前公开照片 5 秒。',322),
  ('资源竞拍 · 加时十五秒','拍品：下一题增加十五秒讨论时间。现在开始竞价。','发布下一题时把原倒计时增加 15 秒。','仅下一题有效；讨论时间增加 15 秒。',323),
  ('资源竞拍 · 修改答案','拍品：下一题锁定答案后可修改一次。现在开始竞价。','主持人宣布正确答案前，成交队可使用一次。','仅下一题有效；公布答案前允许修改一次最终答案。',324),
  ('资源竞拍 · 公开线索','拍品：获得一条由主持人确认的公开间谍线索。现在开始竞价。','成交前必须确认后台已准备可公开线索；没有真实线索时跳过本拍品。','成交后由主持人发布一条已复核且不会直接点名的公开线索。',325)
) as seed(title,prompt,notes,effect,sort_order)
where not exists(select 1 from host_segments existing where existing.title=seed.title);
