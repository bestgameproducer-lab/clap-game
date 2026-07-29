import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_MAX_AGE } from '@/lib/admin-session';
import { getAdminLoginAttemptKey } from '@/lib/auth';
import { recordAdminLoginAttempt } from '@/lib/data/admin-login';
import { createAdminSession } from '@/lib/data/admin-session';
import { apiErrorResponse } from '@/lib/errors';
import { getAdminPassword } from '@/lib/env';
import { assertSameOrigin, readJsonObject, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const supplied = requiredString(body.password, '密码', 256);
    const expected = getAdminPassword();
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    const passwordValid = crypto.timingSafeEqual(suppliedHash, expectedHash);
    const attempt = await recordAdminLoginAttempt(getAdminLoginAttemptKey(request), passwordValid);
    if (attempt.status === 'rate_limited') {
      const minutes = Math.max(1, Math.ceil(attempt.retryAfterSeconds / 60));
      const response = NextResponse.json({ error: `密码尝试次数过多，请 ${minutes} 分钟后再试` }, { status: 429 });
      response.headers.set('Retry-After', String(attempt.retryAfterSeconds));
      response.headers.set('Cache-Control', 'private, no-store, max-age=0');
      return response;
    }
    if (attempt.status !== 'ok' || !passwordValid) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }
    const token = await createAdminSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set('admin_session', token, {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: ADMIN_SESSION_MAX_AGE, path: '/',
    });
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
