import 'server-only';
import { ApiError } from '../errors';
import { isTaskAllowedInCatalogMode } from '../official-task-manifest';
import { buildPublicScoreboard, findUndetectedTricksterIds, hasJoinedPersonalRanking } from '../scoreboard-core';
import { getSupabaseAdmin } from '../supabase';
import { compareWeddingGuests } from '../wedding-roster-order';

function ensureHostDatabaseError(error: { message: string } | null, fallback: string) {
  if (!error) return;
  if (error.message.includes('invalid_host_score_amount')) throw new ApiError(400, '每次只能增加 1–100 分');
  if (error.message.includes('score_reason_required')) throw new ApiError(400, '请填写加分原因');
  if (error.message.includes('score_event_key_required')) throw new ApiError(400, '缺少本次加分的事件编号');
  if (error.message.includes('rehearsal_run_required')) throw new ApiError(400, '缺少婚礼运行批次，请刷新主持人页面后重试');
  if (error.message.includes('rehearsal_run_mismatch')) throw new ApiError(409, '本页面属于清场前的旧批次；为避免污染正式数据，请刷新主持人页面后重新操作');
  if (error.message.includes('score_event_conflict')) throw new ApiError(409, '这次加分请求与已有记录冲突，请刷新后重试');
  if (error.message.includes('guest_not_personal_score_eligible')) throw new ApiError(409, '这位宾客目前不能获得个人积分');
  if (error.message.includes('guest_not_found')) throw new ApiError(404, '找不到这位宾客');
  if (error.message.includes('ceremony_assignment_not_found')) throw new ApiError(404, '找不到这项仪式任务');
  if (error.message.includes('ring_variant_required')) throw new ApiError(409, '请先选择负责新郎戒指或新娘戒指');
  if (error.message.includes('ceremony_assignment_not_completable')) throw new ApiError(409, '这项仪式任务当前不能完成，请刷新后核对状态');
  if (error.message.includes('invalid_team')) throw new ApiError(400, '组别不正确');
  if (error.message.includes('use_voting_controls')) throw new ApiError(409, '投票和身份揭晓必须使用下方专用按钮，不能从婚礼环节直接跳转');
  if (error.message.includes('invalid_game_stage_transition')) throw new ApiError(409, '婚礼环节只能按顺序进入；请刷新页面确认当前环节和下一步');
  if (error.message.includes('symbol_pairing_count_invalid')) throw new ApiError(409, '爱心和星星都必须各有五位玩家完成抽卡');
  if (error.message.includes('symbol_pairing_state_invalid') || error.message.includes('symbol_finalization_incomplete')) throw new ApiError(409, '爱心或星星配对状态异常，请让主控核对联盟记录');
  if (error.message.includes('symbol_fragment_distribution_invalid')) throw new ApiError(409, '爱心或星星的左右图案数量异常，无法自动完成最终配对');
  if (error.message.includes('symbol_auto_pair_conflict')) throw new ApiError(409, '自动补齐伙伴配对发生冲突，请刷新后重试');
  if (error.message.includes('symbol_final_player_missing')) throw new ApiError(409, '爱心或星星没有留下可升级的最后一位玩家，请让主控核对名单');
  if (error.message.includes('phase_two_roster_not_ready')) throw new ApiError(409, '第二轮任务需要海岛组和沙漠组各有 10 位玩家完成抽卡');
  if (error.message.includes('phase_two_trickster_count_invalid')) throw new ApiError(409, '海岛组和沙漠组必须各有一位已抽卡的恶作剧者');
  if (error.message.includes('phase_two_relationship_roles_not_ready')) throw new ApiError(409, '爱心或星星角色尚未完成结算，请刷新后重试');
  if (error.message.includes('guiding_star_origin_invalid') || error.message.includes('lonely_cupid_origin_invalid')) throw new ApiError(409, '第二轮觉醒角色与第一轮爱心/星星结果不一致，本次没有写入部分任务；请让主控核对第一轮配对记录');
  if (error.message.includes('phase_two_yirui_speech_unavailable')) throw new ApiError(409, '固定晚宴致辞玩家尚未完成抽卡，暂时不能发放第二轮任务');
  if (error.message.includes('phase_two_first_act_photo_contract_invalid')) throw new ApiError(409, '第一轮照片任务分配与正式任务清单不一致；第二轮尚未发放，请让主控核对张奕睿的固定照片任务和三项竞技组照片任务');
  if (error.message.includes('phase_two_photo_absorption_incomplete')) throw new ApiError(409, '仍有第一轮照片玩家未被第二轮能力任务吸收；本次没有发放第二轮任务，请让主控运行完整性检查');
  if (error.message.includes('phase_two_extra_vote_unavailable') || error.message.includes('phase_two_lucky_unavailable')) throw new ApiError(409, '第二轮能力卡名额不足，请让主控核对竞技组名单');
  if (error.message.includes('phase_two_existing_assignments_incomplete')) throw new ApiError(409, '检测到不完整或旧版第二轮任务，系统已停止切换；请让主控运行完整性检查');
  if (error.message.includes('phase_two_coverage_invalid') || error.message.includes('phase_two_team_coverage_invalid') || error.message.includes('phase_two_assignment_count_invalid')) throw new ApiError(409, '第二轮任务覆盖校验失败，本次没有写入部分任务，请让主控核对配置');
  if (error.message.includes('voting_stage_not_ready')) throw new ApiError(409, '请先在主持人流程台切换到团队挑战，再开启最终投票');
  if (error.message.includes('no_drawn_guests')) throw new ApiError(409, '尚无宾客完成抽卡，不能开启最终投票');
  if (error.message.includes('phase_two_team_draws_incomplete')) throw new ApiError(409, '20 位竞技组玩家尚未全部完成抽卡，不能结算团队积分');
  if (error.message.includes('phase_two_team_scores_missing')) throw new ApiError(409, '请先分别记录海岛组和沙漠组的最终成绩；即使某队是 0 分也需要明确记录');
  if (error.message.includes('phase_two_team_spy_missing')) throw new ApiError(409, '海岛组和沙漠组必须各有 1 名已抽卡的恶作剧者；请先让主办方完成抽卡或修正预设身份');
  if (error.message.includes('phase_two_team_clues_missing')) throw new ApiError(409, '海岛组和沙漠组都至少需要 2 条启用线索；请让主办方先补齐团队线索');
  if (error.message.includes('team_clue_settlement_stage_not_ready')) throw new ApiError(409, '请先切换到团队挑战，再结算团队积分与线索');
  if (error.message.includes('team_clues_not_settled')) throw new ApiError(409, '请先结算团队积分并自动发放线索，再开启最终投票');
  if (error.message.includes('team_scores_already_settled')) throw new ApiError(409, '团队积分已经结算，不能继续加分');
  if (error.message.includes('team_score_stage_closed')) throw new ApiError(409, '只有进入“婚宴互动 · 团队挑战”后才能记录团队积分');
  if (error.message.includes('family_random_score_stage_closed')) throw new ApiError(409, '只有进入“婚宴互动 · 团队挑战”后才能抽取家人组个人奖励');
  if (error.message.includes('family_random_guest_unavailable')) throw new ApiError(409, '家人组当前没有可获得个人积分的宾客，请让主办方核对名单');
  if (error.message.includes('results_already_published') || error.message.includes('final_results_locked')) throw new ApiError(409, '最终结果已经公布，本场流程、积分与结算记录已锁定');
  if (error.message.includes('DELETE requires a WHERE clause')) throw new ApiError(409, '第二轮派发被数据库安全规则拦截，请刷新后重试；本次没有写入部分任务');
  if (error.message.includes('voting_not_started')) throw new ApiError(409, '请先发起最终投票，再进行结算');
  if (error.message.includes('voting_still_open')) throw new ApiError(409, '请先关闭本轮投票，再公布身份并结算终局奖励');
  if (error.message.includes('no_votes_in_current_round')) throw new ApiError(409, '本轮还没有收到任何投票，不能公布并永久冻结终局结果');
  throw new Error(`${fallback}: ${error.message}`);
}

