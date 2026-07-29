import 'server-only';
import { ApiError } from '../errors';
import { buildPublicScoreboard } from '../scoreboard-core';
import { getSupabaseAdmin } from '../supabase';

export async function getPublicScoreboard() {
  const db = getSupabaseAdmin();
  const { data: game, error: gameError } = await db
    .from('game_state')
    .select('stage,voting_round,scoreboard_visible,results_visible,display_title,display_body,public_clue,timer_ends_at,updated_at')
    .eq('id', 1)
    .single();
  if (gameError || !game) throw new ApiError(503, '积分大屏暂时无法加载');

  if (!game.scoreboard_visible) {
    return { visible: false, stage: game.stage, resultsVisible: false, displayTitle: null, displayBody: null, publicClue: null, timerEndsAt: null, updatedAt: game.updated_at, teams: [], leaders: [], voteCounts: [], revealedRoles: [], awards: [] };
  }

  const [guestResult, assignmentResult, voteResult, teamPointResult] = await Promise.all([
    db.from('guests').select('id,name,team,points').not('drawn_at', 'is', null).order('name'),
    db.from('assignments').select('guest_id,status').eq('status', 'approved'),
    db.from('votes').select('target_guest_id').eq('voting_round', game.voting_round),
    db.from('team_points_ledger').select('team,amount'),
  ]);
  const error = guestResult.error ?? assignmentResult.error ?? voteResult.error ?? teamPointResult.error;
  if (error) throw new Error(`Unable to load public scoreboard: ${error.message}`);

  const scoreboard = buildPublicScoreboard(guestResult.data ?? [], assignmentResult.data ?? [], voteResult.data ?? [], teamPointResult.data ?? []);
  let revealedRoles: Array<{ id: string; name: string; team: string; role: string; is_hidden_spy: boolean }> = [];
  let awards: Array<{ id: string; title: string; winnerName: string; winnerTeam: string | null; reason: string }> = [];
  if (game.results_visible) {
    const [roleResult, awardResult] = await Promise.all([
      db.from('guests').select('id,name,team,role,is_hidden_spy').in('role', ['spy', 'helper']).not('drawn_at', 'is', null).order('team').order('name'),
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

  return {
    visible: true,
    stage: game.stage,
    resultsVisible: game.results_visible,
    displayTitle: game.display_title,
    displayBody: game.display_body,
    publicClue: game.public_clue,
    timerEndsAt: game.timer_ends_at,
    updatedAt: game.updated_at,
    teams: scoreboard.teams,
    leaders: scoreboard.leaders,
    voteCounts: game.results_visible ? scoreboard.voteCounts : [],
    revealedRoles,
    awards,
  };
}
