import 'server-only';
import { ApiError } from '../errors';
import { createPlatformServerClient } from './supabase-server';
import { requirePlatformUser, type PlatformUser } from './auth';

export type PlatformStaff = {
  user: PlatformUser;
  role: 'operator' | 'admin';
};

export async function requirePlatformStaff(): Promise<PlatformStaff> {
  const user = await requirePlatformUser();
  const client = await createPlatformServerClient();
  const { data, error } = await client
    .from('platform_staff')
    .select('role,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (error) throw new Error(`Unable to verify platform staff: ${error.message}`);
  if (!data || (data.role !== 'operator' && data.role !== 'admin')) {
    throw new ApiError(403, '此账号没有平台运营权限');
  }
  return { user, role: data.role };
}
