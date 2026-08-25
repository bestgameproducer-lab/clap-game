import 'server-only';
import { ApiError } from '../errors';
import { getPlatformSupabaseEnv } from './env';
import { createPlatformServerClient } from './supabase-server';

export type PlatformUser = {
  id: string;
  email: string;
};

export async function getPlatformUser(): Promise<PlatformUser | null> {
  if (!getPlatformSupabaseEnv()) return null;
  const client = await createPlatformServerClient();
  const { data, error } = await client.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const email = typeof data.claims.email === 'string' ? data.claims.email : '';
  return { id: data.claims.sub, email };
}

export async function requirePlatformUser() {
  if (!getPlatformSupabaseEnv()) throw new ApiError(503, '平台云端账号尚未开通');
  const user = await getPlatformUser();
  if (!user) throw new ApiError(401, '请先登录平台账号');
  return user;
}
