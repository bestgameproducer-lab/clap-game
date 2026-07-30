'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StaffLogoutButton } from '../staff-logout-button';
import { parseGuestRosterText } from '@/lib/guest-roster-import';
import { recommendedTaskPoints } from '@/lib/task-points';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const STAGES = [
  ['registration', '宾客报到'], ['waiting', '等待开场'], ['task_round_1', '第一轮任务'],
  ['task_round_2', '第二轮任务'], ['group_game', '团队挑战'], ['voting', '最终投票'], ['results', '身份揭晓'],
] as const;
const TEAMS = ['玫瑰组', '月桂组', '星辰组', '琥珀组'] as const;

const ROLE_LABELS: Record<string, string> = { guest: '祝福见证者', spy: '恶作剧者（间谍）', helper: '秘密信使' };
const PARTICIPATION_LABELS: Record<string, string> = { ACTIVE_PLAYER: '任务玩家', HONOR_GUEST: '荣誉宾客', PRINCIPAL: '新人专属' };
const STORY_ROLE_LABELS: Record<string, string> = { NONE: '', OFFICIANT: '誓词引导人', RING_KEEPER: '戒指守护者', GROOM_CHEERLEADER: '新郎应援者', BRIDE_CHEERLEADER: '新娘应援者', APPLAUSE_STARTER: '掌声发起者', HEART_HOLDER: '爱心持有者' };
const CATEGORY_LABELS: Record<string, string> = { standard: '普通任务', ceremony: '仪式任务', group: '团队任务', upgrade: '升级任务', hidden: '隐藏任务' };
const SPY_POINT_LABELS: Record<string, string> = { team_wrong_answer: '误导队伍答错', resource_wasted: '诱导浪费资源', ordinary_guest_suspected: '让普通宾客被怀疑', escaped_vote: '未成为本队最高票', team_first: '所在队伍第一', all_spy_tasks_complete: '完成全部间谍任务' };
const DEFAULT_VERIFICATION_METHOD = '向任务站工作人员说明完成过程；如任务涉及照片或合影，请出示对应照片。';
type AdminPanel = 'home' | 'live' | 'guests' | 'content' | 'review' | 'finale' | 'data';
const ADMIN_PANELS: Array<{ id: AdminPanel; label: string; shortLabel: string }> = [
  { id: 'home', label: '后台首页', shortLabel: '首页' },
  { id: 'live', label: '现场总控', shortLabel: '总控' },
  { id: 'guests', label: '宾客管理', shortLabel: '宾客' },
  { id: 'content', label: '任务与内容', shortLabel: '内容' },
  { id: 'review', label: '审核与积分', shortLabel: '审核' },
  { id: 'finale', label: '投票与揭晓', shortLabel: '终局' },
  { id: 'data', label: '数据与清场', shortLabel: '清场' },
];
const PRIMARY_ADMIN_PANELS = ADMIN_PANELS.filter((panel) => ['home', 'review', 'live', 'finale'].includes(panel.id));
const ACTION_LABELS: Record<string, string> = {
  'assignment.approve': '审核通过', 'assignment.reject': '退回任务', 'assignment.create': '派发任务',
  'guest.points_adjust': '调整积分', 'guest.profile_configure': '配置身份', 'guest.claim_reset': '重置密码',
  'clue.grant': '发放线索', 'clue.create': '创建线索', 'task.create': '创建任务',
  'clue.save': '保存线索', 'task.save': '保存任务', 'task.points_scale': '任务积分尺度校准',
  'guest.roster_save': '保存宾客资料',
  'guest.roster_import': '批量导入宾客',
  'assignment.early_bonus': '首轮前三额外奖励',
  'game_state.stage': '切换阶段', 'game_state.registration_open': '切换注册',
  'game_state.invitation_code_rotate': '更换邀请码',
  'game_state.phase_note': '更新宾客提示',
  'game_state.voting_open': '切换投票', 'game_state.results_visible': '切换揭晓',
  'game_state.scoreboard_visible': '切换大屏', 'game_state.live_display': '更新大屏内容',
  'team.points_adjust': '调整团队积分',
  'team.resources_adjust': '调整丘比特金币',
  'host_segment.save': '保存主持环节', 'host_segment.publish': '发布主持环节',
  'award.save': '保存颁奖结果',
  'hidden_task_code.issue': '生成隐藏任务卡', 'hidden_task_code.redeem': '兑换隐藏任务卡',
  'spy_points.record': '记录间谍积分', 'spy_points.settle': '结算间谍积分',
  'rehearsal.reset': '清空彩排运行数据', 'rehearsal.evidence_cleanup_pending': '验证照片待清理',
  'admin_session.create': '工作人员登录', 'admin_session.revoke': '工作人员安全退出',
};