export async function getHostDashboardData() {
  const db = getSupabaseAdmin();
  const [guests, teamPoints, personalPoints, game, votes, assignments, clues, finalRewards] = await Promise.all([
    db.from('guests').select('id,name,team,role,is_hidden_spy,points,participation_mode,phase_two_eligible,special_card_title,eligible_for_personal_score,drawn_at,special_card_revealed_at').eq('active', true).eq('uses_app', true).order('team').order('name'),
    db.from('team_points_ledger').select('id,team,amount,reason,created_at').order('created_at', { ascending: false }),
    db.from('points_ledger').select('id,guest_id,amount,reason,created_at,guest:guests(id,name)').is('assignment_id', null).not('event_key', 'is', null).order('created_at', { ascending: false }).limit(50),
    db.from('game_state').select('stage,voting_open,voting_round,results_visible,results_published_at,team_clues_settled_at,team_score_snapshot,rehearsal_run_id,task_catalog_mode').eq('id', 1).single(),
    db.from('votes').select('id,voting_round,voter_guest_id,target_guest_id,vote_weight,voter:guests!votes_voter_guest_id_fkey(id,name,team)'),
    db.from('assignments').select('id,guest_id,status,ceremony_status,ring_variant,guest:guests(id,name),task:tasks!assignments_task_id_fkey(title,mission_code,category)').neq('status', 'cancelled'),
    db.from('clues').select('team_scope,active,spy_guest_id').eq('active', true).in('team_scope', ['海岛组', '沙漠组']),
    db.from('result_rewards').select('id').limit(1),
  ]);
  const error = guests.error ?? teamPoints.error ?? personalPoints.error ?? game.error ?? votes.error ?? assignments.error ?? clues.error ?? finalRewards.error;
  if (error) throw new Error(`Unable to load host data: ${error.message}`);
  const orderedGuests = [...(guests.data ?? [])].sort(compareWeddingGuests);
  const votingRound = game.data?.voting_round ?? 0;
  const eligibleGuests = orderedGuests
    .filter((guest) => guest.eligible_for_personal_score && hasJoinedPersonalRanking(guest))
    .map((guest) => ({
      id: guest.id,
      name: guest.name,
      team: guest.team,
      points: guest.points,
      countsForTeam: guest.participation_mode === 'ACTIVE_PLAYER' && ['海岛组', '沙漠组'].includes(guest.team),
    }));
  const frozenTeamPoints = game.data?.team_score_snapshot && typeof game.data.team_score_snapshot === 'object'
    ? Object.entries(game.data.team_score_snapshot as Record<string, unknown>).map(([team, amount]) => ({ team, amount: Number(amount) || 0 }))
    : teamPoints.data ?? [];
  const roundVotes = (votes.data ?? []).filter((vote) => vote.voting_round === votingRound).map((vote) => ({
    voter_guest_id: vote.voter_guest_id,
    target_guest_id: vote.target_guest_id,
    vote_weight: vote.vote_weight,
    voter: Array.isArray(vote.voter) ? vote.voter[0] ?? null : vote.voter,
  }));
  const eligibleTeamTricksters = orderedGuests.filter((guest) => guest.participation_mode === 'ACTIVE_PLAYER'
    && guest.phase_two_eligible && guest.drawn_at && guest.role === 'spy' && !guest.is_hidden_spy
    && ['海岛组', '沙漠组'].includes(guest.team));
  const undetectedTricksterIds = game.data?.results_visible
    ? findUndetectedTricksterIds(eligibleGuests, roundVotes, eligibleTeamTricksters)
    : new Set<string>();
  const rankingAssignments = (assignments.data ?? []).filter((assignment) => assignment.status === 'approved')
    .filter((assignment) => isTaskAllowedInCatalogMode(assignment.task, game.data?.task_catalog_mode));
  const ceremonyAssignments = (assignments.data ?? []).filter((assignment) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return task?.category === 'ceremony';
  });
  const rankings = buildPublicScoreboard(eligibleGuests, rankingAssignments, roundVotes, frozenTeamPoints, {
    leaderLimit: game.data?.results_visible ? eligibleGuests.length : 10,
    priorityGuestIds: undetectedTricksterIds,
    tricksterGuestIds: game.data?.results_visible ? new Set(eligibleTeamTricksters.map((guest) => guest.id)) : undefined,
  });
  return {
    guests: orderedGuests,
    teamPoints: (teamPoints.data ?? []).filter((entry) => ['海岛组', '沙漠组'].includes(entry.team)),
    personalPoints: personalPoints.data ?? [],
    game: game.data,
    finalLocked: Boolean(game.data?.results_published_at || finalRewards.data?.length),
    voteCount: roundVotes.length,
    teamClueCounts: Object.fromEntries(['海岛组', '沙漠组'].map((team) => {
      const teamTricksterIds = eligibleTeamTricksters.filter((guest) => guest.team === team).map((guest) => guest.id);
      return [team, (clues.data ?? []).filter((clue) => clue.team_scope === team
        && (clue.spy_guest_id === null || teamTricksterIds.includes(clue.spy_guest_id))).length];
    })),
    ceremonyAssignments,
    rankings: { personal: rankings.leaders, teams: rankings.teams },
    finale: {
      tricksters: game.data?.results_visible ? eligibleTeamTricksters.map((guest) => ({ id: guest.id, name: guest.name, team: guest.team, escaped: undetectedTricksterIds.has(guest.id) })) : [],
      voteCounts: game.data?.results_visible ? rankings.voteCounts : [],
    },
  };
}

