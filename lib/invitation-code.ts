export function normalizeInvitationCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isInvitationCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9-]{6,32}$/.test(value);
}
