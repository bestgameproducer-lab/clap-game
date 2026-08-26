import type { PlatformDeliveryScope } from './draft';

export const PLATFORM_FULFILLMENT_LANES = ['standard_auto', 'custom_service'] as const;
export const PLATFORM_FULFILLMENT_STATUSES = ['awaiting_payment', 'manual_setup'] as const;
export const PLATFORM_RUNTIME_MODELS = ['managed_isolated', 'bespoke_isolated'] as const;

export type PlatformFulfillmentLane = typeof PLATFORM_FULFILLMENT_LANES[number];
export type PlatformFulfillmentStatus = typeof PLATFORM_FULFILLMENT_STATUSES[number];
export type PlatformRuntimeModel = typeof PLATFORM_RUNTIME_MODELS[number];

export type PlatformFulfillmentPlan = {
  projectVersion: number;
  lane: PlatformFulfillmentLane;
  status: PlatformFulfillmentStatus;
  runtimeModel: PlatformRuntimeModel;
  createdAt: string;
};

export type PlatformFulfillmentAssessment = {
  lane: PlatformFulfillmentLane;
  label: string;
  eyebrow: string;
  summary: string;
  runtimeModel: PlatformRuntimeModel;
  blockers: string[];
};

const AUTOMATABLE_SERVICE_IDS = new Set([
  'brand-adaptation',
  'guest-import',
  'host-runbook',
  'archive-export',
]);

const HUMAN_SERVICE_IDS = new Set([
  'content-workshop',
  'wedding-day-support',
]);

export const STANDARD_AUTO_SCOPE: PlatformDeliveryScope = {
  customizationLevel: 'template',
  supportMode: 'self_service',
  rehearsalMode: 'self_check',
  services: ['brand-adaptation', 'guest-import', 'host-runbook', 'archive-export'],
  serviceNotes: '',
};

export const CUSTOM_SERVICE_SCOPE: PlatformDeliveryScope = {
  customizationLevel: 'bespoke',
  supportMode: 'managed',
  rehearsalMode: 'full_rehearsal',
  services: ['brand-adaptation', 'content-workshop', 'guest-import', 'host-runbook', 'archive-export'],
  serviceNotes: '',
};

export function assessPlatformFulfillment(scope: PlatformDeliveryScope): PlatformFulfillmentAssessment {
  const blockers: string[] = [];
  if (scope.customizationLevel !== 'template') blockers.push('定制深度需要工作人员参与');
  if (scope.supportMode !== 'self_service') blockers.push('运营协作包含人工服务');
  if (scope.rehearsalMode !== 'self_check') blockers.push('彩排方式包含人工服务');
  if (scope.services.some((service) => HUMAN_SERVICE_IDS.has(service) || !AUTOMATABLE_SERVICE_IDS.has(service))) {
    blockers.push('所选服务包含人工工作坊或婚礼日支持');
  }
  if (scope.serviceNotes.trim()) blockers.push('补充要求需要工作人员确认');

  if (!blockers.length) {
    return {
      lane: 'standard_auto',
      label: '标准版 · 自动交付',
      eyebrow: 'STANDARD · AUTOMATED',
      summary: '付款确认后按已批准配置进入自动开通队列；发布前仍保留安全检查与人工暂停能力。',
      runtimeModel: 'managed_isolated',
      blockers,
    };
  }

  return {
    lane: 'custom_service',
    label: '深度定制 · 人工服务',
    eyebrow: 'BESPOKE · HUMAN REVIEW',
    summary: '系统先生成标准配置基线，特殊内容、视觉或现场服务由工作人员确认后再交付。',
    runtimeModel: 'bespoke_isolated',
    blockers,
  };
}
