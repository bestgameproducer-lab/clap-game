import 'server-only';
import { ApiError } from '../errors';
import { createGuestSessionToken, GUEST_SESSION_MAX_AGE, hashGuestSessionToken } from '../guest-session';
import { getSupabaseAdmin } from '../supabase';

function mapRegistrationError(message: string): never {
  if (message.includes('registration_closed')) throw new ApiError(409, '注册尚未开放或已经关闭');
  if (message.includes('invalid_invitation_code')) throw new ApiError(401, '婚礼邀请码不正确');
  if (message.includes('invalid_claim_code')) throw new ApiError(401, '个人认领码不正确');
  if (message.includes('guest_already_claimed')) throw new ApiError(409, '该宾客身份已经被认领，请联系主办方重置');
  if (message.includes('guest_not_found')) throw new ApiError(404, '找不到该宾客');
  throw new Error(`Registration operation failed: ${message}`);
}

export async function listRegistrationGuests(invitationCode: string) {
  const { data, error } = await getSupabaseAdmin().rpc('registration_guest_list', {
    p_invitation_code: invitationCode,
  });
  if (error) mapRegistrationError(error.message);
  return data ?? [];
}

export async function claimGuestIdentity(invitationCode: string, guestId: string, claimCode: string) {
  const token = createGuestSessionToken();
  const expiresAt = new Date(Date.now() + GUEST_SESSION_MAX_AGE * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc('claim_guest_identity', {
    p_invitation_code: invitationCode,
    p_guest_id: guestId,
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
