import 'server-only';
import { ApiError } from '../errors';
import { getSupabaseAdmin } from '../supabase';

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
    if (error.message.includes('clue_already_granted')) throw new ApiError(409, '这位宾客已经获得该线索');
    if (error.message.includes('guest_card_already_drawn')) throw new ApiError(409, '宾客已经抽卡，不能直接修改组别或身份');
    if (error.message.includes('point_total_unchanged')) throw new ApiError(409, '积分没有发生变化');
    if (error.message.includes('assignment_already_approved')) throw new ApiError(409, '该任务已经通过，不能重复加分');
    if (error.message.includes('award_winner_required')) throw new ApiError(400, '发布奖项前必须选择获奖宾客或队伍');
    if (error.message.includes('award_not_found')) throw new ApiError(404, '找不到奖项');
    if (error.message.includes('task_rules_locked')) throw new ApiError(409, '任务已派发；积分、身份范围、类型和开放阶段已锁定，只能修改文字或停用');
    if (error.message.includes('task_not_found')) throw new ApiError(404, '找不到任务');
    if (error.message.includes('clue_not_found')) throw new ApiError(404, '找不到线索');
    if (error.message.includes('clue_target_not_spy')) throw new ApiError(400, '线索只能绑定到已预设为间谍的宾客');
    if (error.message.includes('clue_spy_still_referenced')) throw new ApiError(409, '这位间谍仍有绑定线索，请先调整对应线索后再更改身份');
    if (error.message.includes('clue_rules_locked')) throw new ApiError(409, '线索已经发放，对应间谍和等级已锁定；仍可修正文案或停用');
    if (error.message.includes('guest_login_conflict')) throw new ApiError(409, '这个登录名已经被其他宾客使用');
    if (error.message.includes('guest_login_locked')) throw new ApiError(409, '宾客已经设置密码，登录名已锁定；可修改显示姓名或先重置密码');
    if (error.message.includes('drawn_guest_cannot_deactivate')) throw new ApiError(409, '宾客已经抽卡，不能停用；请保留身份并由工作人员现场处理');
    throw new Error(`${fallback}: ${error.message}`);
  }
}

export async function getAdminDashboardData() {
  const db = getSupabaseAdmin();
  const results = await Promise.all([
    db.from('guests').select('id,name,login_name,team,role,points,claimed_at,drawn_at,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes,created_at').order('active', { ascending: false }).order('team').order('name'),
    db.from('assignments').select('id,guest_id,task_id,status,is_initial,completion_rank,reward_task_id,reward_clue_id,submitted_at,approved_at,rejected_at,rejection_reason,created_at,task:tasks(id,title,description,points,category,stage)'),
    db.from('tasks').select('id,title,description,points,role_scope,category,stage,active,created_at').order('stage').order('title'),
    db.from('assignments').select('id,status,submitted_at,guest:guests(id,name),task:tasks(id,title,points)').eq('status', 'submitted'),
    db.from('votes').select('id,voter_guest_id,target_guest_id,voting_round,created_at,voter:guests!votes_voter_guest_id_fkey(id,name,team),target:guests!votes_target_guest_id_fkey(id,name,team)'),
    db.from('game_state').select('id,registration_open,stage,voting_open,voting_round,results_visible,scoreboard_visible,phase_note,display_title,display_body,public_clue,timer_ends_at,updated_at').eq('id', 1).single(),
    db.from('clues').select('id,title,content,active,spy_guest_id,level,created_at,spy:guests!clues_spy_guest_id_fkey(id,name,team)').order('level').order('created_at'),
    db.from('guest_clues').select('id,guest_id,clue_id,created_at,guest:guests(id,name),clue:clues(id,title)').order('created_at', { ascending: false }).limit(50),
    db.from('points_ledger').select('id,guest_id,amount,reason,actor,created_at,guest:guests(id,name)').order('created_at', { ascending: false }).limit(50),
    db.from('audit_log').select('id,actor,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(50),
    db.from('team_points_ledger').select('id,team,amount,reason,actor,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('awards').select('id,title,winner_guest_id,winner_team,reason,sort_order,published,updated_at,winner:guests(id,name,team)').order('sort_order').order('created_at'),
    db.from('result_rewards').select('id,voting_round,reward_type,guest_id,team,amount,details,created_at').order('created_at', { ascending: false }).limit(100),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load admin data: ${error.message}`);
  return {
    guests: results[0].data ?? [], assignments: results[1].data ?? [], tasks: results[2].data ?? [],
    submissions: results[3].data ?? [],
    votes: (results[4].data ?? []).filter((vote) => vote.voting_round === (results[5].data?.voting_round ?? 0)),
    game: results[5].data,
    clues: results[6].data ?? [], guestClues: results[7].data ?? [],
    pointLedger: results[8].data ?? [], auditLog: results[9].data ?? [], teamPointLedger: results[10].data ?? [], awards: results[11].data ?? [],
    resultRewards: results[12].data ?? [],
  };
}

export async function approveAssignment(assignmentId: string, actor: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('approve_assignment', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: reason,
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

export async function setGameStage(stage: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_stage', { p_stage: stage, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to update game stage');
}

export async function resetGuestClaim(guestId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('reset_guest_claim', { p_guest_id: guestId, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to reset guest claim');
}

export async function completeAssignmentAtStation(assignmentId: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('complete_assignment_at_station', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: '任务站现场核验通过',
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

type SavedTask = {
  id: string | null;
  title: string;
  description: string;
  points: number;
  roleScope: string;
  category: string;
  stage: string;
  active: boolean;
};

export async function saveGameTask(input: SavedTask, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('save_game_task', {
    p_task_id: input.id,
    p_title: input.title,
    p_description: input.description,
    p_points: input.points,
    p_role_scope: input.roleScope,
    p_category: input.category,
    p_stage: input.stage,
    p_active: input.active,
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
