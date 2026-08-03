import { requireGuest } from '@/lib/auth';
import { acceptGuestConnection } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    const result = await acceptGuestConnection(guestId, requiredUuid(body.relationshipId, '配对邀请'));
    return noStoreJson({ ok: true, result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
