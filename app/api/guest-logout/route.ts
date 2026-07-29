import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { revokeGuestSession } from '@/lib/data/registration';
import { apiErrorResponse } from '@/lib/errors';
import { assertSameOrigin } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const token = (await cookies()).get('guest_session')?.value;
    if (token) await revokeGuestSession(token);
    const response = NextResponse.json({ ok: true });
    response.cookies.set('guest_session', '', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 0, path: '/' });
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
