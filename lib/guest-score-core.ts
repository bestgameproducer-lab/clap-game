export type GuestPointLedgerEntry = {
  id: number;
  assignment_id: string | null;
  amount: number;
  reason: string;
  created_at: string;
};

export type GuestAssignmentLabel = {
  id: string;
  task: { title?: string | null } | Array<{ title?: string | null }> | null;
};

export type GuestTeamPointEntry = { team: string; amount: number };

const COMPETITIVE_TEAMS = ['海岛组', '沙漠组'] as const;
const HIDDEN_RESULT_REASONS = ['超级幸运星', '丘比特幸运星', '孤单丘比特', '领航星队长'];

function pointLabel(reason: string, assignmentTitle: string | null, resultsVisible: boolean) {
  if (!resultsVisible && HIDDEN_RESULT_REASONS.some((prefix) => reason.startsWith(prefix))) return '第二幕系统奖励';
  if (assignmentTitle) return assignmentTitle;
  return reason || '积分调整';
}

export function buildGuestPointLedger(
  entries: GuestPointLedgerEntry[],
  assignments: GuestAssignmentLabel[],
  resultsVisible: boolean,
) {
  const assignmentTitles = new Map(assignments.map((assignment) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return [assignment.id, task?.title?.trim() || null];
  }));
  return entries.map((entry) => ({
    id: entry.id,
    amount: entry.amount,
    label: pointLabel(entry.reason.trim(), entry.assignment_id ? assignmentTitles.get(entry.assignment_id) ?? null : null, resultsVisible),
    createdAt: entry.created_at,
  }));
}

export function buildGuestTeamScores(entries: GuestTeamPointEntry[], snapshot?: unknown) {
  if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
    const frozen = snapshot as Record<string, unknown>;
    return COMPETITIVE_TEAMS
      .map((team) => ({ team, points: Number.isFinite(Number(frozen[team])) ? Number(frozen[team]) : 0 }))
      .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));
  }
  const totals = new Map<string, number>(COMPETITIVE_TEAMS.map((team) => [team, 0]));
  for (const entry of entries) {
    if (totals.has(entry.team)) totals.set(entry.team, (totals.get(entry.team) ?? 0) + entry.amount);
  }
  return COMPETITIVE_TEAMS
    .map((team) => ({ team, points: totals.get(team) ?? 0 }))
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));
}
