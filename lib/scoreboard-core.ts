export type ScoreboardGuest = { id: string; name: string; team: string; points: number; countsForTeam?: boolean };
export type ScoreboardAssignment = { guest_id: string; status: string };
export type ScoreboardVote = {
  target_guest_id: string;
  vote_weight?: number;
  voter_guest_id?: string;
  voter?: { id?: string; name: string; team?: string } | null;
};
export type ScoreboardTeamPoint = { team: string; amount: number };
export type ScoreboardOptions = {
  leaderLimit?: number;
  priorityGuestIds?: ReadonlySet<string>;
};

export function findUndetectedTricksterIds(
  guests: Array<Pick<ScoreboardGuest, 'id' | 'team'>>,
  votes: ScoreboardVote[],
  tricksters: Array<{ id: string; team: string }>,
) {
  const votesByGuest = new Map<string, number>();
  for (const vote of votes) votesByGuest.set(vote.target_guest_id, (votesByGuest.get(vote.target_guest_id) ?? 0) + (vote.vote_weight ?? 1));

  const undetected = new Set<string>();
  for (const trickster of tricksters) {
    const teamGuests = guests.filter((guest) => guest.team === trickster.team);
    const topVotes = Math.max(0, ...teamGuests.map((guest) => votesByGuest.get(guest.id) ?? 0));
    const tricksterVotes = votesByGuest.get(trickster.id) ?? 0;
    if (topVotes === 0 || tricksterVotes < topVotes) undetected.add(trickster.id);
  }
  return undetected;
}

export function buildPublicScoreboard(
  guests: ScoreboardGuest[],
  assignments: ScoreboardAssignment[],
  votes: ScoreboardVote[],
  teamPoints: ScoreboardTeamPoint[] = [],
  options: ScoreboardOptions = {},
) {
  const approvedByGuest = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.status === 'approved') approvedByGuest.set(assignment.guest_id, (approvedByGuest.get(assignment.guest_id) ?? 0) + 1);
  }

  const votesByGuest = new Map<string, number>();
  const votersByGuest = new Map<string, Array<{ id: string; name: string; team: string; votes: number }>>();
  for (const vote of votes) votesByGuest.set(vote.target_guest_id, (votesByGuest.get(vote.target_guest_id) ?? 0) + (vote.vote_weight ?? 1));
  for (const vote of votes) {
    if (!vote.voter?.name) continue;
    const voters = votersByGuest.get(vote.target_guest_id) ?? [];
    voters.push({
      id: vote.voter.id || vote.voter_guest_id || vote.voter.name,
      name: vote.voter.name,
      team: vote.voter.team || '',
      votes: vote.vote_weight ?? 1,
    });
    votersByGuest.set(vote.target_guest_id, voters);
  }

  const teams = new Map<string, { team: string; points: number; guests: number; completedTasks: number }>();
  for (const guest of guests) {
    if (guest.countsForTeam === false) continue;
    const current = teams.get(guest.team) ?? { team: guest.team, points: 0, guests: 0, completedTasks: 0 };
    current.guests += 1;
    current.completedTasks += approvedByGuest.get(guest.id) ?? 0;
    teams.set(guest.team, current);
  }
  for (const entry of teamPoints) {
    const current = teams.get(entry.team) ?? { team: entry.team, points: 0, guests: 0, completedTasks: 0 };
    current.points += entry.amount;
    teams.set(entry.team, current);
  }

  return {
    teams: [...teams.values()].sort((a, b) => b.points - a.points || b.completedTasks - a.completedTasks || a.team.localeCompare(b.team)),
    leaders: guests
      .map((guest) => ({ id: guest.id, name: guest.name, team: guest.team, points: guest.points, completedTasks: approvedByGuest.get(guest.id) ?? 0 }))
      .sort((a, b) => Number(options.priorityGuestIds?.has(b.id) ?? false) - Number(options.priorityGuestIds?.has(a.id) ?? false)
        || b.points - a.points || b.completedTasks - a.completedTasks || a.name.localeCompare(b.name))
      .slice(0, options.leaderLimit ?? 10)
      .map((guest) => ({ ...guest, undetectedTrickster: options.priorityGuestIds?.has(guest.id) ?? false })),
    voteCounts: guests
      .map((guest) => ({
        id: guest.id,
        name: guest.name,
        team: guest.team,
        votes: votesByGuest.get(guest.id) ?? 0,
        voters: (votersByGuest.get(guest.id) ?? []).sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)),
      }))
      .filter((guest) => guest.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)),
  };
}
