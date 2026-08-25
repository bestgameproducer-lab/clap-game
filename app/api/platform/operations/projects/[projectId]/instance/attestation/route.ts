import { attestPlatformRuntimeInstance } from '@/lib/data/platform-operations';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformStaff } from '@/lib/platform/staff';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformRuntimeAttestationInput } from '@/lib/validation/platform-operations';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const staff = await requirePlatformStaff();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformRuntimeAttestationInput(await readJsonObject(request));
    return noStoreJson({
      instance: await attestPlatformRuntimeInstance(
        staff.user.id,
        projectId,
        input.eventKey,
        input.stage,
        input.checklist,
        input.note,
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
