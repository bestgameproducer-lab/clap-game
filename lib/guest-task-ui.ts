const LIVE_PHOTO_EVIDENCE_MISSIONS = new Set([
  'P1-SOCIAL-001',
  'P1-SOCIAL-002',
  'P2-SOCIAL-001',
  'P2-SOCIAL-002',
  'P2-SOCIAL-003',
  'P2-SOCIAL-004',
]);

const LIVE_GUEST_CONFIRMATION_MISSIONS = new Set([
  'P1-CER-001',
  'P1-CER-002',
  'P1-BOUQUET-001',
  'P2-CEREMONY-001',
]);

const REQUIRED_GUEST_PHOTO_MISSIONS = new Set([
  'P2-SOCIAL-003',
  'P2-SOCIAL-004',
]);

export function acceptsGuestPhotoEvidence(input: {
  missionCode: string | null | undefined;
  mechanic: string | null | undefined;
  catalogMode: string | null | undefined;
}) {
  if (input.catalogMode === 'demo') return input.mechanic === 'STANDARD';
  if (input.catalogMode !== 'live') return false;
  return typeof input.missionCode === 'string' && LIVE_PHOTO_EVIDENCE_MISSIONS.has(input.missionCode);
}

export function requiresGuestPhotoBeforeSubmission(missionCode: string | null | undefined) {
  return typeof missionCode === 'string' && REQUIRED_GUEST_PHOTO_MISSIONS.has(missionCode);
}

export function acceptsGuestSelfSubmission(input: {
  missionCode: string | null | undefined;
  mechanic: string | null | undefined;
  catalogMode: string | null | undefined;
}) {
  // Host-confirmed ceremony missions also accept a guest completion notice.
  // This gives the guest a visible handoff while the host or task station keeps
  // final approval and scoring server-authoritative.
  if (input.catalogMode === 'demo') return input.mechanic === 'STANDARD';
  if (input.catalogMode !== 'live') return false;
  return typeof input.missionCode === 'string'
    && (LIVE_PHOTO_EVIDENCE_MISSIONS.has(input.missionCode) || LIVE_GUEST_CONFIRMATION_MISSIONS.has(input.missionCode));
}

export function guestPhotoEvidenceLabel(missionCode: string | null | undefined, hasEvidence: boolean) {
  if (hasEvidence) return '更换验证照片';
  const labels: Record<string, string> = {
    'P1-SOCIAL-001': '添加与新朋友的合影',
    'P1-SOCIAL-002': '添加新郎新娘同框照片',
    'P2-SOCIAL-001': '添加与新郎爸爸的碰杯合影',
    'P2-SOCIAL-002': '添加与新娘妈妈的碰杯合影',
    'P2-SOCIAL-003': '添加与新郎的主题合影（必需）',
    'P2-SOCIAL-004': '添加与新娘的主题合影（必需）',
  };
  return missionCode ? labels[missionCode] ?? '添加验证照片' : '添加验证照片';
}

export function guestCompletionNotePlaceholder(missionCode: string | null | undefined) {
  const placeholders: Record<string, string> = {
    'P1-CER-001': '例如：已按主持人提示完成誓词引导。',
    'P1-CER-002': '例如：已按提示安全送达戒指。',
    'P1-BOUQUET-001': '例如：仪式结束后，我接到或由新人送得手捧花。',
    'P1-SOCIAL-001': '例如：已与新朋友互相介绍并完成合影。',
    'P1-SOCIAL-002': '例如：已拍到新郎新娘同框的画面。',
    'P2-SOCIAL-001': '例如：已送上祝福、碰杯并完成合影。',
    'P2-SOCIAL-002': '例如：已送上祝福、碰杯并完成合影。',
    'P2-SOCIAL-003': '例如：主题合影已上传，祝福和互动均已完成。',
    'P2-SOCIAL-004': '例如：主题合影已上传，祝福和互动均已完成。',
    'P2-CEREMONY-001': '例如：已在主持人指定时间完成晚宴致辞。',
  };
  return missionCode
    ? placeholders[missionCode] ?? '补充任务完成经过，便于工作人员核验。'
    : '补充任务完成经过，便于工作人员核验。';
}

export function guestMissionRewardLabel(input: {
  points: number;
  missionCode: string | null | undefined;
  mechanic: string | null | undefined;
  scorePolicy: string | null | undefined;
}) {
  if (input.points > 0) return `${input.points} 分`;

  const missionLabels: Record<string, string> = {
    'P2-POWER-001': '两票 · 投对 4 分',
    'P2-LUCKY-001': '快照 + 2',
  };
  if (input.missionCode && missionLabels[input.missionCode]) {
    return missionLabels[input.missionCode];
  }

  const mechanicLabels: Record<string, string> = {
    SECRET_DILEMMA: '按选择结算',
    COPY_SCORE: '偷心行动',
    TEAM_CAPTAIN: '团队奖励',
    TRICKSTER_SIGNAL: '能力解锁',
    TRICKSTER_MISSION: '身份任务',
  };
  if (input.mechanic && mechanicLabels[input.mechanic]) {
    return mechanicLabels[input.mechanic];
  }

  return input.scorePolicy === 'NO_PERSONAL' ? '系统结算' : '0 分';
}

export const LIVE_GUEST_PHOTO_EVIDENCE_MISSION_CODES = [...LIVE_PHOTO_EVIDENCE_MISSIONS];
