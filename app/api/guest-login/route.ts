import { NextResponse } from 'next/server';
import { apiErrorResponse } from '@/lib/errors';
import { getSupabaseAdmin } from '@/lib/supabase';
import { signSession } from '@/lib/session';
import { assertSameOrigin, readJsonObject, requiredString } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const name = requiredString(body.name, '姓名', 100);
    const code = requiredString(body.code, '登录码', 32);
    const { data, error } = await getSupabaseAdmin().from('guests').select('id,name').ilike('name', name).eq('login_code', code).single();
    if (error || !data) return NextResponse.json({ error: '姓名或登录码不正确' }, { status: 401 });
    const maxAge = 60 * 60 * 24 * 7;
    const response = NextResponse.json({ ok: true });
    response.cookies.set('guest_session', signSession('guest', data.id, maxAge), {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge, path: '/',
    });
    return response;
  } catch (error) { return apiErrorResponse(error); }
}
