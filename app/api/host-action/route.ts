import { requireAdmin } from '@/lib/auth';
import { adjustHostGuestPoints, adjustHostTeamPoints } from '@/lib/data/host';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredInteger, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    const type = requiredString(body.type, '操作类型', 40);
    if (type === 'adjustTeamPoints') {
      const total = await adjustHostTeamPoints({
        team: requiredString(body.team, '组别', 40),
        amount: requiredInteger(body.amount, '团队加分', 1, 100),
        reason: requiredString(body.reason, '加分原因', 200),
        eventKey: requiredUuid(body.eventKey, '幂等事件 ID'),
      }, actor);
      return noStoreJson({ ok: true, total });
    }
    if (type === 'adjustGuestPoints') {
      const total = await adjustHostGuestPoints({
        guestId: requiredUuid(body.guestId, '宾客 ID'),
        amount: requiredInteger(body.amount, '个人加分', 1, 100),
        reason: requiredString(body.reason, '加分原因', 200),
        eventKey: requiredUuid(body.eventKey, '幂等事件 ID'),
      }, actor);
      return noStoreJson({ ok: true, total });
    }
    throw new ApiError(400, '未知操作');
  } catch (error) { return apiErrorResponse(error); }
}
