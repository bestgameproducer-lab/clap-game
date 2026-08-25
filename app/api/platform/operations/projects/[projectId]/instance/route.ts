import { registerPlatformRuntimeInstance } from '@/lib/data/platform-operations';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformStaff } from '@/lib/platform/staff';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformInstanceRegistrationInput } from '@/lib/validation/platform-operations';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const staff = await requirePlatformStaff();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformInstanceRegistrationInput(await readJsonObject(request));
    return noStoreJson({
      instance: await registerPlatformRuntimeInstance(
        staff.user.id,
        projectId,
        input.eventKey,
        input.targetOrigin,
        input.deploymentRef,
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
