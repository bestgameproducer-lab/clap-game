import { requirePlatformUser } from '@/lib/platform/auth';
import { requestPlatformCommercialQuote } from '@/lib/data/platform-projects';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredUuid } from '@/lib/validation';
import { readPlatformQuoteRequestInput } from '@/lib/validation/platform-commercial';

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requirePlatformUser();
    const projectId = requiredUuid((await params).projectId, '项目编号');
    const input = readPlatformQuoteRequestInput(await readJsonObject(request));
    return noStoreJson({
      quoteRequest: await requestPlatformCommercialQuote(
        user.id,
        projectId,
        input.eventKey,
        input.projectVersion,
      ),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
