import 'server-only';
import { ApiError } from '../errors';
import { isTaskActionOpenAtStage, taskActionClosedMessage } from '../game-rules';
import { acceptsGuestPhotoEvidence } from '../guest-task-ui';
import { getSupabaseAdmin } from '../supabase';

export const TASK_EVIDENCE_BUCKET = 'task-evidence';
const EVIDENCE_URL_TTL_SECONDS = 10 * 60;

function throwEvidenceRpcError(error: { message: string }, action: string, taskStage?: string | null): never {
  if (error.message.includes('rehearsal_run_mismatch')
      || error.message.includes('rehearsal_run_required')) {
    throw new ApiError(409, '页面属于上一轮彩排，请刷新后重试');
  }
  if (error.message.includes('guest_rehearsal_run_mismatch')
      || error.message.includes('guest_session_stale')
      || error.message.includes('guest_rehearsal_run_required')) {
    throw new ApiError(401, '本设备的登录属于上一轮彩排，请重新登录');
  }
  if (error.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
  if (error.message.includes('assignment_guest_not_claimed')) throw new ApiError(409, '该宾客当前未登录，不能上传验证照片');
  if (error.message.includes('assignment_evidence_locked')) throw new ApiError(409, '任务已提交或完成，不能更换验证照片');
  if (error.message.includes('station_photo_evidence_forbidden')) throw new ApiError(409, '这项任务不接收工作人员照片验证，请按任务卡上的核验方式处理');
  if (error.message.includes('assignment_stage_closed')) throw new ApiError(409, taskActionClosedMessage(taskStage, '照片上传'));
  if (error.message.includes('final_results_locked')) throw new ApiError(409, '终局结果已发布，验证照片已锁定');
  if (error.message.includes('invalid_evidence_path')) throw new ApiError(400, '照片路径无效');
  if (error.message.includes('evidence_object_missing')) throw new ApiError(409, '照片尚未上传完成，请重试');
  throw new Error(`${action}: ${error.message}`);
}

async function throwEvidenceRpcErrorForAssignment(
  error: { message: string },
  action: string,
  assignmentId: string,
): Promise<never> {
  let taskStage: string | null = null;
  if (error.message.includes('assignment_stage_closed')) {
    const { data } = await getSupabaseAdmin()
      .from('assignments')
      .select('task:tasks!assignments_task_id_fkey(stage)')
      .eq('id', assignmentId)
      .maybeSingle();
    const task = Array.isArray(data?.task) ? data.task[0] : data?.task;
    taskStage = task?.stage ?? null;
  }
  throwEvidenceRpcError(error, action, taskStage);
}

async function requireEditableGuestAssignment(assignmentId: string, guestId: string) {
  const db = getSupabaseAdmin();
  const [
    { data, error },
    { data: game, error: gameError },
    { data: reward, error: rewardError },
  ] = await Promise.all([
    db.from('assignments').select('id,status,task:tasks!assignments_task_id_fkey(stage,mission_code,mechanic)').eq('id', assignmentId).eq('guest_id', guestId).maybeSingle(),
    db.from('game_state').select('stage,results_published_at,task_catalog_mode').eq('id', 1).single(),
    db.from('result_rewards').select('id').limit(1).maybeSingle(),
  ]);
  if (error || gameError || rewardError) throw new Error(`Unable to authorize task evidence: ${error?.message ?? gameError?.message ?? rewardError?.message}`);
  if (!data) throw new ApiError(404, '找不到任务');
  if (game?.results_published_at || reward) throw new ApiError(409, '终局结果已发布，验证照片已锁定');
  if (!['assigned', 'rejected'].includes(data.status)) throw new ApiError(409, '任务已提交，若需更换照片请先联系任务站退回');
  const task = Array.isArray(data.task) ? data.task[0] : data.task;
  if (!acceptsGuestPhotoEvidence({
    missionCode: task?.mission_code,
    mechanic: task?.mechanic,
    catalogMode: game?.task_catalog_mode,
  })) throw new ApiError(409, '这项任务不接收照片验证，请按任务卡上的验证方式完成');
  if (!isTaskActionOpenAtStage(task?.stage, game?.stage)) throw new ApiError(409, taskActionClosedMessage(task?.stage, '照片上传'));
}

async function requireEditableStaffAssignment(assignmentId: string, requirePhoto = true) {
  const db = getSupabaseAdmin();
  const [
    { data, error },
    { data: game, error: gameError },
    { data: reward, error: rewardError },
  ] = await Promise.all([
    db.from('assignments').select('id,guest_id,status,task:tasks!assignments_task_id_fkey(stage,category,verification_type)').eq('id', assignmentId).maybeSingle(),
    db.from('game_state').select('stage,results_published_at').eq('id', 1).single(),
    db.from('result_rewards').select('id').limit(1).maybeSingle(),
  ]);
  if (error || gameError || rewardError) throw new Error(`Unable to authorize staff task evidence: ${error?.message ?? gameError?.message ?? rewardError?.message}`);
  if (!data) throw new ApiError(404, '找不到任务');
  if (game?.results_published_at || reward) throw new ApiError(409, '终局结果已发布，验证照片已锁定');
  if (!['assigned', 'rejected', 'submitted'].includes(data.status)) throw new ApiError(409, '已完成的任务不能更换验证照片');
  const task = Array.isArray(data.task) ? data.task[0] : data.task;
  if (task?.category === 'hidden') throw new ApiError(409, '隐藏身份任务不接收验证照片');
  if (requirePhoto && task?.verification_type !== 'PHOTO') throw new ApiError(409, '这项任务不接收工作人员照片验证，请按任务卡上的核验方式处理');
  if (!isTaskActionOpenAtStage(task?.stage, game?.stage)) throw new ApiError(409, taskActionClosedMessage(task?.stage, '照片上传'));
  return data.guest_id;
}

export async function createGuestEvidenceUpload(assignmentId: string, guestId: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  await requireEditableGuestAssignment(assignmentId, guestId);
  const { data: path, error: authorizationError } = await db.rpc('authorize_guest_assignment_evidence_upload', {
    p_assignment_id: assignmentId,
    p_guest_id: guestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (authorizationError) await throwEvidenceRpcErrorForAssignment(authorizationError, 'Unable to authorize task evidence', assignmentId);
  if (typeof path !== 'string' || !path) throw new Error('Unable to authorize task evidence: missing path');
  const { data, error } = await db.storage
    .from(TASK_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Unable to authorize evidence upload: ${error?.message ?? 'missing URL'}`);
  return { path, signedUrl: data.signedUrl };
}

export async function confirmGuestEvidence(assignmentId: string, guestId: string, path: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('confirm_assignment_evidence', {
    p_assignment_id: assignmentId,
    p_guest_id: guestId,
    p_evidence_path: path,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) await throwEvidenceRpcErrorForAssignment(error, 'Unable to confirm evidence upload', assignmentId);
}

export async function removeGuestEvidence(assignmentId: string, guestId: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  await requireEditableGuestAssignment(assignmentId, guestId);
  const { data: path, error } = await db.rpc('clear_assignment_evidence', {
    p_assignment_id: assignmentId,
    p_guest_id: guestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) await throwEvidenceRpcErrorForAssignment(error, 'Unable to clear task evidence', assignmentId);
  if (typeof path === 'string' && path) {
    const { error: storageError } = await db.storage.from(TASK_EVIDENCE_BUCKET).remove([path]);
    if (storageError) throw new Error(`Unable to remove task evidence: ${storageError.message}`);
  }
}

export async function createStaffEvidenceUpload(assignmentId: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  await requireEditableStaffAssignment(assignmentId);
  const { data: path, error: authorizationError } = await db.rpc('authorize_staff_assignment_evidence_upload_for_run', {
    p_assignment_id: assignmentId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (authorizationError) await throwEvidenceRpcErrorForAssignment(authorizationError, 'Unable to authorize staff task evidence', assignmentId);
  if (typeof path !== 'string' || !path) throw new Error('Unable to authorize staff task evidence: missing path');
  const { data, error } = await db.storage
    .from(TASK_EVIDENCE_BUCKET)
    .createSignedUploadUrl(path, { upsert: true });
  if (error || !data) throw new Error(`Unable to authorize staff evidence upload: ${error?.message ?? 'missing URL'}`);
  return { path, signedUrl: data.signedUrl };
}

export async function confirmStaffEvidence(assignmentId: string, path: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('confirm_assignment_evidence_staff_for_run', {
    p_assignment_id: assignmentId,
    p_evidence_path: path,
    p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) await throwEvidenceRpcErrorForAssignment(error, 'Unable to confirm staff evidence upload', assignmentId);
}

export async function removeStaffEvidence(assignmentId: string, actor: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  // Clearing an old pointer is always a privacy-safe repair. New uploads and
  // confirmations remain PHOTO-only, but a historical non-photo attachment
  // must not become impossible to remove after the verification rules tighten.
  await requireEditableStaffAssignment(assignmentId, false);
  const { data: path, error } = await db.rpc('clear_assignment_evidence_staff_for_run', {
    p_assignment_id: assignmentId,
    p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) await throwEvidenceRpcErrorForAssignment(error, 'Unable to clear staff task evidence', assignmentId);
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
