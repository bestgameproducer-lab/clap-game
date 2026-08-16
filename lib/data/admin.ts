import 'server-only';
import { ApiError } from '../errors';
import { getSupabaseAdmin } from '../supabase';
import { buildWeddingPreflight } from '../preflight';
import { signEvidencePaths } from './evidence';
import { signAvatarPaths } from './avatar';
import { settledClueIdsByTeam } from './settled-team-clues';
import { compareWeddingGuests } from '../wedding-roster-order';
import { DEPLOYMENT_VERSION } from '../deployment';
import { buildPublicScoreboard, findUndetectedTricksterIds, hasJoinedPersonalRanking } from '../scoreboard-core';
import { isTaskAllowedInCatalogMode } from '../official-task-manifest';

function ensureNoDatabaseError(error: { message: string } | null, fallback: string): void {
  if (error) {
    if (error.message.includes('final_results_locked')) throw new ApiError(409, '终局结果已经发布，本场任务审核、积分、线索、奖项与任务配置均已冻结');
    if (error.message.includes('results_publication_irreversible')) throw new ApiError(409, '终局结果一经发布不能撤回；公开大屏可以单独关闭');
    if (error.message.includes('voting_still_open')) throw new ApiError(409, '请先关闭本轮投票，再公布身份并结算终局奖励');
    if (error.message.includes('no_votes_in_current_round')) throw new ApiError(409, '本轮还没有收到任何投票，不能公布并永久冻结终局结果');
    if (error.message.includes('invalid_game_stage_transition')) throw new ApiError(409, '婚礼环节只能按顺序进入；请刷新页面确认当前环节和下一步');
    if (error.message.includes('hidden_spy_feature_retired')) throw new ApiError(409, '隐藏恶作剧者与实体任务卡功能已经取消');
    if (error.message.includes('official_task_catalog_locked')) throw new ApiError(409, '正式婚礼任务由版本化任务清单维护，后台只能查看，不能现场修改');
    if (error.message.includes('formal_wedding_preflight_not_ready')) throw new ApiError(409, '正式婚礼尚未通过开场检查；请回到“开场与宾客”查看红色待处理项，补齐名单、固定职务或 23 项正式任务后再开放注册');
    if (error.message.includes('live_custom_task_catalog_locked')) throw new ApiError(409, '当前是正式婚礼模式，不能新建或编辑临时任务；请只使用已确认的正式任务清单');
    if (error.message.includes('live_custom_task_assignment_forbidden')) throw new ApiError(409, '当前是正式婚礼模式，不能人工派发或改派临时任务');
    if (error.message.includes('clue_not_earned_in_current_rehearsal')) throw new ApiError(409, '这条线索不在本次团队结算已经赢得的线索中，不能人工发放');
    if (error.message.includes('assignment_not_found')) throw new ApiError(404, '找不到任务');
    if (error.message.includes('assignment_stage_closed')) throw new ApiError(409, '当前婚礼环节不允许核验这项任务，请先确认流程已进入任务开放阶段');
    if (error.message.includes('station_hidden_assignment_forbidden')) throw new ApiError(409, '隐藏身份任务不能由任务站人工完成');
    if (error.message.includes('station_manual_completion_forbidden')) throw new ApiError(409, '这项任务由宾客操作或系统自动结算，不能由任务站人工完成');
    if (error.message.includes('guest_not_found')) throw new ApiError(404, '找不到宾客');
    if (error.message.includes('task_not_found')) throw new ApiError(404, '找不到可用任务');
    if (error.message.includes('clue_not_found')) throw new ApiError(404, '找不到可用线索');
    if (error.message.includes('assignment_not_submitted') || error.message.includes('duplicate key')) {
      throw new ApiError(409, '该任务已经处理，无法重复操作');
    }
    if (error.message.includes('task_already_assigned')) throw new ApiError(409, '这位宾客已经领取过该任务');
    if (error.message.includes('invalid_invitation_code_format')) throw new ApiError(400, '邀请码需为 6–32 位英文字母、数字或连字符');
    if (error.message.includes('phase_note_too_long')) throw new ApiError(400, '宾客端环节提示不能超过 500 字');
    if (error.message.includes('guest_roster_import_invalid')) throw new ApiError(400, '批量名单格式不正确，请重新预览');
    if (error.message.includes('guest_roster_import_registration_open')) throw new ApiError(409, '请先关闭宾客注册，再批量导入名单');
    if (error.message.includes('guest_roster_import_conflict')) throw new ApiError(409, '名单中有重复或已存在的登录名，本次未导入任何宾客');
    if (error.message.includes('official_task_manual_assignment_forbidden')) throw new ApiError(409, '正式婚礼任务由抽卡或流程切换自动分配，不能在手动任务入口派发或改派');
    if (error.message.includes('formal_configuration_locked')) throw new ApiError(409, '正式名单已经进入使用：注册开放、有人认领或流程开始后不能再改动名单结构与预设；如需重排，请先完成彩排清场');
    if (error.message.includes('formal_team_locked')) throw new ApiError(409, '正式婚礼的海岛组与沙漠组名单已经固定，只能为这位宾客预设或取消同队恶作剧者身份');
    if (error.message.includes('formal_profile_guest_ineligible')) throw new ApiError(409, '只有正式名单中可参与第二轮且没有固定剧情职务的竞技玩家可以预设恶作剧者');
    if (error.message.includes('formal_story_cast_locked')) throw new ApiError(409, '正式婚礼的仪式、爱心与星星职务由版本化名单固定，后台现场不能覆盖');
    if (error.message.includes('formal_phase_two_profile_locked')) throw new ApiError(409, '正式婚礼的第二轮任务由流程切换统一校验并自动分配，不能逐人手动指定');
    if (error.message.includes('manual_task_guest_ineligible')) throw new ApiError(409, '该宾客尚未完成抽卡，或不属于可领取手动任务的玩家');
    if (error.message.includes('manual_task_not_demo')) throw new ApiError(409, '只有已启用的非隐藏演示任务可以通过手动任务入口派发');
    if (error.message.includes('manual_task_role_ineligible')) throw new ApiError(409, '这项手动任务不适用于该宾客的当前身份');
    if (error.message.includes('manual_task_stage_closed')) throw new ApiError(409, '这项手动任务在当前婚礼环节不可派发');
    if (error.message.includes('manual_task_capacity_full')) throw new ApiError(409, '这项手动任务的可派发名额已满');
    if (error.message.includes('phase_two_existing_assignments_incomplete')) throw new ApiError(409, '检测到不完整的第二轮任务数据，系统已停止切换以避免错误发放；请先运行完整性检查');
    if (error.message.includes('reset_confirmation_invalid')) throw new ApiError(400, '清场确认词不正确');
    if (error.message.includes('reset_backup_required')) throw new ApiError(400, '请先导出并确认八类清场前核对记录');
    if (error.message.includes('reset_reason_required')) throw new ApiError(400, '请填写本次彩排清场原因');
    if (error.message.includes('rehearsal_storage_cleanup_pending')) throw new ApiError(409, '仍有彩排私密照片等待删除；请先完成存储清理，再开放注册或开始下一次清场');
    if (error.message.includes('reset_postcondition_failed')) throw new ApiError(409, '彩排清场后的完整性检查未通过，所有数据库改动已自动撤销；请联系管理员检查最新迁移');
    if (error.message.includes('reset_public_controls_open')) throw new ApiError(409, '清场前必须关闭注册、投票和公开大屏');
    if (error.message.includes('invalid_task_points')) throw new ApiError(400, '任务积分必须是 0–12 分');
    if (error.message.includes('preset_spy_team_conflict')) throw new ApiError(409, '这个组已经预设了一位恶作剧者，请为其中一人选择其他组别');
    if (error.message.includes('fixed_story_role_conflict')) throw new ApiError(409, '这位宾客已有固定剧情身份，不能预设为恶作剧者');
    if (error.message.includes('symbol_pairing_count_invalid')) throw new ApiError(409, '爱心和星星都必须各有五位玩家完成抽卡');
    if (error.message.includes('symbol_pairing_incomplete')) throw new ApiError(409, '爱心和星星都需要先形成两组正式联盟，并处理全部待确认邀请');
    if (error.message.includes('symbol_pairing_state_invalid') || error.message.includes('symbol_finalization_incomplete')) throw new ApiError(409, '爱心或星星配对状态异常，请先在主持人界面核对联盟记录');
    if (error.message.includes('symbol_fragment_distribution_invalid')) throw new ApiError(409, '爱心或星星的左右图案数量异常，系统无法自动完成最终配对');
    if (error.message.includes('symbol_auto_pair_conflict')) throw new ApiError(409, '自动补齐伙伴配对时发生冲突，请刷新后重试');
    if (error.message.includes('symbol_final_player_missing')) throw new ApiError(409, '爱心或星星没有留下可升级的最后一位玩家；请核对图案持有者名单');
    if (error.message.includes('phase_two_roster_not_ready')) throw new ApiError(409, '第二轮任务需要海岛组和沙漠组各有 10 位玩家完成抽卡');
    if (error.message.includes('phase_two_trickster_count_invalid')) throw new ApiError(409, '第二轮任务需要海岛组和沙漠组各有一位恶作剧者');
    if (error.message.includes('phase_two_relationship_roles_not_ready')) throw new ApiError(409, '爱心或星星角色尚未完成结算，请刷新后重试');
    if (error.message.includes('phase_two_yirui_speech_unavailable')) throw new ApiError(409, '固定晚宴致辞玩家尚未完成抽卡，暂时不能发放第二轮任务');
    if (error.message.includes('phase_two_first_act_photo_contract_invalid')) throw new ApiError(409, '第一轮照片任务分配与正式任务清单不一致；第二轮尚未发放，请核对张奕睿的固定照片任务和三项竞技组照片任务');
    if (error.message.includes('phase_two_photo_absorption_incomplete')) throw new ApiError(409, '仍有第一轮照片玩家未被第二轮能力任务吸收；本次没有发放第二轮任务，请运行完整性检查');
    if (error.message.includes('phase_two_extra_vote_unavailable') || error.message.includes('phase_two_lucky_unavailable')) throw new ApiError(409, '第二轮能力卡名额不足，请核对竞技组名单');
    if (error.message.includes('phase_two_coverage_invalid') || error.message.includes('phase_two_team_coverage_invalid') || error.message.includes('phase_two_assignment_count_invalid')) throw new ApiError(409, '第二轮任务覆盖校验失败，未写入任何任务，请联系管理员检查配置');
    if (error.message.includes('phase_two_safe_update_patch_failed') || error.message.includes('phase_two_runtime_cleanup_safe_update_patch_failed')) throw new ApiError(409, '第二轮数据库安全修复尚未生效，请联系管理员完成最新部署后重试');
    if (error.message.includes('DELETE requires a WHERE clause')) throw new ApiError(409, '第二轮派发被数据库安全规则拦截，请刷新后重试；本次没有写入部分任务');
    if (error.message.includes('assignment_already_completed')) throw new ApiError(409, '已经完成并计分的任务不能直接改派；如需纠错请调整积分并保留审计记录');
    if (error.message.includes('ceremony_assignment_not_found')) throw new ApiError(404, '找不到这项仪式任务');
    if (error.message.includes('ring_variant_required')) throw new ApiError(409, '戒指守护者必须先指定负责新郎戒指或新娘戒指');
    if (error.message.includes('clue_already_granted')) throw new ApiError(409, '这位宾客已经获得该线索');
    if (error.message.includes('clue_team_mismatch')) throw new ApiError(409, '团队线索只能发给同一队的竞技玩家，请重新选择');
    if (error.message.includes('clue_spy_mismatch')) throw new ApiError(409, '这条线索绑定的已不是该队当前恶作剧者，请在婚礼设置中改用或新建正确线索');
    if (error.message.includes('guest_not_secret_clue_eligible')) throw new ApiError(409, '团队线索只能发给已抽卡、参加第二轮的海岛组或沙漠组正式玩家');
    if (error.message.includes('guest_not_personal_score_eligible')) throw new ApiError(409, '这位宾客目前不能获得个人积分');
    if (error.message.includes('score_event_key_required')) throw new ApiError(400, '缺少本次积分操作的事件编号');
    if (error.message.includes('rehearsal_run_required')) throw new ApiError(400, '缺少婚礼运行批次，请刷新后台后重试');
    if (error.message.includes('rehearsal_run_mismatch')) throw new ApiError(409, '本页面属于清场前的旧批次；为避免污染正式数据，请刷新后台后重新操作');
    if (error.message.includes('score_event_conflict')) throw new ApiError(409, '这次积分请求与已保存记录冲突，请刷新后重新操作');
    if (error.message.includes('invalid_point_amount')) throw new ApiError(400, '积分变化必须是 -1000 到 1000 之间的有效整数');
    if (error.message.includes('reason_required')) throw new ApiError(400, '请填写本次操作原因');
    if (error.message.includes('guest_card_already_drawn')) throw new ApiError(409, '宾客已经抽卡，不能直接修改组别或身份');
    if (error.message.includes('story_role_active_player_required')) throw new ApiError(409, '剧情职务只能分配给活跃任务玩家');
    if (error.message.includes('story_role_capacity_full')) throw new ApiError(409, '这个剧情职务的名额已经用完');
    if (error.message.includes('invalid_story_role')) throw new ApiError(400, '剧情职务无效');
    if (error.message.includes('invalid_alliance_clue')) throw new ApiError(400, '联盟线索标题或片段长度不正确');
    if (error.message.includes('point_total_unchanged')) throw new ApiError(409, '积分没有发生变化');
    if (error.message.includes('point_total_below_zero')) throw new ApiError(409, '扣分后个人积分不能低于 0；请减少扣分数值');
    if (error.message.includes('assignment_already_approved')) throw new ApiError(409, '该任务已经通过，不能重复加分');
    if (error.message.includes('verification_note_required')) throw new ApiError(400, '请填写核验记录');
    if (error.message.includes('award_winner_required')) throw new ApiError(400, '发布奖项前必须选择获奖宾客或队伍');
    if (error.message.includes('award_guest_inactive')) throw new ApiError(409, '停用或未参与本场的宾客不能设为获奖者，请重新选择');
    if (error.message.includes('award_not_found')) throw new ApiError(404, '找不到奖项');
    if (error.message.includes('task_rules_locked')) throw new ApiError(409, '任务已派发；积分、身份范围、类型和开放阶段已锁定，只能修改文字或停用');
    if (error.message.includes('task_not_found')) throw new ApiError(404, '找不到任务');
    if (error.message.includes('clue_not_found')) throw new ApiError(404, '找不到线索');
    if (error.message.includes('settled_clue_locked')) throw new ApiError(409, '这条线索已被本轮团队结算选中并发给宾客；终局前必须保持启用，只有彩排清场可以删除');
    if (error.message.includes('clue_target_not_spy')) throw new ApiError(400, '线索只能绑定到已预设为间谍的宾客');
    if (error.message.includes('clue_spy_still_referenced')) throw new ApiError(409, '这位间谍仍有绑定线索，请先调整对应线索后再更改身份');
    if (error.message.includes('clue_rules_locked')) throw new ApiError(409, '线索已经发放，对应间谍和等级已锁定；结算选中的线索还必须保持启用以便补发');
    if (error.message.includes('guest_login_conflict')) throw new ApiError(409, '这个登录名已经被其他宾客使用');
    if (error.message.includes('guest_login_locked')) throw new ApiError(409, '宾客已经设置密码，登录名已锁定；可修改显示姓名或先重置密码');
    if (error.message.includes('drawn_guest_cannot_deactivate')) throw new ApiError(409, '宾客已经抽卡，不能停用；请保留身份并由工作人员现场处理');
    if (error.message.includes('use_voting_controls')) throw new ApiError(409, '投票和身份揭晓必须使用专用按钮，不能从环节下拉框直接跳转');
    if (error.message.includes('voting_stage_not_ready')) throw new ApiError(409, '请先切换到团队挑战环节，再开启最终投票');
    if (error.message.includes('no_drawn_guests')) throw new ApiError(409, '尚无宾客完成抽卡，不能开启最终投票');
    if (error.message.includes('phase_two_team_draws_incomplete')) throw new ApiError(409, '20 位竞技组玩家尚未全部完成抽卡，不能结算团队积分');
    if (error.message.includes('phase_two_team_scores_missing')) throw new ApiError(409, '请先分别记录海岛组和沙漠组的最终成绩；即使某队是 0 分也需要明确记录');
    if (error.message.includes('phase_two_team_spy_missing')) throw new ApiError(409, '海岛组和沙漠组必须各有 1 名已抽卡的恶作剧者；请先完成全员抽卡或修正预设身份');
    if (error.message.includes('guiding_star_origin_invalid') || error.message.includes('lonely_cupid_origin_invalid')) throw new ApiError(409, '第二轮觉醒角色与第一轮爱心/星星结果不一致，本次没有写入部分任务；请核对第一轮配对记录');
    if (error.message.includes('phase_two_team_clues_missing')) throw new ApiError(409, '团队线索不足：正分第一名或并列第一名需要 2 条，其余队伍需要 1 条；若双方都是 0 分，则各需要 1 条。请先到婚礼设置补齐启用线索');
    if (error.message.includes('team_clue_settlement_stage_not_ready')) throw new ApiError(409, '请先切换到团队挑战，再结算团队积分与线索');
    if (error.message.includes('team_clues_not_settled')) throw new ApiError(409, '请先结算团队积分并自动发放排名线索，再开启投票或进行人工线索操作');
    if (error.message.includes('team_scores_already_settled')) throw new ApiError(409, '团队积分已经结算，不能继续调整；如需纠错请在结算前完成');
    if (error.message.includes('team_score_stage_closed')) throw new ApiError(409, '只有进入“婚宴互动 · 团队挑战”后才能记录团队积分');
    if (error.message.includes('invalid_clue_team')) throw new ApiError(400, '请选择海岛组或沙漠组作为线索适用队伍');
    if (error.message.includes('registration_during_finale')) throw new ApiError(409, '已进入终局，本轮婚礼不能重新开放注册；如需重新开始，请完成备份后使用受控彩排清场');
    throw new Error(`${fallback}: ${error.message}`);
  }
}