export async function setHostFinaleFlag(field: 'voting_open' | 'results_visible', value: boolean, actor: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  if (field === 'results_visible' && value) {
    const { data: state, error: stateError } = await db.from('game_state').select('voting_open').eq('id', 1).single();
    ensureHostDatabaseError(stateError, 'Unable to verify finale voting state');
    if (state?.voting_open) throw new ApiError(409, '请先关闭本轮投票，再公布身份并结算终局奖励');
  }
  const { error } = await db.rpc('set_game_flag_for_run', {
    p_field: field, p_value: value, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to update finale state');
}

export async function settleHostTeamChallengeClues(actor: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('settle_phase_two_team_clues_for_run', {
    p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to settle team challenge clues');
  return data;
}

export async function setHostGameStage(stage: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_stage_for_run', {
    p_stage: stage, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to update game stage');
}

export async function completeHostCeremonyAssignment(
  assignmentId: string,
  ringVariant: 'GROOM_RING' | 'BRIDE_RING' | null,
  actor: string,
  rehearsalRunId: string,
) {
  const { error } = await getSupabaseAdmin().rpc('update_ceremony_assignment_for_run', {
    p_assignment_id: assignmentId,
    p_ceremony_status: 'COMPLETED',
    p_ring_variant: ringVariant,
    p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to complete ceremony assignment');
}

export async function adjustHostTeamPoints(input: { team: string; amount: number; reason: string; eventKey: string; rehearsalRunId: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('adjust_host_team_points_for_run', {
    p_team: input.team, p_amount: input.amount, p_reason: input.reason, p_event_key: input.eventKey, p_actor: actor,
    p_rehearsal_run_id: input.rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to add host team points');
  return data as number;
}

export async function adjustHostGuestPoints(input: { guestId: string; amount: number; reason: string; eventKey: string; rehearsalRunId: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('adjust_host_guest_points_for_run', {
    p_guest_id: input.guestId, p_amount: input.amount, p_reason: input.reason, p_event_key: input.eventKey, p_actor: actor,
    p_rehearsal_run_id: input.rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to add host guest points');
  return data as number;
}

export async function awardRandomFamilyGuestPoint(input: { eventKey: string; rehearsalRunId: string }, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('award_random_family_guest_point_for_run', {
    p_event_key: input.eventKey,
    p_actor: actor,
    p_rehearsal_run_id: input.rehearsalRunId,
  });
  ensureHostDatabaseError(error, 'Unable to award a random family guest point');
  return data as { guest_id: string; guest_name: string; total: number; amount: 1; replayed: boolean };
}
