import { offerPlatformCommercialQuote } from '@/lib/data/platform-operations';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { requirePlatformStaff } from '@/lib/platform/staff';
import { assertSameOrigin, readJsonObject } from '@/lib/validation';
import { readPlatformCommercialQuoteInput } from '@/lib/validation/platform-operations';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requirePlatformStaff();
    const input = readPlatformCommercialQuoteInput(await readJsonObject(request));
    return noStoreJson({ quote: await offerPlatformCommercialQuote(staff.user.id, input) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
