import { buildCsv } from '../csv';
import { getWeddingTemplateContent, type WeddingDraft } from './draft';

export const FLAGSHIP_PARTICIPATION_CONTRACT = {
  appAccounts: 32,
  principals: 2,
  familyMissionPlayers: 3,
  familyHonorGuests: 7,
  competitivePlayers: 20,
  competitiveTeamSize: 10,
  heartHolders: 5,
  starHolders: 5,
  tricksters: 2,
} as const;

export type PlatformSeatType = 'principal' | 'family_mission' | 'family_honor' | 'competitor';

export type PlatformSeatTemplateRow = {
  seatId: string;
  seatType: PlatformSeatType;
  team: string;
  missionEligible: boolean;
  finaleEligible: boolean;
  note: string;
};

export type PlatformCapacityCheck = {
  id: string;
  label: string;
  detail: string;
  status: 'ready' | 'blocked' | 'not_required';
};

export function getPlatformOperatorSeatRecommendation(guestCapacity: number) {
  return guestCapacity >= 120 ? 4 : guestCapacity >= 80 ? 3 : 2;
}

export function buildPlatformSeatTemplate(draft: WeddingDraft): PlatformSeatTemplateRow[] {
  if (!draft.modules.includes('secret-missions')) return [];
  const content = getWeddingTemplateContent(draft);
  const seats: PlatformSeatTemplateRow[] = [
    { seatId: 'PRINCIPAL-01', seatType: 'principal', team: '', missionEligible: false, finaleEligible: false, note: '新人账号一' },
    { seatId: 'PRINCIPAL-02', seatType: 'principal', team: '', missionEligible: false, finaleEligible: false, note: '新人账号二' },
  ];
  for (let index = 1; index <= FLAGSHIP_PARTICIPATION_CONTRACT.familyMissionPlayers; index += 1) {
    seats.push({ seatId: `FAMILY-TASK-${String(index).padStart(2, '0')}`, seatType: 'family_mission', team: '家人组', missionEligible: true, finaleEligible: false, note: '家人组任务席位' });
  }
  for (let index = 1; index <= FLAGSHIP_PARTICIPATION_CONTRACT.familyHonorGuests; index += 1) {
    seats.push({ seatId: `FAMILY-HONOR-${String(index).padStart(2, '0')}`, seatType: 'family_honor', team: '家人组', missionEligible: false, finaleEligible: false, note: '家人组荣誉席位' });
  }
  for (const [teamIndex, team] of [content.teamOneName, content.teamTwoName].entries()) {
    for (let index = 1; index <= FLAGSHIP_PARTICIPATION_CONTRACT.competitiveTeamSize; index += 1) {
      seats.push({
        seatId: `TEAM-${teamIndex + 1}-${String(index).padStart(2, '0')}`,
        seatType: 'competitor',
        team,
        missionEligible: true,
        finaleEligible: true,
        note: '竞技玩家；隐藏身份由系统在独立实例内分配',
      });
    }
  }
  return seats;
}

export function buildPlatformCapacityPlan(draft: WeddingDraft) {
  const guestCapacity = Number(draft.guestCount);
  const secretMissionsEnabled = draft.modules.includes('secret-missions');
  const seatTemplate = buildPlatformSeatTemplate(draft);
  const appAccounts = seatTemplate.length;
  const operatorSeats = draft.modules.includes('host-toolkit') ? getPlatformOperatorSeatRecommendation(guestCapacity) : 0;
  const templateContent = getWeddingTemplateContent(draft);
  const teamNamesDistinct = templateContent.teamOneName.trim().toLowerCase() !== templateContent.teamTwoName.trim().toLowerCase();
  const teamNamesValid = Boolean(templateContent.teamOneName.trim() && templateContent.teamTwoName.trim() && teamNamesDistinct);
  const checks: PlatformCapacityCheck[] = secretMissionsEnabled ? [
    {
      id: 'capacity',
      label: '婚礼规模可以容纳旗舰玩法席位',
      detail: `约 ${guestCapacity} 位宾客中预留 ${FLAGSHIP_PARTICIPATION_CONTRACT.appAccounts} 个游戏账号席位，其余约 ${Math.max(guestCapacity - FLAGSHIP_PARTICIPATION_CONTRACT.appAccounts, 0)} 人可作为现场观众或非登录参与者。`,
      status: 'ready',
    },
    {
      id: 'teams',
      label: teamNamesValid ? '两支竞技队伍保持完全平衡' : '两支竞技队伍必须填写不同名称',
      detail: teamNamesValid
        ? `${templateContent.teamOneName} ${FLAGSHIP_PARTICIPATION_CONTRACT.competitiveTeamSize} 人 · ${templateContent.teamTwoName} ${FLAGSHIP_PARTICIPATION_CONTRACT.competitiveTeamSize} 人。`
        : '当前组名为空或重复，无法安全生成名单、主持控制与积分榜；请返回内容定制填写两个不同的组名。',
      status: teamNamesValid ? 'ready' : 'blocked',
    },
    {
      id: 'relationships',
      label: '爱心与星星关系结构可完整结算',
      detail: `爱心 ${FLAGSHIP_PARTICIPATION_CONTRACT.heartHolders} 人形成 2 对与 1 位孤单丘比特；星星 ${FLAGSHIP_PARTICIPATION_CONTRACT.starHolders} 人形成 2 对与 1 位领航星。`,
      status: 'ready',
    },
    {
      id: 'privacy',
      label: '当前只生成空白席位，不收集宾客资料',
      detail: '下载的表格不含姓名、邮箱、密码、隐藏身份或任务结果；填写后的真实名单目前不会自动上传。',
      status: 'ready',
    },
  ] : [{
    id: 'secret-missions-disabled',
    label: '当前方案不需要旗舰秘密角色席位',
    detail: '秘密任务模块未启用，因此不会生成 32 个登录席位或隐藏身份结构；团队游戏的现场人数会在实例类型确定后单独确认。',
    status: 'not_required',
  }];

  return {
    guestCapacity,
    appAccounts,
    audienceOnlyCapacity: Math.max(guestCapacity - appAccounts, 0),
    operatorSeats,
    secretMissionsEnabled,
    teamNamesDistinct,
    teamNamesValid,
    ready: checks.every((check) => check.status !== 'blocked'),
    seatTemplate,
    checks,
  };
}

export function buildPlatformSeatTemplateCsv(draft: WeddingDraft) {
  const plan = buildPlatformCapacityPlan(draft);
  if (!plan.secretMissionsEnabled || !plan.teamNamesValid) return '';
  return buildCsv(
    ['seat_id', 'display_name', 'login_name', 'seat_type', 'team', 'mission_eligible', 'finale_eligible', 'notes'],
    plan.seatTemplate.map((seat) => [
      seat.seatId,
      '',
      '',
      seat.seatType,
      seat.team,
      seat.missionEligible,
      seat.finaleEligible,
      seat.note,
    ]),
  );
}
