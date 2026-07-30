import 'server-only';
import { ApiError } from '../errors';
import { isTaskVisibleAtStage } from '../game-rules';
import { buildPublishedTeamResults } from '../result-core';
import { getSupabaseAdmin } from '../supabase';
import { signEvidencePaths } from './evidence';

export async function submitGuestAssignment(assignmentId: string, guestId: string, completionNote: string) {
  const { error } = await getSupabaseAdmin().rpc('submit_assignment', {
    p_assignment_id: assignmentId, p_guest_id: guestId, p_completion_note: completionNote,
  });
  if (error?.message.includes('assignment_not_assignable')) throw new ApiError(409, '任务状态不可提交');
  if (error?.message.includes('assignment_stage_closed')) throw new ApiError(409, '当前环节不能提交这项任务，请联系任务站');
  if (error) throw new Error(`Unable to submit assignment: ${error.message}`);
}

export async function castGuestVote(voterGuestId: string, targetGuestId: string) {
  const { error } = await getSupabaseAdmin().rpc('cast_team_vote', {
    p_voter_guest_id: voterGuestId, p_target_guest_id: targetGuestId,
  });
  if (error?.message.includes('self_vote')) throw new ApiError(400, '不能投自己');
  if (error?.message.includes('voting_closed')) throw new ApiError(409, '投票尚未开放或已经关闭');
  if (error?.message.includes('cross_team_vote')) throw new ApiError(400, '只能投给本队宾客');
  if (error?.message.includes('vote_already_cast')) throw new ApiError(409, '你已经提交过本轮投票，不能再次修改');
  if (error?.message.includes('guest_not_found')) throw new ApiError(404, '找不到投票对象');
  if (error) throw new Error(`Unable to save vote: ${error.message}`);
}

export async function drawGuestCard(guestId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('draw_guest_card', { p_guest_id: guestId });
  if (error?.message.includes('guest_not_claimed')) throw new ApiError(401, '请先认领宾客身份');
  if (error?.message.includes('guest_not_mission_eligible')) throw new ApiError(409, '你的专属内容不需要抽取普通任务');
  if (error?.message.includes('draw_registration_closed')) throw new ApiError(409, '抽卡入口已经关闭，请联系主办方');
  if (error?.message.includes('draw_capacity_full')) throw new ApiError(409, '抽卡名额已经全部派发');
  if (error?.message.includes('draw_preset_capacity_full')) throw new ApiError(409, '主办方预设的组别已经满员，请联系主办方调整');
  if (error?.message.includes('draw_preset_role_capacity_full')) throw new ApiError(409, '主办方预设的身份名额冲突，请联系主办方调整');
  if (error?.message.includes('draw_task_missing')) throw new ApiError(409, '任务池尚未配置完成，请联系主办方');
  if (error) throw new Error(`Unable to draw guest card: ${error.message}`);
  const card = Array.isArray(data) ? data[0] : data;
  if (!card) throw new Error('Unable to draw guest card: empty response');
  return {
    team: card.guest_team,
    role: card.guest_role,
    storyRole: card.guest_story_role,
    task: {
      id: card.task_id,
      title: card.task_title,
      description: card.task_description,
      verificationMethod: card.task_verification_method,
      points: card.task_points,
    },
    drawnAt: card.card_drawn_at,
  };
}

export async function revealHonorSpecialCard(guestId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('reveal_honor_special_card', { p_guest_id: guestId });
  if (error?.message.includes('guest_not_claimed')) throw new ApiError(401, '请先认领宾客身份');
  if (error?.message.includes('guest_not_honor_eligible')) throw new ApiError(409, '此身份没有家庭惊喜卡');
  if (error?.message.includes('guest_not_found')) throw new ApiError(404, '找不到宾客身份');
  if (error) throw new Error(`Unable to reveal honor special card: ${error.message}`);
  if (typeof data !== 'string') throw new Error('Unable to reveal honor special card: invalid response');
  return data;
}

