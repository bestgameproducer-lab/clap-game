export type PublishedSpy = {
  id: string;
  name: string;
  team: string;
  isHiddenSpy: boolean;
};

export type PublishedSpyPoint = {
  guestId: string;
  amount: number;
  reason: string;
};

export type PublishedSpyMission = {
  guestId: string;
  title: string;
  status: string;
  roleScope: string;
  grantsHiddenSpy: boolean;
};

const REVEAL_REASONS = [
  ['team_wrong_answer', '影响队伍答错'],
  ['resource_wasted', '让队伍浪费资源'],
  ['ordinary_guest_suspected', '让普通宾客被怀疑'],
  ['escaped_vote', '成功隐藏到揭晓'],
  ['team_first', '所在队伍夺冠'],
  ['all_spy_tasks_complete', '完成全部间谍任务'],
] as const;

export function buildPublicSpyReveals(
  spies: PublishedSpy[],
  points: PublishedSpyPoint[],
  missions: PublishedSpyMission[],
) {
  return spies.map((spy) => {
    const spyPoints = points.filter((entry) => entry.guestId === spy.id);
    const actions = REVEAL_REASONS.map(([reason, label]) => {
      const matching = spyPoints.filter((entry) => entry.reason === reason);
      return {
        reason,
        label,
        count: matching.length,
        points: matching.reduce((sum, entry) => sum + entry.amount, 0),
      };
    }).filter((action) => action.count > 0);
    const secretMissions = missions
      .filter((mission) => mission.guestId === spy.id && (mission.roleScope === 'spy' || mission.grantsHiddenSpy))
      .map((mission) => ({ title: mission.title, completed: mission.status === 'approved' }));

    return {
      ...spy,
      points: spyPoints.reduce((sum, entry) => sum + entry.amount, 0),
      actions,
      missions: secretMissions,
    };
  }).sort((left, right) => right.points - left.points || left.name.localeCompare(right.name, 'zh-CN'));
}
