import { requireGuest } from '@/lib/auth';
import { recordCupidHelperAction } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    await recordCupidHelperAction(
      guestId,
      requiredUuid(body.tricksterGuestId, '恶作剧者'),
      requiredString(body.note, '帮助记录', 500),
    );
    return noStoreJson({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
