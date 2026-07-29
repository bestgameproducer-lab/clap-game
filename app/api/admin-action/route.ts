import { requireAdmin } from '@/lib/auth';
import { approveAssignment, rejectAssignment, setGameFlag } from '@/lib/data/admin';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredBoolean, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    const type = requiredString(body.type, '操作类型', 40);
    if (type === 'toggleVoting') {
      await setGameFlag('voting_open', requiredBoolean(body.value, '投票状态'), actor);
    } else if (type === 'toggleResults') {
      await setGameFlag('results_visible', requiredBoolean(body.value, '结果状态'), actor);
    } else if (type === 'approve') {
      await approveAssignment(requiredUuid(body.assignmentId, '任务 ID'), actor, '任务审核通过');
    } else if (type === 'reject') {
      const reason = body.reason === undefined ? '管理员退回' : requiredString(body.reason, '退回原因', 500);
      await rejectAssignment(requiredUuid(body.assignmentId, '任务 ID'), actor, reason);
    } else {
      throw new ApiError(400, '未知操作');
    }
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
