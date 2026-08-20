import 'server-only';
import { ApiError } from '../errors';
import { isTaskAllowedInCatalogMode } from '../official-task-manifest';
import { buildPublicScoreboard, findUndetectedTricksterIds, hasJoinedPersonalRanking } from '../scoreboard-core';
import { getSupabaseAdmin } from '../supabase';

export async function getPublicScoreboard() {
  const db = getSupabaseAdmin();
  const { data: game, error: gameError } = await db
    .from('game_state')
    .select('stage,voting_round,scoreboard_visible,results_visible,display_title,display_body,public_clue,timer_ends_at,updated_at,team_score_snapshot,task_catalog_mode')
    .eq('id', 1)
    .single();
  if (gameError || !game) throw new ApiError(503, '积分大屏暂时无法加载');

  if (!game.scoreboard_visible) {
    return { visible: false, stage: game.stage, resultsVisible: false, displayTitle: null, displayBody: null, publicClue: null, timerEndsAt: null, updatedAt: game.updated_at, teams: [], leaders: [], voteCounts: [], revealedRoles: [], awards: [] };
  }

  const [guestResult, assignmentResult, voteResult, teamPointResult] = await Promise.all([
    db.from('guests').select('id,name,team,points,participation_mode,drawn_at,special_card_revealed_at').eq('active', true).eq('eligible_for_personal_score', true).order('name'),
    db.from('assignments').select('guest_id,status,task:tasks!assignments_task_id_fkey(mission_code)').eq('status', 'approved'),
    db.from('votes').select('voter_guest_id,target_guest_id,vote_weight,voter:guests!votes_voter_guest_id_fkey(id,name,team)').eq('voting_round', game.voting_round),
    db.from('team_points_ledger').select('team,amount'),
  ]);
  const error = guestResult.error ?? assignmentResult.error ?? voteResult.error ?? teamPointResult.error;
  if (error) throw new Error(`Unable to load public scoreboard: ${error.message}`);

  const scoreboardGuests = (guestResult.data ?? []).filter(hasJoinedPersonalRanking).map((guest) => ({
    id: guest.id,
    name: guest.name,
    team: guest.team,
    points: guest.points,
    countsForTeam: guest.participation_mode === 'ACTIVE_PLAYER' && ['海岛组', '沙漠组'].includes(guest.team),
  }));
  let revealedRoles: Array<{ id: string; name: string; team: string; role: string; is_hidden_spy: boolean }> = [];
  let awards: Array<{ id: string; title: string; winnerName: string; winnerTeam: string | null; reason: string }> = [];
  if (game.results_visible) {
    const [roleResult, awardResult] = await Promise.all([
      db.from('guests').select('id,name,team,role,is_hidden_spy')
        .eq('active', true).eq('uses_app', true).eq('participation_mode', 'ACTIVE_PLAYER').eq('phase_two_eligible', true)
        .eq('role', 'spy').eq('is_hidden_spy', false).in('team', ['海岛组', '沙漠组'])
        .not('drawn_at', 'is', null).order('team').order('name'),
      db.from('awards').select('id,title,winner_team,reason,winner:guests(name,team)').eq('published', true).order('sort_order').order('created_at'),
    ]);
    const revealError = roleResult.error ?? awardResult.error;
    if (revealError) throw new Error(`Unable to load published results: ${revealError.message}`);
    revealedRoles = roleResult.data ?? [];
    awards = (awardResult.data ?? []).map((award) => {
      const winner = Array.isArray(award.winner) ? award.winner[0] : award.winner;
      return { id: award.id, title: award.title, winnerName: winner?.name || award.winner_team || '待公布', winnerTeam: winner?.team || award.winner_team, reason: award.reason };
    });
  }

  const scoreboardVotes = (voteResult.data ?? []).map((vote) => ({
    voter_guest_id: vote.voter_guest_id,
    target_guest_id: vote.target_guest_id,
    vote_weight: vote.vote_weight,
    voter: Array.isArray(vote.voter) ? vote.voter[0] ?? null : vote.voter,
  }));
  const undetectedTricksterIds = game.results_visible
    ? findUndetectedTricksterIds(scoreboardGuests, scoreboardVotes, revealedRoles)
    : new Set<string>();
  const scoreboard = buildPublicScoreboard(
    scoreboardGuests,
    (assignmentResult.data ?? []).filter((assignment) => isTaskAllowedInCatalogMode(assignment.task, game.task_catalog_mode)),
    scoreboardVotes,
    game.team_score_snapshot && typeof game.team_score_snapshot === 'object'
      ? Object.entries(game.team_score_snapshot as Record<string, unknown>).map(([team, amount]) => ({ team, amount: Number(amount) || 0 }))
      : teamPointResult.data ?? [],
    {
      leaderLimit: game.results_visible ? scoreboardGuests.length : 10,
      priorityGuestIds: undetectedTricksterIds,
      tricksterGuestIds: game.results_visible ? new Set(revealedRoles.map((guest) => guest.id)) : undefined,
    },
  );

  // The display switch controls whether the public screen itself is open; it
  // must never be able to bypass the wedding timeline. Before the team game,
  // operators may still publish a timer or a public instruction, but scores
  // remain private. Team scores start with the team challenge and individual
  // rankings remain private until voting begins.
  const teamScoresVisible = ['group_game', 'voting', 'results'].includes(game.stage);
  const individualScoresVisible = ['voting', 'results'].includes(game.stage);

  return {
    visible: true,
    stage: game.stage,
    resultsVisible: game.results_visible,
    displayTitle: game.display_title,
    displayBody: game.display_body,
    publicClue: game.public_clue,
    timerEndsAt: game.timer_ends_at,
    updatedAt: game.updated_at,
    teams: teamScoresVisible ? scoreboard.teams : [],
    leaders: individualScoresVisible ? scoreboard.leaders : [],
    voteCounts: game.results_visible ? scoreboard.voteCounts : [],
    revealedRoles: game.results_visible ? revealedRoles.map((guest) => ({
      ...guest,
      escaped: undetectedTricksterIds.has(guest.id),
    })) : [],
    awards,
  };
}
