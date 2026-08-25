import { requirePlatformUser } from '@/lib/platform/auth';
import { requestPlatformQuoteProceed } from '@/lib/data/platform-projects';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformQuoteProceedInput } from '@/lib/validation/platform-commercial';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requirePlatformUser();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformQuoteProceedInput(await readJsonObject(request));
    return noStoreJson({
      proceedRequest: await requestPlatformQuoteProceed(
        user.id,
        projectId,
        input.eventKey,
        input.quoteId,
        input.acknowledgedNoPayment,
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
