export const PLATFORM_QUOTE_CURRENCIES = ['USD', 'CNY'] as const;
export const PLATFORM_QUOTE_BILLING_INTERVALS = ['one_time', 'monthly', 'annual'] as const;

export type PlatformQuoteCurrency = typeof PLATFORM_QUOTE_CURRENCIES[number];
export type PlatformQuoteBillingInterval = typeof PLATFORM_QUOTE_BILLING_INTERVALS[number];

export type PlatformCommercialQuote = {
  id: string;
  quoteRequestId: string;
  projectVersion: number;
  planId: 'buyout' | 'subscription';
  amountMinor: number;
  currency: PlatformQuoteCurrency;
  billingInterval: PlatformQuoteBillingInterval;
  validUntil: string;
  serviceSummary: string;
  termsSummary: string;
  status: 'offered' | 'superseded' | 'withdrawn';
  offeredAt: string;
};

export const PLATFORM_QUOTE_BILLING_LABELS: Record<PlatformQuoteBillingInterval, string> = {
  one_time: '一次性费用',
  monthly: '每月',
  annual: '每年',
};

export function formatPlatformQuoteAmount(amountMinor: number, currency: PlatformQuoteCurrency) {
  return new Intl.NumberFormat(currency === 'CNY' ? 'zh-CN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function parsePlatformQuoteAmountInput(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 && minor <= 1_000_000_000 ? minor : null;
}
