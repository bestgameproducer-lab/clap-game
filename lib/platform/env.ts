import 'server-only';

export type PlatformSupabaseEnv = {
  url: string;
  publishableKey: string;
};

function validatePlatformUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PLATFORM_SUPABASE_URL must be a valid URL');
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error('PLATFORM_SUPABASE_URL must use HTTPS outside local development');
  }
  return url.origin;
}

export function getPlatformSupabaseEnv(): PlatformSupabaseEnv | null {
  const rawUrl = process.env.PLATFORM_SUPABASE_URL?.trim() ?? '';
  const publishableKey = process.env.PLATFORM_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

  if (!rawUrl && !publishableKey) return null;
  if (!rawUrl || !publishableKey) {
    throw new Error('Platform control plane is partially configured; both platform Supabase values are required');
  }
  if (publishableKey.length < 20) throw new Error('PLATFORM_SUPABASE_PUBLISHABLE_KEY is invalid');

  return { url: validatePlatformUrl(rawUrl), publishableKey };
}

export function requirePlatformSupabaseEnv() {
  const env = getPlatformSupabaseEnv();
  if (!env) throw new Error('Platform control plane is not configured');
  return env;
}
