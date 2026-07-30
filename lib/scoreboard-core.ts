export type ScoreboardGuest = { id: string; name: string; team: string; points: number; countsForTeam?: boolean };
export type ScoreboardAssignment = { guest_id: string; status: string };
export type ScoreboardVote = { target_guest_id: string };
export type ScoreboardTeamPoint = { team: string; amount: number };

export function buildPublicScoreboard(
  guests: ScoreboardGuest[],
  assignments: ScoreboardAssignment[],
  votes: ScoreboardVote[],
  teamPoints: ScoreboardTeamPoint[] = [],
) {
  const approvedByGuest = new Map<string, number>();
  for (const assignment of assignments) {
    if (assignment.status === 'approved') approvedByGuest.set(assignment.guest_id, (approvedByGuest.get(assignment.guest_id) ?? 0) + 1);
  }

  const votesByGuest = new Map<string, number>();
  for (const vote of votes) votesByGuest.set(vote.target_guest_id, (votesByGuest.get(vote.target_guest_id) ?? 0) + 1);

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
      .sort((a, b) => b.points - a.points || b.completedTasks - a.completedTasks || a.name.localeCompare(b.name))
      .slice(0, 10),
    voteCounts: guests
      .map((guest) => ({ id: guest.id, name: guest.name, team: guest.team, votes: votesByGuest.get(guest.id) ?? 0 }))
      .filter((guest) => guest.votes > 0)
      .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name)),
  };
}
