import { revokePlatformInvitation } from '@/lib/data/platform-collaboration';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformUser } from '@/lib/platform/auth';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformInvitationRevokeInput } from '@/lib/validation/platform-collaboration';

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; invitationId: string }> }) {
  try {
    assertSameOrigin(request);
    await requirePlatformUser();
    const route = await params;
    const projectId = requiredUuid(route.projectId, '项目编号');
    const invitationId = requiredUuid(route.invitationId, '邀请编号');
    const input = readPlatformInvitationRevokeInput(await readJsonObject(request));
    return noStoreJson({ invitation: await revokePlatformInvitation(projectId, invitationId, input.eventKey) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