export async function getAdminDashboardData(actor: string) {
  const db = getSupabaseAdmin();
  // A signed upload issued before reset can land after both cleanup scans.
  // Reconcile first so this dashboard read durably records any old-run object
  // and closes registration. A temporary reconciliation failure must not hide
  // the rest of the control panel; it is returned as a blocking visible state.
  const { data: storageReconciliation, error: storageReconciliationError } = await db.rpc('reconcile_rehearsal_storage_backlog', {
    p_actor: actor,
  });
  const storageReconciliationUntracked = Boolean(
    storageReconciliation
    && typeof storageReconciliation === 'object'
    && 'untracked_without_reset' in storageReconciliation
    && storageReconciliation.untracked_without_reset,
  );
  const storageReconciliationFailed = Boolean(storageReconciliationError || storageReconciliationUntracked);
  const results = await Promise.all([
    db.from('guests').select('id,name,login_name,team,role,is_hidden_spy,points,claimed_at,drawn_at,special_card_revealed_at,team_locked,role_locked,table_label,is_elder,ceremony_eligible,active,staff_notes,participation_mode,relationship,story_role,uses_app,eligible_for_mission,eligible_for_secret_role,eligible_for_personal_score,phase_two_eligible,special_card_title,special_card_body,player_code,unlocked_role,avatar_path,avatar_uploaded_at,created_at').order('active', { ascending: false }).order('team').order('name'),
    db.from('assignments').select('id,guest_id,task_id,status,is_initial,completion_rank,early_bonus_points,reward_task_id,reward_clue_id,completion_note,verification_note,verified_by,verified_at,evidence_path,evidence_uploaded_at,submitted_at,approved_at,rejected_at,rejection_reason,cancelled_at,ceremony_status,ring_variant,replaced_by_assignment_id,replacement_for_assignment_id,created_at,guest:guests(id,name),task:tasks!assignments_task_id_fkey(id,title,description,verification_method,points,category,stage,mission_code)'),
    db.from('tasks').select('id,title,description,verification_method,points,role_scope,category,stage,active,is_demo,formal_allowed,story_role_scope,mission_code,mechanic,score_policy,assignment_mode,verification_type,max_assignments,grants_hidden_spy,created_at').eq('grants_hidden_spy', false).order('stage').order('title'),
    db.from('assignments').select('id,status,completion_note,evidence_path,evidence_uploaded_at,submitted_at,guest:guests(id,name),task:tasks!assignments_task_id_fkey(id,title,verification_method,points,mission_code)').eq('status', 'submitted'),
    db.from('votes').select('id,voter_guest_id,target_guest_id,voting_round,vote_weight,created_at,voter:guests!votes_voter_guest_id_fkey(id,name,team),target:guests!votes_target_guest_id_fkey(id,name,team)'),
    db.from('game_state').select('id,registration_open,stage,voting_open,voting_round,results_visible,results_published_at,scoreboard_visible,phase_note,display_title,display_body,public_clue,timer_ends_at,invitation_code_updated_at,task_catalog_mode,trickster_max_attempts,phase_one_completed_at,team_clues_settled_at,team_score_snapshot,rehearsal_run_id,updated_at').eq('id', 1).single(),
    db.from('clues').select('id,title,content,group_name,team_scope,active,spy_guest_id,level,created_at,spy:guests!clues_spy_guest_id_fkey(id,name,team)').order('team_scope').order('group_name').order('created_at'),
    db.from('guest_clues').select('id,guest_id,clue_id,created_at,guest:guests(id,name),clue:clues(id,title)').order('created_at', { ascending: false }).limit(50),
    db.from('points_ledger').select('id,guest_id,amount,reason,actor,created_at,guest:guests(id,name)').order('created_at', { ascending: false }),
    db.from('audit_log').select('id,actor,action,target_type,target_id,details,created_at').order('created_at', { ascending: false }).limit(50),
    db.from('team_points_ledger').select('id,team,amount,reason,actor,created_at').order('created_at', { ascending: false }).limit(100),
    db.from('awards').select('id,title,winner_guest_id,winner_team,reason,sort_order,published,updated_at,winner:guests(id,name,team)').order('sort_order').order('created_at'),
    db.from('result_rewards').select('id,voting_round,reward_type,guest_id,team,amount,details,created_at').order('created_at', { ascending: false }).limit(100),
    db.rpc('preview_rehearsal_reset'),
    db.from('heart_slots').select('heart_code,pair_key,side,guest_id,assigned_at,guest:guests(id,name)').order('heart_code'),
    db.from('player_relationships').select('id,relationship_type,status,player_a_confirmed,player_b_confirmed,activated_at,player_a:guests!player_relationships_player_a_id_fkey(id,name),player_b:guests!player_relationships_player_b_id_fkey(id,name)').order('created_at', { ascending: false }),
    db.from('symbol_pairing_assignments').select('guest_id,symbol,status,partner_guest_id,pending_relationship_id,finalized_at,updated_at,guest:guests!symbol_pairing_assignments_guest_id_fkey(id,name),partner:guests!symbol_pairing_assignments_partner_guest_id_fkey(id,name)').order('symbol').order('updated_at'),
    db.from('phase_two_profiles').select('guest_id,team,primary_mission,extra_vote,super_lucky,is_captain,interaction_theme,unlocked_at,updated_at').order('team').order('updated_at'),
    db.from('rehearsal_resets').select('event_key,evidence_paths,avatar_paths,created_at').order('created_at', { ascending: false }),
    db.from('audit_log').select('action,details,created_at')
      .in('action', ['rehearsal.reset', 'phase_two.team_clues_settle'])
      .order('created_at', { ascending: false }).limit(20),
  ]);
  const error = results.find((result) => result.error)?.error;
  if (error) throw new Error(`Unable to load admin data: ${error.message}`);
  const guests = await signAvatarPaths([...(results[0].data ?? [])].sort(compareWeddingGuests));
  const tasks = results[2].data ?? [];
  const clues = results[6].data ?? [];
  const game = results[5].data;
  const rawAssignments = results[1].data ?? [];
  const catalogAssignments = rawAssignments.filter((assignment) => (
    isTaskAllowedInCatalogMode(assignment.task, game?.task_catalog_mode)
  ));
  const catalogSubmissions = (results[3].data ?? []).filter((assignment) => (
    isTaskAllowedInCatalogMode(assignment.task, game?.task_catalog_mode)
  ));
  const settledTeamClueIds = settledClueIdsByTeam(results[19].data ?? []);
  const currentRoundVotes = (results[4].data ?? []).filter((vote) => vote.voting_round === (game?.voting_round ?? 0)).map((vote) => ({
    voter_guest_id: vote.voter_guest_id,
    target_guest_id: vote.target_guest_id,
    vote_weight: vote.vote_weight,
    voter: Array.isArray(vote.voter) ? vote.voter[0] ?? null : vote.voter,
  }));
  const rankingGuests = guests.filter((guest) => guest.active && guest.eligible_for_personal_score && hasJoinedPersonalRanking(guest)).map((guest) => ({
    id: guest.id, name: guest.name, team: guest.team, points: guest.points,
    countsForTeam: guest.participation_mode === 'ACTIVE_PLAYER' && ['海岛组', '沙漠组'].includes(guest.team),
  }));
  const tricksters = guests.filter((guest) => guest.active && guest.uses_app
    && guest.participation_mode === 'ACTIVE_PLAYER' && guest.phase_two_eligible
    && guest.drawn_at && guest.role === 'spy' && !guest.is_hidden_spy
    && ['海岛组', '沙漠组'].includes(guest.team));
  const undetectedTricksterIds = game?.results_visible ? findUndetectedTricksterIds(rankingGuests, currentRoundVotes, tricksters) : new Set<string>();
  const frozenTeamPoints = game?.team_score_snapshot && typeof game.team_score_snapshot === 'object'
    ? Object.entries(game.team_score_snapshot as Record<string, unknown>).map(([team, amount]) => ({ team, amount: Number(amount) || 0 }))
    : results[10].data ?? [];
  const rankingAssignments = catalogAssignments;
  const rankings = buildPublicScoreboard(rankingGuests, rankingAssignments, currentRoundVotes, frozenTeamPoints, {
    leaderLimit: game?.results_visible ? rankingGuests.length : 10,
    priorityGuestIds: undetectedTricksterIds,
  });
  const recordedPendingRehearsalCleanup = (results[18].data ?? []).find((record) =>
    (Array.isArray(record.evidence_paths) && record.evidence_paths.length > 0)
    || (Array.isArray(record.avatar_paths) && record.avatar_paths.length > 0));
  const latestReset = (results[18].data ?? [])[0];
  const currentRunId = typeof game?.rehearsal_run_id === 'string' ? game.rehearsal_run_id : '';
  const [evidenceStorage, avatarStorage] = await Promise.all([
    scanStorageBucket('task-evidence'),
    scanStorageBucket('guest-avatars'),
  ]);
  const staleEvidencePaths = evidenceStorage.failed || !currentRunId
    ? []
    : evidenceStorage.paths.filter((path) => !isCurrentRehearsalStoragePath('task-evidence', path, currentRunId));
  const staleAvatarPaths = avatarStorage.failed || !currentRunId
    ? []
    : avatarStorage.paths.filter((path) => !isCurrentRehearsalStoragePath('guest-avatars', path, currentRunId));
  // A signed URL from the old rehearsal can finish after the reset's final
  // Storage scan. Do not mutate data from this read route; surface that stale
  // namespace against the latest durable reset so the explicit retry action
  // can rescan and delete it while preserving current-run objects.
  const pendingRehearsalCleanup = recordedPendingRehearsalCleanup ?? (
    latestReset && (staleEvidencePaths.length > 0 || staleAvatarPaths.length > 0)
      ? {
        ...latestReset,
        evidence_paths: staleEvidencePaths,
        avatar_paths: staleAvatarPaths,
      }
      : null
  );
  const basePreflight = buildWeddingPreflight({
    guests: guests.map((guest) => ({ ...guest, is_hidden_spy: false })),
    tasks,
    hasGameState: Boolean(results[5].data),
    invitationCodeRotated: Boolean(results[5].data?.invitation_code_updated_at),
  });
  const storageSafetyBlocked = storageReconciliationFailed || Boolean(pendingRehearsalCleanup);
  const retiredApprovedAssignments = rawAssignments.filter((assignment) => (
    assignment.status === 'approved'
    && !isTaskAllowedInCatalogMode(assignment.task, game?.task_catalog_mode)
  ));
  const staleLiveRuntimeBlocked = game?.task_catalog_mode === 'live' && retiredApprovedAssignments.length > 0;
  const preflight = storageSafetyBlocked || staleLiveRuntimeBlocked ? {
    ...basePreflight,
    ready: false,
    blockedCount: basePreflight.blockedCount + Number(storageSafetyBlocked) + Number(staleLiveRuntimeBlocked),
    items: [
      ...basePreflight.items,
      ...(storageSafetyBlocked ? [{
        id: 'private-storage-cleanup',
        label: '彩排私密照片已彻底清理',
        detail: storageReconciliationFailed
          ? '暂时无法核对私密照片存储；注册保持关闭，请刷新后台重试'
          : '检测到旧彩排照片，请先点击“继续删除剩余私密照片”',
        status: 'blocked' as const,
      }] : []),
      ...(staleLiveRuntimeBlocked ? [{
        id: 'retired-live-task-runtime',
        label: '正式场次没有旧任务积分残留',
        detail: `检测到 ${retiredApprovedAssignments.length} 项已完成的旧任务仍保留积分历史；请在正式开放前执行彩排清场`,
        status: 'blocked' as const,
      }] : []),
    ],
  } : basePreflight;
  return {
    health: {
      database: 'online' as const,
      checkedAt: new Date().toISOString(),
      deploymentVersion: DEPLOYMENT_VERSION,
    },
    guests, assignments: await signEvidencePaths(catalogAssignments), tasks,
    submissions: await signEvidencePaths(catalogSubmissions),
    votes: (results[4].data ?? []).filter((vote) => vote.voting_round === (game?.voting_round ?? 0)),
    game,
    clues, guestClues: results[7].data ?? [], settledTeamClueIds,
    pointLedger: results[8].data ?? [], auditLog: results[9].data ?? [], teamPointLedger: results[10].data ?? [], awards: results[11].data ?? [],
    resultRewards: results[12].data ?? [],
    preflight,
    storageReconciliationFailed,
    rehearsalResetPreview: results[13].data ?? {},
    heartSlots: results[14].data ?? [],
    playerRelationships: results[15].data ?? [],
    symbolPairings: results[16].data ?? [],
    phaseTwoProfiles: results[17].data ?? [],
    pendingRehearsalCleanup: pendingRehearsalCleanup ? {
      eventKey: pendingRehearsalCleanup.event_key,
      evidenceCount: Array.isArray(pendingRehearsalCleanup.evidence_paths) ? pendingRehearsalCleanup.evidence_paths.length : 0,
      avatarCount: Array.isArray(pendingRehearsalCleanup.avatar_paths) ? pendingRehearsalCleanup.avatar_paths.length : 0,
      createdAt: pendingRehearsalCleanup.created_at,
    } : null,
    rankings: { personal: rankings.leaders, teams: rankings.teams },
    finale: {
      tricksters: game?.results_visible ? tricksters.map((guest) => ({ id: guest.id, name: guest.name, team: guest.team, escaped: undetectedTricksterIds.has(guest.id) })) : [],
      voteCounts: game?.results_visible ? rankings.voteCounts : [],
    },
  };
}

