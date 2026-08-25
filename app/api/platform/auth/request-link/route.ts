import { createPlatformServerClient } from '@/lib/platform/supabase-server';
import { apiErrorResponse, noStoreJson, ApiError } from '@/lib/errors';
import { assertSameOrigin, readJsonObject } from '@/lib/validation';
import { requiredPlatformEmail, safePlatformReturnPath } from '@/lib/validation/platform-auth';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJsonObject(request);
    const email = requiredPlatformEmail(body.email);
    const next = safePlatformReturnPath(body.next);
    const client = await createPlatformServerClient();
    const redirectUrl = new URL(`/platform/auth/confirm?next=${encodeURIComponent(next)}`, request.url).toString();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl, shouldCreateUser: true },
    });
    if (error) {
      if (error.status === 429) throw new ApiError(429, '邮件发送太频繁，请稍后再试');
      throw new Error(`Unable to request platform sign-in link: ${error.message}`);
    }
    return noStoreJson({ ok: true, message: '登录邮件已发送，请查看收件箱' });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
