import { requireGuest } from '@/lib/auth';
import { submitGuestAssignment } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    await submitGuestAssignment(requiredUuid(body.assignmentId, '任务 ID'), guestId);
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
