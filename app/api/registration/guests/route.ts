import { cookies } from 'next/headers';
import { getInvitationCodeAttemptKey } from '@/lib/auth';
import { clearInvitationCodeAttempts, consumeInvitationCodeAttempt, listRegistrationGuests } from '@/lib/data/registration';
import { ApiError, apiErrorResponse, noStoreJson } from '@/lib/errors';
import { createInvitationDevicePass, INVITATION_DEVICE_COOKIE, INVITATION_DEVICE_MAX_AGE, readInvitationDevicePass } from '@/lib/invitation-device-pass';
import { assertSameOrigin, readJsonObject, requiredInvitationCode } from '@/lib/validation';

const deviceCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function GET() {
  try {
    const devicePass = (await cookies()).get(INVITATION_DEVICE_COOKIE)?.value;
    const invitationCode = readInvitationDevicePass(devicePass);
    if (!invitationCode) throw new ApiError(401, '请先输入婚礼邀请码');
    return noStoreJson(await listRegistrationGuests(invitationCode));
  } catch (error) {
    const response = apiErrorResponse(error);
    if (error instanceof ApiError && error.status === 401) {
      response.cookies.set(INVITATION_DEVICE_COOKIE, '', { ...deviceCookieOptions, maxAge: 0 });
    }
    return response;
  }
}

export async function POST(request: Request) {
  let retryAfterSeconds = 0;
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const invitationCode = requiredInvitationCode(body.invitationCode);
    const attemptKey = getInvitationCodeAttemptKey(request);
    const attempt = await consumeInvitationCodeAttempt(attemptKey);
    if (attempt.status === 'rate_limited') {
      retryAfterSeconds = attempt.retryAfterSeconds;
      const minutes = Math.max(1, Math.ceil(attempt.retryAfterSeconds / 60));
      throw new ApiError(429, `邀请码尝试次数过多，请 ${minutes} 分钟后再试`);
    }
    const result = await listRegistrationGuests(invitationCode);
    await clearInvitationCodeAttempts(attemptKey);
    const response = noStoreJson(result);
    response.cookies.set(INVITATION_DEVICE_COOKIE, createInvitationDevicePass(invitationCode), {
      ...deviceCookieOptions,
      maxAge: INVITATION_DEVICE_MAX_AGE,
    });
    return response;
  } catch (error) {
    const response = apiErrorResponse(error);
    if (error instanceof ApiError && error.status === 429) {
      response.headers.set('Retry-After', String(Math.max(1, retryAfterSeconds)));
    }
    return response;
  }
}
