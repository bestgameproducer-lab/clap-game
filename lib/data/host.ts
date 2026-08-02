import 'server-only';
import { ApiError } from '../errors';
import { buildPublicScoreboard } from '../scoreboard-core';
import { getSupabaseAdmin } from '../supabase';

export type HostSegmentInput = {
  id: string | null;
  title: string;
  stage: string;
  publicPrompt: string;
  hostNotes: string;
  correctAnswer: string;
  publicClue: string;
  timerMinutes: number;
  sortOrder: number;
  ready: boolean;
};

function ensureHostDatabaseError(error: { message: string } | null, fallback: string) {
  if (!error) return;
  if (error.message.includes('host_segment_not_found')) throw new ApiError(404, '找不到这个主持环节');
  if (error.message.includes('host_segment_not_ready')) throw new ApiError(409, '请先补齐正确答案并勾选允许发布');
  if (error.message.includes('host_answer_required')) throw new ApiError(400, '允许发布前必须填写主持人正确答案');
  if (error.message.includes('team_not_found')) throw new ApiError(404, '找不到这个队伍');
  if (error.message.includes('insufficient_team_resources')) throw new ApiError(409, '丘比特金币余额不足，不能完成这次扣减');
  if (error.message.includes('team_resources_limit')) throw new ApiError(409, '丘比特金币余额超过系统上限');
  if (error.message.includes('invalid_resource_amount')) throw new ApiError(400, '金币变化必须是 -100 到 100 之间的非零整数');
  if (error.message.includes('resource_reason_required')) throw new ApiError(400, '请填写金币变化原因');
  if (error.message.includes('resource_event_conflict')) throw new ApiError(409, '这次金币操作与已保存记录冲突，请刷新后重试');
  if (error.message.includes('invalid_host_score_amount')) throw new ApiError(400, '每次只能增加 1–100 分');
  if (error.message.includes('score_reason_required')) throw new ApiError(400, '请填写加分原因');
  if (error.message.includes('score_event_key_required')) throw new ApiError(400, '缺少本次加分的事件编号');
  if (error.message.includes('score_event_conflict')) throw new ApiError(409, '这次加分请求与已有记录冲突，请刷新后重试');
  if (error.message.includes('guest_not_personal_score_eligible')) throw new ApiError(409, '这位宾客目前不能获得个人积分');
  if (error.message.includes('guest_not_found')) throw new ApiError(404, '找不到这位宾客');
  if (error.message.includes('invalid_team')) throw new ApiError(400, '组别不正确');
  if (error.message.includes('voting_stage_not_ready')) throw new ApiError(409, '请先在主持人流程台切换到团队挑战，再开启最终投票');
  if (error.message.includes('no_drawn_guests')) throw new ApiError(409, '尚无宾客完成抽卡，不能开启最终投票');
  if (error.message.includes('phase_two_team_scores_missing')) throw new ApiError(409, '请先记录海岛组或沙漠组的团队成绩，再开启最终投票');
  if (error.message.includes('phase_two_team_spy_missing')) throw new ApiError(409, '海岛组和沙漠组必须各有 1 名已抽卡的恶作剧者；请先让主办方完成抽卡或修正预设身份');
  if (error.message.includes('phase_two_team_clues_missing')) throw new ApiError(409, '海岛组和沙漠组都至少需要 2 条启用线索；请让主办方先补齐团队线索');
  if (error.message.includes('team_clue_settlement_stage_not_ready')) throw new ApiError(409, '请先切换到团队挑战，再结算团队积分与线索');
  if (error.message.includes('team_clues_not_settled')) throw new ApiError(409, '请先结算团队积分并自动发放线索，再开启最终投票');
  if (error.message.includes('team_scores_already_settled')) throw new ApiError(409, '团队积分已经结算，不能继续加分');
  if (error.message.includes('DELETE requires a WHERE clause')) throw new ApiError(409, '第二轮派发被数据库安全规则拦截，请刷新后重试；本次没有写入部分任务');
  if (error.message.includes('voting_not_started')) throw new ApiError(409, '请先发起最终投票，再进行结算');
  throw new Error(`${fallback}: ${error.message}`);
}

