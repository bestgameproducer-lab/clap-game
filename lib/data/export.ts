import 'server-only';
import { buildCsv, type CsvCell } from '../csv';
import { getSupabaseAdmin } from '../supabase';

export type AdminExportKind = 'guests' | 'assignments' | 'points' | 'team-points' | 'spy-points' | 'team-resources' | 'awards' | 'audit';

export async function getAdminCsvExport(kind: AdminExportKind) {
  const db = getSupabaseAdmin();
  let headers: string[];
  let rows: CsvCell[][];

  if (kind === 'guests') {
    const { data, error } = await db.from('guests').select('name,login_name,table_label,is_elder,ceremony_eligible,active,staff_notes,team,role,points,claimed_at,drawn_at,created_at').order('team').order('name');
    if (error) throw new Error(`Unable to export guests: ${error.message}`);
    headers = ['姓名', '登录名', '桌号', '长辈', '适合仪式任务', '启用', '工作人员备注', '组别', '身份', '积分', '已设置密码时间', '抽卡时间', '创建时间'];
    rows = (data ?? []).map((item) => [item.name, item.login_name, item.table_label, item.is_elder, item.ceremony_eligible, item.active, item.staff_notes, item.team, item.role, item.points, item.claimed_at, item.drawn_at, item.created_at]);
  } else if (kind === 'assignments') {
    const { data, error } = await db.from('assignments').select('status,is_initial,completion_rank,early_bonus_points,completion_note,verification_note,verified_by,verified_at,evidence_path,evidence_uploaded_at,submitted_at,approved_at,rejected_at,rejection_reason,created_at,guest:guests(name),task:tasks(title,verification_method,points,category,stage)').order('created_at');
    if (error) throw new Error(`Unable to export assignments: ${error.message}`);
    headers = ['宾客', '任务', '验证方式', '宾客完成说明', '已附验证照片', '照片上传时间', '工作人员核验记录', '核验人员', '核验时间', '任务积分', '前三额外积分', '类型', '阶段', '是否首轮', '完成名次', '状态', '提交时间', '通过时间', '退回时间', '退回原因', '创建时间'];
    rows = (data ?? []).map((item) => {
      const guest = Array.isArray(item.guest) ? item.guest[0] : item.guest;
      const task = Array.isArray(item.task) ? item.task[0] : item.task;
      return [guest?.name, task?.title, task?.verification_method, item.completion_note, Boolean(item.evidence_path), item.evidence_uploaded_at, item.verification_note, item.verified_by, item.verified_at, task?.points, item.early_bonus_points, task?.category, task?.stage, item.is_initial, item.completion_rank, item.status, item.submitted_at, item.approved_at, item.rejected_at, item.rejection_reason, item.created_at];
    });
  } else if (kind === 'points') {
    const { data, error } = await db.from('points_ledger').select('amount,reason,actor,created_at,guest:guests(name)').order('created_at');
    if (error) throw new Error(`Unable to export points: ${error.message}`);
    headers = ['宾客', '积分变化', '原因', '操作人', '时间'];
    rows = (data ?? []).map((item) => {
      const guest = Array.isArray(item.guest) ? item.guest[0] : item.guest;
      return [guest?.name, item.amount, item.reason, item.actor, item.created_at];
    });
  } else if (kind === 'team-points') {
    const { data, error } = await db.from('team_points_ledger').select('team,amount,reason,actor,created_at').order('created_at');
    if (error) throw new Error(`Unable to export team points: ${error.message}`);
    headers = ['组别', '团队积分变化', '原因', '操作人', '时间'];
    rows = (data ?? []).map((item) => [item.team, item.amount, item.reason, item.actor, item.created_at]);
  } else if (kind === 'spy-points') {
    const { data, error } = await db.from('spy_points_ledger').select('amount,reason,note,actor,voting_round,created_at,guest:guests(name,team)').order('created_at');
    if (error) throw new Error(`Unable to export spy points: ${error.message}`);
    headers = ['间谍', '组别', '积分变化', '事件', '现场记录', '投票轮次', '操作人', '时间'];
    rows = (data ?? []).map((item) => {
      const guest = Array.isArray(item.guest) ? item.guest[0] : item.guest;
      return [guest?.name, guest?.team, item.amount, item.reason, item.note, item.voting_round, item.actor, item.created_at];
    });
  } else if (kind === 'team-resources') {
    const { data, error } = await db.from('team_resource_ledger').select('team,amount,balance_after,reason,actor,created_at').order('created_at');
    if (error) throw new Error(`Unable to export team resources: ${error.message}`);
    headers = ['组别', '金币变化', '变化后余额', '原因', '操作人', '时间'];
    rows = (data ?? []).map((item) => [item.team, item.amount, item.balance_after, item.reason, item.actor, item.created_at]);
  } else if (kind === 'awards') {
    const { data, error } = await db.from('awards').select('title,winner_team,reason,sort_order,published,updated_at,winner:guests(name)').order('sort_order').order('created_at');
    if (error) throw new Error(`Unable to export awards: ${error.message}`);
    headers = ['奖项', '获奖宾客', '获奖组别', '颁奖词', '排序', '已发布', '更新时间'];
    rows = (data ?? []).map((item) => {
      const winner = Array.isArray(item.winner) ? item.winner[0] : item.winner;
      return [item.title, winner?.name, item.winner_team, item.reason, item.sort_order, item.published, item.updated_at];
    });
  } else {
    const { data, error } = await db.from('audit_log').select('actor,action,target_type,target_id,details,created_at').order('created_at');
    if (error) throw new Error(`Unable to export audit log: ${error.message}`);
    headers = ['操作人', '动作', '对象类型', '对象 ID', '详情', '时间'];
    rows = (data ?? []).map((item) => [item.actor, item.action, item.target_type, item.target_id, JSON.stringify(item.details), item.created_at]);
  }

  return { filename: `wedding-${kind}.csv`, csv: buildCsv(headers, rows) };
}
