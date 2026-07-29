import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { revokeAdminSession, verifyAdminSession } from '@/lib/data/admin-session';
import { apiErrorResponse } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = (await cookies()).get('admin_session')?.value;
    if (token) {
      const actor = await verifyAdminSession(token);
      if (actor) await revokeAdminSession(token, actor);
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set('admin_session', '', {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0, path: '/',
    });
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
