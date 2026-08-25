export type PlatformRetentionWindowId =
  | 'event_plus_7_days'
  | 'event_plus_30_days'
  | 'event_plus_90_days';

export type PlatformDataPolicy = {
  retentionWindow: PlatformRetentionWindowId;
  projectArchiveBeforeDeletion: boolean;
  rosterAuthorityConfirmed: boolean;
  guestNoticeConfirmed: boolean;
  isolatedRuntimeRequired: true;
};

export const PLATFORM_RETENTION_WINDOWS: readonly {
  id: PlatformRetentionWindowId;
  days: 7 | 30 | 90;
  name: string;
  description: string;
}[] = [
  {
    id: 'event_plus_7_days',
    days: 7,
    name: '婚礼后 7 天',
    description: '推荐默认值。留出短期复核时间后删除宾客运行资料。',
  },
  {
    id: 'event_plus_30_days',
    days: 30,
    name: '婚礼后 30 天',
    description: '适合需要较长交付复核期的单场项目。',
  },
  {
    id: 'event_plus_90_days',
    days: 90,
    name: '婚礼后 90 天',
    description: '仅在确有运营需要时选择；平台不提供无限期保留。',
  },
] as const;

export const DEFAULT_PLATFORM_DATA_POLICY: PlatformDataPolicy = {
  retentionWindow: 'event_plus_7_days',
  projectArchiveBeforeDeletion: true,
  rosterAuthorityConfirmed: false,
  guestNoticeConfirmed: false,
  isolatedRuntimeRequired: true,
};

function hasExactDataPolicyKeys(value: Record<string, unknown>) {
  const keys = Object.keys(value).sort().join(',');
  return keys === 'guestNoticeConfirmed,isolatedRuntimeRequired,projectArchiveBeforeDeletion,retentionWindow,rosterAuthorityConfirmed';
}

export function isPlatformDataPolicy(value: unknown): value is PlatformDataPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  return (
    hasExactDataPolicyKeys(policy)
    && PLATFORM_RETENTION_WINDOWS.some((option) => option.id === policy.retentionWindow)
    && typeof policy.projectArchiveBeforeDeletion === 'boolean'
    && typeof policy.rosterAuthorityConfirmed === 'boolean'
    && typeof policy.guestNoticeConfirmed === 'boolean'
    && policy.isolatedRuntimeRequired === true
  );
}

export function normalizePlatformDataPolicy(value: unknown): PlatformDataPolicy {
  return isPlatformDataPolicy(value)
    ? { ...value }
    : { ...DEFAULT_PLATFORM_DATA_POLICY };
}

export function getPlatformRetentionDays(policy: PlatformDataPolicy) {
  return PLATFORM_RETENTION_WINDOWS.find((option) => option.id === policy.retentionWindow)?.days ?? 7;
}

export function isPlatformDataPolicyReady(policy: PlatformDataPolicy) {
  return policy.isolatedRuntimeRequired
    && policy.rosterAuthorityConfirmed
    && policy.guestNoticeConfirmed;
}
