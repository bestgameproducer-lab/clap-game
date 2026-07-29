import { ApiError } from './errors';
import { isFourDigitClaimCode } from './claim-code';

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

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    if (process.env.NODE_ENV === 'production') throw new ApiError(403, '请求来源无效');
    return;
  }
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host || new URL(origin).host !== host) throw new ApiError(403, '请求来源无效');
}
