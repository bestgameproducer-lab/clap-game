import crypto from 'crypto';

const secret = () => process.env.SESSION_SECRET || 'development-only-secret';

export function sign(value: string) {
  const sig = crypto.createHmac('sha256', secret()).update(value).digest('hex');
  return `${value}.${sig}`;
}

export function verify(token?: string | null) {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 1) return null;
  const value = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret()).update(value).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? value : null;
  } catch {
    return null;
  }
}