export async function requestGuestConnection(guestId: string, targetCode: string, relationshipType: string) {
  const { data, error } = await getSupabaseAdmin().rpc('request_player_connection', {
    p_guest_id: guestId,
    p_target_code: targetCode,
    p_relationship_type: relationshipType,
  });
  if (error?.message.includes('connection_guest_not_ready')) throw new ApiError(409, '请先完成抽卡');
  if (error?.message.includes('connection_target_not_found')) throw new ApiError(404, '没有找到这个玩家编号');
  if (error?.message.includes('connection_self_target')) throw new ApiError(400, '不能输入自己的玩家编号');
  if (error?.message.includes('heart_connection_stage_closed')) throw new ApiError(409, '爱心确认尚未开放或已经结束');
  if (error?.message.includes('heart_holder_required')) throw new ApiError(409, '只有爱心持有者之间可以进行配对确认');
  if (error?.message.includes('heart_pair_not_matched')) throw new ApiError(409, '两张爱心并不匹配，请继续寻找');
  if (error?.message.includes('trickster_connection_stage_closed')) throw new ApiError(409, '丘比特的召集令尚未开放或已经结束');
  if (error?.message.includes('trickster_connection_forbidden')) throw new ApiError(403, '当前身份不能使用这项秘密确认');
  if (error?.message.includes('trickster_attempt_limit')) throw new ApiError(409, '三次试探机会已经用完');
  if (error) throw new Error(`Unable to request player connection: ${error.message}`);
  return data as { relationshipType: string; status: 'NO_MATCH' | 'PENDING' | 'ACTIVE' };
}

