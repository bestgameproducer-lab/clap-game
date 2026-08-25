export type PlatformRuntimeAttestationStage = 'verification' | 'readiness';

export const PLATFORM_RUNTIME_CHECKLISTS = {
  verification: [
    { id: 'publicOriginOpened', label: '已在独立设备打开公开 HTTPS 实例网址' },
    { id: 'manifestHashMatched', label: '实例使用的配置清单指纹与平台记录一致' },
    { id: 'isolatedDataStoreConfirmed', label: '已确认数据库与存储不和其他客户或旧婚礼共用' },
    { id: 'staffAccessConfirmed', label: '主办方、主持人和任务站入口均可正常登录' },
    { id: 'noSecretsConfirmed', label: '网址、部署标识和备注中均没有 Token、密钥或连接串' },
  ],
  readiness: [
    { id: 'mobileGuestFlowPassed', label: '至少使用两台手机跑通签到、身份与任务界面' },
    { id: 'operatorFlowPassed', label: '主办方、主持人、任务审核与积分操作已联动通过' },
    { id: 'stageTransitionsPassed', label: '阶段切换、刷新、重复操作和异常路径均已核验' },
    { id: 'fallbackMaterialsReady', label: '二维码、操作手册和网络故障备用材料已准备' },
  ],
} as const;

export type PlatformRuntimeChecklist = Record<string, boolean>;

export function getPlatformRuntimeChecklist(stage: PlatformRuntimeAttestationStage) {
  return PLATFORM_RUNTIME_CHECKLISTS[stage];
}

export function createEmptyPlatformRuntimeChecklist(stage: PlatformRuntimeAttestationStage): PlatformRuntimeChecklist {
  return Object.fromEntries(getPlatformRuntimeChecklist(stage).map((item) => [item.id, false]));
}

export function isPlatformRuntimeChecklistComplete(
  stage: PlatformRuntimeAttestationStage,
  checklist: PlatformRuntimeChecklist,
) {
  const expected = getPlatformRuntimeChecklist(stage).map((item) => item.id).sort();
  const actual = Object.keys(checklist).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    && expected.every((key) => checklist[key] === true);
}
