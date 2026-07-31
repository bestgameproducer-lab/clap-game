import 'server-only';
import { getSupabaseAdmin } from '../supabase';

export async function verifyAdminPasswordOverride(password: string) {
  const { data, error } = await getSupabaseAdmin().rpc('verify_admin_password_override', { p_password: password });
  if (error) throw new Error(`Unable to verify administrator password: ${error.message}`);
  return data === null ? null : Boolean(data);
}

export async function rotateAdminPassword(password: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('rotate_admin_password', {
    p_password: password,
    p_actor: actor,
  });
  if (error?.message.includes('admin_password_length_invalid')) throw new Error('管理员密码须为 12–128 位');
  if (error?.message.includes('admin_password_strength_invalid')) throw new Error('管理员密码必须同时包含字母和数字');
  if (error) throw new Error(`Unable to rotate administrator password: ${error.message}`);
}

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
