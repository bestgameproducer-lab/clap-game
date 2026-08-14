import { requireGuestContext } from '@/lib/auth';
import { revealHonorSpecialCard } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { guestId, rehearsalRunId } = await requireGuestContext();
    return noStoreJson({ ok: true, revealedAt: await revealHonorSpecialCard(guestId, rehearsalRunId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
