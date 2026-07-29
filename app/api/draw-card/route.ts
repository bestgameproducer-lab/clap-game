import { requireGuest } from '@/lib/auth';
import { drawGuestCard } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    return noStoreJson({ ok: true, card: await drawGuestCard(guestId) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
