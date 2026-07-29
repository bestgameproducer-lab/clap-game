import { listRegistrationGuests } from '@/lib/data/registration';
import { apiErrorResponse, noStoreJson } from '@/lib/errors';
import { assertSameOrigin, readJsonObject, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const invitationCode = requiredString(body.invitationCode, '婚礼邀请码', 64);
    const result = await listRegistrationGuests(invitationCode);
    return noStoreJson(result);
  } catch (error) { return apiErrorResponse(error); }
}
