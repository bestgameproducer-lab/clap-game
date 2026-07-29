import crypto from 'crypto';
import 'server-only';
import { ApiError } from './errors';
import { getSupabaseEnv } from './env';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function createHiddenTaskCode() {
  let compact = '';
  for (let index = 0; index < 8; index += 1) compact += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `CUPID-${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizeHiddenTaskCode(value: string) {
  let compact = value.trim().toUpperCase().replace(/[\s-]/g, '');
  if (compact.length === 13 && compact.startsWith('CUPID')) compact = compact.slice(5);
  if (!new RegExp(`^[${CODE_ALPHABET}]{8}$`).test(compact)) {
    throw new ApiError(400, '隐藏任务码格式不正确');
  }
  return compact;
}

export function hashHiddenTaskCode(value: string) {
  const compact = normalizeHiddenTaskCode(value);
  const { supabaseServiceRoleKey } = getSupabaseEnv();
  return crypto.createHmac('sha256', supabaseServiceRoleKey)
    .update(`hidden-task-code-v1\n${compact}`)
    .digest('hex');
}
