export type PlatformRuntimeReleaseAction = 'release' | 'hold';

export const PLATFORM_RUNTIME_RELEASE_CHECKLISTS = {
  release: [
    { id: 'readyStateReviewed', label: '已复核实例仍为通过完整彩排的当前版本' },
    { id: 'ownerApprovalConfirmed', label: '已取得项目所有者对本次正式开放的明确确认' },
    { id: 'publicEntryVerified', label: '已在宾客设备打开正式入口与二维码' },
    { id: 'supportContactsConfirmed', label: '已确认婚礼当天负责人、支持时段与联系路径' },
    { id: 'rollbackProcedureConfirmed', label: '已确认外部平台的停用、回退和备用入口步骤' },
    { id: 'dataDeadlineRecorded', label: '已记录本项目约定的宾客资料删除期限' },
  ],
  hold: [
    { id: 'externalAccessRestricted', label: '已在外部部署平台限制正式入口或切回安全版本' },
    { id: 'ownerNotified', label: '已通知项目所有者当前暂停原因和影响范围' },
    { id: 'incidentRecorded', label: '已记录问题、现场替代方案和恢复前检查要求' },
  ],
} as const;

export type PlatformRuntimeReleaseChecklist = Record<string, boolean>;

export function getPlatformRuntimeReleaseChecklist(action: PlatformRuntimeReleaseAction) {
  return PLATFORM_RUNTIME_RELEASE_CHECKLISTS[action];
}

export function createEmptyPlatformRuntimeReleaseChecklist(
  action: PlatformRuntimeReleaseAction,
): PlatformRuntimeReleaseChecklist {
  return Object.fromEntries(getPlatformRuntimeReleaseChecklist(action).map((item) => [item.id, false]));
}

export function isPlatformRuntimeReleaseChecklistComplete(
  action: PlatformRuntimeReleaseAction,
  checklist: PlatformRuntimeReleaseChecklist,
) {
  const expected = getPlatformRuntimeReleaseChecklist(action).map((item) => item.id).sort();
  const actual = Object.keys(checklist).sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index])
    && expected.every((key) => checklist[key] === true);
}
