import { ApiError } from '../errors';
import { requiredString } from '../validation';

export function requiredPlatformEmail(value: unknown) {
  const email = requiredString(value, '邮箱', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, '请输入有效邮箱');
  return email;
}

export function safePlatformReturnPath(value: unknown) {
  if (typeof value !== 'string') return '/platform/account';
  if (!value.startsWith('/platform/') || value.startsWith('//') || value.includes('\\')) {
    return '/platform/account';
  }
  return value.slice(0, 500);
}
