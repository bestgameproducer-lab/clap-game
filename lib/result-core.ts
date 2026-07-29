export type RevealedTeamMember = { id: string; name: string; role: string };

export function buildPublishedTeamResults(
  teamMembers: RevealedTeamMember[],
  votedTargetId: string | null,
  resultsVisible: boolean,
) {
  if (!resultsVisible) return null;
  const votedTarget = teamMembers.find((member) => member.id === votedTargetId) ?? null;
  return {
    teamMembers,
    votedTargetId,
    votedTargetName: votedTarget?.name ?? null,
    voteCorrect: votedTargetId ? teamMembers.some((member) => member.id === votedTargetId && member.role === 'spy') : null,
  };
}
