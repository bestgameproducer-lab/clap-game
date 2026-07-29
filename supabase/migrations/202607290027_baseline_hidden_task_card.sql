-- The product baseline requires four physical hidden cards. Earlier seeds provide
-- two regular hidden cards plus the single hidden-spy card, so add one neutral card.
insert into tasks(title,description,verification_method,points,role_scope,category,stage,active,grants_hidden_spy)
select
  '祝福密令',
  '找到藏在婚礼现场的祝福信封，记住其中的密令并把信封留在原处，然后前往任务站兑换。',
  '向任务站准确说出信封中的密令；工作人员核对实体卡后收回或标记该卡。',
  40,'all','hidden','task_round_2',true,false
where not exists(select 1 from tasks where title='祝福密令');
