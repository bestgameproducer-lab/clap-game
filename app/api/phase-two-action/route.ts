import { requireGuestContext } from '@/lib/auth';
import { submitPhaseTwoCopyChoice, submitPhaseTwoDilemma } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredEnum, requiredUuid } from '@/lib/validation';

const DILEMMA_CHOICES = ['LOVE', 'HATE', 'TOGETHER', 'TAKE_ALL'] as const;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { guestId, rehearsalRunId } = await requireGuestContext();
    const body = await readJsonObject(request);
    const action = requiredEnum(body.action, '第二轮任务操作', ['dilemma', 'copy'] as const);
    if (action === 'dilemma') {
      await submitPhaseTwoDilemma(guestId, requiredEnum(body.choice, '秘密选择', DILEMMA_CHOICES), rehearsalRunId);
    } else {
      await submitPhaseTwoCopyChoice(guestId, requiredUuid(body.targetGuestId, '复制目标'), rehearsalRunId);
    }
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
