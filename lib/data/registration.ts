import 'server-only';
import { ApiError } from '../errors';
import { createGuestSessionToken, GUEST_SESSION_MAX_AGE, hashGuestSessionToken } from '../guest-session';
import { getSupabaseAdmin } from '../supabase';

function mapRegistrationError(message: string): never {
  if (message.includes('registration_closed')) throw new ApiError(409, '注册尚未开放或已经关闭');
  if (message.includes('invalid_invitation_code')) throw new ApiError(401, '婚礼邀请码不正确');
  if (message.includes('invalid_login_name')) throw new ApiError(401, '找不到这个拼音用户名，请检查拼写');
  if (message.includes('invalid_claim_code')) throw new ApiError(401, '四位宾客密码不正确');
  if (message.includes('guest_not_found')) throw new ApiError(404, '找不到该宾客');
  throw new Error(`Registration operation failed: ${message}`);
}

export async function listRegistrationGuests(invitationCode: string) {
  const db = getSupabaseAdmin();
  const { data: permittedGuests, error: invitationError } = await db.rpc('registration_guest_list', {
    p_invitation_code: invitationCode,
  });
  if (invitationError) mapRegistrationError(invitationError.message);

  const permittedIds = (permittedGuests ?? []).map((guest: { id: string }) => guest.id);
  const permittedOrder = new Map<string, number>(permittedIds.map((id: string, index: number): [string, number] => [id, index]));
  const { data: game, error: gameError } = await db.from('game_state').select('registration_open').eq('id', 1).single();
  if (gameError || !game) throw new Error(`Unable to load registration state: ${gameError?.message ?? 'missing row'}`);
  if (permittedIds.length === 0) return { guests: [], registrationOpen: game.registration_open };

  const { data, error } = await db
    .from('guests')
    .select('id,name,login_name,claim_code_hash')
    .in('id', permittedIds)
    .eq('active', true);
  if (error) throw new Error(`Unable to load registration guests: ${error.message}`);
  return {
    registrationOpen: game.registration_open,
    guests: (data ?? []).sort((a, b) => (permittedOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (permittedOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER)).map((guest) => ({
      id: guest.id,
      name: guest.name,
      loginName: guest.login_name,
      hasPassword: guest.claim_code_hash !== null,
    })),
  };
}

export async function claimGuestIdentity(invitationCode: string, loginName: string, claimCode: string, attemptKey: string) {
  const token = createGuestSessionToken();
  const expiresAt = new Date(Date.now() + GUEST_SESSION_MAX_AGE * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc('claim_guest_by_login', {
    p_invitation_code: invitationCode,
    p_login_name: loginName,
    p_claim_code: claimCode,
    p_token_hash: hashGuestSessionToken(token),
    p_expires_at: expiresAt,
    p_attempt_key: attemptKey,
  });
  if (error) mapRegistrationError(error.message);
  const guest = Array.isArray(data) ? data[0] : data;
  if (!guest || guest.auth_status === 'invalid_claim_code') throw new ApiError(401, '四位宾客密码不正确');
  if (guest.auth_status === 'rate_limited') {
    const minutes = Math.max(1, Math.ceil(Number(guest.retry_after_seconds || 900) / 60));
    throw new ApiError(429, `密码尝试次数过多，请 ${minutes} 分钟后再试`);
  }
  if (guest.auth_status !== 'ok') throw new Error('Registration operation returned an unknown authentication status');
  return {
    token,
    guest: {
      guest_id: guest.guest_id,
      guest_name: guest.guest_name,
      account_created: guest.account_created,
    },
  };
}

export async function revokeGuestSession(token: string) {
  const { error } = await getSupabaseAdmin()
    .from('guest_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashGuestSessionToken(token))
    .is('revoked_at', null);
  if (error) throw new Error(`Unable to revoke guest session: ${error.message}`);
}
