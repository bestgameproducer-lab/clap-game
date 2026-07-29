import 'server-only';
import { ADMIN_SESSION_MAX_AGE, createAdminSessionToken, hashAdminSessionToken } from '../admin-session';
import { getSupabaseAdmin } from '../supabase';

export async function createAdminSession() {
  const token = createAdminSessionToken();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE * 1000).toISOString();
  const { error } = await getSupabaseAdmin().rpc('create_admin_session', {
    p_token_hash: hashAdminSessionToken(token), p_expires_at: expiresAt,
  });
  if (error) throw new Error(`Unable to create admin session: ${error.message}`);
  return token;
}

export async function verifyAdminSession(token: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('admin_sessions')
    .select('id')
    .eq('token_hash', hashAdminSessionToken(token))
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Unable to verify admin session: ${error.message}`);
  return data ? `admin:${data.id}` : null;
}

export async function revokeAdminSession(token: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('revoke_admin_session', {
    p_token_hash: hashAdminSessionToken(token), p_actor: actor,
  });
  if (error) throw new Error(`Unable to revoke admin session: ${error.message}`);
}
