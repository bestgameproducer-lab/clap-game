-- Replace the superseded reunion-photo prompt without changing task identity,
-- assignment history, capacity, points, or phase-two photo exclusions.
do $$
begin
  update public.tasks
  set title = '拍摄一张新郎新娘同框的照片',
      description = '在不打扰婚礼流程的前提下，捕捉一张新郎和新娘同时入镜的照片。',
      verification_method = '上传照片或向任务站工作人员出示照片。'
  where mission_code = 'P1-SOCIAL-002'
    and not is_demo;

  if not found then
    raise exception 'phase_one_reunion_photo_task_not_found';
  end if;
end;
$$;
