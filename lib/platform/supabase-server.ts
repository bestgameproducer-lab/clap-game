import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import 'server-only';
import { requirePlatformSupabaseEnv } from './env';

const PLATFORM_AUTH_COOKIE = 'wedding-platform-auth';

export async function createPlatformServerClient() {
  const env = requirePlatformSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(env.url, env.publishableKey, {
    cookieOptions: {
      name: PLATFORM_AUTH_COOKIE,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The platform proxy refreshes them before rendering.
        }
      },
    },
  });
}

export { PLATFORM_AUTH_COOKIE };
