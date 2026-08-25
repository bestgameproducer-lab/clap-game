import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createPlatformServerClient } from '@/lib/platform/supabase-server';
import { safePlatformReturnPath } from '@/lib/validation/platform-auth';

const EMAIL_OTP_TYPES = new Set<EmailOtpType>(['email', 'magiclink', 'signup', 'invite', 'recovery', 'email_change']);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safePlatformReturnPath(url.searchParams.get('next'));
  const redirect = new URL(next, url.origin);

  try {
    const client = await createPlatformServerClient();
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const rawType = url.searchParams.get('type');
    let error: { message: string } | null = null;

    if (code) {
      ({ error } = await client.auth.exchangeCodeForSession(code));
    } else if (tokenHash && rawType && EMAIL_OTP_TYPES.has(rawType as EmailOtpType)) {
      ({ error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: rawType as EmailOtpType }));
    } else {
      redirect.searchParams.set('auth_error', 'invalid_link');
      return NextResponse.redirect(redirect, 303);
    }

    if (error) redirect.searchParams.set('auth_error', 'expired_link');
    else redirect.searchParams.set('connected', '1');
  } catch {
    redirect.searchParams.set('auth_error', 'unavailable');
  }

  const response = NextResponse.redirect(redirect, 303);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
