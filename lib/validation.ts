import { ApiError } from './errors';
import { isFourDigitClaimCode } from './claim-code';
import { isInvitationCode, normalizeInvitationCode } from './invitation-code';
import type { GuestRosterImportRow } from './guest-roster-import';

export type JsonObject = Record<string, unknown>;

export async function readJsonObject(request: Request): Promise<JsonObject> {
  let value: unknown;
  try { value = await request.json(); } catch { throw new ApiError(400, '请求内容不是有效的 JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, '请求格式不正确');
  return value as JsonObject;
}

export function requiredString(value: unknown, label: string, maximum = 200): string {
  if (typeof value !== 'string') throw new ApiError(400, `${label}格式不正确`);
  const result = value.trim();
  if (!result || result.length > maximum) throw new ApiError(400, `${label}格式不正确`);
  return result;
}

export function optionalString(value: unknown, label: string, maximum = 200): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > maximum) throw new ApiError(400, `${label}格式不正确`);
  return value.trim();
}

export function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ApiError(400, `${label}格式不正确`);
  return value;
}

export function requiredInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ApiError(400, `${label}格式不正确`);
  }
  return value;
}

export function requiredEnum<const T extends readonly string[]>(
  value: unknown,
  label: string,
  allowed: T,
): T[number] {
  const result = requiredString(value, label, 80);
  if (!allowed.includes(result)) throw new ApiError(400, `${label}格式不正确`);
  return result as T[number];
}

export function requiredUuid(value: unknown, label: string): string {
  const result = requiredString(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new ApiError(400, `${label}格式不正确`);
  }
  return result;
}

export function requiredClaimCode(value: unknown): string {
  if (!isFourDigitClaimCode(value)) throw new ApiError(400, '请输入四位数字宾客密码');
  return value;
}

export function requiredPlayerCode(value: unknown): string {
  const code = requiredString(value, '玩家编号', 12).toUpperCase();
  if (!/^P[0-9]{3,6}$/.test(code)) throw new ApiError(400, '玩家编号格式不正确');
  return code;
}

export function requiredInvitationCode(value: unknown): string {
  if (typeof value !== 'string') throw new ApiError(400, '邀请码需为 6–32 位英文字母、数字或连字符');
  const result = normalizeInvitationCode(value);
  if (!isInvitationCode(result)) throw new ApiError(400, '邀请码需为 6–32 位英文字母、数字或连字符');
  return result;
}

export function requiredAdminPassword(value: unknown): string {
  const password = requiredString(value, '新管理员密码', 128);
  if (password.length < 12) throw new ApiError(400, '管理员密码须为 12–128 位');
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ApiError(400, '管理员密码必须同时包含字母和数字');
  }
  return password;
}

export function requiredGuestRosterImportRows(value: unknown): GuestRosterImportRow[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new ApiError(400, '批量名单需包含 1–100 位宾客');
  }
  return value.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new ApiError(400, `第 ${index + 1} 行宾客格式不正确`);
    const item = row as Record<string, unknown>;
    return {
      name: requiredString(item.name, `第 ${index + 1} 行显示姓名`, 120),
      loginName: requiredString(item.loginName, `第 ${index + 1} 行登录名`, 80),
      tableLabel: optionalString(item.tableLabel, `第 ${index + 1} 行桌号`, 40),
    };
  });
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    if (process.env.NODE_ENV === 'production') throw new ApiError(403, '请求来源无效');
    return;
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host || new URL(origin).host !== host) throw new ApiError(403, '请求来源无效');
}
