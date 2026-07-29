export function isFourDigitClaimCode(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{4}$/.test(value);
}
