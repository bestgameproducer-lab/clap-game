import 'server-only';

const PLACEHOLDER_VALUES = new Set([
  'development-only-secret',
  'replace-with-a-long-random-string',
  'replace-with-a-strong-password',
]);

function requireValue(name: string, minimumLength = 1): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  if (value.length < minimumLength) throw new Error(`${name} must be at least ${minimumLength} characters`);
  if (process.env.NODE_ENV === 'production' && PLACEHOLDER_VALUES.has(value)) {
    throw new Error(`${name} must not use a placeholder value in production`);
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    supabaseUrl: requireValue('SUPABASE_URL'),
    supabaseServiceRoleKey: requireValue('SUPABASE_SERVICE_ROLE_KEY', 20),
  };
}

export const getSessionSecret = () => requireValue('SESSION_SECRET', 32);
export const getAdminPassword = () => requireValue('ADMIN_PASSWORD', 12);
