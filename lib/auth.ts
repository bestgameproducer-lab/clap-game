import 'server-only';
import { cookies } from 'next/headers';
import { ApiError } from './errors';
import { verifyAdminSession } from './data/admin-session';
import { hashGuestSessionToken } from './guest-session';
import { getSupabaseAdmin } from './supabase';

export async function requireAdmin() {
  const token = (await cookies()).get('admin_session')?.value;
  const subject = token ? await verifyAdminSession(token) : null;
  if (!subject) throw new ApiError(401, '未授权');
  return subject;
}

export async function requireGuest() {
  const token = (await cookies()).get('guest_session')?.value;
  if (!token) throw new ApiError(401, '未登录');
  const { data, error } = await getSupabaseAdmin()
    .from('guest_sessions')
    .select('guest_id')
    .eq('token_hash', hashGuestSessionToken(token))
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(`Unable to verify guest session: ${error.message}`);
  if (!data) throw new ApiError(401, '登录已失效');
  const { data: guest, error: guestError } = await getSupabaseAdmin()
    .from('guests').select('id').eq('id', data.guest_id).eq('active', true).maybeSingle();
  if (guestError) throw new Error(`Unable to verify active guest: ${guestError.message}`);
  if (!guest) throw new ApiError(401, '宾客身份已停用，请联系主办方');
  return data.guest_id;
}
