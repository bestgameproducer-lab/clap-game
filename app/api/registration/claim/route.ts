import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getGuestLoginAttemptKey } from '@/lib/auth';
import { claimGuestIdentity } from '@/lib/data/registration';
import { ApiError, apiErrorResponse } from '@/lib/errors';
import { GUEST_SESSION_MAX_AGE } from '@/lib/guest-session';
import { INVITATION_DEVICE_COOKIE, readInvitationDevicePass } from '@/lib/invitation-device-pass';
import { assertSameOrigin, readJsonObject, requiredClaimCode, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const invitationCode = readInvitationDevicePass((await cookies()).get(INVITATION_DEVICE_COOKIE)?.value);
    if (!invitationCode) throw new ApiError(401, '请先输入婚礼邀请码');
    const loginName = requiredString(body.loginName, '拼音用户名', 80);
    const claimCode = requiredClaimCode(body.claimCode);
    const result = await claimGuestIdentity(
      invitationCode,
      loginName,
      claimCode,
      getGuestLoginAttemptKey(request, loginName),
    );
    const response = NextResponse.json({ ok: true, guest: result.guest });
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.cookies.set('guest_session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: GUEST_SESSION_MAX_AGE,
      path: '/',
    });
    return response;
  } catch (error) {
    const response = apiErrorResponse(error);
    if (error instanceof ApiError && error.status === 401 && error.message.includes('邀请码')) {
      response.cookies.set(INVITATION_DEVICE_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 0,
        path: '/',
      });
    }
    return response;
  }
}