export async function getHostDashboardData() {
  const db = getSupabaseAdmin();
  const [guests, teamPoints, personalPoints, game, votes, assignments, clues] = await Promise.all([
    db.from('guests').select('id,name,team,role,is_hidden_spy,points,participation_mode,special_card_title,eligible_for_personal_score,drawn_at').eq('active', true).eq('uses_app', true).order('team').order('name'),
    db.from('team_points_ledger').select('id,team,amount,reason,created_at').order('created_at', { ascending: false }),
    db.from('points_ledger').select('id,guest_id,amount,reason,created_at,guest:guests(id,name)').is('assignment_id', null).order('created_at', { ascending: false }).limit(50),
    db.from('game_state').select('stage,voting_open,voting_round,results_visible,team_clues_settled_at').eq('id', 1).single(),
    db.from('votes').select('id,voting_round'),
    db.from('assignments').select('guest_id,status').eq('status', 'approved'),
    db.from('clues').select('team_scope,active').eq('active', true).in('team_scope', ['海岛组', '沙漠组']),
  ]);
  const error = guests.error ?? teamPoints.error ?? personalPoints.error ?? game.error ?? votes.error ?? assignments.error ?? clues.error;
  if (error) throw new Error(`Unable to load host data: ${error.message}`);
  const votingRound = game.data?.voting_round ?? 0;
  const eligibleGuests = (guests.data ?? [])
    .filter((guest) => guest.eligible_for_personal_score)
    .map((guest) => ({
      id: guest.id,
      name: guest.name,
      team: guest.participation_mode === 'HONOR_GUEST' ? '荣誉宾客' : guest.team,
      points: guest.points,
      countsForTeam: guest.participation_mode === 'ACTIVE_PLAYER',
    }));
  const rankings = buildPublicScoreboard(eligibleGuests, assignments.data ?? [], [], teamPoints.data ?? []);
  return {
    guests: guests.data ?? [], teamPoints: teamPoints.data ?? [], personalPoints: personalPoints.data ?? [],
    game: game.data,
    voteCount: (votes.data ?? []).filter((vote) => vote.voting_round === votingRound).length,
    teamClueCounts: Object.fromEntries(['海岛组', '沙漠组'].map((team) => [team,
      (clues.data ?? []).filter((clue) => clue.team_scope === team).length])),
    rankings: { personal: rankings.leaders, teams: rankings.teams },
  };
}

export async function setHostFinaleFlag(field: 'voting_open' | 'results_visible', value: boolean, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_flag', {
    p_field: field, p_value: value, p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to update finale state');
}

export async function settleHostTeamChallengeClues(actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('settle_phase_two_team_clues', { p_actor: actor });
  ensureHostDatabaseError(error, 'Unable to settle team challenge clues');
  return data;
}

export async function setHostGameStage(stage: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_stage', {
    p_stage: stage, p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to update game stage');
}

export async function adjustHostTeamPoints(input: { team: string; amount: number; reason: string; eventKey: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('adjust_host_team_points', {
    p_team: input.team, p_amount: input.amount, p_reason: input.reason, p_event_key: input.eventKey, p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to add host team points');
  return data as number;
}

export async function adjustHostGuestPoints(input: { guestId: string; amount: number; reason: string; eventKey: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('adjust_host_guest_points', {
    p_guest_id: input.guestId, p_amount: input.amount, p_reason: input.reason, p_event_key: input.eventKey, p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to add host guest points');
  return data as number;
}

export async function saveHostSegment(input: HostSegmentInput, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('save_host_segment', {
    p_segment_id: input.id,
    p_title: input.title,
    p_stage: input.stage,
    p_public_prompt: input.publicPrompt,
    p_host_notes: input.hostNotes,
    p_correct_answer: input.correctAnswer,
    p_public_clue: input.publicClue,
    p_timer_minutes: input.timerMinutes,
    p_sort_order: input.sortOrder,
    p_ready: input.ready,
    p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to save host segment');
  return data as string;
}

export async function publishHostSegment(segmentId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('publish_host_segment', { p_segment_id: segmentId, p_actor: actor });
  ensureHostDatabaseError(error, 'Unable to publish host segment');
}

export async function adjustTeamResources(input: { team: string; amount: number; reason: string; eventKey: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('adjust_team_resources', {
    p_team: input.team,
    p_amount: input.amount,
    p_reason: input.reason,
    p_event_key: input.eventKey,
    p_actor: actor,
  });
  ensureHostDatabaseError(error, 'Unable to adjust team resources');
  return data as number;
}