export async function getGuestView(guestId: string) {
  const db = getSupabaseAdmin();
  const [{ data: guest, error: guestError }, { data: game, error: gameError }] = await Promise.all([
    db.from('guests').select('id,name,team,role,is_hidden_spy,points,drawn_at,special_card_revealed_at,participation_mode,relationship,story_role,eligible_for_mission,eligible_for_secret_role,eligible_for_personal_score,special_card_title,special_card_body,player_code,unlocked_role').eq('id', guestId).single(),
    db.from('game_state').select('registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,task_catalog_mode').eq('id', 1).single(),
  ]);
  if (guestError || !guest) throw new ApiError(401, '登录已失效');
  if (gameError || !game) throw new Error(`Unable to load game state: ${gameError?.message ?? 'missing row'}`);
  if (guest.participation_mode !== 'ACTIVE_PLAYER') {
    return { guest, assignments: [], clues: [], game, candidates: [], existingVote: null, results: null };
  }
  const results = await Promise.all([
    db.from('assignments').select('id,status,is_initial,completion_rank,early_bonus_points,reward_task_id,reward_clue_id,completion_note,verification_note,verified_at,evidence_path,evidence_uploaded_at,rejection_reason,task:tasks!assignments_task_id_fkey(title,description,verification_method,points,category,stage,mission_code,mechanic,score_policy)').eq('guest_id', guestId).order('created_at', { ascending: false }).order('id', { ascending: false }),
    db.from('guest_clues').select('id,clue:clues(title,content)').eq('guest_id', guestId),
    db.from('guests').select('id,name,team').eq('team', guest.team).not('drawn_at', 'is', null).order('name'),
    db.from('votes').select('target_guest_id').eq('voter_guest_id', guestId).eq('voting_round', game.voting_round).maybeSingle(),
    db.from('heart_slots').select('heart_code,pair_key,side').eq('guest_id', guestId).maybeSingle(),
    db.from('player_relationships').select('id,relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status,activated_at,player_a:guests!player_relationships_player_a_id_fkey(id,name),player_b:guests!player_relationships_player_b_id_fkey(id,name)').or(`player_a_id.eq.${guestId},player_b_id.eq.${guestId}`).order('created_at'),
    db.from('trickster_signal_attempts').select('id', { count: 'exact', head: true }).eq('guest_id', guestId),
    db.from('alliance_clue_fragments').select('pair_key,title,left_fragment,right_fragment,active').eq('active', true),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load guest data: ${error.message}`);
  const visibleAssignments = (results[0].data ?? []).filter((assignment: { task: { stage?: string } | { stage?: string }[] | null }) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return isTaskVisibleAtStage(task?.stage, game.stage);
  });
  const signedVisibleAssignments = await signEvidencePaths(visibleAssignments);
  let publishedResults: null | {
    teamMembers: Array<{ id: string; name: string; role: string; is_hidden_spy: boolean }>;
    votedTargetId: string | null;
    votedTargetName: string | null;
    voteCorrect: boolean | null;
    bonusPoints: number;
    spyPoints: number | null;
  } = null;
  if (game.results_visible) {
    const [{ data: teamMembers, error: revealError }, { data: rewards, error: rewardError }, { data: spyRewards, error: spyRewardError }] = await Promise.all([
      db.from('guests').select('id,name,role,is_hidden_spy').eq('team', guest.team).not('drawn_at', 'is', null).order('name'),
      db.from('result_rewards').select('amount').eq('guest_id', guestId),
      db.from('spy_points_ledger').select('amount').eq('guest_id', guestId),
    ]);
    if (revealError || rewardError || spyRewardError) throw new Error(`Unable to load published results: ${revealError?.message ?? rewardError?.message ?? spyRewardError?.message}`);
    const votedTargetId = results[3].data?.target_guest_id ?? null;
    const baseResults = buildPublishedTeamResults(teamMembers ?? [], votedTargetId, true);
    if (!baseResults) throw new Error('Unable to build published results');
    publishedResults = {
      ...baseResults,
      bonusPoints: (rewards ?? []).reduce((sum, reward) => sum + reward.amount, 0),
      spyPoints: guest.role === 'spy' ? (spyRewards ?? []).reduce((sum, reward) => sum + reward.amount, 0) : null,
    };
  }
  const heart = results[4].data;
  const relationships = (results[5].data ?? []).map((relationship) => {
    const isPlayerA = relationship.player_a_id === guestId;
    const partner = isPlayerA
      ? (Array.isArray(relationship.player_b) ? relationship.player_b[0] : relationship.player_b)
      : (Array.isArray(relationship.player_a) ? relationship.player_a[0] : relationship.player_a);
    return {
      id: relationship.id,
      type: relationship.relationship_type,
      status: relationship.status,
      partnerName: partner?.name ?? '另一位宾客',
      confirmedByMe: isPlayerA ? relationship.player_a_confirmed : relationship.player_b_confirmed,
      confirmedByPartner: isPlayerA ? relationship.player_b_confirmed : relationship.player_a_confirmed,
      activatedAt: relationship.activated_at,
    };
  });
  const activeAlliance = relationships.some((relationship) => relationship.type === 'CUPID_ALLIANCE' && relationship.status === 'ACTIVE');
  const fragmentConfig = heart && activeAlliance
    ? (results[7].data ?? []).find((fragment) => fragment.pair_key === heart.pair_key)
    : null;
  return {
    guest,
    assignments: signedVisibleAssignments,
    clues: (results[1].data ?? []).map((item: { id: string; clue: { title: string; content: string } | { title: string; content: string }[] | null }) => ({
      id: item.id,
      title: Array.isArray(item.clue) ? item.clue[0]?.title : item.clue?.title,
      content: Array.isArray(item.clue) ? item.clue[0]?.content : item.clue?.content,
    })),
    game,
    candidates: results[2].data ?? [],
    existingVote: results[3].data?.target_guest_id ?? null,
    results: publishedResults,
    missionStory: {
      playerCode: guest.player_code,
      unlockedRole: guest.unlocked_role,
      heart: heart ? { code: heart.heart_code, pairKey: heart.pair_key, side: heart.side } : null,
      relationships,
      tricksterAttemptsUsed: results[6].count ?? 0,
      allianceClue: fragmentConfig ? {
        title: fragmentConfig.title,
        fragment: heart?.side === 'LEFT' ? fragmentConfig.left_fragment : fragmentConfig.right_fragment,
      } : null,
    },
  };
}
