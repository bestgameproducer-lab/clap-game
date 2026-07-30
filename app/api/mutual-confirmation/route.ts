import { requireGuest } from '@/lib/auth';
import { requestAssignmentMutualConfirmation, respondAssignmentMutualConfirmation } from '@/lib/data/guest';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredBoolean, requiredEnum, requiredPlayerCode, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    const action = requiredEnum(body.action, '操作', ['REQUEST', 'RESPOND'] as const);
    if (action === 'REQUEST') {
      await requestAssignmentMutualConfirmation(
        requiredUuid(body.assignmentId, '任务 ID'), guestId, requiredPlayerCode(body.targetCode),
      );
    } else if (action === 'RESPOND') {
      await respondAssignmentMutualConfirmation(
        requiredUuid(body.confirmationId, '确认邀请'), guestId, requiredBoolean(body.accept, '确认结果'),
      );
    } else {
      throw new ApiError(400, '未知确认操作');
    }
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
