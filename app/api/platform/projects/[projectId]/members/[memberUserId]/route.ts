import { removePlatformMember } from '@/lib/data/platform-collaboration';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformUser } from '@/lib/platform/auth';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformMemberRemoveInput } from '@/lib/validation/platform-collaboration';

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string; memberUserId: string }> }) {
  try {
    assertSameOrigin(request);
    await requirePlatformUser();
    const route = await params;
    const projectId = requiredUuid(route.projectId, '项目编号');
    const memberUserId = requiredUuid(route.memberUserId, '成员编号');
    const input = readPlatformMemberRemoveInput(await readJsonObject(request));
    return noStoreJson({ member: await removePlatformMember(projectId, memberUserId, input.eventKey) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
