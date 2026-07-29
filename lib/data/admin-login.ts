import 'server-only';
import { getSupabaseAdmin } from '../supabase';

export async function recordAdminLoginAttempt(attemptKey: string, passwordValid: boolean) {
  const { data, error } = await getSupabaseAdmin().rpc('record_admin_login_attempt', {
    p_attempt_key: attemptKey,
    p_password_valid: passwordValid,
  });
  if (error) throw new Error(`Unable to record administrator login attempt: ${error.message}`);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result || !['ok', 'invalid_credentials', 'rate_limited'].includes(result.auth_status)) {
    throw new Error('Administrator login throttle returned an unknown status');
  }
  return {
    status: result.auth_status as 'ok' | 'invalid_credentials' | 'rate_limited',
    retryAfterSeconds: Math.max(0, Number(result.retry_after_seconds || 0)),
  };
}

