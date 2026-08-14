import { requireGuestContext } from '@/lib/auth';
import { confirmGuestAvatar, createGuestAvatarUpload } from '@/lib/data/avatar';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { guestId, rehearsalRunId } = await requireGuestContext();
    return noStoreJson(await createGuestAvatarUpload(guestId, rehearsalRunId));
  } catch (error) { return apiErrorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const { guestId, rehearsalRunId } = await requireGuestContext();
    const body = await readJsonObject(request);
    return noStoreJson(await confirmGuestAvatar(guestId, requiredString(body.path, '头像路径', 80), rehearsalRunId));
  } catch (error) { return apiErrorResponse(error); }
}
