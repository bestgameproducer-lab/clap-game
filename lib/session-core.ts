import crypto from 'crypto';

export type SessionKind = 'admin' | 'guest';
type SessionPayload = { kind: SessionKind; subject: string; issuedAt: number; expiresAt: number };

const encode = (value: string) => Buffer.from(value).toString('base64url');

export function signSessionToken(
  kind: SessionKind,
  subject: string,
  lifetimeSeconds: number,
  secret: string,
  now = Date.now(),
) {
  const issuedAt = Math.floor(now / 1000);
  const payload: SessionPayload = { kind, subject, issuedAt, expiresAt: issuedAt + lifetimeSeconds };
  const encoded = encode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifySessionToken(
  token: string | null | undefined,
  expectedKind: SessionKind,
  secret: string,
  now = Date.now(),
) {
  if (!token) return null;
  const [encoded, signature, extra] = token.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>;
    const current = Math.floor(now / 1000);
    if (payload.kind !== expectedKind || typeof payload.subject !== 'string' || !payload.subject) return null;
    if (typeof payload.issuedAt !== 'number' || typeof payload.expiresAt !== 'number') return null;
    if (payload.issuedAt > current + 60 || payload.expiresAt <= current) return null;
    return payload.subject;
  } catch { return null; }
}
