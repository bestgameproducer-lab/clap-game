export const PLAYER_CODE_PATTERN = /^(?=.*[A-Z])(?=.*[2-9])[A-HJ-KM-NP-Z2-9]{4}$/;

export function normalizePlayerCode(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, '').slice(0, 4);
}

export function isPlayerCode(value: string): boolean {
  return PLAYER_CODE_PATTERN.test(normalizePlayerCode(value));
}
