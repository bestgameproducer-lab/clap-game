type SettlementAuditEntry = {
  action: string;
  details: unknown;
  created_at: string;
};

function auditDetails(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Return only the exact clue ids selected by each team's latest settlement in
 * the current rehearsal. Manual grants are deliberately not a source here.
 */
export function settledClueIdsByTeam(entries: SettlementAuditEntry[]) {
  const ordered = [...entries].sort((left, right) => (
    Date.parse(right.created_at) - Date.parse(left.created_at)
  ));
  const latestResetAt = ordered.find((entry) => entry.action === 'rehearsal.reset')?.created_at;
  const result: Record<string, string[]> = {};
  for (const entry of ordered) {
    if (entry.action !== 'phase_two.team_clues_settle') continue;
    if (latestResetAt && entry.created_at <= latestResetAt) continue;
    const details = auditDetails(entry.details);
    const team = typeof details?.team === 'string' ? details.team : '';
    if (!team || result[team]) continue;
    const clueIds = Array.isArray(details?.clue_ids)
      ? details.clue_ids.filter((value): value is string => typeof value === 'string')
      : [];
    result[team] = [...new Set(clueIds)];
  }
  return result;
}
