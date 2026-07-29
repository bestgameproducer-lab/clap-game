import { ApiError } from './errors';

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

export function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ApiError(400, `${label}格式不正确`);
  return value;
}

export function requiredUuid(value: unknown, label: string): string {
  const result = requiredString(value, label, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new ApiError(400, `${label}格式不正确`);
  }
  return result;
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