export async function getPrintableMissionCards() {
  const db = getSupabaseAdmin();
  const [
    { data: guests, error: guestError },
    { data: assignments, error: assignmentError },
    { data: game, error: gameError },
  ] = await Promise.all([
    db.from('guests').select('id,name,login_name,player_code,participation_mode,relationship,special_card_title,special_card_body').eq('active', true).eq('uses_app', true).order('name'),
    db.from('assignments').select('guest_id,status,created_at,task:tasks!assignments_task_id_fkey(title,description,verification_method,mission_code)').eq('is_initial', true).neq('status', 'cancelled').order('created_at', { ascending: false }),
    db.from('game_state').select('task_catalog_mode').eq('id', 1).single(),
  ]);
  if (guestError || assignmentError || gameError || !game) {
    throw new Error(`Unable to load printable cards: ${guestError?.message ?? assignmentError?.message ?? gameError?.message ?? 'missing game state'}`);
  }
  const taskByGuest = new Map<string, { title: string; description: string; verification_method: string }>();
  for (const assignment of assignments ?? []) {
    if (taskByGuest.has(assignment.guest_id) || !isTaskAllowedInCatalogMode(assignment.task, game.task_catalog_mode)) continue;
    const task = Array.isArray(assignment.task) ? assignment.task[0] : assignment.task;
    if (task) taskByGuest.set(assignment.guest_id, task);
  }
  return [...(guests ?? [])].sort(compareWeddingGuests).map((guest) => ({ ...guest, task: taskByGuest.get(guest.id) ?? null }));
}

