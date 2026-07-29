import 'server-only';
import { ApiError } from '../errors';
import { buildPublicScoreboard } from '../scoreboard-core';
import { getSupabaseAdmin } from '../supabase';

export async function getPublicScoreboard() {
  const db = getSupabaseAdmin();
  const { data: game, error: gameError } = await db
    .from('game_state')
    .select('stage,scoreboard_visible,results_visible,updated_at')
    .eq('id', 1)
    .single();
  if (gameError || !game) throw new ApiError(503, '积分大屏暂时无法加载');

  if (!game.scoreboard_visible) {
    return { visible: false, stage: game.stage, resultsVisible: false, updatedAt: game.updated_at, teams: [], leaders: [], voteCounts: [], revealedRoles: [] };
  }

  const [guestResult, assignmentResult, voteResult] = await Promise.all([
    db.from('guests').select('id,name,team,points').not('drawn_at', 'is', null).order('name'),
    db.from('assignments').select('guest_id,status').eq('status', 'approved'),
    db.from('votes').select('target_guest_id'),
  ]);
  const error = guestResult.error ?? assignmentResult.error ?? voteResult.error;
  if (error) throw new Error(`Unable to load public scoreboard: ${error.message}`);

  const scoreboard = buildPublicScoreboard(guestResult.data ?? [], assignmentResult.data ?? [], voteResult.data ?? []);
  let revealedRoles: Array<{ id: string; name: string; team: string; role: string }> = [];
  if (game.results_visible) {
    const { data, error: roleError } = await db.from('guests').select('id,name,team,role').in('role', ['spy', 'helper']).not('drawn_at', 'is', null).order('team').order('name');
    if (roleError) throw new Error(`Unable to load revealed roles: ${roleError.message}`);
    revealedRoles = data ?? [];
  }

  return {
    visible: true,
    stage: game.stage,
    resultsVisible: game.results_visible,
    updatedAt: game.updated_at,
    teams: scoreboard.teams,
    leaders: scoreboard.leaders,
    voteCounts: game.results_visible ? scoreboard.voteCounts : [],
    revealedRoles,
  };
}
