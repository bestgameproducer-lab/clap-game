import { requirePlatformUser } from '@/lib/platform/auth';
import { setPlatformDraftProjectArchiveState } from '@/lib/data/platform-projects';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformProjectArchiveInput } from '@/lib/validation/platform-project';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requirePlatformUser();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformProjectArchiveInput(await readJsonObject(request));
    return noStoreJson({
      project: await setPlatformDraftProjectArchiveState(
        user.id,
        projectId,
        input.eventKey,
        input.action,
        input.confirmed,
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
