import { createPlatformInvitation } from '@/lib/data/platform-collaboration';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformUser } from '@/lib/platform/auth';
import { hashPlatformInvitationToken } from '@/lib/platform/invitation';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformInvitationCreateInput } from '@/lib/validation/platform-collaboration';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    await requirePlatformUser();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformInvitationCreateInput(await readJsonObject(request));
    const invitation = await createPlatformInvitation(
      projectId,
      input.eventKey,
      input.role,
      hashPlatformInvitationToken(input.invitationToken),
    );
    return noStoreJson({ invitation, invitePath: `/platform/invitations/${input.invitationToken}` });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
