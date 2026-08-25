import { requirePlatformUser } from '@/lib/platform/auth';
import { submitPlatformProjectForReview } from '@/lib/data/platform-projects';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformReviewSubmissionInput } from '@/lib/validation/platform-project';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requirePlatformUser();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const { eventKey } = readPlatformReviewSubmissionInput(await readJsonObject(request));
    return noStoreJson({ project: await submitPlatformProjectForReview(user.id, projectId, eventKey) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
