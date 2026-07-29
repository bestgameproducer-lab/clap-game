import { requireGuest } from '@/lib/auth';
import {
  confirmGuestEvidence,
  createGuestEvidenceUpload,
  removeGuestEvidence,
} from '@/lib/data/evidence';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    const data = await createGuestEvidenceUpload(requiredUuid(body.assignmentId, '任务 ID'), guestId);
    return noStoreJson(data);
  } catch (error) { return apiErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    await confirmGuestEvidence(
      requiredUuid(body.assignmentId, '任务 ID'),
      guestId,
      requiredString(body.path, '照片路径', 250),
    );
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const guestId = await requireGuest();
    const body = await readJsonObject(request);
    await removeGuestEvidence(requiredUuid(body.assignmentId, '任务 ID'), guestId);
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
