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
    if (error.message.includes('guest_not_active_spy')) throw new ApiError(409, '只能给已抽卡且当前身份为间谍的宾客记录间谍分');
    if (error.message.includes('invalid_spy_point_reason')) throw new ApiError(400, '间谍积分事件类型无效');
    if (error.message.includes('spy_scoring_closed')) throw new ApiError(409, '身份已经揭晓，间谍现场积分已锁定');
    if (error.message.includes('reset_confirmation_invalid')) throw new ApiError(400, '清场确认词不正确');
    if (error.message.includes('reset_backup_required')) throw new ApiError(400, '请先导出并确认八类备份');
    if (error.message.includes('reset_reason_required')) throw new ApiError(400, '请填写本次彩排清场原因');
    if (error.message.includes('reset_public_controls_open')) throw new ApiError(409, '清场前必须关闭注册、投票和公开大屏');
    if (error.message.includes('guest_card_not_drawn')) throw new ApiError(409, '宾客尚未抽取身份卡，暂时不能兑换隐藏任务');
    if (error.message.includes('active_hidden_spy_task_exists')) throw new ApiError(409, '任务库只能启用一张隐藏间谍卡');
    if (error.message.includes('invalid_hidden_spy_task')) throw new ApiError(400, '隐藏间谍卡必须是第二轮、仅限普通宾客的隐藏任务');
    if (error.message.includes('invalid_task_points')) throw new ApiError(400, '任务积分必须是 1、2 或 3 分');
    if (error.message.includes('clue_already_granted')) throw new ApiError(409, '这位宾客已经获得该线索');
    if (error.message.includes('guest_card_already_drawn')) throw new ApiError(409, '宾客已经抽卡，不能直接修改组别或身份');
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
    if (error.message.includes('registration_during_finale')) throw new ApiError(409, '最终投票或身份揭晓期间不能重新开放注册；请先切回常规婚礼环节');
    throw new Error(`${fallback}: ${error.message}`);
  }
}

export async function getAdminDashboardData() {
  const db = getSupabaseAdmin();
  const results = await Promise.all([
    db.from('guests').select('id,name,login_name,team,role,is_hidden_spy,points,claimed_at,drawn_at,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes,created_at').order('active', { ascending: false }).order('team').order('name'),
    db.from('assignments').select('id,guest_id,task_id,status,is_initial,completion_rank,early_bonus_points,reward_task_id,reward_clue_id,completion_note,verification_note,verified_by,verified_at,evidence_path,evidence_uploaded_at,submitted_at,approved_at,rejected_at,rejection_reason,created_at,task:tasks(id,title,description,verification_method,points,category,stage)'),
    db.from('tasks').select('id,title,description,verification_method,points,role_scope,category,stage,active,grants_hidden_spy,created_at').order('stage').order('title'),
    db.from('assignments').select('id,status,completion_note,evidence_path,evidence_uploaded_at,submitted_at,guest:guests(id,name),task:tasks(id,title,verification_method,points)').eq('status', 'submitted'),
    db.from('votes').select('id,voter_guest_id,target_guest_id,voting_round,created_at,voter:guests!votes_voter_guest_id_fkey(id,name,team),target:guests!votes_target_guest_id_fkey(id,name,team)'),
    db.from('game_state').select('id,registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,display_title,display_body,public_clue,timer_ends_at,invitation_code_updated_at,updated_at').eq('id', 1).single(),
    db.from('clues').select('id,title,content,active,spy_guest_id,level,created_at,spy:guests!clues_spy_guest_id_fkey(id,name,team)').order('level').order('created_at'),
    db.from('guest_clues').select('id,guest_id,clue_id,created_at,guest:guests(id,name),clue:clues(id,title)').order('created_at', { ascending: false }).limit(50),
    db.from('points_ledger').select('id,guest_id,amount,reason,actor,created_at,guest:guests(id,name)').order('created_at', { ascending: false }).limit(50),
    db.from('audit_log').select('id,actor,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(50),
    db.from('team_points_ledger').select('id,team,amount,reason,actor,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('awards').select('id,title,winner_guest_id,winner_team,reason,sort_order,published,updated_at,winner:guests(id,name,team)').order('sort_order').order('created_at'),
    db.from('result_rewards').select('id,voting_round,reward_type,guest_id,team,amount,details,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('hidden_task_codes').select('id,task_id,issued_by,issued_at,claimed_by,claimed_at,assignment_id,task:tasks(id,title,active),guest:guests!hidden_task_codes_claimed_by_fkey(id,name)').order('issued_at', { ascending: false }),
    db.from('spy_points_ledger').select('id,guest_id,amount,reason,note,actor,voting_round,created_at,guest:guests(id,name,team)').order('created_at', { ascending: false }).limit(100),
    db.from('host_segments').select('id,title,stage,ready,active').order('sort_order').order('created_at'),
    db.from('team_resources').select('team,balance,updated_at').order('team'),
    db.rpc('preview_rehearsal_reset'),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load admin data: ${error.message}`);
  const guests = results[0].data ?? [];
  const tasks = results[2].data ?? [];
  const clues = results[6].data ?? [];
  const hiddenTaskCodes = results[13].data ?? [];
  const hostSegments = results[15].data ?? [];
  const resourceWallets = results[16].data ?? [];
  return {
    guests, assignments: await signEvidencePaths(results[1].data ?? []), tasks,
    submissions: await signEvidencePaths(results[3].data ?? []),
    votes: (results[4].data ?? []).filter((vote) => vote.voting_round === (results[5].data?.voting_round ?? 0)),
    game: results[5].data,
    clues, guestClues: results[7].data ?? [],
    pointLedger: results[8].data ?? [], auditLog: results[9].data ?? [], teamPointLedger: results[10].data ?? [], awards: results[11].data ?? [],
    resultRewards: results[12].data ?? [],
    hiddenTaskCodes: results[13].data ?? [],
    spyPointLedger: results[14].data ?? [],
    hostSegments,
    resourceWallets,
    preflight: buildWeddingPreflight({ guests, tasks, clues, hiddenTaskCodes, hostSegments, resourceWallets, hasGameState: Boolean(results[5].data), invitationCodeRotated: Boolean(results[5].data?.invitation_code_updated_at) }),
    rehearsalResetPreview: results[17].data ?? {},
  };
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

export async function recordSpyPointEvent(input: { guestId: string; reason: string; note: string; eventKey: string }, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('record_spy_point_event', {
    p_guest_id: input.guestId,
    p_reason: input.reason,
    p_note: input.note,
    p_event_key: input.eventKey,
    p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to record spy point event');
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
