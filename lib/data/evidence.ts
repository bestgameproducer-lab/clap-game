import 'server-only';
import { ApiError } from '../errors';
import { isTaskActionOpenAtStage } from '../game-rules';
import { getSupabaseAdmin } from '../supabase';

export const TASK_EVIDENCE_BUCKET = 'task-evidence';
const EVIDENCE_URL_TTL_SECONDS = 10 * 60;

function assignmentEvidencePath(guestId: string, assignmentId: string) {
  return `${guestId}/${assignmentId}/evidence.jpg`;
}

async function requireEditableGuestAssignment(assignmentId: string, guestId: string) {
  const db = getSupabaseAdmin();
  const [{ data, error }, { data: game, error: gameError }] = await Promise.all([
    db.from('assignments').select('id,status,task:tasks!assignments_task_id_fkey(stage)').eq('id', assignmentId).eq('guest_id', guestId).maybeSingle(),
    db.from('game_state').select('stage').eq('id', 1).single(),
  ]);
  if (error || gameError) throw new Error(`Unable to authorize task evidence: ${error?.message ?? gameError?.message}`);
  if (!data) throw new ApiError(404, '找不到任务');
  if (!['assigned', 'rejected'].includes(data.status)) throw new ApiError(409, '任务已提交，若需更换照片请先联系任务站退回');
  const task = Array.isArray(data.task) ? data.task[0] : data.task;
  if (!isTaskActionOpenAtStage(task?.stage, game?.stage)) throw new ApiError(409, '当前环节暂停或已关闭照片上传；仪式前、仪式结束后至最终投票前开放');
}

async function requireEditableStaffAssignment(assignmentId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('assignments')
    .select('id,guest_id,status')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error) throw new Error(`Unable to authorize staff task evidence: ${error.message}`);
  if (!data) throw new ApiError(404, '找不到任务');
  if (!['assigned', 'rejected', 'submitted'].includes(data.status)) throw new ApiError(409, '已完成的任务不能更换验证照片');
  return data.guest_id;
}

export async function createGuestEvidenceUpload(assignmentId: string, guestId: string) {
  await requireEditableGuestAssignment(assignmentId, guestId);
  const path = assignmentEvidencePath(guestId, assignmentId);
  const { data, error } = await getSupabaseAdmin().storage
    .from(TASK_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Unable to authorize evidence upload: ${error?.message ?? 'missing URL'}`);
  return { path, signedUrl: data.signedUrl };
}

export async function confirmGuestEvidence(assignmentId: string, guestId: string, path: string) {
  await requireEditableGuestAssignment(assignmentId, guestId);
  const { error } = await getSupabaseAdmin().rpc('confirm_assignment_evidence', {
    p_assignment_id: assignmentId,
    p_guest_id: guestId,
    p_evidence_path: path,
  });
  if (error?.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
  if (error?.message.includes('assignment_evidence_locked')) throw new ApiError(409, '任务已提交，不能更换验证照片');
  if (error?.message.includes('invalid_evidence_path')) throw new ApiError(400, '照片路径无效');
  if (error?.message.includes('evidence_object_missing')) throw new ApiError(409, '照片尚未上传完成，请重试');
  if (error) throw new Error(`Unable to confirm evidence upload: ${error.message}`);
}

export async function removeGuestEvidence(assignmentId: string, guestId: string) {
  const db = getSupabaseAdmin();
  await requireEditableGuestAssignment(assignmentId, guestId);
  const { data: path, error } = await db.rpc('clear_assignment_evidence', {
    p_assignment_id: assignmentId,
    p_guest_id: guestId,
  });
  if (error?.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
  if (error?.message.includes('assignment_evidence_locked')) throw new ApiError(409, '任务已提交，不能删除验证照片');
  if (error) throw new Error(`Unable to clear task evidence: ${error.message}`);
  if (typeof path === 'string' && path) {
    const { error: storageError } = await db.storage.from(TASK_EVIDENCE_BUCKET).remove([path]);
    if (storageError) throw new Error(`Unable to remove task evidence: ${storageError.message}`);
  }
}

export async function createStaffEvidenceUpload(assignmentId: string) {
  const guestId = await requireEditableStaffAssignment(assignmentId);
  const path = assignmentEvidencePath(guestId, assignmentId);
  const { data, error } = await getSupabaseAdmin().storage
    .from(TASK_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Unable to authorize staff evidence upload: ${error?.message ?? 'missing URL'}`);
  return { path, signedUrl: data.signedUrl };
}

export async function confirmStaffEvidence(assignmentId: string, path: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('confirm_assignment_evidence_staff', {
    p_assignment_id: assignmentId,
    p_evidence_path: path,
    p_actor: actor,
  });
  if (error?.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
  if (error?.message.includes('assignment_evidence_locked')) throw new ApiError(409, '已完成的任务不能更换验证照片');
  if (error?.message.includes('invalid_evidence_path')) throw new ApiError(400, '照片路径无效');
  if (error?.message.includes('evidence_object_missing')) throw new ApiError(409, '照片尚未上传完成，请重试');
  if (error) throw new Error(`Unable to confirm staff evidence upload: ${error.message}`);
}

export async function removeStaffEvidence(assignmentId: string, actor: string) {
  const db = getSupabaseAdmin();
  const { data: path, error } = await db.rpc('clear_assignment_evidence_staff', {
    p_assignment_id: assignmentId,
    p_actor: actor,
  });
  if (error?.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
  if (error?.message.includes('assignment_evidence_locked')) throw new ApiError(409, '已完成的任务不能删除验证照片');
  if (error) throw new Error(`Unable to clear staff task evidence: ${error.message}`);
  if (typeof path === 'string' && path) {
    const { error: storageError } = await db.storage.from(TASK_EVIDENCE_BUCKET).remove([path]);
    if (storageError) throw new Error(`Unable to remove staff task evidence: ${storageError.message}`);
  }
}

export async function signEvidencePaths<T extends { evidence_path?: string | null }>(items: T[]) {
  const paths = [...new Set(items.flatMap((item) => item.evidence_path ? [item.evidence_path] : []))];
  if (paths.length === 0) return items.map((item) => ({ ...item, evidence_url: null }));
  const { data, error } = await getSupabaseAdmin().storage
    .from(TASK_EVIDENCE_BUCKET)
    .createSignedUrls(paths, EVIDENCE_URL_TTL_SECONDS);
  if (error || !data) throw new Error(`Unable to sign task evidence: ${error?.message ?? 'missing URLs'}`);
  const signedByPath = new Map(data.map((item) => [item.path, item.signedUrl]));
  return items.map((item) => ({
    ...item,
    evidence_url: item.evidence_path ? signedByPath.get(item.evidence_path) ?? null : null,
  }));
}
