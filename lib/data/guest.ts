import 'server-only';
import { ApiError } from '../errors';
import { isFinaleVotingParticipant } from '../finale-voting-core';
import { buildGuestPointLedger, buildGuestTeamScores } from '../guest-score-core';
import { isAssignmentVisibleAtStage, phaseOneInteractionClosedMessage, taskActionClosedMessage } from '../game-rules';
import { acceptsGuestSelfSubmission, requiresGuestPhotoBeforeSubmission } from '../guest-task-ui';
import { isTaskAllowedInCatalogMode } from '../official-task-manifest';
import { getSupabaseAdmin } from '../supabase';
import { signAvatarPaths } from './avatar';
import { signEvidencePaths } from './evidence';
import { getPublicScoreboard } from './public';

function throwIfStaleGuestRun(error: { message: string }) {
  if (error.message.includes('guest_rehearsal_run_mismatch')
      || error.message.includes('guest_session_stale')
      || error.message.includes('guest_rehearsal_run_required')) {
    throw new ApiError(401, '本设备的登录属于上一轮彩排，请重新登录');
  }
}

async function consumePlayerCodeAttempt(guestId: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('consume_player_code_attempt', {
    p_guest_id: guestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error) throw new Error(`Unable to rate limit player code: ${error.message}`);
  const retryAfter = Number(data ?? 0);
  if (retryAfter > 0) throw new ApiError(429, '玩家编号尝试次数过多，请十分钟后再试，或联系现场工作人员');
}

export async function getPlayerCodeDirectory(guestId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from('guests')
    .select('id,name,player_code,avatar_path')
    .eq('active', true)
    .eq('uses_app', true)
    .not('drawn_at', 'is', null)
    .neq('id', guestId)
    .order('name');
  if (error) throw new Error(`Unable to load player code directory: ${error.message}`);
  const signedGuests = await signAvatarPaths(data ?? []);
  return signedGuests.map((guest) => ({ name: guest.name, playerCode: guest.player_code, avatarUrl: guest.avatar_url }));
}

export async function submitGuestAssignment(assignmentId: string, guestId: string, completionNote: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  const [
    { data: assignment, error: assignmentError },
    { data: game, error: gameError },
  ] = await Promise.all([
    db.from('assignments').select('evidence_uploaded_at,task:tasks!assignments_task_id_fkey(stage,mission_code,mechanic)').eq('id', assignmentId).eq('guest_id', guestId).maybeSingle(),
    db.from('game_state').select('stage,task_catalog_mode').eq('id', 1).single(),
  ]);
  if (assignmentError || gameError) throw new Error(`Unable to validate assignment proof: ${assignmentError?.message ?? gameError?.message}`);
  if (!assignment) throw new ApiError(404, '找不到任务');
  const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
  if (!acceptsGuestSelfSubmission({ missionCode: task?.mission_code, mechanic: task?.mechanic, catalogMode: game?.task_catalog_mode })) {
    throw new ApiError(409, '这项任务由主持人或系统确认，无需从宾客页面提交');
  }
  if (requiresGuestPhotoBeforeSubmission(task?.mission_code) && !assignment.evidence_uploaded_at) {
    throw new ApiError(409, '请先上传本任务要求的主题合影，再提交验证');
  }
  const { error } = await db.rpc('submit_assignment', {
    p_assignment_id: assignmentId, p_guest_id: guestId, p_completion_note: completionNote,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('assignment_not_assignable')) throw new ApiError(409, '任务状态不可提交');
  if (error?.message.includes('assignment_stage_closed')) throw new ApiError(409, taskActionClosedMessage(task?.stage, '提交'));
  if (error) throw new Error(`Unable to submit assignment: ${error.message}`);
}

export async function castGuestVote(voterGuestId: string, targetGuestId: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  const participantFields = 'id,active,uses_app,participation_mode,phase_two_eligible,drawn_at,team';
  const [voterResult, targetResult] = await Promise.all([
    db.from('guests').select(participantFields).eq('id', voterGuestId).maybeSingle(),
    db.from('guests').select(participantFields).eq('id', targetGuestId).maybeSingle(),
  ]);
  if (voterResult.error || targetResult.error) {
    throw new Error(`Unable to validate vote participants: ${voterResult.error?.message ?? targetResult.error?.message}`);
  }
  if (!isFinaleVotingParticipant(voterResult.data)) {
    throw new ApiError(403, '本轮最终投票只面向海岛组和沙漠组的第二轮正式玩家');
  }
  if (!isFinaleVotingParticipant(targetResult.data)) throw new ApiError(404, '找不到可投票的正式玩家');
  if (voterResult.data.team !== targetResult.data.team) throw new ApiError(400, '只能投给本队宾客');

  const { error } = await getSupabaseAdmin().rpc('cast_team_vote', {
    p_voter_guest_id: voterGuestId, p_target_guest_id: targetGuestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('self_vote')) throw new ApiError(400, '不能投自己');
  if (error?.message.includes('voting_closed')) throw new ApiError(409, '投票尚未开放或已经关闭');
  if (error?.message.includes('cross_team_vote')) throw new ApiError(400, '只能投给本队宾客');
  if (error?.message.includes('vote_already_cast')) throw new ApiError(409, '你已经提交过本轮投票，不能再次修改');
  if (error?.message.includes('guest_not_found')) throw new ApiError(404, '找不到投票对象');
  if (error) throw new Error(`Unable to save vote: ${error.message}`);
}

export async function submitPhaseTwoDilemma(guestId: string, choice: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('submit_phase_two_dilemma', {
    p_guest_id: guestId, p_choice: choice, p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('phase_two_action_closed')) throw new ApiError(409, '当前环节尚未开放或已经关闭秘密选择');
  if (error?.message.includes('phase_two_dilemma_forbidden')) throw new ApiError(403, '你没有这项秘密选择任务');
  if (error?.message.includes('phase_two_alliance_missing')) throw new ApiError(409, '联盟关系尚未完成，暂时不能选择');
  if (error?.message.includes('phase_two_choice_locked')) throw new ApiError(409, '选择已经提交，不能修改');
  if (error?.message.includes('invalid_phase_two_choice')) throw new ApiError(400, '秘密选择不符合当前任务');
  if (error) throw new Error(`Unable to submit phase two dilemma: ${error.message}`);
}

export async function submitPhaseTwoCopyChoice(guestId: string, targetGuestId: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('submit_phase_two_copy_choice', {
    p_guest_id: guestId, p_target_guest_id: targetGuestId, p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('phase_two_action_closed')) throw new ApiError(409, '当前环节尚未开放或已经关闭命运复制');
  if (error?.message.includes('phase_two_copy_forbidden')) throw new ApiError(403, '你没有命运复制任务');
  if (error?.message.includes('phase_two_copy_self')) throw new ApiError(400, '不能选择自己');
  if (error?.message.includes('phase_two_copy_target_invalid')) throw new ApiError(400, '这个玩家不能作为复制目标');
  if (error?.message.includes('phase_two_choice_locked')) throw new ApiError(409, '复制目标已经提交，不能修改');
  if (error) throw new Error(`Unable to submit phase two copy choice: ${error.message}`);
}

export async function drawGuestCard(guestId: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('draw_guest_card', {
    p_guest_id: guestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('guest_not_claimed')) throw new ApiError(401, '请先认领宾客身份');
  if (error?.message.includes('guest_not_mission_eligible')) throw new ApiError(409, '你的专属内容不需要抽取普通任务');
  if (error?.message.includes('draw_registration_closed')) throw new ApiError(409, '抽卡入口已经关闭，请联系主办方');
  if (error?.message.includes('draw_capacity_full')) throw new ApiError(409, '抽卡名额已经全部派发');
  if (error?.message.includes('draw_preset_capacity_full')) throw new ApiError(409, '主办方预设的组别已经满员，请联系主办方调整');
  if (error?.message.includes('draw_preset_role_capacity_full')) throw new ApiError(409, '主办方预设的身份名额冲突，请联系主办方调整');
  if (error?.message.includes('draw_role_capacity_full')) throw new ApiError(409, '当前组别的身份名额暂时冲突，请联系主办方检查抽卡配置');
  if (error?.message.includes('draw_task_missing')) throw new ApiError(409, '任务池尚未配置完成，请联系主办方');
  if (error?.message.includes('draw_assignment_missing')) throw new ApiError(409, '抽卡记录不完整，请联系主办方处理');
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

export async function revealHonorSpecialCard(guestId: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('reveal_honor_special_card', {
    p_guest_id: guestId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('guest_not_claimed')) throw new ApiError(401, '请先认领宾客身份');
  if (error?.message.includes('guest_not_honor_eligible')) throw new ApiError(409, '此身份没有家庭惊喜卡');
  if (error?.message.includes('guest_not_found')) throw new ApiError(404, '找不到宾客身份');
  if (error) throw new Error(`Unable to reveal honor special card: ${error.message}`);
  if (typeof data !== 'string') throw new Error('Unable to reveal honor special card: invalid response');
  return data;
}

export async function requestGuestConnection(guestId: string, targetCode: string, relationshipType: string, rehearsalRunId: string) {
  await consumePlayerCodeAttempt(guestId, rehearsalRunId);
  const { data, error } = await getSupabaseAdmin().rpc('request_player_connection', {
    p_guest_id: guestId,
    p_target_code: targetCode,
    p_relationship_type: relationshipType,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('connection_guest_not_ready')) throw new ApiError(409, '请先完成抽卡');
  if (error?.message.includes('connection_target_not_found') || error?.message.includes('connection_self_target') || error?.message.includes('symbol_holder_required')) throw new ApiError(400, '编号无效或不适合这项任务，请向对方重新确认');
  if (error?.message.includes('symbol_connection_stage_closed')) throw new ApiError(409, phaseOneInteractionClosedMessage('配对'));
  if (error?.message.includes('star_fragment_side_mismatch')) throw new ApiError(409, '你们持有的是同一半星星，请寻找另一半星星');
  if (error?.message.includes('heart_fragment_side_mismatch')) throw new ApiError(409, '你们持有的是同一半爱心，请寻找另一半爱心');
  if (error?.message.includes('symbol_player_unavailable')) throw new ApiError(409, '你或对方已经完成正式配对');
  if (error?.message.includes('symbol_pending_conflict')) throw new ApiError(409, '你或对方已有一项待处理的配对邀请');
  if (error?.message.includes('trickster_connection_stage_closed')) throw new ApiError(409, phaseOneInteractionClosedMessage('伙伴确认'));
  if (error?.message.includes('trickster_connection_forbidden')) throw new ApiError(403, '当前身份不能使用这项秘密确认');
  if (error?.message.includes('trickster_attempt_limit')) throw new ApiError(409, '整场婚礼的 5 次验证机会已经用完');
  if (error) throw new Error(`Unable to request player connection: ${error.message}`);
  return data as { relationshipType: string; status: 'NO_MATCH' | 'PENDING' | 'ACTIVE'; maxAttempts: number };
}

export async function rejectGuestConnection(guestId: string, relationshipId: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('reject_player_connection', {
    p_guest_id: guestId, p_relationship_id: relationshipId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('relationship_not_found')) throw new ApiError(404, '找不到这项配对邀请');
  if (error?.message.includes('relationship_forbidden')) throw new ApiError(403, '不能处理其他玩家的配对邀请');
  if (error?.message.includes('relationship_not_rejectable')) throw new ApiError(409, '这项邀请已经处理，不能再次拒绝');
  if (error) throw new Error(`Unable to reject player connection: ${error.message}`);
}

export async function acceptGuestConnection(guestId: string, relationshipId: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('accept_player_connection', {
    p_guest_id: guestId, p_relationship_id: relationshipId,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('relationship_not_found')) throw new ApiError(404, '找不到这项配对邀请');
  if (error?.message.includes('relationship_forbidden')) throw new ApiError(403, '不能处理其他玩家的配对邀请');
  if (error?.message.includes('relationship_not_accepting') || error?.message.includes('relationship_already_confirmed')) throw new ApiError(409, '这项邀请已经处理，请刷新查看');
  if (error?.message.includes('symbol_connection_stage_closed') || error?.message.includes('trickster_connection_stage_closed')) throw new ApiError(409, phaseOneInteractionClosedMessage('伙伴确认'));
  if (error) throw new Error(`Unable to accept player connection: ${error.message}`);
  return data as { relationshipType: string; status: 'ACTIVE' };
}

export async function requestAssignmentMutualConfirmation(assignmentId: string, guestId: string, targetCode: string, rehearsalRunId: string) {
  await consumePlayerCodeAttempt(guestId, rehearsalRunId);
  const { error } = await getSupabaseAdmin().rpc('request_assignment_mutual_confirmation', {
    p_assignment_id: assignmentId, p_owner_guest_id: guestId, p_target_code: targetCode,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('mutual_assignment_not_found')) throw new ApiError(404, '找不到可以双方确认的任务');
  if (error?.message.includes('mutual_confirmation_not_supported')) throw new ApiError(409, '这项任务不支持双方软件确认');
  if (error?.message.includes('connection_target_not_found') || error?.message.includes('connection_self_target')) throw new ApiError(400, '编号无效或不适合这项任务，请向对方重新确认');
  if (error?.message.includes('mutual_confirmer_limit')) throw new ApiError(409, '对方已经帮助两位玩家确认同类任务，请换一位新朋友');
  if (error?.message.includes('mutual_confirmation_pending')) throw new ApiError(409, '已有一项确认邀请正在等待对方处理');
  if (error?.message.includes('mutual_confirmation_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭确认；仪式前、仪式结束后至最终投票前开放');
  if (error) throw new Error(`Unable to request mutual confirmation: ${error.message}`);
}

export async function respondAssignmentMutualConfirmation(confirmationId: string, guestId: string, accept: boolean, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('respond_assignment_mutual_confirmation', {
    p_confirmation_id: confirmationId, p_confirmer_guest_id: guestId, p_accept: accept,
    p_rehearsal_run_id: rehearsalRunId,
  });
  if (error) throwIfStaleGuestRun(error);
  if (error?.message.includes('mutual_confirmation_not_found')) throw new ApiError(404, '找不到这项确认邀请');
  if (error?.message.includes('mutual_confirmation_forbidden')) throw new ApiError(403, '不能处理其他宾客的确认邀请');
  if (error?.message.includes('mutual_confirmation_already_handled')) throw new ApiError(409, '这项邀请已经处理');
  if (error?.message.includes('mutual_confirmation_stage_closed')) throw new ApiError(409, '当前环节暂停或已关闭确认；仪式前、仪式结束后至最终投票前开放');
  if (error) throw new Error(`Unable to respond to mutual confirmation: ${error.message}`);
}

export async function getGuestView(guestId: string) {
  const db = getSupabaseAdmin();
  const [{ data: guest, error: guestError }, { data: game, error: gameError }] = await Promise.all([
    db.from('guests').select('id,name,team,role,is_hidden_spy,points,active,uses_app,drawn_at,special_card_revealed_at,participation_mode,phase_two_eligible,relationship,story_role,eligible_for_mission,eligible_for_secret_role,eligible_for_personal_score,special_card_title,special_card_body,player_code,unlocked_role,avatar_path,avatar_uploaded_at').eq('id', guestId).single(),
    db.from('game_state').select('registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,task_catalog_mode,trickster_max_attempts,phase_one_completed_at,team_score_snapshot,rehearsal_run_id').eq('id', 1).single(),
  ]);
  if (guestError || !guest) throw new ApiError(401, '登录已失效');
  if (gameError || !game) throw new Error(`Unable to load game state: ${gameError?.message ?? 'missing row'}`);
  const votingEligible = isFinaleVotingParticipant(guest);
  const [signedGuest] = await signAvatarPaths([guest]);
  const teamScoresVisible = ['group_game', 'voting', 'results'].includes(game.stage);
  const [pointLedgerResult, teamPointResult] = await Promise.all([
    db.from('points_ledger').select('id,assignment_id,amount,reason,created_at').eq('guest_id', guestId).order('created_at', { ascending: false }).order('id', { ascending: false }),
    teamScoresVisible
      ? db.from('team_points_ledger').select('team,amount')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (pointLedgerResult.error || teamPointResult.error) {
    throw new Error(`Unable to load guest scores: ${pointLedgerResult.error?.message ?? teamPointResult.error?.message}`);
  }
  if (guest.participation_mode !== 'ACTIVE_PLAYER') {
    return {
      guest: signedGuest, assignments: [], clues: [], game, candidates: [], existingVote: null, results: null,
      votingEligible: false,
      pointLedger: buildGuestPointLedger(pointLedgerResult.data ?? [], [], game.results_visible),
      teamScores: [],
    };
  }
  const [
    assignmentsResult,
    cluesResult,
    candidatesResult,
    voteResult,
    symbolPairingResult,
    relationshipsResult,
    tricksterAttemptsResult,
    mutualConfirmationsResult,
    phaseTwoProfileResult,
    dilemmaResult,
    copyChoiceResult,
  ] = await Promise.all([
    db.from('assignments').select('id,status,is_initial,completion_rank,early_bonus_points,reward_task_id,reward_clue_id,completion_note,verification_note,verified_at,evidence_path,evidence_uploaded_at,rejection_reason,task:tasks!assignments_task_id_fkey(title,description,verification_method,points,category,stage,mission_code,mechanic,score_policy)').eq('guest_id', guestId).neq('status', 'cancelled').order('created_at', { ascending: false }).order('id', { ascending: false }),
    db.from('guest_clues').select('id,created_at,clue:clues(title,content,group_name)').eq('guest_id', guestId).order('created_at', { ascending: true }).order('id', { ascending: true }),
    votingEligible
      ? db.from('guests').select('id,name,team').eq('active', true).eq('uses_app', true)
        .eq('participation_mode', 'ACTIVE_PLAYER').eq('phase_two_eligible', true)
        .eq('team', guest.team).not('drawn_at', 'is', null).neq('id', guestId).order('name')
      : Promise.resolve({ data: [], error: null }),
    votingEligible
      ? db.from('votes').select('target_guest_id').eq('voter_guest_id', guestId).eq('voting_round', game.voting_round).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('symbol_pairing_assignments').select('symbol,status,fragment_side,partner_guest_id,pending_relationship_id,finalized_at').eq('guest_id', guestId).maybeSingle(),
    db.from('player_relationships').select('id,relationship_type,player_a_id,player_b_id,player_a_confirmed,player_b_confirmed,status,activated_at,player_a:guests!player_relationships_player_a_id_fkey(id,name),player_b:guests!player_relationships_player_b_id_fkey(id,name)').or(`player_a_id.eq.${guestId},player_b_id.eq.${guestId}`).order('created_at'),
    db.from('trickster_signal_attempts').select('id', { count: 'exact', head: true }).eq('guest_id', guestId),
    db.from('assignment_mutual_confirmations').select('id,assignment_id,owner_guest_id,confirmer_guest_id,status,created_at,owner:guests!assignment_mutual_confirmations_owner_guest_id_fkey(id,name),confirmer:guests!assignment_mutual_confirmations_confirmer_guest_id_fkey(id,name)').or(`owner_guest_id.eq.${guestId},confirmer_guest_id.eq.${guestId}`).order('created_at', { ascending: false }),
    db.from('phase_two_profiles').select('primary_mission,extra_vote,super_lucky,is_captain,unlocked_at,phase_one_points_snapshot,lucky_bonus_settled_at,captain_bonus_settled_at').eq('guest_id', guestId).maybeSingle(),
    db.from('phase_two_dilemmas').select('alliance_type,player_a_id,player_b_id,player_a_choice,player_b_choice,player_a_points,player_b_points,settled_at').or(`player_a_id.eq.${guestId},player_b_id.eq.${guestId}`).maybeSingle(),
    db.from('phase_two_copy_choices').select('target_guest_id,settled_points,settled_at,target:guests!phase_two_copy_choices_target_guest_id_fkey(id,name,team)').eq('guest_id', guestId).maybeSingle(),
  ]);
  const queryResults = [assignmentsResult, cluesResult, candidatesResult, voteResult, symbolPairingResult,
    relationshipsResult, tricksterAttemptsResult, mutualConfirmationsResult, phaseTwoProfileResult,
    dilemmaResult, copyChoiceResult];
  const error = queryResults.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load guest data: ${error.message}`);
  const catalogAssignments = (assignmentsResult.data ?? []).filter((assignment) => (
    isTaskAllowedInCatalogMode(assignment.task, game.task_catalog_mode)
  ));
  const assignmentStatusById = new Map(
    catalogAssignments.map((assignment) => [assignment.id, assignment.status]),
  );
  const visibleAssignments = catalogAssignments.filter((assignment: { is_initial: boolean; task: { stage?: string; mission_code?: string | null } | { stage?: string; mission_code?: string | null }[] | null }) => {
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
    tricksters: Array<{ id: string; name: string; team: string; escaped: boolean }>;
    voteCounts: Array<{ id: string; name: string; team: string; votes: number; voters: Array<{ id: string; name: string; team: string; votes: number }> }>;
    votedTargetId: string | null;
    votedTargetName: string | null;
    voteCorrect: boolean | null;
    bonusPoints: number;
  } = null;
  if (game.results_visible) {
    const [{ data: rewards, error: rewardError }, publicScoreboard] = await Promise.all([
      db.from('result_rewards').select('amount').eq('guest_id', guestId),
      getPublicScoreboard(),
    ]);
    if (rewardError) throw new Error(`Unable to load published results: ${rewardError.message}`);
    const votedTargetId = voteResult.data?.target_guest_id ?? null;
    const votedTarget = publicScoreboard.revealedRoles.find((candidate) => candidate.id === votedTargetId) ?? null;
    publishedResults = {
      tricksters: publicScoreboard.revealedRoles.map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        team: candidate.team,
        escaped: candidate.escaped,
      })),
      voteCounts: publicScoreboard.voteCounts,
      votedTargetId,
      votedTargetName: votedTargetId
        ? publicScoreboard.voteCounts.find((candidate) => candidate.id === votedTargetId)?.name
          ?? publicScoreboard.revealedRoles.find((candidate) => candidate.id === votedTargetId)?.name
          ?? '已投票宾客'
        : null,
      voteCorrect: votedTargetId ? Boolean(votedTarget) : null,
      bonusPoints: (rewards ?? []).reduce((sum, reward) => sum + reward.amount, 0),
    };
  }
  const symbolPairing = symbolPairingResult.data;
  const phaseTwoProfile = phaseTwoProfileResult.data;
  const dilemma = dilemmaResult.data;
  const copyChoice = copyChoiceResult.data;
  let copyCandidates: Array<{ id: string; name: string; team: string }> = [];
  if (phaseTwoProfile?.primary_mission === 'COPY_SCORE' && phaseTwoProfile.unlocked_at) {
    const { data: candidateProfiles, error: candidateError } = await db
      .from('phase_two_profiles')
      .select('guest_id,primary_mission,guest:guests!phase_two_profiles_guest_id_fkey(id,name,team)')
      .not('unlocked_at', 'is', null)
      .neq('guest_id', guestId)
      .neq('primary_mission', 'COPY_SCORE');
    if (candidateError) throw new Error(`Unable to load copy candidates: ${candidateError.message}`);
    copyCandidates = (candidateProfiles ?? []).flatMap((candidate) => {
      const target = Array.isArray(candidate.guest) ? candidate.guest[0] : candidate.guest;
      return target ? [{ id: target.id, name: target.name, team: target.team }] : [];
    }).sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  }
  const relationships = (relationshipsResult.data ?? []).map((relationship) => {
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
    guest: signedGuest,
    assignments: signedVisibleAssignments,
    pointLedger: buildGuestPointLedger(pointLedgerResult.data ?? [], visibleAssignments, game.results_visible),
    teamScores: teamScoresVisible ? buildGuestTeamScores(teamPointResult.data ?? [], game.team_score_snapshot) : [],
    clues: (cluesResult.data ?? []).flatMap((item: { id: string; clue: { title: string; content: string; group_name: string } | { title: string; content: string; group_name: string }[] | null }) => {
      const clue = Array.isArray(item.clue) ? item.clue[0] : item.clue;
      return clue?.title && clue.content ? [{ id: item.id, title: clue.title, content: clue.content, groupName: clue.group_name || '现场线索' }] : [];
    }),
    game,
    votingEligible,
    candidates: candidatesResult.data ?? [],
    existingVote: voteResult.data?.target_guest_id ?? null,
    results: publishedResults,
    missionStory: {
      playerCode: guest.player_code,
      unlockedRole: guest.unlocked_role,
      symbolPairing: symbolPairing ? {
        symbol: symbolPairing.symbol,
        status: symbolPairing.status,
        fragmentSide: symbolPairing.fragment_side,
        pendingRelationshipId: symbolPairing.pending_relationship_id,
        finalizedAt: symbolPairing.finalized_at,
      } : null,
      relationships,
      tricksterAttemptsUsed: tricksterAttemptsResult.count ?? 0,
      tricksterMaxAttempts: game.trickster_max_attempts,
      mutualConfirmations: (mutualConfirmationsResult.data ?? [])
        .filter((confirmation) => confirmation.status !== 'PENDING'
          || ['assigned', 'rejected', 'submitted'].includes(assignmentStatusById.get(confirmation.assignment_id) ?? ''))
        .map((confirmation) => {
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
    },
    phaseTwo: phaseTwoProfile ? {
      mission: phaseTwoProfile.primary_mission,
      extraVote: phaseTwoProfile.extra_vote,
      superLucky: phaseTwoProfile.super_lucky,
      isCaptain: phaseTwoProfile.is_captain,
      unlockedAt: phaseTwoProfile.unlocked_at,
      phaseOnePointsSnapshot: phaseTwoProfile.super_lucky ? phaseTwoProfile.phase_one_points_snapshot : null,
      luckySettled: Boolean(phaseTwoProfile.lucky_bonus_settled_at),
      captainSettled: Boolean(phaseTwoProfile.captain_bonus_settled_at),
      originVerified: phaseTwoProfile.primary_mission === 'TEAM_CAPTAIN'
        ? symbolPairing?.symbol === 'STAR' && symbolPairing.status === 'UNPAIRED_FINAL'
        : phaseTwoProfile.primary_mission === 'COPY_SCORE'
          ? symbolPairing?.symbol === 'HEART' && symbolPairing.status === 'UNPAIRED_FINAL'
          : true,
      dilemma: dilemma ? (() => {
        const isA = dilemma.player_a_id === guestId;
        const settled = Boolean(dilemma.settled_at);
        return {
          allianceType: dilemma.alliance_type,
          submitted: Boolean(isA ? dilemma.player_a_choice : dilemma.player_b_choice),
          settled,
          myChoice: isA ? dilemma.player_a_choice : dilemma.player_b_choice,
          partnerChoice: settled ? (isA ? dilemma.player_b_choice : dilemma.player_a_choice) : null,
          myPoints: settled ? (isA ? dilemma.player_a_points : dilemma.player_b_points) : null,
          partnerPoints: settled ? (isA ? dilemma.player_b_points : dilemma.player_a_points) : null,
        };
      })() : null,
      copyChoice: copyChoice ? {
        targetGuestId: copyChoice.target_guest_id,
        targetName: (Array.isArray(copyChoice.target) ? copyChoice.target[0] : copyChoice.target)?.name ?? '已选择玩家',
        targetTeam: (Array.isArray(copyChoice.target) ? copyChoice.target[0] : copyChoice.target)?.team ?? '',
        settledPoints: copyChoice.settled_points,
        settled: Boolean(copyChoice.settled_at),
      } : null,
      copyCandidates,
    } : null,
  };
}
