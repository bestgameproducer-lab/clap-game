import { requireGuest } from '@/lib/auth';
import { revealHonorSpecialCard } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    return noStoreJson({ ok: true, revealedAt: await revealHonorSpecialCard(guestId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