type Guest = { id: string; name: string; login_name: string; team: string; role: string; is_hidden_spy: boolean; points: number; claimed_at: string | null; drawn_at: string | null; team_locked: boolean; role_locked: boolean; table_label: string; is_elder: boolean; ceremony_eligible: boolean; active: boolean; staff_notes: string; participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL'; relationship: string; story_role: string; uses_app: boolean; eligible_for_mission: boolean; eligible_for_secret_role: boolean; eligible_for_personal_score: boolean; special_card_title: string; special_card_body: string; player_code: string; unlocked_role: string };
type Task = { id: string; title: string; description: string; verification_method: string; points: number; role_scope: string; category: string; stage: string; active: boolean; grants_hidden_spy: boolean; is_demo: boolean; story_role_scope: string; mission_code: string | null; mechanic: string; score_policy: string };
type Clue = { id: string; title: string; content: string; active: boolean; spy_guest_id: string | null; level: number; spy?: { id: string; name: string; team: string } };
type HiddenTaskCode = { id: string; task_id: string; issued_by: string; issued_at: string; claimed_by: string | null; claimed_at: string | null; assignment_id: string | null; task?: { id: string; title: string; active: boolean }; guest?: { id: string; name: string } };
type AdminData = {
  guests: Guest[];
  assignments: Array<{ id: string; guest_id: string; status: string; rejection_reason: string | null; task?: Task }>;
  tasks: Task[];
  clues: Clue[];
  submissions: Array<{ id: string; completion_note: string; evidence_uploaded_at: string | null; evidence_url: string | null; guest?: { name: string }; task?: { title: string; verification_method: string; points: number } }>;
  votes: Array<{ id: string; voter?: { name: string; team: string }; target?: { name: string; team: string } }>;
  pointLedger: Array<{ id: string; amount: number; reason: string; actor: string; created_at: string; guest?: { name: string } }>;
  auditLog: Array<{ id: number; actor: string; action: string; target_type: string; details: Record<string, unknown>; created_at: string }>;
  awards: Array<{ id: string; title: string; winner_guest_id: string | null; winner_team: string | null; reason: string; sort_order: number; published: boolean; winner?: { id: string; name: string; team: string } }>;
  teamPointLedger: Array<{ id: number; team: string; amount: number; reason: string; actor: string; created_at: string }>;
  resultRewards: Array<{ id: number; voting_round: number; reward_type: 'guest_detective' | 'team_detective' | 'team_completion'; guest_id: string | null; team: string | null; amount: number }>;
  hiddenTaskCodes: HiddenTaskCode[];
  heartSlots: Array<{ heart_code: string; pair_key: string; side: string; guest_id: string | null; assigned_at: string | null; guest?: { id: string; name: string } }>;
  playerRelationships: Array<{ id: string; relationship_type: string; status: string; player_a_confirmed: boolean; player_b_confirmed: boolean; activated_at: string | null; player_a?: { id: string; name: string }; player_b?: { id: string; name: string } }>;
  allianceClues: Array<{ pair_key: 'A' | 'B'; title: string; left_fragment: string; right_fragment: string; active: boolean; updated_at: string }>;
  spyPointLedger: Array<{ id: number; guest_id: string; amount: number; reason: string; note: string; actor: string; voting_round: number | null; created_at: string; guest?: { id: string; name: string; team: string } }>;
  preflight: { ready: boolean; blockedCount: number; items: Array<{ id: string; label: string; detail: string; status: 'ready' | 'warning' | 'blocked' }> };
  rehearsalResetPreview: { claimed_guests: number; drawn_guests: number; assignments: number; evidence_files: number; votes: number; guest_clues: number; personal_ledger_entries: number; team_ledger_entries: number; spy_ledger_entries: number; resource_ledger_entries: number; registration_open: boolean; voting_open: boolean; scoreboard_visible: boolean };
  game: { registration_open: boolean; stage: string; voting_open: boolean; voting_round: number; results_visible: boolean; scoreboard_visible: boolean; phase_note: string | null; display_title: string | null; display_body: string | null; public_clue: string | null; timer_ends_at: string | null; invitation_code_updated_at: string | null; task_catalog_mode: 'demo' | 'live' } | null;
};

async function responseBody(response: Response) {
  try { return await response.json(); } catch { return {}; }
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [activePanel, setActivePanel] = useState<AdminPanel>('home');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedClueId, setSelectedClueId] = useState('');
  const [libraryTaskId, setLibraryTaskId] = useState('new');
  const [libraryClueId, setLibraryClueId] = useState('new');
  const [rosterGuestId, setRosterGuestId] = useState('new');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('guest');
  const [storyRole, setStoryRole] = useState('NONE');
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('');
  const [newTask, setNewTask] = useState({ title: '', description: '', verificationMethod: DEFAULT_VERIFICATION_METHOD, points: '1', roleScope: 'all', category: 'standard', stage: 'task_round_1', active: true, grantsHiddenSpy: false });
  const [newClue, setNewClue] = useState({ title: '', content: '', active: true, spyGuestId: '', level: '1' });
  const [teamScore, setTeamScore] = useState({ team: '玫瑰组', amount: '5', reason: '团队游戏第一名' });
  const [liveDisplay, setLiveDisplay] = useState({ title: '', body: '', publicClue: '', timerMinutes: '0' });
  const [selectedAwardId, setSelectedAwardId] = useState('');
  const [awardForm, setAwardForm] = useState({ title: '', winnerKind: 'none', winnerGuestId: '', winnerTeam: '玫瑰组', reason: '', sortOrder: '100', published: false });
  const [guestForm, setGuestForm] = useState({ name: '', loginName: '', tableLabel: '', isElder: false, ceremonyEligible: false, active: true, staffNotes: '' });
  const [generatedHiddenCode, setGeneratedHiddenCode] = useState<{ taskId: string; taskTitle: string; code: string } | null>(null);
  const [spyScoreForm, setSpyScoreForm] = useState({ guestId: '', reason: 'team_wrong_answer', note: '' });
  const [resetForm, setResetForm] = useState({ confirmation: '', backupConfirmed: false, reason: '婚礼正式开始前清空彩排记录' });
  const [resetEventKey, setResetEventKey] = useState('');
  const [resetCleanupPending, setResetCleanupPending] = useState(false);
  const [invitationCodeForm, setInvitationCodeForm] = useState({ code: '', confirm: '' });
  const [guestPhaseNote, setGuestPhaseNote] = useState('');
  const [rosterImportText, setRosterImportText] = useState('');
  const [rosterImportConfirmed, setRosterImportConfirmed] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [allianceForms, setAllianceForms] = useState<Record<string, { title: string; leftFragment: string; rightFragment: string; active: boolean }>>({});
  const loadRequestRef = useRef(0);

  async function load() {
    const requestId = ++loadRequestRef.current;
    try {
      const response = await fetch('/api/admin-data', { cache: 'no-store' });
      const body = await responseBody(response);
      if (requestId !== loadRequestRef.current) return;
      if (response.ok) { setData(body); setError(''); }
      else if (response.status !== 401) setError(body.error || '后台数据加载失败');
    } catch { if (requestId === loadRequestRef.current) setError('网络连接不稳定，请稍后重试。'); }
  }

  function openPanel(panel: AdminPanel) {
    setActivePanel(panel);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => { void load(); }, []);
  useLiveRefresh(load, undefined, Boolean(data));

  useEffect(() => {
    if (!data?.guests.length) return;
    const firstActiveGuest = data.guests.find((guest) => guest.active);
    if ((!selectedGuestId || !data.guests.some((guest) => guest.id === selectedGuestId && guest.active)) && firstActiveGuest) setSelectedGuestId(firstActiveGuest.id);
    const firstActiveTask = data.tasks.find((task) => task.active && task.story_role_scope === 'NONE' && (data.game?.task_catalog_mode === 'demo' ? task.is_demo : !task.is_demo));
    const firstActiveClue = data.clues.find((clue) => clue.active);
    if ((!selectedTaskId || !data.tasks.some((task) => task.id === selectedTaskId && task.active && task.story_role_scope === 'NONE' && (data.game?.task_catalog_mode === 'demo' ? task.is_demo : !task.is_demo))) && firstActiveTask) setSelectedTaskId(firstActiveTask.id);
    if ((!selectedClueId || !data.clues.some((clue) => clue.id === selectedClueId && clue.active)) && firstActiveClue) setSelectedClueId(firstActiveClue.id);
    if (!selectedAwardId && data.awards[0]) setSelectedAwardId(data.awards[0].id);
  }, [data, selectedGuestId, selectedTaskId, selectedClueId, selectedAwardId]);

  const libraryTask = data?.tasks.find((item) => item.id === libraryTaskId);
  const libraryClue = data?.clues.find((item) => item.id === libraryClueId);
  const rosterGuestRecord = data?.guests.find((item) => item.id === rosterGuestId);
  const selectedGuest = data?.guests.find((guest) => guest.id === selectedGuestId) ?? null;
  const selectedAward = data?.awards.find((item) => item.id === selectedAwardId);
  const libraryTaskSignature = JSON.stringify(libraryTask ?? null);
  const libraryClueSignature = JSON.stringify(libraryClue ?? null);
  const rosterGuestSignature = JSON.stringify(rosterGuestRecord ?? null);
  const selectedGuestProfileSignature = selectedGuest ? `${selectedGuest.id}|${selectedGuest.team}|${selectedGuest.role}|${selectedGuest.story_role}` : '';
  const selectedAwardSignature = JSON.stringify(selectedAward ?? null);
  const allianceCluesSignature = JSON.stringify(data?.allianceClues ?? null);

  useEffect(() => {
    if (libraryTaskId === 'new') { setNewTask({ title: '', description: '', verificationMethod: DEFAULT_VERIFICATION_METHOD, points: '1', roleScope: 'all', category: 'standard', stage: 'task_round_1', active: true, grantsHiddenSpy: false }); return; }
    if (libraryTask) setNewTask({ title: libraryTask.title, description: libraryTask.description, verificationMethod: libraryTask.verification_method, points: String(libraryTask.points), roleScope: libraryTask.role_scope, category: libraryTask.category, stage: libraryTask.stage, active: libraryTask.active, grantsHiddenSpy: libraryTask.grants_hidden_spy });
  }, [libraryTaskId, libraryTaskSignature]);

  useEffect(() => {
    if (libraryClueId === 'new') { setNewClue({ title: '', content: '', active: true, spyGuestId: '', level: '1' }); return; }
    if (libraryClue) setNewClue({ title: libraryClue.title, content: libraryClue.content, active: libraryClue.active, spyGuestId: libraryClue.spy_guest_id || '', level: String(libraryClue.level) });
  }, [libraryClueId, libraryClueSignature]);

  useEffect(() => {
    if (rosterGuestId === 'new') { setGuestForm({ name: '', loginName: '', tableLabel: '', isElder: false, ceremonyEligible: false, active: true, staffNotes: '' }); return; }
    if (rosterGuestRecord) setGuestForm({ name: rosterGuestRecord.name, loginName: rosterGuestRecord.login_name, tableLabel: rosterGuestRecord.table_label, isElder: rosterGuestRecord.is_elder, ceremonyEligible: rosterGuestRecord.ceremony_eligible, active: rosterGuestRecord.active, staffNotes: rosterGuestRecord.staff_notes });
  }, [rosterGuestId, rosterGuestSignature]);

  const rosterImportPreview = useMemo(
    () => parseGuestRosterText(rosterImportText, data?.guests.map((guest) => guest.login_name) ?? []),
    [rosterImportText, data?.guests],
  );

  useEffect(() => {
    if (!selectedGuest) return;
    setTeam(selectedGuest.team);
    setRole(selectedGuest.role);
    setStoryRole(selectedGuest.story_role);
  }, [selectedGuestProfileSignature]);

  useEffect(() => {
    if (!data?.allianceClues) return;
    setAllianceForms(Object.fromEntries(data.allianceClues.map((clue) => [clue.pair_key, {
      title: clue.title, leftFragment: clue.left_fragment,
      rightFragment: clue.right_fragment, active: clue.active,
    }])));
  }, [allianceCluesSignature]);

  useEffect(() => {
    if (!data?.game) return;
    setLiveDisplay({ title: data.game.display_title || '', body: data.game.display_body || '', publicClue: data.game.public_clue || '', timerMinutes: '0' });
    setGuestPhaseNote(data.game.phase_note || '');
  }, [data?.game?.display_title, data?.game?.display_body, data?.game?.public_clue, data?.game?.phase_note]);

  useEffect(() => {
    if (!selectedAward) return;
    setAwardForm({ title: selectedAward.title, winnerKind: selectedAward.winner_guest_id ? 'guest' : selectedAward.winner_team ? 'team' : 'none', winnerGuestId: selectedAward.winner_guest_id || '', winnerTeam: selectedAward.winner_team || '玫瑰组', reason: selectedAward.reason, sortOrder: String(selectedAward.sort_order), published: selectedAward.published });
  }, [selectedAwardId, selectedAwardSignature]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '登录失败');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败'); }
    finally { setBusy(false); }
  }

  async function action(body: Record<string, unknown>, success = '操作已保存') {
    setError(''); setMessage(''); setGeneratedHiddenCode(null); setBusy(true);
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success);
      await load();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); return false; }
    finally { setBusy(false); }
  }

  async function approveSubmission(submission: AdminData['submissions'][number]) {
    const verificationNote = (reviewNotes[submission.id]?.trim()
      || `已按任务要求核验：${submission.task?.verification_method || '主办方现场确认'}`).slice(0, 500);
    const approved = await action(
      { type: 'approve', assignmentId: submission.id, verificationNote },
      `${submission.guest?.name || '宾客'}的任务已通过，积分已到账`,
    );
    if (approved) setReviewNotes((current) => {
      const next = { ...current };
      delete next[submission.id];
      return next;
    });
  }

  async function rejectSubmission(submission: AdminData['submissions'][number]) {
    const reason = reviewNotes[submission.id]?.trim();
    if (!reason) {
      setError('退回任务前，请在该任务下填写退回原因。');
      return;
    }
    const rejected = await action(
      { type: 'reject', assignmentId: submission.id, reason },
      `${submission.guest?.name || '宾客'}的任务已退回`,
    );
    if (rejected) setReviewNotes((current) => {
      const next = { ...current };
      delete next[submission.id];
      return next;
    });
  }

  function changeStage(stage: string) {
    if (!data?.game || stage === data.game.stage || ['voting', 'results'].includes(stage)) return;
    if (!window.confirm('切换婚礼环节会关闭当前投票、隐藏揭晓，并清空大屏上的上一题、公开线索和倒计时；已经结算的积分不会撤销。确认继续吗？')) return;
    void action({ type: 'setStage', stage }, '游戏阶段已切换，大屏旧内容已清空');
  }

  function toggleVoting() {
    const opening = !data?.game?.voting_open;
    if (opening && !window.confirm('开启一轮新的最终投票？系统会关闭宾客注册、清空大屏旧题目；宾客每人本轮只能投一次，旧轮次会保留。')) return;
    void action({ type: 'toggleVoting', value: opening }, opening ? '新一轮最终投票已开启，宾客注册已关闭' : '最终投票已关闭');
  }

  function toggleResults() {
    const publishing = !data?.game?.results_visible;
    const prompt = publishing
      ? `确认公布身份并结算终局奖励？当前收到 ${data?.votes.length ?? 0} 票。系统会关闭投票并自动发放全部终局奖励。`
      : '确认暂时隐藏公开身份？已经结算的个人、团队和间谍积分不会撤销；如需重新投票，必须开启一个新轮次。';
    if (!window.confirm(prompt)) return;
    void action({ type: 'toggleResults', value: publishing }, publishing ? '身份已公布，全部终局奖励已结算' : '公开身份已隐藏，已结算积分保持不变');
  }

  async function issueCode(task: Task, replacing: boolean) {
    if (replacing && !window.confirm(`重新生成“${task.title}”的代码？之前打印或抄写的代码会立即失效。`)) return;
    setError(''); setMessage(''); setBusy(true); setGeneratedHiddenCode(null);
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'issueHiddenTaskCode', taskId: task.id }) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '生成隐藏任务码失败');
      if (typeof result.code !== 'string') throw new Error('服务器没有返回隐藏任务码');
      setGeneratedHiddenCode({ taskId: task.id, taskTitle: task.title, code: result.code });
      setMessage('隐藏任务码已生成；离开本页后无法再次查看，请立即写入对应实体卡。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '生成隐藏任务码失败'); }
    finally { setBusy(false); }
  }

  async function resetRehearsal(event: React.FormEvent) {
    event.preventDefault();
    if (!window.confirm('最后确认：这会退出全部宾客、清除抽卡、任务进度、投票、积分和竞拍记录。配置内容会保留。是否继续？')) return;
    const eventKey = resetEventKey || crypto.randomUUID();
    setResetEventKey(eventKey); setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'resetRehearsal', ...resetForm, eventKey }) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '彩排清场失败');
      setResetCleanupPending(Boolean(result.evidenceCleanupPending));
      setMessage(result.evidenceCleanupPending ? '运行数据已清空，但部分验证照片仍待删除；请保持当前确认内容并点击“重试照片清理”。' : `彩排数据已安全清空${result.removedEvidence ? `，并删除 ${result.removedEvidence} 张验证照片` : ''}。`);
      if (!result.evidenceCleanupPending) {
        setResetForm({ confirmation: '', backupConfirmed: false, reason: '婚礼正式开始前清空彩排记录' });
        setResetEventKey('');
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '彩排清场失败'); }
    finally { setBusy(false); }
  }

  async function rotateInvitationCode(event: React.FormEvent) {
    event.preventDefault();
    const code = invitationCodeForm.code.trim().toUpperCase();
    if (code !== invitationCodeForm.confirm.trim().toUpperCase()) { setError('两次输入的邀请码不一致'); return; }
    if (!window.confirm('确认更换共享邀请码？已登录宾客不会退出，但之后重新登录必须使用新邀请码；旧二维码网址仍然有效。')) return;
    const ok = await action({ type: 'rotateInvitationCode', code }, '共享邀请码已安全更新，请立即同步到请柬和现场提示牌');
    if (ok) setInvitationCodeForm({ code: '', confirm: '' });
  }

  async function importRoster(event: React.FormEvent) {
    event.preventDefault();
    if (!data?.game || data.game.registration_open || rosterImportPreview.issues.length || !rosterImportPreview.rows.length || !rosterImportConfirmed) return;
    if (!window.confirm(`确认新增 ${rosterImportPreview.rows.length} 位宾客？批量导入不会覆盖现有宾客。`)) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'importGuestRoster', rows: rosterImportPreview.rows }) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '批量导入失败');
      setRosterImportText(''); setRosterImportConfirmed(false);
      setMessage(`已新增 ${Number(result.importedCount) || rosterImportPreview.rows.length} 位宾客`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '批量导入失败'); }
    finally { setBusy(false); }
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">ORGANIZER ONLY</div><div className="heart-mark">♡</div><h1>主办方<br/>控制台</h1><p className="lead">管理婚礼流程、审核任务与揭晓结果。</p><form onSubmit={login}><label htmlFor="admin-password">管理员密码</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/><p className="login-note">连续输错五次后，该设备暂停登录十五分钟。</p><button disabled={busy}>{busy ? '登录中…' : '进入控制台'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  const activeGuests = data.guests.filter((guest) => guest.active);
  const activeCatalogTasks = data.tasks.filter((task) => task.active && task.story_role_scope === 'NONE' && (data.game?.task_catalog_mode === 'demo' ? task.is_demo : !task.is_demo));
  const claimed = activeGuests.filter((guest) => guest.claimed_at).length;
  const drawn = activeGuests.filter((guest) => guest.drawn_at).length;
  const rosterGuest = data.guests.find((guest) => guest.id === rosterGuestId) ?? null;
  const votesByTarget = Object.entries(data.votes.reduce<Record<string, number>>((counts, vote) => {
    const name = vote.target?.name || '未知'; counts[name] = (counts[name] || 0) + 1; return counts;
  }, {})).sort((a, b) => b[1] - a[1]);
  const settledPersonalPoints = data.resultRewards.filter((reward) => reward.reward_type === 'guest_detective').reduce((sum, reward) => sum + reward.amount, 0);
  const settledTeamPoints = data.resultRewards.filter((reward) => reward.reward_type !== 'guest_detective').reduce((sum, reward) => sum + reward.amount, 0);
  const activeHiddenTasks = data.tasks.filter((task) => task.active && task.category === 'hidden');
  const issuedHiddenTaskIds = new Set(data.hiddenTaskCodes.map((code) => code.task_id));
  const readyHiddenTaskCards = activeHiddenTasks.filter((task) => issuedHiddenTaskIds.has(task.id)).length;
  const spyGuests = data.guests.filter((guest) => guest.active && guest.role === 'spy');
  const drawnSpyGuests = spyGuests.filter((guest) => guest.drawn_at);
  const spyScoreTotals = drawnSpyGuests.map((guest) => ({ guest, points: data.spyPointLedger.filter((entry) => entry.guest_id === guest.id).reduce((sum, entry) => sum + entry.amount, 0) }));
  const teamTotals = TEAMS.map((teamName) => ({ team: teamName, points: data.teamPointLedger.filter((entry) => entry.team === teamName).reduce((sum, entry) => sum + entry.amount, 0) }));
  const finaleActive = Boolean(data.game?.voting_open || data.game?.results_visible || ['voting', 'results'].includes(data.game?.stage || ''));
  const resetControlsClosed = !data.game?.registration_open && !data.game?.voting_open && !data.game?.scoreboard_visible;
  const resetPreview = data.rehearsalResetPreview;
  const rehearsalDataCount = resetPreview.claimed_guests + resetPreview.drawn_guests + resetPreview.assignments + resetPreview.votes
    + resetPreview.guest_clues + resetPreview.personal_ledger_entries + resetPreview.team_ledger_entries
    + resetPreview.spy_ledger_entries + resetPreview.resource_ledger_entries;

  return <main className="admin-shell">
    <section className="admin-hero"><div><div className="eyebrow">LIVE CONTROL</div><h1>婚礼游戏控制台</h1><p>{claimed}/{data.guests.length} 位宾客已认领 · {data.submissions.length} 项待审核</p></div><div className="admin-hero-actions"><a href="/station">任务站</a><a href="/host">主持人流程台</a><StaffLogoutButton/><div className="live-dot">LIVE</div></div></section>
    {message && <div className="notice success sticky-notice">{message}</div>}{error && <div className="notice error sticky-notice">{error}</div>}

    <nav className="admin-panel-tabs" aria-label="主办方后台功能入口">{PRIMARY_ADMIN_PANELS.map((panel) => <button type="button" key={panel.id} className={activePanel === panel.id ? 'active' : ''} aria-current={activePanel === panel.id ? 'page' : undefined} onClick={() => openPanel(panel.id)}><span>{panel.shortLabel}</span></button>)}</nav>

    {activePanel === 'home' && <section className="admin-launchpad" aria-labelledby="admin-launchpad-title">
      <div className="launchpad-heading"><div><small>CONTROL CENTER</small><h2 id="admin-launchpad-title">今天要管理什么？</h2></div><p>每次只进入一个模块，避免在手机上反复长距离滚动。</p></div>
      <div className="launchpad-grid launchpad-primary">
        <button type="button" onClick={() => openPanel('review')}><span className="launchpad-index">01</span><strong>待审核任务</strong><small>现场确认完成情况并自动加分</small><b className={data.submissions.length ? 'needs-attention' : ''}>{data.submissions.length} 项待处理 →</b></button>
        <button type="button" onClick={() => openPanel('live')}><span className="launchpad-index">02</span><strong>现场流程</strong><small>切换阶段、开放注册与控制大屏</small><b>{STAGES.find(([value]) => value === data.game?.stage)?.[1] || '未设置'} →</b></button>
        <button type="button" onClick={() => openPanel('guests')}><span className="launchpad-index">03</span><strong>宾客状态</strong><small>查看认领进度或重置宾客密码</small><b>{claimed}/{activeGuests.length} 已认领 →</b></button>
        <button type="button" onClick={() => openPanel('finale')}><span className="launchpad-index">04</span><strong>投票与揭晓</strong><small>票数、积分流水与颁奖结果</small><b>{data.votes.length} 票已提交 →</b></button>
      </div>
      <details className="admin-advanced-tools admin-setup-links"><summary>婚礼设置与数据管理</summary><div className="launchpad-grid"><button type="button" onClick={() => openPanel('content')}><span className="launchpad-index">A</span><strong>任务与线索设置</strong><small>婚礼开始前配置内容</small><b>{data.game?.task_catalog_mode === 'demo' ? `${activeCatalogTasks.length} 项演示任务` : `${activeCatalogTasks.length} 项正式任务`} →</b></button><button type="button" className="launchpad-danger" onClick={() => openPanel('data')}><span className="launchpad-index">B</span><strong>备份与清场</strong><small>导出数据或清空彩排记录</small><b className={rehearsalDataCount ? 'needs-attention' : ''}>{rehearsalDataCount ? `${rehearsalDataCount} 条运行记录` : '当前已清场'} →</b></button></div></details>
    </section>}

    {activePanel === 'home' && <details className="admin-advanced-tools readiness-details"><summary>开场前就绪检查 · {data.preflight.ready ? '可以开场' : `${data.preflight.blockedCount} 项待处理`}</summary><section className="section-card readiness-card">
      <div className="section-heading"><div><small>PRE-FLIGHT CHECK</small><h2>开场前就绪检查</h2></div><span className={data.preflight.ready ? 'ready-badge' : 'warning-badge'}>{data.preflight.ready ? '可以开场' : `${data.preflight.blockedCount} 项待处理`}</span></div>
      <div className="readiness-list">{data.preflight.items.map((item) => <div key={item.id} className={item.status === 'ready' ? 'ready' : 'not-ready'}><b aria-hidden="true">{item.status === 'ready' ? '✓' : '!'}</b><p><strong>{item.label}</strong><small>{item.detail}</small></p></div>)}</div>
      {!data.preflight.ready && <p className="readiness-help">带感叹号的项目会影响完整流程，请在开放注册前处理。主持题目必须替换为真实答案，并确认每位间谍已有专属线索。</p>}
    </section></details>}

    {activePanel === 'live' && <>
    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>REGISTRATION</small><h2>宾客注册</h2></div><span className={data.game?.invitation_code_updated_at ? 'ready-badge' : 'warning-badge'}>{data.game?.invitation_code_updated_at ? '邀请码已设置' : '请更换示例码'}</span></div><p className="muted">首次进入由宾客自行设置四位密码，忘记后可在宾客列表中重置。开启最终投票时注册会自动关闭。</p><button disabled={busy || (!data.game?.registration_open && finaleActive)} onClick={() => action({ type: 'toggleRegistration', value: !data.game?.registration_open })}>{data.game?.registration_open ? '关闭注册' : finaleActive ? '终局期间不可开放' : '开放注册'}</button><div className={`control-state ${data.game?.registration_open ? 'on' : ''}`}>{data.game?.registration_open ? '● 注册开放中' : finaleActive ? '○ 注册已关闭 · 先切回常规环节才能开放' : '○ 注册已关闭'}</div><form onSubmit={rotateInvitationCode}><h3>更换共享邀请码</h3><p className="field-help">使用 6–32 位英文字母、数字或连字符。系统只保存哈希，保存后不会再次显示原码。</p><label htmlFor="invitation-code-new">新邀请码</label><input id="invitation-code-new" value={invitationCodeForm.code} onChange={(event) => setInvitationCodeForm({ ...invitationCodeForm, code: event.target.value.toUpperCase() })} minLength={6} maxLength={32} pattern="[A-Z0-9-]{6,32}" autoCapitalize="characters" autoComplete="off" required/><label htmlFor="invitation-code-confirm">再次输入</label><input id="invitation-code-confirm" value={invitationCodeForm.confirm} onChange={(event) => setInvitationCodeForm({ ...invitationCodeForm, confirm: event.target.value.toUpperCase() })} minLength={6} maxLength={32} pattern="[A-Z0-9-]{6,32}" autoCapitalize="characters" autoComplete="off" required/><button disabled={busy || invitationCodeForm.code.length < 6 || invitationCodeForm.code !== invitationCodeForm.confirm}>保存并替换旧邀请码</button></form></article>
      <article className="section-card">
        <div className="section-heading"><div><small>GAME STAGE</small><h2>当前流程</h2></div></div>
        <label htmlFor="game-stage">切换婚礼环节</label>
        <select id="game-stage" value={data.game?.stage || 'registration'} disabled={busy} onChange={(event) => changeStage(event.target.value)}>{STAGES.map(([value, label]) => <option value={value} key={value} disabled={['voting', 'results'].includes(value)}>{label}{['voting', 'results'].includes(value) ? '（由下方按钮控制）' : ''}</option>)}</select>
        <p className="field-help">手动切换会清空上一题和倒计时；投票与揭晓必须使用下方专用按钮，确保轮次和积分结算完整。</p>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'setGuestPhaseNote', note: guestPhaseNote }, guestPhaseNote.trim() ? '宾客端环节提示已更新' : '宾客端环节提示已清空'); }}><label htmlFor="guest-phase-note">宾客手机上的当前提示</label><textarea id="guest-phase-note" value={guestPhaseNote} onChange={(event) => setGuestPhaseNote(event.target.value)} maxLength={500} placeholder="例如：第一轮任务延长五分钟，请完成后前往任务站核验。"/><div className="form-grid"><button disabled={busy}>发布宾客提示</button><button type="button" className="secondary" disabled={busy || !data.game?.phase_note} onClick={() => { void action({ type: 'setGuestPhaseNote', note: '' }, '宾客端环节提示已清空').then((ok) => { if (ok) setGuestPhaseNote(''); }); }}>清空提示</button></div></form>
        <div className="control-buttons">
          <button disabled={busy} onClick={toggleVoting}>{data.game?.voting_open ? '关闭投票' : '开启新投票'}</button>
          <button disabled={busy} className="secondary" onClick={toggleResults}>{data.game?.results_visible ? '隐藏揭晓' : '公布并结算'}</button>
          <button disabled={busy} className="secondary" onClick={() => action({ type: 'toggleScoreboard', value: !data.game?.scoreboard_visible })}>{data.game?.scoreboard_visible ? '关闭大屏' : '开放大屏'}</button>
        </div>
        <div className={`control-state ${data.game?.voting_open ? 'on' : ''}`}>{data.game?.results_visible ? `● 第 ${data.game.voting_round} 轮已公布并锁定` : data.game?.voting_open ? `● 第 ${data.game.voting_round} 轮投票中 · ${data.votes.length}/${drawn} 人已投` : data.game?.stage === 'voting' ? `○ 第 ${data.game.voting_round} 轮投票已关闭` : '○ 投票未开放'}</div>
      </article>
    </section>

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>HOST DISPLAY</small><h2>主持人与大屏内容</h2></div><a className="text-link" href="/scoreboard" target="_blank" rel="noreferrer">打开大屏 ↗</a></div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'setLiveDisplay', title: liveDisplay.title, body: liveDisplay.body, publicClue: liveDisplay.publicClue, timerMinutes: Number(liveDisplay.timerMinutes) }, '大屏内容已更新'); }}><label htmlFor="display-title">当前题目或环节标题</label><input id="display-title" value={liveDisplay.title} onChange={(event) => setLiveDisplay({ ...liveDisplay, title: event.target.value })} maxLength={120} placeholder="例如：爱情档案解密 · 第一题"/><label htmlFor="display-body">公开规则或题目</label><textarea id="display-body" value={liveDisplay.body} onChange={(event) => setLiveDisplay({ ...liveDisplay, body: event.target.value })} maxLength={1000} placeholder="这里只填写可以公开展示的内容，不要填写正确答案。"/><label htmlFor="public-clue">公开线索</label><input id="public-clue" value={liveDisplay.publicClue} onChange={(event) => setLiveDisplay({ ...liveDisplay, publicClue: event.target.value })} maxLength={500} placeholder="留空则不显示"/><label htmlFor="timer-minutes">重新开始倒计时（分钟，0 表示关闭）</label><input id="timer-minutes" type="number" min={0} max={120} value={liveDisplay.timerMinutes} onChange={(event) => setLiveDisplay({ ...liveDisplay, timerMinutes: event.target.value })}/><button disabled={busy}>发布到大屏</button></form></article>
      <article className="section-card"><div className="section-heading"><div><small>TEAM GAME SCORE</small><h2>团队游戏计分</h2></div></div><div className="team-total-list">{teamTotals.map((item) => <div key={item.team}><strong>{item.team}</strong><span>{item.points > 0 ? '+' : ''}{item.points} 团队分</span></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'adjustTeamPoints', team: teamScore.team, amount: Number(teamScore.amount), reason: teamScore.reason }, '团队积分已记录'); }}><label htmlFor="score-team">组别</label><select id="score-team" value={teamScore.team} onChange={(event) => setTeamScore({ ...teamScore, team: event.target.value })}>{TEAMS.map((teamName) => <option key={teamName}>{teamName}</option>)}</select><div className="form-grid"><div><label htmlFor="score-amount">分数变化</label><input id="score-amount" type="number" min={-1000} max={1000} value={teamScore.amount} onChange={(event) => setTeamScore({ ...teamScore, amount: event.target.value })} required/></div><div><label htmlFor="score-reason">原因</label><input id="score-reason" value={teamScore.reason} onChange={(event) => setTeamScore({ ...teamScore, reason: event.target.value })} maxLength={200} required/></div></div><div className="score-presets"><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '5', reason: '团队游戏第一名' })}>第一名 +5</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '3', reason: '团队游戏第二名' })}>第二名 +3</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '1', reason: '团队游戏参与分' })}>第三名 +1</button></div><button disabled={busy || !teamScore.amount || !teamScore.reason.trim()}>记录团队积分</button></form></article>
    </section>
    </>}

    {activePanel === 'review' && <><section className="section-card"><div className="section-heading"><div><small>APPROVAL QUEUE</small><h2>待审核任务</h2></div><span>{data.submissions.length}</span></div>{data.submissions.length === 0 ? <div className="empty-state">暂无待审核提交。</div> : data.submissions.map((submission) => <article className="approval-row" key={submission.id}><div className="approval-copy"><strong>{submission.guest?.name}</strong><p>{submission.task?.title} · {submission.task?.points} 分</p><div className="verification-note"><strong>核验要求</strong><span>{submission.task?.verification_method}</span></div>{submission.completion_note && <div className="submission-note"><strong>宾客完成说明</strong><span>{submission.completion_note}</span></div>}{submission.evidence_url && <figure className="evidence-preview compact"><a href={submission.evidence_url} target="_blank" rel="noreferrer"><img src={submission.evidence_url} alt={`${submission.task?.title || '任务'}的验证照片`} loading="lazy"/></a><figcaption>点击查看验证照片</figcaption></figure>}</div><div className="approval-actions"><label htmlFor={`review-note-${submission.id}`}>审核备注 <small>通过可留空；退回必须填写</small></label><input id={`review-note-${submission.id}`} value={reviewNotes[submission.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [submission.id]: event.target.value }))} maxLength={500} placeholder="例如：照片不清楚，请重新提交"/><div><button data-testid={`approve-${submission.id}`} disabled={busy} onClick={() => void approveSubmission(submission)}>{busy ? '处理中…' : '通过并加分'}</button><button disabled={busy || !reviewNotes[submission.id]?.trim()} className="danger" onClick={() => void rejectSubmission(submission)}>退回</button></div></div></article>)}</section>

    <details className="admin-advanced-tools"><summary>高级操作：预设身份、派发任务、线索与人工积分</summary><section className="section-card"><div className="section-heading"><div><small>QUICK OPERATIONS</small><h2>宾客操作台</h2></div></div>
      <label htmlFor="operation-guest">选择宾客</label><select id="operation-guest" value={selectedGuestId} onChange={(event) => setSelectedGuestId(event.target.value)}>{activeGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team} · {guest.points} 分</option>)}</select>
      {selectedGuest && <div className="operation-grid">
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'configureGuest', guestId: selectedGuest.id, team, role }, '组别和身份已锁定，抽卡时会按此发放'); }}><h3>预设组别与阵营</h3><p className="muted">正式版本只保留婚礼守护者与丘比特的恶作剧者两个基础阵营。</p><label htmlFor="guest-team">组别</label><select id="guest-team" value={team} onChange={(event) => setTeam(event.target.value)}><option value="玫瑰组">玫瑰组</option><option value="月桂组">月桂组</option><option value="星辰组">星辰组</option><option value="琥珀组">琥珀组</option></select><label htmlFor="guest-role">基础阵营</label><select id="guest-role" value={role === 'helper' ? 'guest' : role} onChange={(event) => setRole(event.target.value)}><option value="guest">婚礼守护者</option><option value="spy">丘比特的恶作剧者</option></select><button disabled={busy || Boolean(selectedGuest.drawn_at)}>{selectedGuest.team_locked && selectedGuest.role_locked ? '更新锁定预设' : '锁定此预设'}</button></form>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'configureStoryRole', guestId: selectedGuest.id, storyRole }, '剧情职务已保存，抽卡时会领取对应任务'); }}><h3>指定剧情职务</h3><p className="muted">剧情职务不是阵营。固定职务不会进入恶作剧者池；爱心持有者全场最多五人。</p><label htmlFor="guest-story-role">剧情职务</label><select id="guest-story-role" value={storyRole} onChange={(event) => setStoryRole(event.target.value)}>{Object.entries(STORY_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{value === 'NONE' ? '无固定职务' : label}</option>)}</select><div className="control-state">玩家编号：{selectedGuest.player_code} · 后天角色：{selectedGuest.unlocked_role === 'NONE' ? '尚未解锁' : selectedGuest.unlocked_role === 'CUPID_ALLIANCE' ? '丘比特联盟' : '孤单丘比特'}</div><button disabled={busy || Boolean(selectedGuest.drawn_at) || selectedGuest.participation_mode !== 'ACTIVE_PLAYER'}>保存剧情职务</button></form>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'assignTask', guestId: selectedGuest.id, taskId: selectedTaskId }, '任务已派发'); }}><h3>派发任务</h3><p className="muted">{selectedGuest.eligible_for_mission ? '任务会在对应游戏阶段开放时出现在宾客手机上。' : '这位宾客使用专属卡片，不进入普通任务系统。'}</p><label htmlFor="assign-task">任务</label><select id="assign-task" value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>{activeCatalogTasks.map((task) => <option key={task.id} value={task.id}>{task.grants_hidden_spy ? '◆ 隐藏间谍 · ' : ''}{task.title} · {task.points} 分</option>)}</select><button disabled={busy || !selectedTaskId || !selectedGuest.eligible_for_mission}>派发给 {selectedGuest.name}</button></form>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'grantClue', guestId: selectedGuest.id, clueId: selectedClueId }, '线索已发放'); }}><h3>发放线索</h3><p className="muted">{selectedGuest.eligible_for_secret_role ? '线索只会显示在这位宾客的私人任务页。' : '这位宾客不参与隐藏身份与线索玩法。'}</p><label htmlFor="grant-clue">线索</label><select id="grant-clue" value={selectedClueId} onChange={(event) => setSelectedClueId(event.target.value)}>{data.clues.filter((clue) => clue.active).map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</select><button disabled={busy || !selectedClueId || !selectedGuest.eligible_for_secret_role}>发放给 {selectedGuest.name}</button></form>
        <form onSubmit={(event) => { event.preventDefault(); const amount = Number(pointAmount); void action({ type: 'adjustPoints', guestId: selectedGuest.id, amount, reason: pointReason }, '积分已调整').then((ok) => { if (ok) { setPointAmount(''); setPointReason(''); } }); }}><h3>人工调整积分</h3><p className="muted">可输入正数或负数；积分不会降到零以下，必须填写原因。</p><label htmlFor="point-amount">分数变化</label><input id="point-amount" type="number" min={-1000} max={1000} value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="例如 10 或 -5" required/><label htmlFor="point-reason">调整原因</label><input id="point-reason" value={pointReason} onChange={(event) => setPointReason(event.target.value)} maxLength={200} placeholder="例如：完成现场隐藏任务" required/><button disabled={busy || !pointAmount || !pointReason.trim()}>保存积分调整</button></form>
      </div>}
    </section></details></>}

    {activePanel === 'content' && <><section className="admin-grid">
      <article className="section-card">
        <div className="section-heading"><div><small>TASK LIBRARY</small><h2>任务库管理</h2></div><span>{data.tasks.filter((task) => task.active).length}/{data.tasks.length} 启用</span></div>
        <a className="text-link" href="/admin/cards" target="_blank" rel="noreferrer">打开可打印宾客卡片 ↗</a>
        {data.game?.task_catalog_mode === 'demo' && <div className="demo-task-note"><strong>当前使用演示任务池</strong><p>宾客抽卡只会获得标记为“演示”的任务；现有候选任务仍保留，收到最终清单后再切换为正式模式。</p></div>}
        <label htmlFor="library-task">选择任务或新建</label>
        <select id="library-task" value={libraryTaskId} onChange={(event) => setLibraryTaskId(event.target.value)}><option value="new">＋ 新建任务</option>{data.tasks.map((task) => <option key={task.id} value={task.id}>{task.active ? '●' : '○'} {task.is_demo ? '演示 · ' : ''}{task.grants_hidden_spy ? '◆ ' : ''}{task.title}</option>)}</select>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveTask', taskId: libraryTaskId === 'new' ? null : libraryTaskId, ...newTask, points: Number(newTask.points) }, libraryTaskId === 'new' ? '任务已加入任务库' : '任务已保存').then((ok) => { if (ok && libraryTaskId === 'new') setLibraryTaskId('new'); }); }}>
          <label htmlFor="task-title">标题</label><input id="task-title" value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} maxLength={120} required/>
          <label htmlFor="task-description">任务说明</label><textarea id="task-description" value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} maxLength={1000} required/>
          <label htmlFor="task-verification">验证方式</label><textarea id="task-verification" value={newTask.verificationMethod} onChange={(event) => setNewTask({ ...newTask, verificationMethod: event.target.value })} maxLength={500} required/>
          <p className="field-help">写清需要出示照片、提供口令、由相关宾客确认，或由工作人员现场观察。</p>
          <div className="form-grid">
            <div><label htmlFor="task-points">个人积分</label><input id="task-points" type="number" min={1} max={3} value={newTask.points} onChange={(event) => setNewTask({ ...newTask, points: event.target.value })} required/><p className="field-help">普通 1 分，升级/隐藏 2 分，特殊任务最多 3 分。</p></div>
            <div><label htmlFor="task-role">适用身份</label><select id="task-role" value={newTask.roleScope === 'helper' ? 'guest' : newTask.roleScope} disabled={newTask.grantsHiddenSpy} onChange={(event) => { const roleScope = event.target.value; setNewTask({ ...newTask, roleScope, points: String(recommendedTaskPoints(newTask.category, roleScope, newTask.grantsHiddenSpy)) }); }}><option value="all">所有身份</option><option value="guest">婚礼守护者</option><option value="spy">丘比特的恶作剧者</option></select></div>
            <div><label htmlFor="task-category">类型</label><select id="task-category" value={newTask.category} disabled={newTask.grantsHiddenSpy} onChange={(event) => { const category = event.target.value; setNewTask({ ...newTask, category, points: String(recommendedTaskPoints(category, newTask.roleScope, newTask.grantsHiddenSpy)) }); }}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label htmlFor="task-stage">开放阶段</label><select id="task-stage" value={newTask.stage} disabled={newTask.grantsHiddenSpy} onChange={(event) => setNewTask({ ...newTask, stage: event.target.value })}>{STAGES.filter(([value]) => ['task_round_1', 'task_round_2', 'group_game'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <label className="ready-check"><input type="checkbox" checked={newTask.grantsHiddenSpy} onChange={(event) => { const grantsHiddenSpy = event.target.checked; const category = grantsHiddenSpy ? 'hidden' : newTask.category; const roleScope = grantsHiddenSpy ? 'guest' : newTask.roleScope; setNewTask({ ...newTask, grantsHiddenSpy, category, roleScope, points: String(recommendedTaskPoints(category, roleScope, grantsHiddenSpy)), ...(grantsHiddenSpy ? { stage: 'task_round_2' } : {}) }); }}/><span><strong>完成后成为隐藏间谍</strong><small>全场只能启用并派发一张；审核通过时身份自动转化。</small></span></label>
          <label className="ready-check"><input type="checkbox" checked={newTask.active} onChange={(event) => setNewTask({ ...newTask, active: event.target.checked })}/><span><strong>允许继续派发</strong><small>停用后不会影响已领取这项任务的宾客。</small></span></label>
          {libraryTaskId !== 'new' && <p className="field-help">任务一旦派发，积分、身份范围、类型、阶段和隐藏奖励会锁定；仍可修正文案或停用。</p>}
          <button disabled={busy}>{libraryTaskId === 'new' ? '创建任务' : '保存任务'}</button>
        </form>
      </article>
      <article className="section-card"><div className="section-heading"><div><small>CLUE LIBRARY</small><h2>线索库管理</h2></div><span>{data.clues.filter((clue) => clue.active).length}/{data.clues.length} 启用</span></div><label htmlFor="library-clue">选择线索或新建</label><select id="library-clue" value={libraryClueId} onChange={(event) => setLibraryClueId(event.target.value)}><option value="new">＋ 新建线索</option>{data.clues.map((clue) => <option key={clue.id} value={clue.id}>{clue.active ? '●' : '○'} L{clue.level} · {clue.spy?.name || '通用'} · {clue.title}</option>)}</select><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveClue', clueId: libraryClueId === 'new' ? null : libraryClueId, ...newClue, level: Number(newClue.level) }, libraryClueId === 'new' ? '线索已加入线索库' : '线索已保存').then((ok) => { if (ok && libraryClueId === 'new') setLibraryClueId('new'); }); }}><label htmlFor="clue-title">线索标题</label><input id="clue-title" value={newClue.title} onChange={(event) => setNewClue({ ...newClue, title: event.target.value })} maxLength={120} required/><label htmlFor="clue-content">线索内容</label><textarea id="clue-content" value={newClue.content} onChange={(event) => setNewClue({ ...newClue, content: event.target.value })} maxLength={1000} required/><div className="form-grid"><div><label htmlFor="clue-spy">对应间谍</label><select id="clue-spy" value={newClue.spyGuestId} onChange={(event) => setNewClue({ ...newClue, spyGuestId: event.target.value })}><option value="">通用线索</option>{spyGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team}</option>)}</select></div><div><label htmlFor="clue-level">线索等级</label><select id="clue-level" value={newClue.level} onChange={(event) => setNewClue({ ...newClue, level: event.target.value })}><option value="1">一级 · 模糊</option><option value="2">二级 · 收窄范围</option><option value="3">三级 · 接近答案</option></select></div></div><label className="ready-check"><input type="checkbox" checked={newClue.active} onChange={(event) => setNewClue({ ...newClue, active: event.target.checked })}/><span><strong>允许继续发放</strong><small>停用后已获得该线索的宾客仍可查看。</small></span></label>{libraryClueId !== 'new' && <p className="field-help">线索发放后，对应间谍和等级会锁定；仍可修正文案或停用。</p>}<button disabled={busy}>{libraryClueId === 'new' ? '创建线索' : '保存线索'}</button></form>{libraryClueId !== 'new' && <div className="library-preview"><div><strong>L{newClue.level} · {newClue.title}</strong><p>{newClue.content}</p></div></div>}</article>
    </section>

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>HEART STORY</small><h2>爱心卡与角色解锁</h2></div><span>{data.heartSlots.filter((slot) => slot.guest_id).length}/5</span></div><p className="muted">五位爱心持有者抽卡后，系统自动分配两组可配对爱心和一张孤单丘比特卡。</p><div className="heart-slot-admin">{data.heartSlots.map((slot) => <div key={slot.heart_code}><strong>{slot.heart_code}</strong><span>{slot.guest?.name || '等待爱心持有者抽卡'}</span><small>{slot.side === 'SOLO' ? '孤单丘比特' : `${slot.pair_key} 组 · ${slot.side === 'LEFT' ? '左半' : '右半'}`}</small></div>)}</div><div className="relationship-admin-list">{data.playerRelationships.length === 0 ? <div className="empty-state">尚无双向关系确认。</div> : data.playerRelationships.map((relationship) => <div key={relationship.id}><strong>{relationship.relationship_type === 'CUPID_ALLIANCE' ? '丘比特联盟' : '恶作剧者同伴'}</strong><span>{relationship.player_a?.name} ↔ {relationship.player_b?.name}</span><small>{relationship.status === 'ACTIVE' ? '已双向确认' : '等待另一方确认'}</small></div>)}</div></article>
      <article className="section-card"><div className="section-heading"><div><small>SPLIT CLUES</small><h2>联盟半线索</h2></div><span>手动配置</span></div><p className="muted">左右两位联盟成员只会看到自己的半条内容。不要在任何一个片段里单独写出完整答案。</p>{data.allianceClues.map((clue) => { const form = allianceForms[clue.pair_key] ?? { title: clue.title, leftFragment: clue.left_fragment, rightFragment: clue.right_fragment, active: clue.active }; return <form className="alliance-clue-form" key={clue.pair_key} onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveAllianceClue', pairKey: clue.pair_key, ...form }, `${clue.pair_key} 组联盟半线索已保存`); }}><h3>{clue.pair_key} 组丘比特联盟</h3><label htmlFor={`alliance-title-${clue.pair_key}`}>线索标题</label><input id={`alliance-title-${clue.pair_key}`} value={form.title} maxLength={120} onChange={(event) => setAllianceForms({ ...allianceForms, [clue.pair_key]: { ...form, title: event.target.value } })}/><label htmlFor={`alliance-left-${clue.pair_key}`}>左半爱心看到的片段</label><textarea id={`alliance-left-${clue.pair_key}`} value={form.leftFragment} maxLength={500} onChange={(event) => setAllianceForms({ ...allianceForms, [clue.pair_key]: { ...form, leftFragment: event.target.value } })}/><label htmlFor={`alliance-right-${clue.pair_key}`}>右半爱心看到的片段</label><textarea id={`alliance-right-${clue.pair_key}`} value={form.rightFragment} maxLength={500} onChange={(event) => setAllianceForms({ ...allianceForms, [clue.pair_key]: { ...form, rightFragment: event.target.value } })}/><label className="ready-check"><input type="checkbox" checked={form.active} onChange={(event) => setAllianceForms({ ...allianceForms, [clue.pair_key]: { ...form, active: event.target.checked } })}/><span><strong>向已成立的联盟开放</strong><small>只有关系双向确认后才会显示。</small></span></label><button disabled={busy || !form.title.trim()}>保存 {clue.pair_key} 组半线索</button></form>; })}</article>
    </section>

    <section className="section-card">
      <div className="section-heading"><div><small>PHYSICAL HIDDEN CARDS</small><h2>隐藏任务实体卡</h2></div><span>{readyHiddenTaskCards}/{activeHiddenTasks.length}</span></div>
      <p className="muted">每项已启用的隐藏任务可生成一个一次性代码。代码只显示一次，请立即写入或打印到对应实体卡；宾客找到后由任务站兑换。</p>
      {generatedHiddenCode && <div className="generated-secret-code" role="status"><small>仅本次显示 · {generatedHiddenCode.taskTitle}</small><strong>{generatedHiddenCode.code}</strong><p>请现在记录。刷新或离开页面后，后台只保留散列，无法恢复原代码。</p></div>}
      {activeHiddenTasks.length === 0 ? <div className="empty-state">请先在任务库创建并启用隐藏任务。</div> : <div className="hidden-code-list">{activeHiddenTasks.map((task) => {
        const issued = data.hiddenTaskCodes.find((code) => code.task_id === task.id);
        return <article key={task.id}><div><strong>{task.grants_hidden_spy ? '◆ ' : ''}{task.title}</strong><small>{task.points} 分 · {issued?.claimed_at ? `已由 ${issued.guest?.name || '宾客'} 领取` : issued ? '代码已生成，等待领取' : '尚未生成实体卡代码'}</small></div><button className="mini-button" disabled={busy || Boolean(issued?.claimed_at)} onClick={() => void issueCode(task, Boolean(issued))}>{issued?.claimed_at ? '已锁定' : issued ? '重新生成' : '生成代码'}</button></article>;
      })}</div>}
    </section>
    </>}

    {activePanel === 'guests' && <><section className="section-card"><div className="section-heading"><div><small>GUEST ROSTER</small><h2>宾客名单管理</h2></div><span>{activeGuests.length} 位启用</span></div><details className="roster-import"><summary>从表格或文本批量新增</summary><p className="muted">每行填写“显示姓名 | 登录名 | 桌号”，也可以直接从三列表格复制。导入只新增，不覆盖已有宾客；长辈和仪式标记可在导入后逐人设置。</p><form onSubmit={importRoster}><label htmlFor="roster-import-text">待导入名单</label><textarea id="roster-import-text" rows={7} value={rosterImportText} onChange={(event) => { setRosterImportText(event.target.value); setRosterImportConfirmed(false); }} placeholder={'陈方舟 | Fangzhou Chen | 3 号桌\n李思然 | Siran Li | 3 号桌'} spellCheck={false}/>{data.game?.registration_open && <div className="notice error">为避免宾客正在认领时名单变化，请先在“当前流程”关闭注册。</div>}{rosterImportPreview.issues.length > 0 && <div className="import-issues">{rosterImportPreview.issues.slice(0, 6).map((issue) => <p key={`${issue.line}-${issue.message}`}><strong>{issue.line ? `第 ${issue.line} 行` : '名单'}：</strong>{issue.message}</p>)}</div>}{rosterImportPreview.rows.length > 0 && <div className="import-preview"><strong>预览 · {rosterImportPreview.rows.length} 位可新增</strong>{rosterImportPreview.rows.slice(0, 8).map((row) => <span key={row.loginName}>{row.name}<small>{row.loginName}{row.tableLabel ? ` · ${row.tableLabel}` : ''}</small></span>)}{rosterImportPreview.rows.length > 8 && <em>另有 {rosterImportPreview.rows.length - 8} 位</em>}</div>}<label className="ready-check"><input type="checkbox" checked={rosterImportConfirmed} onChange={(event) => setRosterImportConfirmed(event.target.checked)} disabled={!rosterImportPreview.rows.length || Boolean(rosterImportPreview.issues.length)}/><span><strong>我已核对预览中的显示姓名和登录名</strong><small>登录名用于搜索和登录，导入后仍可在下方逐人修改。</small></span></label><button disabled={busy || Boolean(data.game?.registration_open) || !rosterImportConfirmed || !rosterImportPreview.rows.length || Boolean(rosterImportPreview.issues.length)}>{busy ? '正在导入…' : `确认新增 ${rosterImportPreview.rows.length} 位宾客`}</button></form></details><label htmlFor="roster-guest">选择宾客或新增</label><select id="roster-guest" value={rosterGuestId} onChange={(event) => setRosterGuestId(event.target.value)}><option value="new">＋ 新增宾客</option>{data.guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.active ? '●' : '○'} {guest.name} · {guest.login_name}</option>)}</select><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveGuestRoster', guestId: rosterGuestId === 'new' ? null : rosterGuestId, ...guestForm }, rosterGuestId === 'new' ? '宾客已加入名单' : '宾客资料已保存'); }}><div className="form-grid"><div><label htmlFor="roster-name">显示姓名</label><input id="roster-name" value={guestForm.name} onChange={(event) => setGuestForm({ ...guestForm, name: event.target.value })} maxLength={120} required/></div><div><label htmlFor="roster-login">登录名</label><input id="roster-login" value={guestForm.loginName} disabled={Boolean(rosterGuest?.claimed_at)} onChange={(event) => setGuestForm({ ...guestForm, loginName: event.target.value })} maxLength={80} placeholder="例如 Fangzhou Chen" required/></div><div><label htmlFor="roster-table">桌号或座位</label><input id="roster-table" value={guestForm.tableLabel} onChange={(event) => setGuestForm({ ...guestForm, tableLabel: event.target.value })} maxLength={40} placeholder="例如 3 号桌"/></div></div>{rosterGuest?.claimed_at && <p className="field-help">宾客已设置密码，登录名已锁定；显示姓名、桌号和标记仍可修改。</p>}<label htmlFor="roster-notes">工作人员备注</label><textarea id="roster-notes" value={guestForm.staffNotes} onChange={(event) => setGuestForm({ ...guestForm, staffNotes: event.target.value })} maxLength={300} placeholder="仅主办方和导出文件可见，不填写不必要的个人信息。"/><div className="form-grid"><label className="ready-check"><input type="checkbox" checked={guestForm.isElder} onChange={(event) => setGuestForm({ ...guestForm, isElder: event.target.checked })}/><span><strong>长辈或轻量参与</strong><small>便于优先安排简单任务。</small></span></label><label className="ready-check"><input type="checkbox" checked={guestForm.ceremonyEligible} onChange={(event) => setGuestForm({ ...guestForm, ceremonyEligible: event.target.checked })}/><span><strong>适合仪式任务</strong><small>可承担递戒指、领掌等指定环节。</small></span></label><label className="ready-check"><input type="checkbox" checked={guestForm.active} disabled={Boolean(rosterGuest?.drawn_at)} onChange={(event) => setGuestForm({ ...guestForm, active: event.target.checked })}/><span><strong>允许认领和参与</strong><small>{rosterGuest?.drawn_at ? '已经抽卡，现场期间不能停用。' : '停用会撤销该宾客所有登录会话。'}</small></span></label></div><button disabled={busy}>{rosterGuestId === 'new' ? '添加到宾客名单' : '保存宾客资料'}</button></form></section>

    <section className="section-card"><div className="section-heading"><div><small>GUESTS</small><h2>宾客进度</h2></div><span>{activeGuests.length}/{data.guests.length}</span></div><div className="guest-admin-list">{data.guests.map((guest) => <article key={guest.id}><div className="guest-avatar">{guest.name.slice(0, 1)}</div><div><strong>{guest.name}</strong><small>{guest.login_name} · {PARTICIPATION_LABELS[guest.participation_mode] || guest.participation_mode}{guest.relationship ? ` · ${guest.relationship}` : ''}{guest.story_role !== 'NONE' ? ` · ${STORY_ROLE_LABELS[guest.story_role] || guest.story_role}` : ''}{guest.drawn_at ? ` · ${guest.team} / ${guest.is_hidden_spy ? '隐藏间谍' : ROLE_LABELS[guest.role] || guest.role}` : guest.eligible_for_mission ? ' · 待抽卡' : ' · 专属卡'}{guest.eligible_for_personal_score ? ` · ${guest.points} 分` : ''}</small></div><span className={!guest.active ? 'unclaimed' : guest.claimed_at ? 'claimed' : 'unclaimed'}>{!guest.active ? '已停用' : guest.claimed_at ? (guest.drawn_at ? '已抽卡' : guest.eligible_for_mission ? '待抽卡' : '已登录') : '未设置'}</span>{guest.active && guest.claimed_at && <button className="mini-button" disabled={busy} onClick={() => { if (window.confirm(`确认重置 ${guest.name} 的密码并退出其所有设备？`)) void action({ type: 'resetGuestClaim', guestId: guest.id }, '宾客密码已重置'); }}>重置密码</button>}</article>)}</div></section></>}

    {activePanel === 'review' && <details className="admin-advanced-tools"><summary>高级操作：恶作剧者私密积分</summary><section className="section-card spy-score-admin"><div className="section-heading"><div><small>PRIVATE TRICKSTER SCORE</small><h2>恶作剧者积分台</h2></div><span>揭晓前保密</span></div><p className="muted">这部分规则仍待最终确认，婚礼现场默认收起。逃脱投票、队伍第一等自动结算逻辑只在正式启用后使用。</p>{drawnSpyGuests.length === 0 ? <div className="empty-state">尚无已抽卡的恶作剧者。</div> : <><div className="spy-score-totals">{spyScoreTotals.map(({ guest, points }) => <div key={guest.id}><span>{guest.name} · {guest.team}</span><strong>{points} 分</strong></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'recordSpyPointEvent', guestId: spyScoreForm.guestId, reason: spyScoreForm.reason, note: spyScoreForm.note, eventKey: crypto.randomUUID() }, '恶作剧者积分已私密记录').then((ok) => { if (ok) setSpyScoreForm({ ...spyScoreForm, note: '' }); }); }}><div className="form-grid"><div><label htmlFor="spy-score-guest">恶作剧者</label><select id="spy-score-guest" value={spyScoreForm.guestId} onChange={(event) => setSpyScoreForm({ ...spyScoreForm, guestId: event.target.value })} required><option value="">请选择</option>{drawnSpyGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team}</option>)}</select></div><div><label htmlFor="spy-score-reason">现场事件 · +1</label><select id="spy-score-reason" value={spyScoreForm.reason} onChange={(event) => setSpyScoreForm({ ...spyScoreForm, reason: event.target.value })}>{Object.entries(SPY_POINT_LABELS).filter(([reason]) => ['team_wrong_answer', 'resource_wasted', 'ordinary_guest_suspected'].includes(reason)).map(([reason, label]) => <option key={reason} value={reason}>{label}</option>)}</select></div></div><label htmlFor="spy-score-note">现场备注（选填）</label><input id="spy-score-note" value={spyScoreForm.note} onChange={(event) => setSpyScoreForm({ ...spyScoreForm, note: event.target.value })} maxLength={300} placeholder="例如：第 2 题把玫瑰组引向错误答案"/><button disabled={busy || !spyScoreForm.guestId || Boolean(data.game?.results_visible)}>{data.game?.results_visible ? '身份已揭晓 · 积分锁定' : '私密记录 +1'}</button></form>{data.spyPointLedger.length > 0 && <div className="activity-list spy-ledger">{data.spyPointLedger.slice(0, 12).map((entry) => <div key={entry.id}><span className="amount-positive">+{entry.amount}</span><p><strong>{entry.guest?.name || '未知恶作剧者'} · {SPY_POINT_LABELS[entry.reason] || entry.reason}</strong><small>{entry.note || (entry.voting_round ? `第 ${entry.voting_round} 轮自动结算` : '主办方现场记录')}</small></p></div>)}</div>}</>}</section></details>}

    {activePanel === 'finale' && <><section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>VOTE COUNT</small><h2>第 {data.game?.voting_round || 0} 轮投票</h2></div><span>{data.votes.length}</span></div><p className="muted">已投票 {data.votes.length}/{drawn} 人，每人本轮只能投一次。统计仅在主办方后台可见。</p>{data.game?.results_visible && <div className="control-state on">本场已自动结算：个人 +{settledPersonalPoints} 分 · 团队 +{settledTeamPoints} 分 · 间谍 +{data.spyPointLedger.reduce((sum, entry) => sum + entry.amount, 0)} 分</div>}{votesByTarget.length === 0 ? <div className="empty-state">暂无投票。</div> : <ol className="ranking-list">{votesByTarget.map(([name, count]) => <li key={name}><strong>{name}</strong><span>{count} 票</span></li>)}</ol>}</article>
      <article className="section-card"><div className="section-heading"><div><small>POINTS LEDGER</small><h2>积分流水</h2></div></div>{data.pointLedger.length === 0 ? <div className="empty-state">暂无积分记录。</div> : <div className="activity-list">{data.pointLedger.slice(0, 12).map((entry) => <div key={entry.id}><span className={entry.amount > 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</span><p><strong>{entry.guest?.name || '未知宾客'}</strong><small>{entry.reason}</small></p></div>)}</div>}</article>
    </section>

    <section className="section-card"><div className="section-heading"><div><small>FINAL HONORS</small><h2>颁奖结果</h2></div><span>{data.awards.filter((award) => award.published).length}/{data.awards.length} 已公布</span></div><p className="muted">只有勾选“随身份揭晓公布”且已选择获奖者的奖项，才会在结果阶段显示到公开大屏。</p><div className="award-admin-grid"><div className="award-picker">{data.awards.map((award) => <button key={award.id} className={selectedAwardId === award.id ? 'selected' : ''} onClick={() => setSelectedAwardId(award.id)}><strong>{award.title}</strong><small>{award.published ? '已公布' : award.winner_guest_id || award.winner_team ? '待公布' : '待设置'}</small></button>)}</div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveAward', awardId: selectedAwardId, ...awardForm, sortOrder: Number(awardForm.sortOrder) }, '奖项已保存'); }}><label htmlFor="award-title">奖项名称</label><input id="award-title" value={awardForm.title} onChange={(event) => setAwardForm({ ...awardForm, title: event.target.value })} maxLength={120} required/><label htmlFor="winner-kind">获奖对象</label><select id="winner-kind" value={awardForm.winnerKind} onChange={(event) => setAwardForm({ ...awardForm, winnerKind: event.target.value, published: false })}><option value="none">暂不指定</option><option value="guest">宾客</option><option value="team">队伍</option></select>{awardForm.winnerKind === 'guest' && <><label htmlFor="award-guest">获奖宾客</label><select id="award-guest" value={awardForm.winnerGuestId} onChange={(event) => setAwardForm({ ...awardForm, winnerGuestId: event.target.value })} required><option value="">请选择</option>{data.guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team}</option>)}</select></>}{awardForm.winnerKind === 'team' && <><label htmlFor="award-team">获奖队伍</label><select id="award-team" value={awardForm.winnerTeam} onChange={(event) => setAwardForm({ ...awardForm, winnerTeam: event.target.value })}>{TEAMS.map((teamName) => <option key={teamName}>{teamName}</option>)}</select></>}<label htmlFor="award-reason">颁奖理由</label><textarea id="award-reason" value={awardForm.reason} onChange={(event) => setAwardForm({ ...awardForm, reason: event.target.value })} maxLength={500} placeholder="例如：完成任务最多，并帮助多位宾客参与游戏。"/><label htmlFor="award-order">展示顺序</label><input id="award-order" type="number" min={0} max={9999} value={awardForm.sortOrder} onChange={(event) => setAwardForm({ ...awardForm, sortOrder: event.target.value })}/><label className="ready-check"><input type="checkbox" checked={awardForm.published} disabled={awardForm.winnerKind === 'none'} onChange={(event) => setAwardForm({ ...awardForm, published: event.target.checked })}/><span><strong>随身份揭晓公布</strong><small>结果尚未公布时，即使勾选也不会提前显示。</small></span></label><button disabled={busy || !selectedAwardId}>保存奖项</button></form></div></section></>}

    {activePanel === 'data' && <><section className="section-card"><div className="section-heading"><div><small>DATA &amp; AUDIT</small><h2>数据备份与最近操作</h2></div></div><p className="muted">建议在彩排后和婚礼结束后各导出一次。文件不会包含宾客密码、会话或服务器密钥。</p><div className="export-actions"><a href="/api/admin-export?type=guests">导出宾客</a><a href="/api/admin-export?type=assignments">导出任务</a><a href="/api/admin-export?type=points">个人积分</a><a href="/api/admin-export?type=team-points">团队积分</a><a href="/api/admin-export?type=spy-points">间谍积分</a><a href="/api/admin-export?type=team-resources">竞拍金币</a><a href="/api/admin-export?type=awards">导出奖项</a><a href="/api/admin-export?type=audit">导出审计</a></div>{data.auditLog.length === 0 ? <div className="empty-state">暂无后台操作。</div> : <div className="audit-list">{data.auditLog.slice(0, 20).map((entry) => <div key={entry.id}><strong>{ACTION_LABELS[entry.action] || entry.action}</strong><span>{new Date(entry.created_at).toLocaleString('zh-CN')}</span><small>{entry.actor}</small></div>)}</div>}</section>

    <section className="section-card danger-zone"><div className="section-heading"><div><small>REHEARSAL RESET</small><h2>彩排数据安全清场</h2></div><span className={resetControlsClosed ? 'ready-badge' : 'warning-badge'}>{resetControlsClosed ? '公开入口已关闭' : '请先关闭公开入口'}</span></div><div className="reset-assurance"><strong>清场后，运行数据应全部归零</strong><p>保留宾客名单、锁定的队伍与初始身份、任务、线索、主持题库、奖项名称和实体卡代码；清除所有宾客密码与登录、抽卡结果、任务进度、验证照片、投票、个人/团队/间谍积分、竞拍流水与发布状态。</p></div><div className="reset-preview-grid"><div><strong>{resetPreview.claimed_guests}</strong><span>已认领宾客</span></div><div><strong>{resetPreview.assignments}</strong><span>任务记录</span></div><div><strong>{resetPreview.votes}</strong><span>投票记录</span></div><div><strong>{resetPreview.evidence_files}</strong><span>验证照片</span></div></div><form onSubmit={resetRehearsal}><label className="ready-check"><input type="checkbox" checked={resetForm.backupConfirmed} onChange={(event) => setResetForm({ ...resetForm, backupConfirmed: event.target.checked })}/><span><strong>我已下载上方八类 CSV 备份</strong><small>清场不可从网页撤销；审计日志会永久保留本次操作摘要。</small></span></label><label htmlFor="reset-reason">清场原因</label><input id="reset-reason" value={resetForm.reason} onChange={(event) => setResetForm({ ...resetForm, reason: event.target.value })} minLength={3} maxLength={300} required/><label htmlFor="reset-confirmation">输入 RESET WEDDING 确认</label><input id="reset-confirmation" value={resetForm.confirmation} onChange={(event) => setResetForm({ ...resetForm, confirmation: event.target.value })} autoComplete="off" spellCheck={false} placeholder="RESET WEDDING" required/><button className="danger" disabled={busy || !resetControlsClosed || !resetForm.backupConfirmed || resetForm.confirmation !== 'RESET WEDDING' || resetForm.reason.trim().length < 3}>{busy ? '正在安全清场…' : resetCleanupPending ? '重试照片清理' : '清空全部彩排运行数据'}</button></form></section></>}
  </main>;
}
