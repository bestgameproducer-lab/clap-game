import 'server-only';
import { ApiError } from '../errors';
import { isAssignmentVisibleAtStage } from '../game-rules';
import { buildPublishedTeamResults } from '../result-core';
import { getSupabaseAdmin } from '../supabase';
import { signEvidencePaths } from './evidence';

export async function submitGuestAssignment(assignmentId: string, guestId: string, completionNote: string) {
  const { error } = await getSupabaseAdmin().rpc('submit_assignment', {
    p_assignment_id: assignmentId, p_guest_id: guestId, p_completion_note: completionNote,
  });
  if (error?.message.includes('assignment_not_assignable')) throw new ApiError(409, '任务状态不可提交');
  if (error?.message.includes('assignment_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭提交；仪式前、仪式结束后至最终投票前开放');
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
  if (error?.message.includes('symbol_connection_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭配对；仪式前、仪式结束后至最终投票前开放');
  if (error?.message.includes('symbol_holder_required')) throw new ApiError(409, '只有持有相同图案的玩家可以配对');
  if (error?.message.includes('symbol_player_unavailable')) throw new ApiError(409, '你或对方已经完成正式配对');
  if (error?.message.includes('symbol_pending_conflict')) throw new ApiError(409, '你或对方已有一项待处理的配对邀请');
  if (error?.message.includes('trickster_connection_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭秘密确认；仪式前、仪式结束后至最终投票前开放');
  if (error?.message.includes('trickster_connection_forbidden')) throw new ApiError(403, '当前身份不能使用这项秘密确认');
  if (error?.message.includes('trickster_attempt_limit')) throw new ApiError(409, '本阶段的试探机会已经用完');
  if (error) throw new Error(`Unable to request player connection: ${error.message}`);
  return data as { relationshipType: string; status: 'NO_MATCH' | 'PENDING' | 'ACTIVE'; maxAttempts: number };
}

export async function rejectGuestConnection(guestId: string, relationshipId: string) {
  const { error } = await getSupabaseAdmin().rpc('reject_player_connection', {
    p_guest_id: guestId, p_relationship_id: relationshipId,
  });
  if (error?.message.includes('relationship_not_found')) throw new ApiError(404, '找不到这项配对邀请');
  if (error?.message.includes('relationship_forbidden')) throw new ApiError(403, '不能处理其他玩家的配对邀请');
  if (error?.message.includes('relationship_not_rejectable')) throw new ApiError(409, '这项邀请已经处理，不能再次拒绝');
  if (error) throw new Error(`Unable to reject player connection: ${error.message}`);
}

export async function requestAssignmentMutualConfirmation(assignmentId: string, guestId: string, targetCode: string) {
  const { error } = await getSupabaseAdmin().rpc('request_assignment_mutual_confirmation', {
    p_assignment_id: assignmentId, p_owner_guest_id: guestId, p_target_code: targetCode,
  });
  if (error?.message.includes('mutual_assignment_not_found')) throw new ApiError(404, '找不到可以双方确认的任务');
  if (error?.message.includes('mutual_confirmation_not_supported')) throw new ApiError(409, '这项任务不支持双方软件确认');
  if (error?.message.includes('mutual_confirmer_limit')) throw new ApiError(409, '对方已经帮助两位玩家确认同类任务，请换一位新朋友');
  if (error?.message.includes('mutual_confirmation_pending')) throw new ApiError(409, '已有一项确认邀请正在等待对方处理');
  if (error?.message.includes('mutual_confirmation_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭确认；仪式前、仪式结束后至最终投票前开放');
  if (error) throw new Error(`Unable to request mutual confirmation: ${error.message}`);
}

export async function respondAssignmentMutualConfirmation(confirmationId: string, guestId: string, accept: boolean) {
  const { error } = await getSupabaseAdmin().rpc('respond_assignment_mutual_confirmation', {
    p_confirmation_id: confirmationId, p_confirmer_guest_id: guestId, p_accept: accept,
  });
  if (error?.message.includes('mutual_confirmation_not_found')) throw new ApiError(404, '找不到这项确认邀请');
  if (error?.message.includes('mutual_confirmation_forbidden')) throw new ApiError(403, '不能处理其他宾客的确认邀请');
  if (error?.message.includes('mutual_confirmation_already_handled')) throw new ApiError(409, '这项邀请已经处理');
  if (error?.message.includes('mutual_confirmation_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭确认；仪式前、仪式结束后至最终投票前开放');
  if (error) throw new Error(`Unable to respond to mutual confirmation: ${error.message}`);
}

export async function getGuestView(guestId: string) {
  const db = getSupabaseAdmin();
  const [{ data: guest, error: guestError }, { data: game, error: gameError }] = await Promise.all([
    db.from('guests').select('id,name,team,role,is_hidden_spy,points,drawn_at,special_card_revealed_at,participation_mode,relationship,story_role,eligible_for_mission,eligible_for_secret_role,eligible_for_personal_score,special_card_title,special_card_body,player_code,unlocked_role').eq('id', guestId).single(),
    db.from('game_state').select('registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,task_catalog_mode,trickster_max_attempts,phase_one_completed_at').eq('id', 1).single(),
  ]);
  if (guestError || !guest) throw new ApiError(401, '登录已失效');
  if (gameError || !game) throw new Error(`Unable to load game state: ${gameError?.message ?? 'missing row'}`);
  if (guest.participation_mode !== 'ACTIVE_PLAYER') {
    return { guest, assignments: [], clues: [], game, candidates: [], existingVote: null, results: null };
  }
  const results = await Promise.all([
    db.from('assignments').select('id,status,is_initial,completion_rank,early_bonus_points,reward_task_id,reward_clue_id,completion_note,verification_note,verified_at,evidence_path,evidence_uploaded_at,rejection_reason,task:tasks!assignments_task_id_fkey(title,description,verification_method,points,category,stage,mission_code,mechanic,score_policy)').eq('guest_id', guestId).neq('status', 'cancelled').order('created_at', { ascending: false }).order('id', { ascending: false }),
    db.from('guest_clues').select('id,clue:clues(title,content)').eq('guest_id', guestId),
    db.from('guests').select('id,name,team').eq('team', guest.team).not('drawn_at', 'is', null).order('name'),
    db.from('votes').select('target_guest_id').eq('voter_guest_id', guestId).eq('voting_round', game.voting_round).maybeSingle(),
    db.from('symbol_pairing_assignments').select('symbol,status,partner_guest_id,pending_relationship_id,finalized_at').eq('guest_id', guestId).maybeSingle(),
    db.from('player_relationships').select('id,relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status,activated_at,player_a:guests!player_relationships_player_a_id_fkey(id,name),player_b:guests!player_relationships_player_b_id_fkey(id,name)').or(`player_a_id.eq.${guestId},player_b_id.eq.${guestId}`).order('created_at'),
    db.from('trickster_signal_attempts').select('id', { count: 'exact', head: true }).eq('guest_id', guestId),
    db.from('alliance_clue_fragments').select('pair_key,title,left_fragment,right_fragment,active').eq('active', true),
    db.from('assignment_mutual_confirmations').select('id,assignment_id,owner_guest_id,confirmer_guest_id,status,created_at,owner:guests!assignment_mutual_confirmations_owner_guest_id_fkey(id,name),confirmer:guests!assignment_mutual_confirmations_confirmer_guest_id_fkey(id,name)').or(`owner_guest_id.eq.${guestId},confirmer_guest_id.eq.${guestId}`).order('created_at', { ascending: false }),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load guest data: ${error.message}`);
  const visibleAssignments = (results[0].data ?? []).filter((assignment: { is_initial: boolean; task: { stage?: string; mission_code?: string | null } | { stage?: string; mission_code?: string | null }[] | null }) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return isAssignmentVisibleAtStage({
      taskStage: task?.stage,
      gameStage: game.stage,
      isInitial: assignment.is_initial,
      missionCode: task?.mission_code,
    });
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
  const symbolPairing = results[4].data;
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
      symbolPairing: symbolPairing ? {
        symbol: symbolPairing.symbol,
        status: symbolPairing.status,
        pendingRelationshipId: symbolPairing.pending_relationship_id,
        finalizedAt: symbolPairing.finalized_at,
      } : null,
      relationships,
      tricksterAttemptsUsed: results[6].count ?? 0,
      tricksterMaxAttempts: game.trickster_max_attempts,
      mutualConfirmations: (results[8].data ?? []).map((confirmation) => {
        const owner = confirmation.owner as { name: string } | Array<{ name: string }> | null;
        const confirmer = confirmation.confirmer as { name: string } | Array<{ name: string }> | null;
        return {
          id: confirmation.id,
          assignmentId: confirmation.assignment_id,
          direction: confirmation.owner_guest_id === guestId ? 'OUTGOING' : 'INCOMING',
          otherGuestName: confirmation.owner_guest_id === guestId
            ? (Array.isArray(confirmer) ? confirmer[0]?.name : confirmer?.name)
            : (Array.isArray(owner) ? owner[0]?.name : owner?.name),
          status: confirmation.status,
          createdAt: confirmation.created_at,
        };
      }),
      allianceClue: null,
    },
  };
}
