import 'server-only';
import { ApiError } from '../errors';
import { createGuestSessionToken, GUEST_SESSION_MAX_AGE, hashGuestSessionToken } from '../guest-session';
import { getSupabaseAdmin } from '../supabase';

function mapRegistrationError(message: string): never {
  if (message.includes('registration_closed')) throw new ApiError(409, '注册尚未开放或已经关闭');
  if (message.includes('invalid_invitation_code')) throw new ApiError(401, '婚礼邀请码不正确');
  if (message.includes('invalid_login_name')) throw new ApiError(401, '找不到这个拼音用户名，请检查拼写');
  if (message.includes('invalid_claim_code')) throw new ApiError(401, '四位宾客密码不正确');
  if (message.includes('guest_already_claimed')) throw new ApiError(409, '该宾客身份已经被认领，请联系主办方重置');
  if (message.includes('guest_not_found')) throw new ApiError(404, '找不到该宾客');
  throw new Error(`Registration operation failed: ${message}`);
}

export async function listRegistrationGuests(invitationCode: string) {
  const db = getSupabaseAdmin();
  const { error: invitationError } = await db.rpc('registration_guest_list', {
    p_invitation_code: invitationCode,
  });
  if (invitationError) mapRegistrationError(invitationError.message);

  const { data, error } = await db
    .from('guests')
    .select('id,name,login_name,claimed_at')
    .order('name');
  if (error) throw new Error(`Unable to load registration guests: ${error.message}`);
  return (data ?? []).map((guest) => ({
    id: guest.id,
    name: guest.name,
    loginName: guest.login_name,
    claimed: guest.claimed_at !== null,
  }));
}

export async function claimGuestIdentity(invitationCode: string, loginName: string, claimCode: string) {
  const token = createGuestSessionToken();
  const expiresAt = new Date(Date.now() + GUEST_SESSION_MAX_AGE * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc('claim_guest_by_login', {
    p_invitation_code: invitationCode,
    p_login_name: loginName,
    p_claim_code: claimCode,
    p_token_hash: hashGuestSessionToken(token),
    p_expires_at: expiresAt,
  });
  if (error) mapRegistrationError(error.message);
  return { token, guest: Array.isArray(data) ? data[0] : data };
}

export async function revokeGuestSession(token: string) {
  const { error } = await getSupabaseAdmin()
    .from('guest_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashGuestSessionToken(token))
    .is('revoked_at', null);
  if (error) throw new Error(`Unable to revoke guest session: ${error.message}`);
}
