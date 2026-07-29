import 'server-only';
import { ApiError } from '../errors';
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

export async function getGuestView(guestId: string) {
  const db = getSupabaseAdmin();
  const { data: guest, error: guestError } = await db.from('guests').select('id,name,team,points').eq('id', guestId).single();
  if (guestError || !guest) throw new ApiError(401, '登录已失效');
  const results = await Promise.all([
    db.from('assignments').select('id,status,task:tasks(title,description,points)').eq('guest_id', guestId).order('created_at'),
    db.from('guest_clues').select('id,clue:clues(content)').eq('guest_id', guestId),
    db.from('game_state').select('voting_open,results_visible').eq('id', 1).single(),
    db.from('guests').select('id,name,team').eq('team', guest.team).order('name'),
    db.from('votes').select('target_guest_id').eq('voter_guest_id', guestId).maybeSingle(),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load guest data: ${error.message}`);
  return {
    guest,
    assignments: results[0].data ?? [],
    clues: (results[1].data ?? []).map((item: { id: string; clue: { content: string } | { content: string }[] | null }) => ({
      id: item.id, content: Array.isArray(item.clue) ? item.clue[0]?.content : item.clue?.content,
    })),
    game: results[2].data,
    candidates: results[3].data ?? [],
    existingVote: results[4].data?.target_guest_id ?? null,
  };
}
