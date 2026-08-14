import crypto from 'crypto';
import 'server-only';
import { cookies } from 'next/headers';
import { ApiError } from './errors';
import { verifyAdminSession } from './data/admin-session';
import { getSupabaseEnv } from './env';
import { hashGuestSessionToken } from './guest-session';
import { getSupabaseAdmin } from './supabase';

function firstClientAddress(request: Request) {
  const forwarded = request.headers.get('x-vercel-forwarded-for')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')
    || 'unknown';
  return forwarded.split(',')[0].trim().slice(0, 128) || 'unknown';
}

export function getGuestLoginAttemptKey(request: Request, loginName: string) {
  const normalizedLogin = loginName.trim().replace(/\s+/g, ' ').toLowerCase();
  const userAgent = (request.headers.get('user-agent') || 'unknown').slice(0, 256);
  const { supabaseServiceRoleKey } = getSupabaseEnv();
  return crypto
    .createHmac('sha256', supabaseServiceRoleKey)
    .update(`guest-login-v1\n${firstClientAddress(request)}\n${userAgent}\n${normalizedLogin}`)
    .digest('hex');
}

export function getAdminLoginAttemptKey(request: Request) {
  const userAgent = (request.headers.get('user-agent') || 'unknown').slice(0, 256);
  const { supabaseServiceRoleKey } = getSupabaseEnv();
  return crypto
    .createHmac('sha256', supabaseServiceRoleKey)
    .update(`admin-login-v1\n${firstClientAddress(request)}\n${userAgent}`)
    .digest('hex');
}

export async function requireAdmin() {
  const token = (await cookies()).get('admin_session')?.value;
  const subject = token ? await verifyAdminSession(token) : null;
  if (!subject) throw new ApiError(401, '未授权');
  return subject;
}

export async function requireGuestContext() {
  const token = (await cookies()).get('guest_session')?.value;
  if (!token) throw new ApiError(401, '未登录');
  const { data, error } = await getSupabaseAdmin()
    .from('guest_sessions')
    .select('guest_id,rehearsal_run_id')
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
  const { data: game, error: gameError } = await getSupabaseAdmin()
    .from('game_state')
    .select('rehearsal_run_id')
    .eq('id', 1)
    .single();
  if (gameError || !game) throw new Error(`Unable to verify rehearsal run: ${gameError?.message ?? 'missing row'}`);
  if (!data.rehearsal_run_id || data.rehearsal_run_id !== game.rehearsal_run_id) {
    throw new ApiError(401, '本设备的登录属于上一轮彩排，请重新登录');
  }
  return { guestId: data.guest_id, rehearsalRunId: data.rehearsal_run_id };
}

export async function requireGuest() {
  return (await requireGuestContext()).guestId;
}
