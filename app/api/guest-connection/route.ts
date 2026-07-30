import { requireGuest } from '@/lib/auth';
import { requestGuestConnection } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { PLAYER_RELATIONSHIP_TYPES } from '@/lib/game-rules';
import { assertSameOrigin, readJsonObject, requiredEnum, requiredPlayerCode } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    const result = await requestGuestConnection(
      guestId,
      requiredPlayerCode(body.targetCode),
      requiredEnum(body.relationshipType, '关系类型', PLAYER_RELATIONSHIP_TYPES),
    );
    return noStoreJson({ ok: true, result });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
