import { requireGuestContext } from '@/lib/auth';
import { castGuestVote } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { guestId, rehearsalRunId } = await requireGuestContext();
    const body = await readJsonObject(request);
    await castGuestVote(guestId, requiredUuid(body.targetGuestId, '投票对象'), rehearsalRunId);
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
