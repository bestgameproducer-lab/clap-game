import { requireAdmin } from '@/lib/auth';
import {
  confirmStaffEvidence,
  createStaffEvidenceUpload,
  removeStaffEvidence,
} from '@/lib/data/evidence';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredString, requiredUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requireAdmin();
    const body = await readJsonObject(request);
    const data = await createStaffEvidenceUpload(
      requiredUuid(body.assignmentId, '任务 ID'),
      requiredUuid(body.rehearsalRunId, '婚礼运行批次'),
    );
    return noStoreJson(data);
  } catch (error) { return apiErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    await confirmStaffEvidence(
      requiredUuid(body.assignmentId, '任务 ID'),
      requiredString(body.path, '照片路径', 250),
      actor,
      requiredUuid(body.rehearsalRunId, '婚礼运行批次'),
    );
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const actor = await requireAdmin();
    const body = await readJsonObject(request);
    await removeStaffEvidence(
      requiredUuid(body.assignmentId, '任务 ID'),
      actor,
      requiredUuid(body.rehearsalRunId, '婚礼运行批次'),
    );
    return noStoreJson({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
