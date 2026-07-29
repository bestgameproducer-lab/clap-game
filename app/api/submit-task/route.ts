import { requireGuest } from '@/lib/auth';
import { submitGuestAssignment } from '@/lib/data/guest';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, optionalString, readJsonObject, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    await submitGuestAssignment(
      requiredUuid(body.assignmentId, '任务 ID'),
      guestId,
      optionalString(body.completionNote, '完成说明', 500),
    );
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
