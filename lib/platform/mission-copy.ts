import { OFFICIAL_TASK_MANIFEST } from '../official-task-manifest';

export const PLATFORM_EDITABLE_MISSION_CODES = [
  'P1-CER-001',
  'P1-CER-002',
  'P1-BOUQUET-001',
  'P1-SOCIAL-001',
  'P1-SOCIAL-002',
  'P2-SOCIAL-001',
  'P2-SOCIAL-002',
  'P2-SOCIAL-003',
  'P2-SOCIAL-004',
  'P2-CEREMONY-001',
] as const;

export type PlatformEditableMissionCode = typeof PLATFORM_EDITABLE_MISSION_CODES[number];

const editableMissionCodeSet = new Set<string>(PLATFORM_EDITABLE_MISSION_CODES);

export const PLATFORM_EDITABLE_MISSIONS = OFFICIAL_TASK_MANIFEST
  .filter((task) => editableMissionCodeSet.has(task.mission_code))
  .map((task) => ({
    missionCode: task.mission_code as PlatformEditableMissionCode,
    stage: task.stage,
    title: task.title,
    description: task.description,
    verificationMethod: task.verification_method,
    points: task.points,
  }));

export function isPlatformEditableMissionCode(value: unknown): value is PlatformEditableMissionCode {
  return typeof value === 'string' && editableMissionCodeSet.has(value);
}
