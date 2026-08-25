import { createHash } from 'node:crypto';
import 'server-only';

export function hashPlatformInvitationToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
