import 'server-only';
import { ApiError } from '../errors';
import { createHiddenTaskCode, hashHiddenTaskCode } from '../hidden-task-code';
import { getSupabaseAdmin } from '../supabase';
import { buildWeddingPreflight } from '../preflight';
import { signEvidencePaths } from './evidence';

function ensureNoDatabaseError(error: { message: string } | null, fallback: string): void {
  if (error) {
    if (error.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
    if (error.message.includes('guest_not_found')) throw new ApiError(404, '找不到宾客');
    if (error.message.includes('task_not_found')) throw new ApiError(404, '找不到可用任务');
    if (error.message.includes('clue_not_found')) throw new ApiError(404, '找不到可用线索');
    if (error.message.includes('assignment_not_submitted') || error.message.includes('duplicate key')) {
      throw new ApiError(409, '该任务已经处理，无法重复操作');
    }
    if (error.message.includes('task_already_assigned')) throw new ApiError(409, '这位宾客已经领取过该任务');
    if (error.message.includes('hidden_spy_guest_ineligible')) throw new ApiError(409, '隐藏间谍任务只能派给已抽卡的普通宾客');
    if (error.message.includes('hidden_spy_already_activated')) throw new ApiError(409, '本场已经激活一位隐藏间谍，不能重复操作');
    if (error.message.includes('hidden_spy_task_already_assigned')) throw new ApiError(409, '隐藏间谍任务已经派发，请处理当前任务');
    if (error.message.includes('hidden_task_not_found')) throw new ApiError(404, '请选择已启用的隐藏任务');
    if (error.message.includes('hidden_task_code_invalid')) throw new ApiError(404, '隐藏任务码无效，请核对实体卡');
    if (error.message.includes('hidden_task_code_already_claimed')) throw new ApiError(409, '这张隐藏任务卡已经被领取');
    if (error.message.includes('invalid_invitation_code_format')) throw new ApiError(400, '邀请码需为 6–32 位英文字母、数字或连字符');
    if (error.message.includes('phase_note_too_long')) throw new ApiError(400, '宾客端环节提示不能超过 500 字');
    if (error.message.includes('guest_roster_import_invalid')) throw new ApiError(400, '批量名单格式不正确，请重新预览');
    if (error.message.includes('guest_roster_import_registration_open')) throw new ApiError(409, '请先关闭宾客注册，再批量导入名单');
    if (error.message.includes('guest_roster_import_conflict')) throw new ApiError(409, '名单中有重复或已存在的登录名，本次未导入任何宾客');
    if (error.message.includes('hidden_task_stage_closed')) throw new ApiError(409, '隐藏任务卡仅可在第二轮任务或团队挑战环节兑换');
    if (error.message.includes('reset_confirmation_invalid')) throw new ApiError(400, '清场确认词不正确');
    if (error.message.includes('reset_backup_required')) throw new ApiError(400, '请先导出并确认七类备份');
    if (error.message.includes('reset_reason_required')) throw new ApiError(400, '请填写本次彩排清场原因');
    if (error.message.includes('reset_public_controls_open')) throw new ApiError(409, '清场前必须关闭注册、投票和公开大屏');
    if (error.message.includes('guest_card_not_drawn')) throw new ApiError(409, '宾客尚未抽取身份卡，暂时不能兑换隐藏任务');
    if (error.message.includes('active_hidden_spy_task_exists')) throw new ApiError(409, '任务库只能启用一张隐藏间谍卡');
    if (error.message.includes('invalid_hidden_spy_task')) throw new ApiError(400, '隐藏间谍卡必须是第二轮、仅限普通宾客的隐藏任务');
    if (error.message.includes('invalid_task_points')) throw new ApiError(400, '任务积分必须是 0–12 分');
    if (error.message.includes('preset_spy_team_conflict')) throw new ApiError(409, '这个组已经预设了一位恶作剧者，请为其中一人选择其他组别');
    if (error.message.includes('symbol_pairing_count_invalid')) throw new ApiError(409, '爱心和星星都必须各有五位玩家完成抽卡');
    if (error.message.includes('symbol_pairing_incomplete')) throw new ApiError(409, '爱心和星星都需要先形成两组正式联盟，并处理全部待确认邀请');
    if (error.message.includes('symbol_pairing_state_invalid') || error.message.includes('symbol_finalization_incomplete')) throw new ApiError(409, '爱心或星星配对状态异常，请先在主持人界面核对联盟记录');
    if (error.message.includes('symbol_fragment_distribution_invalid')) throw new ApiError(409, '爱心或星星的左右图案数量异常，系统无法自动完成最终配对');
    if (error.message.includes('symbol_auto_pair_conflict')) throw new ApiError(409, '自动补齐伙伴配对时发生冲突，请刷新后重试');
    if (error.message.includes('phase_two_roster_not_ready')) throw new ApiError(409, '第二阶段需要海岛组和沙漠组各有 10 位玩家完成抽卡');
    if (error.message.includes('phase_two_trickster_count_invalid')) throw new ApiError(409, '第二阶段需要海岛组和沙漠组各有一位恶作剧者');
    if (error.message.includes('phase_two_relationship_roles_not_ready')) throw new ApiError(409, '爱心或星星角色尚未完成结算，请刷新后重试');
    if (error.message.includes('phase_two_yirui_speech_unavailable')) throw new ApiError(409, '固定晚宴致辞玩家尚未完成抽卡，暂时不能开启第二阶段');
    if (error.message.includes('phase_two_extra_vote_unavailable') || error.message.includes('phase_two_lucky_unavailable')) throw new ApiError(409, '第二阶段能力卡名额不足，请核对竞技组名单');
    if (error.message.includes('phase_two_coverage_invalid') || error.message.includes('phase_two_team_coverage_invalid') || error.message.includes('phase_two_assignment_count_invalid')) throw new ApiError(409, '第二阶段任务覆盖校验失败，未写入任何任务，请联系管理员检查配置');
    if (error.message.includes('assignment_already_completed')) throw new ApiError(409, '已经完成并计分的任务不能直接改派；如需纠错请调整积分并保留审计记录');
    if (error.message.includes('ceremony_assignment_not_found')) throw new ApiError(404, '找不到这项仪式任务');
    if (error.message.includes('ring_variant_required')) throw new ApiError(409, '戒指守护者必须先指定负责新郎戒指或新娘戒指');
    if (error.message.includes('clue_already_granted')) throw new ApiError(409, '这位宾客已经获得该线索');
    if (error.message.includes('guest_not_secret_clue_eligible')) throw new ApiError(409, '这位宾客不参与秘密线索玩法，但仍应可以正常通过任务；请刷新后重试');
    if (error.message.includes('guest_card_already_drawn')) throw new ApiError(409, '宾客已经抽卡，不能直接修改组别或身份');
    if (error.message.includes('story_role_active_player_required')) throw new ApiError(409, '剧情职务只能分配给活跃任务玩家');
    if (error.message.includes('story_role_capacity_full')) throw new ApiError(409, '这个剧情职务的名额已经用完');
    if (error.message.includes('invalid_story_role')) throw new ApiError(400, '剧情职务无效');
    if (error.message.includes('invalid_alliance_clue')) throw new ApiError(400, '联盟线索标题或片段长度不正确');
    if (error.message.includes('point_total_unchanged')) throw new ApiError(409, '积分没有发生变化');
    if (error.message.includes('assignment_already_approved')) throw new ApiError(409, '该任务已经通过，不能重复加分');
    if (error.message.includes('verification_note_required')) throw new ApiError(400, '请填写核验记录');
    if (error.message.includes('award_winner_required')) throw new ApiError(400, '发布奖项前必须选择获奖宾客或队伍');
    if (error.message.includes('award_not_found')) throw new ApiError(404, '找不到奖项');
    if (error.message.includes('task_rules_locked')) throw new ApiError(409, '任务已派发；积分、身份范围、类型、开放阶段和隐藏奖励已锁定，只能修改文字或停用');
    if (error.message.includes('task_not_found')) throw new ApiError(404, '找不到任务');
    if (error.message.includes('clue_not_found')) throw new ApiError(404, '找不到线索');
    if (error.message.includes('clue_target_not_spy')) throw new ApiError(400, '线索只能绑定到已预设为间谍的宾客');
    if (error.message.includes('clue_spy_still_referenced')) throw new ApiError(409, '这位间谍仍有绑定线索，请先调整对应线索后再更改身份');
    if (error.message.includes('clue_rules_locked')) throw new ApiError(409, '线索已经发放，对应间谍和等级已锁定；仍可修正文案或停用');
    if (error.message.includes('guest_login_conflict')) throw new ApiError(409, '这个登录名已经被其他宾客使用');
    if (error.message.includes('guest_login_locked')) throw new ApiError(409, '宾客已经设置密码，登录名已锁定；可修改显示姓名或先重置密码');
    if (error.message.includes('drawn_guest_cannot_deactivate')) throw new ApiError(409, '宾客已经抽卡，不能停用；请保留身份并由工作人员现场处理');
    if (error.message.includes('use_voting_controls')) throw new ApiError(409, '投票和身份揭晓必须使用专用按钮，不能从环节下拉框直接跳转');
    if (error.message.includes('voting_stage_not_ready')) throw new ApiError(409, '请先切换到团队挑战环节，再开启最终投票');
    if (error.message.includes('no_drawn_guests')) throw new ApiError(409, '尚无宾客完成抽卡，不能开启最终投票');
    if (error.message.includes('phase_two_team_scores_missing')) throw new ApiError(409, '请先在团队游戏计分中记录海岛组或沙漠组的成绩，再开启最终投票');
    if (error.message.includes('phase_two_team_spy_missing')) throw new ApiError(409, '每个竞技组必须先完成抽卡并产生一名恶作剧者，才能发放排名线索');
    if (error.message.includes('phase_two_team_clues_missing')) throw new ApiError(409, '启用的本队恶作剧者线索不足，请先在任务与线索设置中补齐');
    if (error.message.includes('registration_during_finale')) throw new ApiError(409, '最终投票或身份揭晓期间不能重新开放注册；请先切回常规婚礼环节');
    throw new Error(`${fallback}: ${error.message}`);
  }
}

export async function getAdminDashboardData() {
  const db = getSupabaseAdmin();
  const results = await Promise.all([
    db.from('guests').select('id,name,login_name,team,role,is_hidden_spy,points,claimed_at,drawn_at,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes,participation_mode,relationship,story_role,uses_app,eligible_for_mission,eligible_for_secret_role,eligible_for_personal_score,phase_two_eligible,special_card_title,special_card_body,player_code,unlocked_role,created_at').order('active', { ascending: false }).order('team').order('name'),
    db.from('assignments').select('id,guest_id,task_id,status,is_initial,completion_rank,early_bonus_points,reward_task_id,reward_clue_id,completion_note,verification_note,verified_by,verified_at,evidence_path,evidence_uploaded_at,submitted_at,approved_at,rejected_at,rejection_reason,cancelled_at,ceremony_status,ring_variant,replaced_by_assignment_id,replacement_for_assignment_id,created_at,guest:guests(id,name),task:tasks!assignments_task_id_fkey(id,title,description,verification_method,points,category,stage,mission_code)'),
    db.from('tasks').select('id,title,description,verification_method,points,role_scope,category,stage,active,grants_hidden_spy,is_demo,story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,max_assignments,created_at').order('stage').order('title'),
    db.from('assignments').select('id,status,completion_note,evidence_path,evidence_uploaded_at,submitted_at,guest:guests(id,name),task:tasks!assignments_task_id_fkey(id,title,verification_method,points)').eq('status', 'submitted'),
    db.from('votes').select('id,voter_guest_id,target_guest_id,voting_round,vote_weight,created_at,voter:guests!votes_voter_guest_id_fkey(id,name,team),target:guests!votes_target_guest_id_fkey(id,name,team)'),
    db.from('game_state').select('id,registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,display_title,display_body,public_clue,timer_ends_at,invitation_code_updated_at,task_catalog_mode,trickster_max_attempts,phase_one_completed_at,updated_at').eq('id', 1).single(),
    db.from('clues').select('id,title,content,active,spy_guest_id,level,created_at,spy:guests!clues_spy_guest_id_fkey(id,name,team)').order('level').order('created_at'),
    db.from('guest_clues').select('id,guest_id,clue_id,created_at,guest:guests(id,name),clue:clues(id,title)').order('created_at', { ascending: false }).limit(50),
    db.from('points_ledger').select('id,guest_id,amount,reason,actor,created_at,guest:guests(id,name)').order('created_at', { ascending: false }).limit(50),
    db.from('audit_log').select('id,actor,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(50),
    db.from('team_points_ledger').select('id,team,amount,reason,actor,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('awards').select('id,title,winner_guest_id,winner_team,reason,sort_order,published,updated_at,winner:guests(id,name,team)').order('sort_order').order('created_at'),
    db.from('result_rewards').select('id,voting_round,reward_type,guest_id,team,amount,details,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('hidden_task_codes').select('id,task_id,issued_by,issued_at,claimed_by,claimed_at,assignment_id,task:tasks(id,title,active),guest:guests!hidden_task_codes_claimed_by_fkey(id,name)').order('issued_at', { ascending: false }),
    db.from('host_segments').select('id,title,stage,ready,active').order('sort_order').order('created_at'),
    db.from('team_resources').select('team,balance,updated_at').order('team'),
    db.rpc('preview_rehearsal_reset'),
    db.from('heart_slots').select('heart_code,pair_key,side,guest_id,assigned_at,guest:guests(id,name)').order('heart_code'),
    db.from('player_relationships').select('id,relationship_type,status,player_a_confirmed,player_b_confirmed,activated_at,player_a:guests!player_relationships_player_a_id_fkey(id,name),player_b:guests!player_relationships_player_b_id_fkey(id,name)').order('created_at', { ascending: false }),
    db.from('alliance_clue_fragments').select('pair_key,title,left_fragment,right_fragment,active,updated_at').order('pair_key'),
    db.from('symbol_pairing_assignments').select('guest_id,symbol,status,partner_guest_id,pending_relationship_id,finalized_at,updated_at,guest:guests!symbol_pairing_assignments_guest_id_fkey(id,name),partner:guests!symbol_pairing_assignments_partner_guest_id_fkey(id,name)').order('symbol').order('updated_at'),
    db.from('phase_two_profiles').select('guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,unlocked_at,updated_at').order('team').order('updated_at'),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load admin data: ${error.message}`);
  const guests = results[0].data ?? [];
  const tasks = results[2].data ?? [];
  const clues = results[6].data ?? [];
  const hiddenTaskCodes = results[13].data ?? [];
  const hostSegments = results[14].data ?? [];
  const resourceWallets = results[15].data ?? [];
  return {
    guests, assignments: await signEvidencePaths(results[1].data ?? []), tasks,
    submissions: await signEvidencePaths(results[3].data ?? []),
    votes: (results[4].data ?? []).filter((vote) => vote.voting_round === (results[5].data?.voting_round ?? 0)),
    game: results[5].data,
    clues, guestClues: results[7].data ?? [],
    pointLedger: results[8].data ?? [], auditLog: results[9].data ?? [], teamPointLedger: results[10].data ?? [], awards: results[11].data ?? [],
    resultRewards: results[12].data ?? [],
    hiddenTaskCodes: results[13].data ?? [],
    hostSegments,
    resourceWallets,
    preflight: buildWeddingPreflight({ guests, tasks, clues, hiddenTaskCodes, hostSegments, resourceWallets, hasGameState: Boolean(results[5].data), invitationCodeRotated: Boolean(results[5].data?.invitation_code_updated_at) }),
    rehearsalResetPreview: results[16].data ?? {},
    heartSlots: results[17].data ?? [],
    playerRelationships: results[18].data ?? [],
    allianceClues: results[19].data ?? [],
    symbolPairings: results[20].data ?? [],
    phaseTwoProfiles: results[21].data ?? [],
  };
}

export async function getPrintableMissionCards() {
  const db = getSupabaseAdmin();
  const [{ data: guests, error: guestError }, { data: assignments, error: assignmentError }] = await Promise.all([
    db.from('guests').select('id,name,login_name,player_code,participation_mode,relationship,special_card_title,special_card_body').eq('active', true).eq('uses_app', true).order('name'),
    db.from('assignments').select('guest_id,task:tasks!assignments_task_id_fkey(title,description,verification_method)').eq('is_initial', true),
  ]);
  if (guestError || assignmentError) throw new Error(`Unable to load printable cards: ${guestError?.message ?? assignmentError?.message}`);
  const taskByGuest = new Map((assignments ?? []).map((assignment) => {
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    return [assignment.guest_id, task ?? null];
  }));
  return (guests ?? []).map((guest) => ({ ...guest, task: taskByGuest.get(guest.id) ?? null }));
}

export async function approveAssignment(assignmentId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('approve_assignment_with_verification', {
    p_assignment_id: assignmentId, p_actor: actor, p_verification_note: reason,
  });
  ensureNoDatabaseError(error, 'Unable to approve assignment');
}

export async function rejectAssignment(assignmentId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('reject_assignment', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to reject assignment');
}

export async function setGameFlag(field: 'voting_open' | 'results_visible' | 'scoreboard_visible', value: boolean, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_flag', {
    p_field: field, p_value: value, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to update game state');
}

export async function setRegistrationOpen(value: boolean, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_registration_open', { p_value: value, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to update registration state');
}

export async function setInvitationCode(code: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_invitation_code', { p_code: code, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to rotate invitation code');
}

export async function setGuestPhaseNote(note: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_guest_phase_note', { p_note: note, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to update guest phase note');
}

export async function setGameStage(stage: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_stage', { p_stage: stage, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to update game stage');
}

export async function resetGuestClaim(guestId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('reset_guest_claim', { p_guest_id: guestId, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to reset guest claim');
}

export async function completeAssignmentAtStation(assignmentId: string, actor: string, verificationNote: string) {
  const { error } = await getSupabaseAdmin().rpc('complete_assignment_at_station', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: verificationNote,
  });
  ensureNoDatabaseError(error, 'Unable to complete assignment at station');
}

export async function saveAward(input: { id: string | null; title: string; winnerGuestId: string | null; winnerTeam: string | null; reason: string; sortOrder: number; published: boolean }, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('save_award', {
    p_award_id: input.id, p_title: input.title, p_winner_guest_id: input.winnerGuestId,
    p_winner_team: input.winnerTeam, p_reason: input.reason, p_sort_order: input.sortOrder,
    p_published: input.published, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to save award');
}

export async function adjustGuestPoints(guestId: string, amount: number, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('adjust_guest_points', {
    p_guest_id: guestId, p_amount: amount, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to adjust guest points');
}

export async function adjustTeamPoints(team: string, amount: number, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('adjust_team_points', {
    p_team: team, p_amount: amount, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to adjust team points');
}

export async function setLiveDisplay(title: string, body: string, publicClue: string, timerMinutes: number, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_live_display', {
    p_title: title, p_body: body, p_public_clue: publicClue, p_timer_minutes: timerMinutes, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to update live display');
}

export async function assignTaskToGuest(guestId: string, taskId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('assign_task_to_guest', {
    p_guest_id: guestId, p_task_id: taskId, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to assign task');
}

export async function reassignTaskAssignment(assignmentId: string, taskId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('reassign_task_assignment', {
    p_assignment_id: assignmentId, p_task_id: taskId, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to reassign task');
}

export async function updateCeremonyAssignment(assignmentId: string, ceremonyStatus: string, ringVariant: string | null, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('update_ceremony_assignment', {
    p_assignment_id: assignmentId, p_ceremony_status: ceremonyStatus, p_ring_variant: ringVariant, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to update ceremony assignment');
}

export async function issueHiddenTaskCode(taskId: string, actor: string) {
  const code = createHiddenTaskCode();
  const { error } = await getSupabaseAdmin().rpc('issue_hidden_task_code', {
    p_task_id: taskId, p_code_hash: hashHiddenTaskCode(code), p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to issue hidden task code');
  return code;
}

export async function redeemHiddenTaskCode(guestId: string, code: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('redeem_hidden_task_code', {
    p_guest_id: guestId, p_code_hash: hashHiddenTaskCode(code), p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to redeem hidden task code');
}

export async function resetRehearsalData(input: { confirmation: string; backupConfirmed: boolean; reason: string; eventKey: string }, actor: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc('reset_rehearsal_data', {
    p_confirmation: input.confirmation,
    p_backup_confirmed: input.backupConfirmed,
    p_reason: input.reason,
    p_event_key: input.eventKey,
    p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to reset rehearsal data');
  const { data: resetRecord, error: resetRecordError } = await db.from('rehearsal_resets').select('evidence_paths').eq('event_key', input.eventKey).single();
  if (resetRecordError) throw new Error(`Unable to load pending evidence cleanup: ${resetRecordError.message}`);
  const storedEvidencePaths = Array.isArray(resetRecord.evidence_paths)
    ? resetRecord.evidence_paths.filter((path): path is string => typeof path === 'string')
    : [];
  const evidencePaths: string[] = [...new Set(storedEvidencePaths)];

  let evidenceCleanupPending = false;
  let removedEvidence = 0;
  const pendingEvidencePaths: string[] = [];
  for (let index = 0; index < evidencePaths.length; index += 100) {
    const batch = evidencePaths.slice(index, index + 100);
    const { error: cleanupError } = await db.storage.from('task-evidence').remove(batch);
    if (cleanupError) {
      evidenceCleanupPending = true;
      pendingEvidencePaths.push(...batch);
      await db.from('audit_log').insert({ actor, action: 'rehearsal.evidence_cleanup_pending', target_type: 'storage_bucket', target_id: 'task-evidence', details: { count: batch.length } });
    } else {
      removedEvidence += batch.length;
    }
  }
  const { error: pendingUpdateError } = await db.from('rehearsal_resets').update({ evidence_paths: pendingEvidencePaths }).eq('event_key', input.eventKey);
  if (pendingUpdateError) evidenceCleanupPending = true;
  return { summary: data as Record<string, number | boolean>, removedEvidence, evidenceCleanupPending };
}

export async function grantClueToGuest(guestId: string, clueId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('grant_guest_clue', {
    p_guest_id: guestId, p_clue_id: clueId, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to grant clue');
}

export async function configureGuestGameProfile(guestId: string, team: string, role: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('configure_guest_game_profile', {
    p_guest_id: guestId, p_team: team, p_role: role, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to configure guest profile');
}

export async function configurePhaseTwoProfile(input: {
  guestId: string;
  primaryMission: string | null;
  extraVote: boolean;
  superLucky: boolean;
  isCaptain: boolean;
  interactionTheme: string;
}, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('configure_phase_two_profile', {
    p_guest_id: input.guestId,
    p_primary_mission: input.primaryMission,
    p_extra_vote: input.extraVote,
    p_super_lucky: input.superLucky,
    p_is_captain: input.isCaptain,
    p_interaction_theme: input.interactionTheme,
    p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to configure phase two profile');
}

export async function configureGuestStoryRole(guestId: string, storyRole: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('configure_guest_story_role', {
    p_guest_id: guestId, p_story_role: storyRole, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to configure guest story role');
}

export async function undoPlayerRelationship(relationshipId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('undo_player_relationship', {
    p_relationship_id: relationshipId, p_actor: actor, p_reason: reason,
  });
  ensureNoDatabaseError(error, 'Unable to undo player relationship');
}

export async function saveAllianceClue(input: { pairKey: string; title: string; leftFragment: string; rightFragment: string; active: boolean }, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('save_alliance_clue_fragment', {
    p_pair_key: input.pairKey,
    p_title: input.title,
    p_left_fragment: input.leftFragment,
    p_right_fragment: input.rightFragment,
    p_active: input.active,
    p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to save alliance clue');
}

export async function saveGuestRoster(input: { id: string | null; name: string; loginName: string; tableLabel: string; isElder: boolean; ceremonyEligible: boolean; active: boolean; staffNotes: string }, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('save_guest_roster', {
    p_guest_id: input.id, p_name: input.name, p_login_name: input.loginName,
    p_table_label: input.tableLabel, p_is_elder: input.isElder,
    p_ceremony_eligible: input.ceremonyEligible, p_active: input.active,
    p_staff_notes: input.staffNotes, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to save guest roster');
}

export async function importGuestRoster(rows: Array<{ name: string; loginName: string; tableLabel: string }>, actor: string) {
  const { data, error } = await getSupabaseAdmin().rpc('import_guest_roster', { p_rows: rows, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to import guest roster');
  return Number(data);
}

type SavedTask = {
  id: string | null;
  title: string;
  description: string;
  verificationMethod: string;
  points: number;
  roleScope: string;
  category: string;
  stage: string;
  active: boolean;
  grantsHiddenSpy: boolean;
};

export async function saveGameTask(input: SavedTask, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('save_game_task', {
    p_task_id: input.id,
    p_title: input.title,
    p_description: input.description,
    p_verification_method: input.verificationMethod,
    p_points: input.points,
    p_role_scope: input.roleScope,
    p_category: input.category,
    p_stage: input.stage,
    p_active: input.active,
    p_grants_hidden_spy: input.grantsHiddenSpy,
    p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to save task');
}

export async function saveGameClue(input: { id: string | null; title: string; content: string; active: boolean; spyGuestId: string | null; level: number }, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('save_game_clue', {
    p_clue_id: input.id, p_title: input.title, p_content: input.content, p_active: input.active,
    p_spy_guest_id: input.spyGuestId, p_level: input.level, p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to save clue');
}
