import 'server-only';
import { ApiError } from '../errors';
import { isTaskVisibleAtStage } from '../game-rules';
import { getSupabaseAdmin } from '../supabase';

export async function submitGuestAssignment(assignmentId: string, guestId: string) {
  const { error } = await getSupabaseAdmin().rpc('submit_assignment', {
    p_assignment_id: assignmentId, p_guest_id: guestId,
  });
  if (error?.message.includes('assignment_not_assignable')) throw new ApiError(409, '任务状态不可提交');
  if (error) throw new Error(`Unable to submit assignment: ${error.message}`);
}

export async function castGuestVote(voterGuestId: string, targetGuestId: string) {
  const { error } = await getSupabaseAdmin().rpc('cast_team_vote', {
    p_voter_guest_id: voterGuestId, p_target_guest_id: targetGuestId,
  });
  if (error?.message.includes('self_vote')) throw new ApiError(400, '不能投自己');
  if (error?.message.includes('voting_closed')) throw new ApiError(409, '投票尚未开放或已经关闭');
  if (error?.message.includes('cross_team_vote')) throw new ApiError(400, '只能投给本队宾客');
  if (error?.message.includes('guest_not_found')) throw new ApiError(404, '找不到投票对象');
  if (error) throw new Error(`Unable to save vote: ${error.message}`);
}

export async function drawGuestCard(guestId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('draw_guest_card', { p_guest_id: guestId });
  if (error?.message.includes('guest_not_claimed')) throw new ApiError(401, '请先认领宾客身份');
  if (error?.message.includes('draw_capacity_full')) throw new ApiError(409, '抽卡名额已经全部派发');
  if (error?.message.includes('draw_task_missing')) throw new ApiError(409, '任务池尚未配置完成，请联系主办方');
  if (error) throw new Error(`Unable to draw guest card: ${error.message}`);
  const card = Array.isArray(data) ? data[0] : data;
  if (!card) throw new Error('Unable to draw guest card: empty response');
  return {
    team: card.guest_team,
    role: card.guest_role,
    task: {
      id: card.task_id,
      title: card.task_title,
      description: card.task_description,
      points: card.task_points,
    },
    drawnAt: card.card_drawn_at,
  };
}

export async function getGuestView(guestId: string) {
  const db = getSupabaseAdmin();
  const { data: guest, error: guestError } = await db.from('guests').select('id,name,team,role,points,drawn_at').eq('id', guestId).single();
  if (guestError || !guest) throw new ApiError(401, '登录已失效');
  const results = await Promise.all([
    db.from('assignments').select('id,status,rejection_reason,task:tasks(title,description,points,category,stage)').eq('guest_id', guestId).order('created_at'),
    db.from('guest_clues').select('id,clue:clues(title,content)').eq('guest_id', guestId),
    db.from('game_state').select('registration_open,stage,voting_open,results_visible,scoreboard_visible,phase_note').eq('id', 1).single(),
    db.from('guests').select('id,name,team').eq('team', guest.team).order('name'),
    db.from('votes').select('target_guest_id').eq('voter_guest_id', guestId).maybeSingle(),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load guest data: ${error.message}`);
  const visibleAssignments = (results[0].data ?? []).filter((assignment: { task: { stage?: string } | { stage?: string }[] | null }) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return isTaskVisibleAtStage(task?.stage, results[2].data?.stage);
  });
  return {
    guest,
    assignments: visibleAssignments,
    clues: (results[1].data ?? []).map((item: { id: string; clue: { title: string; content: string } | { title: string; content: string }[] | null }) => ({
      id: item.id,
      title: Array.isArray(item.clue) ? item.clue[0]?.title : item.clue?.title,
      content: Array.isArray(item.clue) ? item.clue[0]?.content : item.clue?.content,
    })),
    game: results[2].data,
    candidates: results[3].data ?? [],
    existingVote: results[4].data?.target_guest_id ?? null,
  };
}
