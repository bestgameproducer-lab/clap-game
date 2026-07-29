import 'server-only';
import { ApiError } from '../errors';
import { getSupabaseAdmin } from '../supabase';

function ensureNoDatabaseError(error: { message: string } | null, fallback: string): void {
  if (error) {
    if (error.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
    if (error.message.includes('assignment_not_submitted') || error.message.includes('duplicate key')) {
      throw new ApiError(409, '该任务已经处理，无法重复操作');
    }
    throw new Error(`${fallback}: ${error.message}`);
  }
}

export async function getAdminDashboardData() {
  const db = getSupabaseAdmin();
  const results = await Promise.all([
    db.from('guests').select('id,name,login_name,team,points,claimed_at,created_at').order('team').order('name'),
    db.from('assignments').select('id,guest_id,task_id,status,submitted_at,approved_at,created_at,task:tasks(id,title,description,points)'),
    db.from('tasks').select('id,title,description,points,role_scope,created_at'),
    db.from('assignments').select('id,status,submitted_at,guest:guests(id,name),task:tasks(id,title,points)').eq('status', 'submitted'),
    db.from('votes').select('id,voter_guest_id,target_guest_id,created_at,target:guests!votes_target_guest_id_fkey(id,name)'),
    db.from('game_state').select('id,registration_open,stage,voting_open,results_visible,updated_at').eq('id', 1).single(),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load admin data: ${error.message}`);
  return {
    guests: results[0].data ?? [], assignments: results[1].data ?? [], tasks: results[2].data ?? [],
    submissions: results[3].data ?? [], votes: results[4].data ?? [], game: results[5].data,
  };
}

export async function approveAssignment(assignmentId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('approve_assignment', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to approve assignment');
}

export async function rejectAssignment(assignmentId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('reject_assignment', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to reject assignment');
}

export async function setGameFlag(field: 'voting_open' | 'results_visible', value: boolean, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_flag', {
    p_field: field, p_value: value, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to update game state');
}

export async function setRegistrationOpen(value: boolean, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_registration_open', { p_value: value, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to update registration state');
}

export async function setGameStage(stage: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_stage', { p_stage: stage, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to update game stage');
}

export async function resetGuestClaim(guestId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('reset_guest_claim', { p_guest_id: guestId, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to reset guest claim');
}
