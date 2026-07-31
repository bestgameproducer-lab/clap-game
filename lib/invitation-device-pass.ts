import crypto from 'crypto';
import 'server-only';
import { getSupabaseEnv } from './env';
import { isInvitationCode, normalizeInvitationCode } from './invitation-code';

export const INVITATION_DEVICE_COOKIE = 'invitation_device_pass';
export const INVITATION_DEVICE_MAX_AGE = 60 * 60 * 24 * 180;

const VERSION = 'v1';
const AAD = Buffer.from('wedding-invitation-device-pass-v1', 'utf8');

function encryptionKey() {
  return crypto.createHash('sha256')
    .update(AAD)
    .update(getSupabaseEnv().supabaseServiceRoleKey)
    .digest();
}

export function createInvitationDevicePass(invitationCode: string) {
  const normalized = normalizeInvitationCode(invitationCode);
  if (!isInvitationCode(normalized)) throw new Error('Cannot create an invitation device pass for an invalid code');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(AAD);
  const payload = JSON.stringify({ invitationCode: normalized, issuedAt: Date.now() });
  const ciphertext = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), ciphertext.toString('base64url'), tag.toString('base64url')].join('.');
}

export function readInvitationDevicePass(token: string | undefined) {
  if (!token || token.length > 512) return null;
  try {
    const [version, encodedIv, encodedCiphertext, encodedTag, extra] = token.split('.');
    if (version !== VERSION || !encodedIv || !encodedCiphertext || !encodedTag || extra) return null;
    const iv = Buffer.from(encodedIv, 'base64url');
    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');
    const tag = Buffer.from(encodedTag, 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 32 || ciphertext.length > 160) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as { invitationCode?: unknown; issuedAt?: unknown };
    if (typeof payload.invitationCode !== 'string' || typeof payload.issuedAt !== 'number' || !Number.isSafeInteger(payload.issuedAt)) return null;
    const age = Date.now() - payload.issuedAt;
    if (age < -60_000 || age > INVITATION_DEVICE_MAX_AGE * 1000) return null;
    const invitationCode = normalizeInvitationCode(payload.invitationCode);
    return isInvitationCode(invitationCode) ? invitationCode : null;
  } catch {
    return null;
  }
}
