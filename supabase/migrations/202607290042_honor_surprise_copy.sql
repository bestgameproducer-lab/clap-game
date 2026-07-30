-- Honor guests still draw a card; the card reveals a family surprise rather than a game mission.
begin;

update guests
set special_card_title='家庭守护者',
  special_card_body='你已经完成了最重要的任务：一路陪伴新郎长大，并见证他与所爱的人建立自己的家庭。今天不需要完成任何挑战。请安心享受婚礼，接受新人和所有宾客的感谢与祝福。'
where active and participation_mode='HONOR_GUEST';

insert into audit_log(actor,action,target_type,target_id,details)
values('migration:202607290042','guest.honor_surprise_copy_update','guest_roster','honor_guests',
  jsonb_build_object('honor_guests_updated',(select count(*) from guests where active and participation_mode='HONOR_GUEST')));

commit;
