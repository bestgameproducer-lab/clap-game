import 'server-only';
import { cookies } from 'next/headers';
import { ApiError } from './errors';
import { verifySession } from './session';

export async function requireAdmin() {
  const subject = verifySession((await cookies()).get('admin_session')?.value, 'admin');
  if (!subject) throw new ApiError(401, '未授权');
  return subject;
}

export async function requireGuest() {
  const subject = verifySession((await cookies()).get('guest_session')?.value, 'guest');
  if (!subject) throw new ApiError(401, '未登录');
  return subject;
}