export async function approveAssignment(assignmentId: string, actor: string, reason: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('approve_assignment_with_verification_for_run', {
    p_assignment_id: assignmentId, p_actor: actor, p_verification_note: reason,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to approve assignment');
}

export async function rejectAssignment(assignmentId: string, actor: string, reason: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('reject_assignment_for_run', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: reason,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to reject assignment');
}

export async function setGameFlag(field: 'voting_open' | 'results_visible' | 'scoreboard_visible', value: boolean, actor: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  if (field === 'results_visible' && value) {
    const { data: state, error: stateError } = await db.from('game_state').select('voting_open').eq('id', 1).single();
    ensureNoDatabaseError(stateError, 'Unable to verify finale voting state');
    if (state?.voting_open) throw new ApiError(409, '请先关闭本轮投票，再公布身份并结算终局奖励');
  }
  const { error } = await db.rpc('set_game_flag_for_run', {
    p_field: field, p_value: value, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to update game state');
}

export async function setRegistrationOpen(value: boolean, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('set_registration_open_for_run', {
    p_value: value, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to update registration state');
}

export async function setInvitationCode(code: string, actor: string) {
  const { error } = await getSupabaseAdmin().rpc('set_invitation_code', { p_code: code, p_actor: actor });
  ensureNoDatabaseError(error, 'Unable to rotate invitation code');
}

export async function setGuestPhaseNote(note: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('set_guest_phase_note_for_run', {
    p_note: note, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to update guest phase note');
}

export async function setGameStage(stage: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('set_game_stage_for_run', {
    p_stage: stage, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to update game stage');
}

export async function resetGuestClaim(guestId: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('reset_guest_claim_for_run', {
    p_guest_id: guestId, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to reset guest claim');
}

export async function completeAssignmentAtStation(assignmentId: string, actor: string, verificationNote: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('complete_assignment_at_station_for_run', {
    p_assignment_id: assignmentId, p_actor: actor, p_reason: verificationNote,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to complete assignment at station');
}

export async function saveAward(input: { id: string | null; title: string; winnerGuestId: string | null; winnerTeam: string | null; reason: string; sortOrder: number; published: boolean }, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('save_award_for_run', {
    p_award_id: input.id, p_title: input.title, p_winner_guest_id: input.winnerGuestId,
    p_winner_team: input.winnerTeam, p_reason: input.reason, p_sort_order: input.sortOrder,
    p_published: input.published, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to save award');
}

export async function adjustGuestPoints(guestId: string, amount: number, actor: string, reason: string, eventKey: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('adjust_staff_guest_points_for_run', {
    p_guest_id: guestId, p_amount: amount, p_actor: actor, p_reason: reason, p_event_key: eventKey,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to adjust guest points');
}

export async function adjustTeamPoints(team: string, amount: number, actor: string, reason: string, eventKey: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('adjust_staff_team_points_for_run', {
    p_team: team, p_amount: amount, p_actor: actor, p_reason: reason, p_event_key: eventKey,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to adjust team points');
}

export async function setLiveDisplay(title: string, body: string, publicClue: string, timerMinutes: number, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('set_live_display_for_run', {
    p_title: title, p_body: body, p_public_clue: publicClue, p_timer_minutes: timerMinutes, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to update live display');
}

export async function assignTaskToGuest(guestId: string, taskId: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('assign_task_to_guest_for_run', {
    p_guest_id: guestId, p_task_id: taskId, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to assign task');
}

export async function reassignTaskAssignment(assignmentId: string, taskId: string, actor: string, reason: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('reassign_task_assignment_for_run', {
    p_assignment_id: assignmentId, p_task_id: taskId, p_actor: actor, p_reason: reason,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to reassign task');
}

export async function updateCeremonyAssignment(assignmentId: string, ceremonyStatus: string, ringVariant: string | null, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('update_ceremony_assignment_for_run', {
    p_assignment_id: assignmentId, p_ceremony_status: ceremonyStatus, p_ring_variant: ringVariant, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to update ceremony assignment');
}

export async function resetRehearsalData(input: { confirmation: string; backupConfirmed: boolean; reason: string; eventKey: string }, actor: string, rehearsalRunId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc('reset_rehearsal_data_for_run', {
    p_confirmation: input.confirmation,
    p_backup_confirmed: input.backupConfirmed,
    p_reason: input.reason,
    p_event_key: input.eventKey,
    p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to reset rehearsal data');
  return { summary: data as Record<string, number | boolean>, ...(await cleanupRehearsalStorage(input.eventKey, actor)) };
}

const STORAGE_SCAN_SENTINEL = '__storage_scan_required__';

function isCurrentRehearsalStoragePath(bucket: 'task-evidence' | 'guest-avatars', path: string, runId: string) {
  const uuid = '[0-9a-f-]{36}';
  const escapedRunId = runId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = bucket === 'guest-avatars'
    ? new RegExp(`^${uuid}/${escapedRunId}\\.jpg$`, 'i')
    : new RegExp(`^${uuid}/${escapedRunId}/${uuid}\\.jpg$`, 'i');
  return pattern.test(path);
}

async function listAllStorageObjectPaths(bucket: string, prefix = '', depth = 0): Promise<string[]> {
  if (depth > 6) throw new Error(`Storage cleanup exceeded the supported folder depth for ${bucket}`);
  const storage = getSupabaseAdmin().storage.from(bucket);
  const paths: string[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`Unable to scan ${bucket}: ${error.message}`);
    const entries = (data ?? []) as Array<{ name: string; id?: string | null; metadata?: unknown }>;
    for (const entry of entries) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      const isFolder = !entry.id && (entry.metadata === null || entry.metadata === undefined);
      if (isFolder) paths.push(...await listAllStorageObjectPaths(bucket, path, depth + 1));
      else paths.push(path);
    }
    if (entries.length < pageSize) break;
  }
  return paths;
}

async function scanStorageBucket(bucket: string) {
  try {
    return { paths: await listAllStorageObjectPaths(bucket), failed: false };
  } catch {
    return { paths: [] as string[], failed: true };
  }
}

async function cleanupRehearsalStorage(eventKey: string, actor: string) {
  const db = getSupabaseAdmin();
  const { data: resetRecord, error: resetRecordError } = await db.from('rehearsal_resets').select('evidence_paths,avatar_paths').eq('event_key', eventKey).single();
  if (resetRecordError || !resetRecord) throw new ApiError(404, '找不到待继续的彩排照片清理记录');
  const { data: currentRun, error: currentRunError } = await db.from('game_state').select('rehearsal_run_id').eq('id', 1).single();
  if (currentRunError || !currentRun?.rehearsal_run_id) throw new ApiError(409, '无法确认当前婚礼运行批次，未删除任何私密照片');
  const currentRunId = currentRun.rehearsal_run_id;
  const storedEvidencePaths = Array.isArray(resetRecord.evidence_paths)
    ? resetRecord.evidence_paths.filter((path): path is string => typeof path === 'string')
    : [];
  const initialEvidenceScan = await scanStorageBucket('task-evidence');
  const evidencePaths: string[] = [...new Set([
    ...storedEvidencePaths.filter((path) => path !== STORAGE_SCAN_SENTINEL),
    ...initialEvidenceScan.paths,
  ])].filter((path) => !isCurrentRehearsalStoragePath('task-evidence', path, currentRunId));
  const storedAvatarPaths = Array.isArray(resetRecord.avatar_paths)
    ? resetRecord.avatar_paths.filter((path): path is string => typeof path === 'string')
    : [];
  const initialAvatarScan = await scanStorageBucket('guest-avatars');
  const avatarPaths: string[] = [...new Set([
    ...storedAvatarPaths.filter((path) => path !== STORAGE_SCAN_SENTINEL),
    ...initialAvatarScan.paths,
  ])].filter((path) => !isCurrentRehearsalStoragePath('guest-avatars', path, currentRunId));

  let removedEvidence = 0;
  let removedAvatars = 0;
  const failedEvidencePaths: string[] = [];
  for (let index = 0; index < evidencePaths.length; index += 100) {
    const batch = evidencePaths.slice(index, index + 100);
    const { error: cleanupError } = await db.storage.from('task-evidence').remove(batch);
    if (cleanupError) {
      failedEvidencePaths.push(...batch);
      await db.from('audit_log').insert({ actor, action: 'rehearsal.evidence_cleanup_pending', target_type: 'storage_bucket', target_id: 'task-evidence', details: { count: batch.length } });
    } else {
      removedEvidence += batch.length;
    }
  }
  const failedAvatarPaths: string[] = [];
  for (let index = 0; index < avatarPaths.length; index += 100) {
    const batch = avatarPaths.slice(index, index + 100);
    const { error: cleanupError } = await db.storage.from('guest-avatars').remove(batch);
    if (cleanupError) {
      failedAvatarPaths.push(...batch);
      await db.from('audit_log').insert({ actor, action: 'rehearsal.avatar_cleanup_pending', target_type: 'storage_bucket', target_id: 'guest-avatars', details: { count: batch.length } });
    } else {
      removedAvatars += batch.length;
    }
  }
  // Verify each private bucket after removal. This second pass catches objects
  // that were uploaded through an already-issued signed URL while the database
  // reset was running. Any survivor is persisted and keeps registration closed
  // until the operator retries this cleanup.
  const evidenceVerification = await scanStorageBucket('task-evidence');
  const avatarVerification = await scanStorageBucket('guest-avatars');
  const pendingEvidencePaths = [...new Set([
    ...failedEvidencePaths,
    ...evidenceVerification.paths.filter((path) => !isCurrentRehearsalStoragePath('task-evidence', path, currentRunId)),
    ...(initialEvidenceScan.failed || evidenceVerification.failed ? [STORAGE_SCAN_SENTINEL] : []),
  ])];
  const pendingAvatarPaths = [...new Set([
    ...failedAvatarPaths,
    ...avatarVerification.paths.filter((path) => !isCurrentRehearsalStoragePath('guest-avatars', path, currentRunId)),
    ...(initialAvatarScan.failed || avatarVerification.failed ? [STORAGE_SCAN_SENTINEL] : []),
  ])];
  const evidenceCleanupPending = pendingEvidencePaths.length > 0;
  const avatarCleanupPending = pendingAvatarPaths.length > 0;
  const { error: pendingUpdateError } = await db.from('rehearsal_resets').update({ evidence_paths: pendingEvidencePaths }).eq('event_key', eventKey);
  if (pendingUpdateError) throw new Error(`Unable to persist evidence cleanup state: ${pendingUpdateError.message}`);
  const { error: avatarPendingUpdateError } = await db.from('rehearsal_resets').update({ avatar_paths: pendingAvatarPaths }).eq('event_key', eventKey);
  if (avatarPendingUpdateError) throw new Error(`Unable to persist avatar cleanup state: ${avatarPendingUpdateError.message}`);
  if (!evidenceCleanupPending && !avatarCleanupPending) {
    await db.from('audit_log').insert({ actor, action: 'rehearsal.storage_cleanup_complete', target_type: 'rehearsal_reset', target_id: eventKey, details: { removed_evidence: removedEvidence, removed_avatars: removedAvatars } });
  }
  return { removedEvidence, removedAvatars, evidenceCleanupPending, avatarCleanupPending };
}

export async function retryRehearsalStorageCleanup(eventKey: string, actor: string) {
  return cleanupRehearsalStorage(eventKey, actor);
}

export async function grantClueToGuest(guestId: string, clueId: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('grant_guest_clue_for_run', {
    p_guest_id: guestId, p_clue_id: clueId, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to grant clue');
}

export async function deactivateGameClue(clueId: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('deactivate_game_clue_for_run', {
    p_clue_id: clueId, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to deactivate clue');
}

export async function configureGuestGameProfile(guestId: string, team: string, role: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('configure_guest_game_profile_for_run', {
    p_guest_id: guestId, p_team: team, p_role: role, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
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
}, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('configure_phase_two_profile_for_run', {
    p_guest_id: input.guestId,
    p_primary_mission: input.primaryMission,
    p_extra_vote: input.extraVote,
    p_super_lucky: input.superLucky,
    p_is_captain: input.isCaptain,
    p_interaction_theme: input.interactionTheme,
    p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to configure phase two profile');
}

export async function configureGuestStoryRole(guestId: string, storyRole: string, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('configure_guest_story_role_for_run', {
    p_guest_id: guestId, p_story_role: storyRole, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to configure guest story role');
}

export async function undoPlayerRelationship(relationshipId: string, actor: string, reason: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('undo_player_relationship_for_run', {
    p_relationship_id: relationshipId, p_actor: actor, p_reason: reason,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to undo player relationship');
}

export async function saveGuestRoster(input: { id: string | null; name: string; loginName: string; tableLabel: string; isElder: boolean; ceremonyEligible: boolean; active: boolean; staffNotes: string }, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('save_guest_roster_for_run', {
    p_guest_id: input.id, p_name: input.name, p_login_name: input.loginName,
    p_table_label: input.tableLabel, p_is_elder: input.isElder,
    p_ceremony_eligible: input.ceremonyEligible, p_active: input.active,
    p_staff_notes: input.staffNotes, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to save guest roster');
}

export async function importGuestRoster(rows: Array<{ name: string; loginName: string; tableLabel: string }>, actor: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('import_guest_roster_for_run', {
    p_rows: rows, p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
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
    p_grants_hidden_spy: false,
    p_actor: actor,
  });
  ensureNoDatabaseError(error, 'Unable to save task');
}

export async function saveGameClue(input: { id: string | null; title: string; content: string; groupName: string; teamScope: string }, actor: string, rehearsalRunId: string) {
  const { error } = await getSupabaseAdmin().rpc('save_game_clue_v3_for_run', {
    p_clue_id: input.id, p_title: input.title, p_content: input.content,
    p_group_name: input.groupName, p_team_scope: input.teamScope, p_actor: actor,
    p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to save clue');
}

export async function settleTeamChallengeClues(actor: string, rehearsalRunId: string) {
  const { data, error } = await getSupabaseAdmin().rpc('settle_phase_two_team_clues_for_run', {
    p_actor: actor, p_rehearsal_run_id: rehearsalRunId,
  });
  ensureNoDatabaseError(error, 'Unable to settle team challenge clues');
  return data;
}
