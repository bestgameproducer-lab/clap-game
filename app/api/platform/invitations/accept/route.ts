import { acceptPlatformInvitation } from '@/lib/data/platform-collaboration';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformUser } from '@/lib/platform/auth';
import { hashPlatformInvitationToken } from '@/lib/platform/invitation';
import { assertSameOrigin, readJsonObject } from '@/lib/validation';
import { readPlatformInvitationAcceptInput } from '@/lib/validation/platform-collaboration';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await requirePlatformUser();
    const input = readPlatformInvitationAcceptInput(await readJsonObject(request));
    return noStoreJson({ membership: await acceptPlatformInvitation(input.eventKey, hashPlatformInvitationToken(input.invitationToken)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
