import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/errors';
import { getAdminPassword } from '@/lib/env';
import { signSession } from '@/lib/session';
import { assertSameOrigin, readJsonObject, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const supplied = requiredString(body.password, '密码', 256);
    const expected = getAdminPassword();
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    const expectedHash = crypto.createHash('sha256').update(expected).digest();
    if (!crypto.timingSafeEqual(suppliedHash, expectedHash)) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }
    const maxAge = 60 * 60 * 12;
    const response = NextResponse.json({ ok: true });
    response.cookies.set('admin_session', signSession('admin', 'shared-admin', maxAge), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge, path: '/',
    });
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
