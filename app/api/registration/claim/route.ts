import { NextResponse } from 'next/server';
import { claimGuestIdentity } from '@/lib/data/registration';
import { apiErrorResponse } from '@/lib/errors';
import { GUEST_SESSION_MAX_AGE } from '@/lib/guest-session';
import { assertSameOrigin, readJsonObject, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const result = await claimGuestIdentity(
      requiredString(body.invitationCode, '婚礼邀请码', 64),
      requiredString(body.loginName, '拼音用户名', 80),
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
  } catch (error) { return apiErrorResponse(error); }
}
