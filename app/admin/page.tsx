'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StaffLogoutButton } from '../staff-logout-button';
import { createEventKey } from '@/lib/event-key';
import { parseGuestRosterText } from '@/lib/guest-roster-import';
import { GAME_STAGE_OPTIONS, LIVE_GAME_STAGE_SEQUENCE, gameStageCopy, isNextLiveGameStage } from '@/lib/game-stages';
import { recommendedTaskPoints } from '@/lib/task-points';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { WeddingSignature } from '../wedding-signature';
import { getManualTaskAvailability } from '@/lib/manual-task-eligibility';
import { requiredTeamClueCount } from '@/lib/team-clue-readiness';

const STAGES = GAME_STAGE_OPTIONS;
const LIVE_FLOW_STAGES = LIVE_GAME_STAGE_SEQUENCE;
const TEAMS = ['海岛组', '沙漠组'] as const;

const ROLE_LABELS: Record<string, string> = { guest: '祝福见证者', spy: '恶作剧者（间谍）' };
const PARTICIPATION_LABELS: Record<string, string> = { ACTIVE_PLAYER: '任务玩家', HONOR_GUEST: '荣誉宾客', PRINCIPAL: '新人专属' };
const STORY_ROLE_LABELS: Record<string, string> = { NONE: '', OFFICIANT: '誓词引导人', RING_KEEPER: '戒指守护者', GROOM_CHEERLEADER: '新郎应援者', BRIDE_CHEERLEADER: '新娘应援者', HEART_HOLDER: '爱心寻觅者', STAR_HOLDER: '星光寻觅者' };
const PHASE_TWO_MISSION_LABELS: Record<string, string> = {
  TOAST_GROOM_FATHER: '向新郎爸爸敬酒并合影', TOAST_BRIDE_MOTHER: '向新娘妈妈敬酒并合影',
  INTERACT_WITH_GROOM: '与新郎互动或合影', INTERACT_WITH_BRIDE: '与新娘互动或合影',
  DINNER_SPEECH: '晚宴致辞', HEART_DILEMMA: '爱心联盟秘密选择', STAR_DILEMMA: '星光联盟秘密选择',
  COPY_SCORE: '孤单丘比特 · 偷心行动', TEAM_CAPTAIN: '领航星队长', TRICKSTER: '丘比特的恶作剧者',
  EXTRA_VOTE: '双重裁决 · 额外投票权', SUPER_LUCKY: '超级幸运星 · 快照 + 2',
};
const CEREMONY_STATUS_LABELS: Record<string, string> = { LOCKED: '尚未开放', AVAILABLE: '等待沟通', BRIEFED: '流程已沟通', RING_RECEIVED: '已领取戒指', IN_PROGRESS: '进行中', DELIVERED: '已送达', COMPLETED: '已完成' };
const CATEGORY_LABELS: Record<string, string> = { standard: '普通任务', ceremony: '仪式任务', group: '团队任务', upgrade: '升级任务', hidden: '隐藏任务' };
const DEFAULT_VERIFICATION_METHOD = '向任务站工作人员说明完成过程；如任务涉及照片或合影，请出示对应照片。';
type AdminPanel = 'live' | 'guests' | 'content' | 'review' | 'finale' | 'data';
const PRIMARY_ADMIN_PANELS: Array<{ id: AdminPanel; label: string }> = [
  { id: 'guests', label: '开场与宾客' },
  { id: 'live', label: '现场执行' },
  { id: 'finale', label: '终局结算' },
  { id: 'content', label: '婚礼设置' },
];
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
  'team.points_adjust': '调整团队积分', 'host.team_points_add': '主持人团队计分',
  'host.guest_points_add': '主持人个人加分',
  'host_segment.save': '保存主持环节', 'host_segment.publish': '发布主持环节',
  'award.save': '保存颁奖结果',
  'rehearsal.reset': '清空彩排运行数据', 'rehearsal.evidence_cleanup_pending': '验证照片待清理',
  'rehearsal.avatar_cleanup_pending': '宾客自拍待清理', 'rehearsal.storage_cleanup_complete': '私密照片清理完成',
  'admin_session.create': '工作人员登录', 'admin_session.revoke': '工作人员安全退出',
  'admin_password.rotate': '更换管理员密码',
};

type Guest = { id: string; name: string; login_name: string; team: string; role: string; points: number; claimed_at: string | null; drawn_at: string | null; special_card_revealed_at: string | null; team_locked: boolean; role_locked: boolean; table_label: string; is_elder: boolean; ceremony_eligible: boolean; active: boolean; staff_notes: string; participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL'; relationship: string; story_role: string; uses_app: boolean; eligible_for_mission: boolean; eligible_for_secret_role: boolean; eligible_for_personal_score: boolean; phase_two_eligible: boolean; special_card_title: string; special_card_body: string; player_code: string; unlocked_role: string; avatar_path: string | null; avatar_uploaded_at: string | null; avatar_url: string | null };
type Task = { id: string; title: string; description: string; verification_method: string; points: number; role_scope: string; category: string; stage: string; active: boolean; is_demo: boolean; formal_allowed: boolean; story_role_scope: string; mission_code: string | null; mechanic: string; score_policy: string; assignment_mode: string; verification_type: string; max_assignments: number | null };
type Clue = { id: string; title: string; content: string; group_name: string; team_scope: typeof TEAMS[number] | null; active: boolean; spy_guest_id: string | null; level: number; spy?: { id: string; name: string; team: string } };
type AdminData = {
  health: { database: 'online'; checkedAt: string; deploymentVersion: string };
  guests: Guest[];
  assignments: Array<{ id: string; guest_id: string; task_id: string; status: string; rejection_reason: string | null; ceremony_status: string | null; ring_variant: 'GROOM_RING' | 'BRIDE_RING' | null; replaced_by_assignment_id: string | null; replacement_for_assignment_id: string | null; guest?: { id: string; name: string }; task?: Task }>;
  tasks: Task[];
  clues: Clue[];
  settledTeamClueIds: Record<string, string[]>;
  submissions: Array<{ id: string; completion_note: string; evidence_uploaded_at: string | null; evidence_url: string | null; guest?: { name: string }; task?: { title: string; verification_method: string; points: number } }>;
  votes: Array<{ id: string; vote_weight: number; voter?: { name: string; team: string }; target?: { name: string; team: string } }>;
  rankings: {
    personal: Array<{ id: string; name: string; team: string; points: number; completedTasks: number; undetectedTrickster: boolean; caughtTrickster: boolean }>;
    teams: Array<{ team: string; points: number; guests: number; completedTasks: number }>;
  };
  finale: {
    tricksters: Array<{ id: string; name: string; team: string; escaped: boolean }>;
    voteCounts: Array<{ id: string; name: string; team: string; votes: number; voters: Array<{ id: string; name: string; team: string; votes: number }> }>;
  };
  pointLedger: Array<{ id: string; amount: number; reason: string; actor: string; created_at: string; guest?: { name: string } }>;
  auditLog: Array<{ id: number; actor: string; action: string; target_type: string; details: Record<string, unknown>; created_at: string }>;
  awards: Array<{ id: string; title: string; winner_guest_id: string | null; winner_team: string | null; reason: string; sort_order: number; published: boolean; winner?: { id: string; name: string; team: string } }>;
  teamPointLedger: Array<{ id: number; team: string; amount: number; reason: string; actor: string; created_at: string }>;
  resultRewards: Array<{ id: number; voting_round: number; reward_type: 'guest_detective' | 'team_detective' | 'team_completion'; guest_id: string | null; team: string | null; amount: number }>;
  heartSlots: Array<{ heart_code: string; pair_key: string; side: string; guest_id: string | null; assigned_at: string | null; guest?: { id: string; name: string } }>;
  playerRelationships: Array<{ id: string; relationship_type: string; status: string; player_a_confirmed: boolean; player_b_confirmed: boolean; activated_at: string | null; player_a?: { id: string; name: string }; player_b?: { id: string; name: string } }>;
  symbolPairings: Array<{ guest_id: string; symbol: 'HEART' | 'STAR'; fragment_side: 'LEFT' | 'RIGHT'; status: 'AVAILABLE' | 'PENDING' | 'PAIRED' | 'UNPAIRED_FINAL'; partner_guest_id: string | null; pending_relationship_id: string | null; finalized_at: string | null; guest?: { id: string; name: string }; partner?: { id: string; name: string } }>;
  phaseTwoProfiles: Array<{ guest_id: string; team: string; primary_mission: string | null; extra_vote: boolean; super_lucky: boolean; is_captain: boolean; interaction_theme: string; unlocked_at: string | null }>;
  preflight: { ready: boolean; blockedCount: number; items: Array<{ id: string; label: string; detail: string; status: 'ready' | 'warning' | 'blocked' }> };
  rehearsalResetPreview: { claimed_guests: number; drawn_guests: number; assignments: number; evidence_files: number; avatar_files: number; votes: number; result_rewards: number; guest_clues: number; clue_library_entries: number; personal_ledger_entries: number; team_ledger_entries: number; spy_ledger_entries: number; resource_ledger_entries: number; mutual_confirmations: number; symbol_pairings: number; helper_actions: number; player_relationships: number; trickster_attempts: number; assigned_heart_slots: number; phase_two_profiles: number; phase_two_dilemmas: number; phase_two_copy_choices: number; guest_sessions: number; published_awards: number; hidden_task_codes: number; legacy_alliance_clue_fragments: number; pending_storage_cleanup_events: number; registration_open: boolean; voting_open: boolean; results_visible: boolean; scoreboard_visible: boolean; team_clues_settled: boolean; team_score_snapshotted: boolean };
  pendingRehearsalCleanup: { eventKey: string; evidenceCount: number; avatarCount: number; createdAt: string } | null;
  storageReconciliationFailed: boolean;
  game: { registration_open: boolean; stage: string; voting_open: boolean; voting_round: number; results_visible: boolean; results_published_at: string | null; scoreboard_visible: boolean; phase_note: string | null; display_title: string | null; display_body: string | null; public_clue: string | null; timer_ends_at: string | null; invitation_code_updated_at: string | null; task_catalog_mode: 'demo' | 'live'; trickster_max_attempts: number; phase_one_completed_at: string | null; team_clues_settled_at: string | null; team_score_snapshot: Record<string, number> | null; rehearsal_run_id: string; updated_at: string } | null;
};

async function responseBody(response: Response) {
  try { return await response.json(); } catch { return {}; }
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [activePanel, setActivePanel] = useState<AdminPanel>('guests');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [selectedClueId, setSelectedClueId] = useState('');
  const [libraryTaskId, setLibraryTaskId] = useState('new');
  const [libraryClueId, setLibraryClueId] = useState('new');
  const [rosterGuestId, setRosterGuestId] = useState('new');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('guest');
  const [storyRole, setStoryRole] = useState('NONE');
  const [phaseTwoForm, setPhaseTwoForm] = useState({ primaryMission: '', isCaptain: false, interactionTheme: '' });
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('');
  const [newTask, setNewTask] = useState({ title: '', description: '', verificationMethod: DEFAULT_VERIFICATION_METHOD, points: '1', roleScope: 'all', category: 'standard', stage: 'task_round_1', active: true });
  const [newClue, setNewClue] = useState({ title: '', content: '', groupName: '身份线索', teamScope: '' as '' | typeof TEAMS[number], spyGuestId: '', level: '1', active: true });
  const [teamScore, setTeamScore] = useState({ team: '海岛组', amount: '5', reason: '团队游戏第一名' });
  const [liveDisplay, setLiveDisplay] = useState({ title: '', body: '', publicClue: '', timerMinutes: '0' });
  const [selectedAwardId, setSelectedAwardId] = useState('');
  const [awardForm, setAwardForm] = useState({ title: '', winnerKind: 'none', winnerGuestId: '', winnerTeam: '海岛组', reason: '', sortOrder: '100', published: false });
  const [guestForm, setGuestForm] = useState({ name: '', loginName: '', tableLabel: '', isElder: false, ceremonyEligible: false, active: true, staffNotes: '' });
  const [resetForm, setResetForm] = useState({ confirmation: '', backupConfirmed: false, reason: '婚礼正式开始前清空彩排记录' });
  const [resetEventKey, setResetEventKey] = useState('');
  const [resetCleanupPending, setResetCleanupPending] = useState(false);
  const [pendingResetConfirmation, setPendingResetConfirmation] = useState(false);
  const [operatorToolsOpen, setOperatorToolsOpen] = useState(false);
  const operatorToolsRef = useRef<HTMLDetailsElement>(null);
  const [invitationCodeForm, setInvitationCodeForm] = useState({ code: '', confirm: '' });
  const [adminPasswordForm, setAdminPasswordForm] = useState({ password: '', confirm: '' });
  const [guestPhaseNote, setGuestPhaseNote] = useState('');
  const [pendingStage, setPendingStage] = useState('');
  const [stageError, setStageError] = useState('');
  const [pendingResultsVisible, setPendingResultsVisible] = useState<boolean | null>(null);
  const [pendingFinaleAction, setPendingFinaleAction] = useState<'settle-team-clues' | 'open-voting' | 'close-voting' | null>(null);
  const [rosterImportText, setRosterImportText] = useState('');
  const [rosterImportConfirmed, setRosterImportConfirmed] = useState(false);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [guestSearch, setGuestSearch] = useState('');
  const [guestStatusFilter, setGuestStatusFilter] = useState<'all' | 'unclaimed' | 'claimed' | 'drawn' | 'missing-avatar'>('all');
  const loadRequestRef = useRef(0);
  const pendingScoreRef = useRef<{ signature: string; eventKey: string } | null>(null);

  function clearAdminSession() {
    setData(null);
  }

  async function load() {
    const requestId = ++loadRequestRef.current;
    try {
      const response = await fetch('/api/admin-data', { method: 'POST', cache: 'no-store' });
      const body = await responseBody(response);
      if (requestId !== loadRequestRef.current) return;
      if (response.ok) { setData(body); setError(''); }
      else if (response.status === 401) { clearAdminSession(); setError(''); }
      else setError(body.error || '后台数据加载失败');
    } catch { if (requestId === loadRequestRef.current) setError('网络连接不稳定，请稍后重试。'); }
  }

  function openPanel(panel: AdminPanel) {
    if (panel !== 'review') setOperatorToolsOpen(false);
    setActivePanel(panel);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openManualScoreTools() {
    setActivePanel('review');
    setOperatorToolsOpen(true);
  }

  useEffect(() => { void load(); }, []);
  useLiveRefresh(load, undefined, Boolean(data));

  useEffect(() => {
    if (activePanel !== 'review' || !operatorToolsOpen) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('manual-personal-score')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePanel, operatorToolsOpen]);

  useEffect(() => {
    if (!data) return;
    const firstActiveGuest = data.guests.find((guest) => guest.active);
    const firstActiveTask = data.game?.task_catalog_mode === 'demo' ? data.tasks.find((task) => task.active && task.story_role_scope === 'NONE'
      && !/^P[12]-/i.test(task.mission_code || '')
      && task.mission_code === null) : undefined;
    const firstActiveClue = data.clues.find((clue) => clue.active);
    setSelectedGuestId((current) => data.guests.some((guest) => guest.id === current && guest.active) ? current : firstActiveGuest?.id || '');
    setSelectedTaskId((current) => data.tasks.some((task) => task.id === current && task.active
      && task.story_role_scope === 'NONE' && !/^P[12]-/i.test(task.mission_code || '')
      && data.game?.task_catalog_mode === 'demo' && task.mission_code === null) ? current : firstActiveTask?.id || '');
    setSelectedClueId((current) => data.clues.some((clue) => clue.id === current && clue.active) ? current : firstActiveClue?.id || '');
    setSelectedAwardId((current) => data.awards.some((award) => award.id === current) ? current : data.awards[0]?.id || '');
    setLibraryTaskId((current) => {
      if (data.game?.task_catalog_mode === 'demo') return current === 'new' || data.tasks.some((task) => task.id === current) ? current : 'new';
      if (data.tasks.some((task) => task.id === current && /^P[12]-/i.test(task.mission_code || ''))) return current;
      return data.tasks.find((task) => /^P[12]-/i.test(task.mission_code || ''))?.id || '';
    });
    setLibraryClueId((current) => current === 'new' || data.clues.some((clue) => clue.id === current && clue.active) ? current : 'new');
    setRosterGuestId((current) => current === 'new' || data.guests.some((guest) => guest.id === current) ? current : 'new');
  }, [data]);

  const libraryTask = data?.tasks.find((item) => item.id === libraryTaskId);
  const libraryClue = data?.clues.find((item) => item.id === libraryClueId && item.active);
  const rosterGuestRecord = data?.guests.find((item) => item.id === rosterGuestId);
  const selectedGuest = data?.guests.find((guest) => guest.id === selectedGuestId) ?? null;
  const selectedAward = data?.awards.find((item) => item.id === selectedAwardId);
  const libraryTaskSignature = JSON.stringify(libraryTask ?? null);
  const libraryClueSignature = JSON.stringify(libraryClue ?? null);
  const rosterGuestSignature = JSON.stringify(rosterGuestRecord ?? null);
  const selectedPhaseTwoProfile = data?.phaseTwoProfiles.find((profile) => profile.guest_id === selectedGuestId);
  const selectedGuestProfileSignature = selectedGuest ? `${selectedGuest.id}|${selectedGuest.team}|${selectedGuest.role}|${selectedGuest.story_role}|${JSON.stringify(selectedPhaseTwoProfile ?? null)}` : '';
  const selectedAwardSignature = JSON.stringify(selectedAward ?? null);

  useEffect(() => {
    if (libraryTaskId === 'new') { setNewTask({ title: '', description: '', verificationMethod: DEFAULT_VERIFICATION_METHOD, points: '1', roleScope: 'all', category: 'standard', stage: 'task_round_1', active: true }); return; }
    if (libraryTask) setNewTask({ title: libraryTask.title, description: libraryTask.description, verificationMethod: libraryTask.verification_method, points: String(libraryTask.points), roleScope: libraryTask.role_scope === 'helper' ? 'guest' : libraryTask.role_scope, category: libraryTask.category === 'hidden' ? 'standard' : libraryTask.category, stage: libraryTask.stage, active: libraryTask.active });
  }, [libraryTaskId, libraryTaskSignature]);

  useEffect(() => {
    if (libraryClueId === 'new') { setNewClue({ title: '', content: '', groupName: '身份线索', teamScope: '', spyGuestId: '', level: '1', active: true }); return; }
    if (libraryClue) setNewClue({ title: libraryClue.title, content: libraryClue.content, groupName: libraryClue.group_name || '身份线索', teamScope: libraryClue.team_scope || '', spyGuestId: libraryClue.spy_guest_id || '', level: String(libraryClue.level), active: libraryClue.active });
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
    setPhaseTwoForm({
      primaryMission: selectedPhaseTwoProfile?.primary_mission ?? '',
      isCaptain: selectedPhaseTwoProfile?.primary_mission === 'TEAM_CAPTAIN',
      interactionTheme: selectedPhaseTwoProfile?.interaction_theme ?? '',
    });
    setSelectedAssignmentId('');
  }, [selectedGuestProfileSignature]);

  useEffect(() => {
    if (!data?.game || !selectedGuest) return;
    const availability = getManualTaskAvailability({
      guest: selectedGuest,
      tasks: data.tasks,
      taskCatalogMode: data.game.task_catalog_mode,
      gameStage: data.game.stage,
      assignments: data.assignments.map((assignment) => ({
        id: assignment.id,
        guest_id: assignment.guest_id,
        task_id: assignment.task_id || assignment.task?.id || '',
        status: assignment.status,
      })),
      excludeAssignmentId: selectedAssignmentId || null,
    });
    setSelectedTaskId((current) => availability.tasks.some((task) => task.id === current)
      ? current
      : availability.tasks[0]?.id || '');
  }, [data, selectedAssignmentId, selectedGuest]);

  useEffect(() => {
    if (!data?.game) return;
    setLiveDisplay({ title: data.game.display_title || '', body: data.game.display_body || '', publicClue: data.game.public_clue || '', timerMinutes: '0' });
    setGuestPhaseNote(data.game.phase_note || '');
  }, [data?.game?.display_title, data?.game?.display_body, data?.game?.public_clue, data?.game?.phase_note]);

  useEffect(() => {
    if (!selectedAward) return;
    setAwardForm({ title: selectedAward.title, winnerKind: selectedAward.winner_guest_id ? 'guest' : selectedAward.winner_team ? 'team' : 'none', winnerGuestId: selectedAward.winner_guest_id || '', winnerTeam: selectedAward.winner_team || '海岛组', reason: selectedAward.reason, sortOrder: String(selectedAward.sort_order), published: selectedAward.published });
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

  async function action(body: Record<string, unknown>, success = '操作已保存', onError?: (message: string) => void) {
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      const result = await responseBody(response);
      if (response.status === 401) clearAdminSession();
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success);
      await load();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '操作失败';
      setError(message);
      onError?.(message);
      return false;
    }
    finally { setBusy(false); }
  }

  async function approveSubmission(submission: AdminData['submissions'][number]) {
    const verificationNote = (reviewNotes[submission.id]?.trim()
      || `已按任务要求核验：${submission.task?.verification_method || '主办方现场确认'}`).slice(0, 500);
    const approved = await action(
      { type: 'approve', assignmentId: submission.id, verificationNote },
      `${submission.guest?.name || '宾客'}的任务已通过，系统已按任务规则结算`,
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

  function stageTransitionWarning(stage: string) {
    return stage === 'task_round_2'
      ? '系统会结束第一轮、处理尚未配对的最终角色，并一次性发放第二轮任务。'
      : stage === 'banquet'
        ? '宾客将进入婚宴阶段，已发放的第二轮任务可继续提交。'
      : stage === 'ceremony_end'
        ? '第一轮任务提交和伙伴配对会重新开放，但第二轮任务仍保持关闭。'
        : '系统会关闭当前投票、隐藏揭晓，并清空大屏上的上一题、公开线索和倒计时。';
  }

  function requestStageChange(stage: string) {
    if (!data?.game || data.game.results_published_at || !isNextLiveGameStage(data.game.stage, stage)) return;
    setStageError('');
    setPendingStage(stage);
  }

  async function confirmStageChange() {
    const stage = pendingStage;
    if (!data?.game || !stage || stage === data.game.stage || ['voting', 'results'].includes(stage)) {
      setPendingStage('');
      return;
    }
    setStageError('');
    const changed = await action(
      { type: 'setStage', stage },
      `已切换到「${gameStageCopy(stage).label}」`,
      setStageError,
    );
    if (changed) {
      setPendingStage('');
      setGuestPhaseNote('');
    }
  }

  function toggleVoting() {
    const opening = !data?.game?.voting_open;
    setPendingFinaleAction(opening ? 'open-voting' : 'close-voting');
  }

  async function confirmFinaleAction() {
    if (!pendingFinaleAction) return;
    const finaleAction = pendingFinaleAction;
    const ok = finaleAction === 'settle-team-clues'
      ? await action({ type: 'settleTeamClues' }, '团队积分已结算，排名线索已自动发放')
      : await action(
          { type: 'toggleVoting', value: finaleAction === 'open-voting' },
          finaleAction === 'open-voting' ? '新一轮最终投票已开启，宾客注册已关闭' : '最终投票已关闭',
        );
    if (ok) setPendingFinaleAction(null);
  }

  function requestResultsToggle() {
    if (data?.game?.results_published_at || data?.resultRewards.length) return;
    if (data?.game?.voting_open) {
      setError('请先关闭本轮投票，再公布身份并结算终局奖励。');
      return;
    }
    setPendingResultsVisible(true);
  }

  async function confirmResultsToggle() {
    if (pendingResultsVisible === null) return;
    if (data?.game?.voting_open) {
      setPendingResultsVisible(null);
      setError('投票仍在开放中；请先关闭本轮投票，再公布身份。');
      return;
    }
    const changed = await action({ type: 'toggleResults', value: true }, '身份已公布，全部终局奖励已结算；本场数据现已冻结');
    if (changed) setPendingResultsVisible(null);
  }

  function resetRehearsal(event: React.FormEvent) {
    event.preventDefault();
    setPendingResetConfirmation(true);
  }

  async function confirmResetRehearsal() {
    try {
      const eventKey = resetEventKey || createEventKey();
      setResetEventKey(eventKey); setError(''); setMessage(''); setBusy(true);
      const response = await fetch('/api/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'resetRehearsal',
          ...resetForm,
          eventKey,
          rehearsalRunId: data?.game?.rehearsal_run_id,
        }),
      });
      const result = await responseBody(response);
      if (response.status === 401) clearAdminSession();
      if (!response.ok) throw new Error(result.error || '彩排清场失败');
      const photoCleanupPending = Boolean(result.evidenceCleanupPending || result.avatarCleanupPending);
      const removedPhotos = Number(result.removedEvidence || 0) + Number(result.removedAvatars || 0);
      setResetCleanupPending(photoCleanupPending);
      setMessage(photoCleanupPending ? '数据库运行数据已清空，但部分私密照片仍待删除。即使刷新或重新登录，也可以在这里继续清理。' : `彩排数据已安全清空${removedPhotos ? `，并删除 ${removedPhotos} 张私密照片` : ''}。`);
      if (!photoCleanupPending) {
        setResetForm({ confirmation: '', backupConfirmed: false, reason: '婚礼正式开始前清空彩排记录' });
        setResetEventKey('');
      }
      setPendingResetConfirmation(false);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '当前浏览器无法发起彩排清场，请刷新管理台后重试'); }
    finally { setBusy(false); }
  }

  async function retryPendingRehearsalCleanup() {
    const eventKey = data?.pendingRehearsalCleanup?.eventKey || resetEventKey;
    if (!eventKey) { setError('找不到待继续的私密照片清理记录，请刷新后台后重试'); return; }
    try {
      setError(''); setMessage(''); setBusy(true);
      const response = await fetch('/api/admin-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'retryRehearsalCleanup', eventKey }),
      });
      const result = await responseBody(response);
      if (response.status === 401) clearAdminSession();
      if (!response.ok) throw new Error(result.error || '继续清理私密照片失败');
      const photoCleanupPending = Boolean(result.evidenceCleanupPending || result.avatarCleanupPending);
      const removedPhotos = Number(result.removedEvidence || 0) + Number(result.removedAvatars || 0);
      setResetCleanupPending(photoCleanupPending);
      setMessage(photoCleanupPending
        ? `本次已删除 ${removedPhotos} 张私密照片，仍有部分文件待处理；网络恢复后可再次继续。`
        : `剩余私密照片已全部清理${removedPhotos ? `，本次删除 ${removedPhotos} 张` : ''}。`);
      if (!photoCleanupPending) {
        setResetEventKey('');
        setResetForm({ confirmation: '', backupConfirmed: false, reason: '婚礼正式开始前清空彩排记录' });
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '继续清理私密照片失败'); }
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

  async function rotateStaffPassword(event: React.FormEvent) {
    event.preventDefault();
    if (adminPasswordForm.password !== adminPasswordForm.confirm) { setError('两次输入的管理员密码不一致'); return; }
    if (!window.confirm('确认更换管理员密码？保存后所有主办方、主持人和任务站设备都会退出，需要使用新密码重新登录。')) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'rotateAdminPassword', password: adminPasswordForm.password }) });
      const result = await responseBody(response);
      if (response.status === 401) clearAdminSession();
      if (!response.ok) throw new Error(result.error || '管理员密码更换失败');
      setAdminPasswordForm({ password: '', confirm: '' });
      clearAdminSession(); setMessage('管理员密码已更新，请使用新密码重新登录');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '管理员密码更换失败'); }
    finally { setBusy(false); }
  }

  async function importRoster(event: React.FormEvent) {
    event.preventDefault();
    if (!data?.game || data.game.registration_open || rosterImportPreview.issues.length || !rosterImportPreview.rows.length || !rosterImportConfirmed) return;
    if (!window.confirm(`确认新增 ${rosterImportPreview.rows.length} 位宾客？批量导入不会覆盖现有宾客。`)) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const response = await fetch('/api/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'importGuestRoster',
          rows: rosterImportPreview.rows,
          rehearsalRunId: data.game.rehearsal_run_id,
        }),
      });
      const result = await responseBody(response);
      if (response.status === 401) clearAdminSession();
      if (!response.ok) throw new Error(result.error || '批量导入失败');
      setRosterImportText(''); setRosterImportConfirmed(false);
      setMessage(`已新增 ${Number(result.importedCount) || rosterImportPreview.rows.length} 位宾客`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '批量导入失败'); }
    finally { setBusy(false); }
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">ORGANIZER ONLY</div><WeddingSignature compact/><div className="heart-mark">♡</div><h1>主办方<br/>控制台</h1><p className="lead">管理婚礼流程、审核任务与揭晓结果。</p><div className="staff-privacy-note">仅限主办方使用 · 请勿在宾客可见的屏幕上打开</div><form onSubmit={login}><label htmlFor="admin-password">管理员密码</label><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/><p className="login-note">连续输错五次后，该设备暂停登录十五分钟。</p><button disabled={busy}>{busy ? '登录中…' : '进入控制台'}</button>{error && <div className="notice error" role="alert">{error}</div>}</form></section></main>;

  const activeGuests = data.guests.filter((guest) => guest.active);
  const activeClues = data.clues.filter((clue) => clue.active);
  const eligibleTeamTricksters = activeGuests.filter((guest) => guest.uses_app
    && guest.participation_mode === 'ACTIVE_PLAYER' && guest.phase_two_eligible && guest.drawn_at
    && guest.role === 'spy' && TEAMS.includes(guest.team as typeof TEAMS[number]));
  const settledClueIdsForSelectedTeam = new Set(selectedGuest ? data.settledTeamClueIds[selectedGuest.team] ?? [] : []);
  const settledClueIdSet = new Set(Object.values(data.settledTeamClueIds).flat());
  const selectableCluesForSelectedGuest = selectedGuest ? activeClues.filter((clue) => clue.team_scope === selectedGuest.team
    && settledClueIdsForSelectedTeam.has(clue.id)) : [];
  const finalResultsLocked = Boolean(data.game?.results_published_at || data.resultRewards.length > 0);
  const officialLibraryTask = Boolean(libraryTask?.mission_code && /^P[12]-/i.test(libraryTask.mission_code));
  const selectedGuestClueEligible = Boolean(selectedGuest?.active
    && selectedGuest.uses_app
    && selectedGuest.drawn_at
    && selectedGuest.phase_two_eligible
    && selectedGuest.participation_mode === 'ACTIVE_PLAYER'
    && TEAMS.includes(selectedGuest.team as typeof TEAMS[number]));
  const manualTaskAvailability = selectedGuest && data.game ? getManualTaskAvailability({
    guest: selectedGuest,
    tasks: data.tasks,
    taskCatalogMode: data.game.task_catalog_mode,
    gameStage: data.game.stage,
    assignments: data.assignments.map((assignment) => ({
      id: assignment.id,
      guest_id: assignment.guest_id,
      task_id: assignment.task_id || assignment.task?.id || '',
      status: assignment.status,
    })),
    excludeAssignmentId: selectedAssignmentId || null,
  }) : { tasks: [] as Task[], reason: '请先选择宾客。' };
  const activeCatalogTasks = manualTaskAvailability.tasks;
  const reassignableAssignments = data.assignments.filter((assignment) => assignment.guest_id === selectedGuestId
    && !['approved','cancelled'].includes(assignment.status)
    && !/^P[12]-/i.test(assignment.task?.mission_code || ''));
  const ceremonyAssignments = data.assignments.filter((assignment) => assignment.task?.category === 'ceremony' && assignment.status !== 'cancelled');
  const claimed = activeGuests.filter((guest) => guest.claimed_at).length;
  const drawEligibleGuests = activeGuests.filter((guest) => guest.eligible_for_mission);
  const drawn = drawEligibleGuests.filter((guest) => guest.drawn_at).length;
  const waitingToDraw = Math.max(drawEligibleGuests.length - drawn, 0);
  const formalConfigurationLocked = Boolean(data.game?.task_catalog_mode === 'live'
    && (data.game.registration_open || data.game.stage !== 'registration' || claimed > 0 || drawn > 0));
  const selectedGuestCanPresetTrickster = Boolean(selectedGuest?.active
    && selectedGuest.uses_app
    && selectedGuest.participation_mode === 'ACTIVE_PLAYER'
    && selectedGuest.phase_two_eligible
    && selectedGuest.eligible_for_secret_role
    && selectedGuest.story_role === 'NONE');
  const avatarCount = activeGuests.filter((guest) => guest.avatar_path).length;
  const normalizedGuestSearch = guestSearch.trim().toLocaleLowerCase();
  const visibleGuests = data.guests.filter((guest) => {
    const matchesSearch = !normalizedGuestSearch || `${guest.name} ${guest.login_name} ${guest.team}`.toLocaleLowerCase().includes(normalizedGuestSearch);
    const matchesStatus = guestStatusFilter === 'all'
      || (guestStatusFilter === 'unclaimed' && guest.active && !guest.claimed_at)
      || (guestStatusFilter === 'claimed' && guest.active && guest.eligible_for_mission && Boolean(guest.claimed_at) && !guest.drawn_at)
      || (guestStatusFilter === 'drawn' && guest.active && Boolean(guest.drawn_at))
      || (guestStatusFilter === 'missing-avatar' && guest.active && !guest.avatar_path);
    return matchesSearch && matchesStatus;
  });
  const rosterGuest = data.guests.find((guest) => guest.id === rosterGuestId) ?? null;
  const votesByTarget = Object.entries(data.votes.reduce<Record<string, number>>((counts, vote) => {
    const name = vote.target?.name || '未知'; counts[name] = (counts[name] || 0) + vote.vote_weight; return counts;
  }, {})).sort((a, b) => b[1] - a[1]);
  const settledPersonalPoints = data.resultRewards.filter((reward) => reward.reward_type === 'guest_detective').reduce((sum, reward) => sum + reward.amount, 0);
  const clueGroups = Array.from(new Set(activeClues.map((clue) => clue.group_name || '身份线索'))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const teamTotals = TEAMS.map((teamName) => ({ team: teamName, points: data.game?.team_score_snapshot && data.game.team_clues_settled_at ? Number(data.game.team_score_snapshot[teamName] ?? 0) : data.teamPointLedger.filter((entry) => entry.team === teamName).reduce((sum, entry) => sum + entry.amount, 0) }));
  const competitiveDrawn = activeGuests.filter((guest) => guest.uses_app
    && guest.participation_mode === 'ACTIVE_PLAYER' && guest.phase_two_eligible
    && TEAMS.includes(guest.team as typeof TEAMS[number]) && guest.drawn_at).length;
  const missingFinalVotes = Math.max(competitiveDrawn - data.votes.length, 0);
  const topTeamScore = Math.max(...teamTotals.map((entry) => entry.points));
  const teamSettlementChecks = TEAMS.map((teamName) => {
    const teamTricksters = eligibleTeamTricksters.filter((guest) => guest.team === teamName);
    const points = teamTotals.find((entry) => entry.team === teamName)?.points ?? 0;
    return {
      team: teamName,
      spies: teamTricksters.length,
      clues: activeClues.filter((clue) => clue.team_scope === teamName
        && (clue.spy_guest_id === null || teamTricksters.some((guest) => guest.id === clue.spy_guest_id))).length,
      requiredClues: requiredTeamClueCount(points, topTeamScore),
      scoreRecorded: data.teamPointLedger.some((entry) => entry.team === teamName),
    };
  });
  const hasBothTeamScores = teamSettlementChecks.every((check) => check.scoreRecorded);
  const teamSettlementReady = competitiveDrawn === 20 && hasBothTeamScores
    && teamSettlementChecks.every((check) => check.spies === 1 && check.clues >= check.requiredClues);
  const teamSettlementStatus = `${competitiveDrawn}/20 人已抽卡 · ${teamSettlementChecks.map((check) => `${check.team}：成绩${check.scoreRecorded ? '已记录' : '未记录'}、恶作剧者 ${check.spies}/1、线索 ${check.clues}/${check.requiredClues}`).join(' · ')}`;
  const finaleActive = Boolean(data.game?.voting_open || finalResultsLocked || ['voting', 'results'].includes(data.game?.stage || ''));
  const activePrimaryPanel: AdminPanel = activePanel === 'review' ? 'live' : activePanel === 'data' ? 'content' : activePanel;
  const preparedAwards = data.awards.filter((award) => award.published && Boolean(award.winner_guest_id || award.winner_team)).length;
  const resetControlsClosed = !data.game?.registration_open && !data.game?.voting_open && !data.game?.results_visible && !data.game?.scoreboard_visible;
  const resetPreview = data.rehearsalResetPreview;
  const rehearsalDataCount = [
    'claimed_guests', 'drawn_guests', 'assignments', 'evidence_files', 'avatar_files', 'votes', 'result_rewards',
    'guest_clues', 'clue_library_entries', 'personal_ledger_entries', 'team_ledger_entries', 'spy_ledger_entries',
    'resource_ledger_entries', 'mutual_confirmations', 'symbol_pairings', 'helper_actions', 'player_relationships',
    'trickster_attempts', 'assigned_heart_slots', 'phase_two_profiles', 'phase_two_dilemmas', 'phase_two_copy_choices',
    'guest_sessions', 'published_awards', 'hidden_task_codes', 'legacy_alliance_clue_fragments',
    'pending_storage_cleanup_events',
  ].reduce((total, key) => total + Number(resetPreview[key as keyof typeof resetPreview] || 0), 0);
  const persistedCleanupPending = Boolean(data.pendingRehearsalCleanup);
  const photoCleanupPending = resetCleanupPending || persistedCleanupPending;
  const pendingPreflightItems = data.preflight.items.filter((item) => item.status !== 'ready');
  const passedPreflightItems = data.preflight.items.filter((item) => item.status === 'ready');
  const adminGuidance = !data.preflight.ready
    ? { label: '开场前检查尚未通过', detail: `${data.preflight.blockedCount} 项配置需要处理，完成后再开放宾客注册。`, action: '处理开场准备', panel: 'guests' as AdminPanel, tone: 'warning' }
    : data.submissions.length > 0
      ? { label: `${data.submissions.length} 项任务等待审核`, detail: '及时处理可以让宾客立即收到状态和积分更新。', action: '前往审核', panel: 'review' as AdminPanel, tone: 'attention' }
      : data.game?.results_visible
        ? { label: '终局已经公布并结算', detail: '检查最终排名与奖项，确认公开页面内容无误。', action: '查看终局', panel: 'finale' as AdminPanel, tone: 'complete' }
        : data.game?.voting_open
          ? { label: `第 ${data.game.voting_round} 轮投票进行中`, detail: `${data.votes.length}/${competitiveDrawn} 人已提交；人数确认后先关闭投票，再公布身份。`, action: '管理投票', panel: 'finale' as AdminPanel, tone: 'attention' }
          : data.game?.stage === 'group_game'
            ? { label: data.game.team_clues_settled_at ? '团队排名线索已发放，可以开启投票' : '下一步：结算团队积分并发放线索', detail: teamSettlementReady ? '团队成绩和线索条件已经齐备。' : teamSettlementStatus, action: '前往终局流程', panel: 'finale' as AdminPanel, tone: teamSettlementReady ? 'active' : 'warning' }
            : { label: `当前：${STAGES.find(([value]) => value === data.game?.stage)?.[1] || '尚未设置流程'}`, detail: '根据现场进度切换下一环节；宾客端会自动同步。', action: '管理现场流程', panel: 'live' as AdminPanel, tone: 'active' };

  return <main className="admin-shell">
    <section className="admin-hero"><div><div className="eyebrow">LIVE CONTROL</div><WeddingSignature inverse compact/><h1>婚礼游戏控制台</h1><p>{claimed}/{activeGuests.length} 位宾客已认领 · {data.submissions.length} 项待审核</p></div><div className="admin-hero-actions"><a href="/station">任务站</a><a href="/host">主持人流程台</a><StaffLogoutButton/><div className="live-dot">LIVE</div></div></section>
    {message && <div className="notice success sticky-notice"><span>{message}</span><button type="button" aria-label="关闭成功提示" onClick={() => setMessage('')}>×</button></div>}{error && <div className="notice error sticky-notice"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}

    <nav className="admin-panel-tabs" aria-label="主办方后台功能入口">{PRIMARY_ADMIN_PANELS.map((panel) => <button type="button" key={panel.id} className={activePrimaryPanel === panel.id ? 'active' : ''} aria-current={activePrimaryPanel === panel.id ? 'page' : undefined} onClick={() => openPanel(panel.id)}><span>{panel.label}</span></button>)}</nav>
    {finalResultsLocked && <div className="notice success" role="status"><strong>终局结果已发布，本场数据已冻结</strong><br/>任务审核、个人积分、线索、奖项和任务配置不能再修改；如需停止公开展示，请单独关闭大屏。</div>}

    {activePanel === 'data' && <section className="section-card"><div className="section-heading"><div><small>SECURITY</small><h2>管理员密码</h2></div><span className="ready-badge">加密保存</span></div><p className="muted">此密码同时用于主办方控制台、主持人台和任务站。更换后会立即退出所有工作人员设备；系统不会显示或导出密码。</p><form onSubmit={rotateStaffPassword}><label htmlFor="admin-password-new">新管理员密码</label><input id="admin-password-new" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={adminPasswordForm.password} onChange={(event) => setAdminPasswordForm({ ...adminPasswordForm, password: event.target.value })} required/><p className="field-help">12–128 位，必须同时包含字母和数字。</p><label htmlFor="admin-password-confirm">再次输入</label><input id="admin-password-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={adminPasswordForm.confirm} onChange={(event) => setAdminPasswordForm({ ...adminPasswordForm, confirm: event.target.value })} required/><button disabled={busy || adminPasswordForm.password.length < 12 || adminPasswordForm.password !== adminPasswordForm.confirm}>{busy ? '正在更新…' : '更换管理员密码并退出所有设备'}</button></form></section>}

    {activePanel === 'guests' && <><div className="wedding-health opening-health" aria-label="婚礼日系统状态">
      <div className="wedding-health-heading"><div><small>OPENING STATUS</small><strong>开场与宾客状态</strong></div><span className="health-online"><i aria-hidden="true"/>系统在线</span></div>
      <div className="wedding-health-grid">
        <div><small>当前流程</small><strong>{gameStageCopy(data.game?.stage).title}</strong></div>
        <div><small>宾客进度</small><strong>{claimed}/{activeGuests.length} 认领 · {drawn}/{drawEligibleGuests.length} 任务卡</strong></div>
        <div><small>待处理</small><strong>{data.submissions.length} 项任务 · 投票 {data.votes.length}/{competitiveDrawn}</strong></div>
        <div><small>最近同步</small><strong>{new Date(data.health.checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</strong></div>
      </div>
      <p>数据库已连接 · 部署 {data.health.deploymentVersion.slice(0, 12)}</p>
    </div><div className={`admin-guidance-card ${adminGuidance.tone}`}><div><small>现场指挥</small><strong>{adminGuidance.label}</strong><p>{adminGuidance.detail}</p></div><button type="button" onClick={() => openPanel(adminGuidance.panel)}>{adminGuidance.action}<span aria-hidden="true">→</span></button></div></>}

    {activePanel === 'guests' && <details className="admin-advanced-tools readiness-details" open={!data.preflight.ready}><summary>开场检查 · {data.preflight.ready ? `${passedPreflightItems.length} 项已通过` : `${pendingPreflightItems.length} 项需要处理`}</summary><section className="section-card readiness-card">
      <div className="section-heading"><div><small>OPENING CHECK</small><h2>{data.preflight.ready ? '开场条件已满足' : '只处理这些事项'}</h2></div><span className={data.preflight.ready ? 'ready-badge' : 'warning-badge'}>{data.preflight.ready ? '可以开场' : `${pendingPreflightItems.length} 项`}</span></div>
      {pendingPreflightItems.length > 0 && <div className="readiness-list readiness-priority-list">{pendingPreflightItems.map((item) => <div key={item.id} className="not-ready"><b aria-hidden="true">!</b><p><strong>{item.label}</strong><small>{item.detail}</small></p></div>)}</div>}
      {data.preflight.ready && <p className="readiness-complete-copy">宾客名单、任务配置和现场流程均已通过检查，无需逐项确认。</p>}
      <details className="readiness-passed-details"><summary>查看已通过的 {passedPreflightItems.length} 项</summary><div className="readiness-list">{passedPreflightItems.map((item) => <div key={item.id} className="ready"><b aria-hidden="true">✓</b><p><strong>{item.label}</strong><small>{item.detail}</small></p></div>)}</div></details>
      {!data.preflight.ready && <p className="readiness-help">只需处理上方事项；已通过的检查无需现场操作。</p>}
    </section></details>}

    {(activePanel === 'live' || activePanel === 'review') && <nav className="admin-section-tabs" aria-label="现场执行功能"><button type="button" className={activePanel === 'live' ? 'active' : ''} aria-current={activePanel === 'live' ? 'page' : undefined} onClick={() => openPanel('live')}><strong>流程控制</strong><small>切换环节与现场状态</small></button><button type="button" className={activePanel === 'review' ? 'active' : ''} aria-current={activePanel === 'review' ? 'page' : undefined} onClick={() => openPanel('review')}><strong>任务审核</strong><small>{data.submissions.length} 项待处理</small></button></nav>}

    {activePanel === 'live' && <>
    <section className="admin-grid">
      <details className="section-card admin-collapsible-card registration-control-card">
        <summary><div><small>REGISTRATION</small><strong>宾客注册</strong><span>{data.game?.registration_open ? '注册开放中' : finaleActive ? '注册已关闭 · 终局期间不可开放' : '注册已关闭'}</span></div><i className={data.game?.invitation_code_updated_at ? 'ready-badge' : 'warning-badge'}>{data.game?.invitation_code_updated_at ? '邀请码已设置' : '请更换示例码'}</i></summary>
        <div className="admin-collapsible-body"><p className="muted">首次进入由宾客自行设置四位密码，忘记后可在宾客列表中重置。开启最终投票时注册会自动关闭。</p><button disabled={busy || (!data.game?.registration_open && finaleActive)} onClick={() => action({ type: 'toggleRegistration', value: !data.game?.registration_open })}>{data.game?.registration_open ? '关闭注册' : finaleActive ? '终局期间不可开放' : '开放注册'}</button><div className={`control-state ${data.game?.registration_open ? 'on' : ''}`}>{data.game?.registration_open ? '● 注册开放中' : finaleActive ? '○ 已进入终局 · 本轮不能重新开放注册' : '○ 注册已关闭'}</div><details className="nested-action-details"><summary>更换共享邀请码</summary><form onSubmit={rotateInvitationCode}><p className="field-help">使用 6–32 位英文字母、数字或连字符。系统只保存哈希，保存后不会再次显示原码。</p><label htmlFor="invitation-code-new">新邀请码</label><input id="invitation-code-new" value={invitationCodeForm.code} onChange={(event) => setInvitationCodeForm({ ...invitationCodeForm, code: event.target.value.toUpperCase() })} minLength={6} maxLength={32} pattern="[A-Z0-9-]{6,32}" autoCapitalize="characters" autoComplete="off" required/><label htmlFor="invitation-code-confirm">再次输入</label><input id="invitation-code-confirm" value={invitationCodeForm.confirm} onChange={(event) => setInvitationCodeForm({ ...invitationCodeForm, confirm: event.target.value.toUpperCase() })} minLength={6} maxLength={32} pattern="[A-Z0-9-]{6,32}" autoCapitalize="characters" autoComplete="off" required/><button disabled={busy || invitationCodeForm.code.length < 6 || invitationCodeForm.code !== invitationCodeForm.confirm}>保存并替换旧邀请码</button></form></details></div>
      </details>
      <article className="section-card">
        <div className="section-heading"><div><small>GAME STAGE</small><h2>当前流程</h2></div></div>
        <div className="stage-flow-steps" aria-label="婚礼流程快捷切换">{LIVE_FLOW_STAGES.map((stage, index) => <button type="button" key={stage} className={data.game?.stage === stage ? 'current' : pendingStage === stage ? 'pending' : ''} disabled={busy || finalResultsLocked || !isNextLiveGameStage(data.game?.stage, stage)} onClick={() => requestStageChange(stage)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{gameStageCopy(stage).title}</strong><em>{gameStageCopy(stage).roundLabel}</em></button>)}</div>
        <label htmlFor="game-stage">切换婚礼环节</label>
        <select id="game-stage" value={pendingStage || data.game?.stage || 'registration'} disabled={busy || finalResultsLocked} onChange={(event) => requestStageChange(event.target.value)}>{STAGES.map(([value, label]) => <option value={value} key={value} disabled={value !== data.game?.stage && !isNextLiveGameStage(data.game?.stage, value)}>{label}{['voting', 'results'].includes(value) ? '（由下方按钮控制）' : value !== data.game?.stage && !isNextLiveGameStage(data.game?.stage, value) ? '（请按顺序进入）' : ''}</option>)}</select>
        {finalResultsLocked && <div className="control-state on">终局排名已发布，婚礼流程已锁定。</div>}
        <p className="field-help">“仪式结束”恢复第一轮提交；“婚宴前奏”发放第二轮任务；宾客入席后再切换到“婚宴开始”。投票、身份揭晓与积分结算统一在“终局结算”操作。</p>
        {pendingStage && <form className="stage-confirmation" role="alert" aria-live="assertive" onSubmit={(event) => { event.preventDefault(); void confirmStageChange(); }}><div><small>请确认流程切换</small><strong>{gameStageCopy(pendingStage).label}</strong><p>{stageTransitionWarning(pendingStage)}已经结算的积分不会撤销。</p>{stageError && <div className="notice error">切换失败：{stageError}</div>}</div><div><button type="submit" disabled={busy}>{busy ? '正在切换…' : pendingStage === 'task_round_2' ? '确认发放第二轮任务' : '确认切换流程'}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setPendingStage(''); setStageError(''); }}>取消</button></div></form>}
        <div className="stage-default-preview"><small>宾客端默认提示</small><strong>{gameStageCopy(data.game?.stage).label}</strong><p>{gameStageCopy(data.game?.stage).note}</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'setGuestPhaseNote', note: guestPhaseNote }, guestPhaseNote.trim() ? '宾客端补充提示已更新' : '宾客端已恢复默认提示'); }}><label htmlFor="guest-phase-note">临时补充提示（选填）</label><textarea id="guest-phase-note" value={guestPhaseNote} onChange={(event) => setGuestPhaseNote(event.target.value)} maxLength={500} placeholder="例如：第一轮任务延长五分钟，请完成后前往任务站核验。留空则只显示上方默认提示。"/><div className="form-grid"><button disabled={busy}>发布补充提示</button><button type="button" className="secondary" disabled={busy || !data.game?.phase_note} onClick={() => { void action({ type: 'setGuestPhaseNote', note: '' }, '宾客端已恢复当前阶段默认提示').then((ok) => { if (ok) setGuestPhaseNote(''); }); }}>恢复默认提示</button></div></form>
        <div className="control-buttons">
          <button disabled={busy} className="secondary" onClick={() => action({ type: 'toggleScoreboard', value: !data.game?.scoreboard_visible })}>{data.game?.scoreboard_visible ? '关闭大屏' : '开放大屏'}</button>
        </div>
        <div className={`control-state ${data.game?.scoreboard_visible ? 'on' : ''}`}>{data.game?.scoreboard_visible ? '● 公开大屏显示中' : '○ 公开大屏已关闭'}</div>
      </article>
    </section>

    <section className="section-card"><div className="section-heading"><div><small>CEREMONY MISSIONS</small><h2>仪式任务流程</h2></div><span>{ceremonyAssignments.filter((assignment) => assignment.ceremony_status === 'COMPLETED').length}/{ceremonyAssignments.length}</span></div><p className="muted">戒指守护者必须先指定负责哪一枚戒指。选择“已完成”会立即由系统审核通过并计分；重复确认不会重复加分。</p>{ceremonyAssignments.length === 0 ? <div className="empty-state">仪式角色抽卡后会显示在这里。</div> : <div className="relationship-admin-list">{ceremonyAssignments.map((assignment) => <div key={assignment.id}><strong>{assignment.guest?.name} · {assignment.task?.title}</strong>{assignment.task?.mission_code === 'P1-CER-002' && <select aria-label={`${assignment.guest?.name}负责的戒指`} value={assignment.ring_variant ?? ''} disabled={busy || finalResultsLocked} onChange={(event) => void action({ type: 'updateCeremonyAssignment', assignmentId: assignment.id, ceremonyStatus: assignment.ceremony_status || 'AVAILABLE', ringVariant: event.target.value }, '戒指分工已保存')}><option value="">选择负责戒指</option><option value="GROOM_RING">新郎戒指</option><option value="BRIDE_RING">新娘戒指</option></select>}<select aria-label={`${assignment.guest?.name}的仪式状态`} value={assignment.ceremony_status || 'AVAILABLE'} disabled={busy || finalResultsLocked || assignment.status === 'approved' || (assignment.task?.mission_code === 'P1-CER-002' && !assignment.ring_variant)} onChange={(event) => void action({ type: 'updateCeremonyAssignment', assignmentId: assignment.id, ceremonyStatus: event.target.value, ringVariant: assignment.ring_variant }, '仪式任务状态已更新')}>{Object.entries(CEREMONY_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}</div>}</section>

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>HOST DISPLAY</small><h2>主持人与大屏内容</h2></div><a className="text-link" href="/scoreboard" target="_blank" rel="noreferrer">打开大屏 ↗</a></div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'setLiveDisplay', title: liveDisplay.title, body: liveDisplay.body, publicClue: liveDisplay.publicClue, timerMinutes: Number(liveDisplay.timerMinutes) }, '大屏内容已更新'); }}><label htmlFor="display-title">当前题目或环节标题</label><input id="display-title" value={liveDisplay.title} onChange={(event) => setLiveDisplay({ ...liveDisplay, title: event.target.value })} maxLength={120} placeholder="例如：爱情档案解密 · 第一题"/><label htmlFor="display-body">公开规则或题目</label><textarea id="display-body" value={liveDisplay.body} onChange={(event) => setLiveDisplay({ ...liveDisplay, body: event.target.value })} maxLength={1000} placeholder="这里只填写可以公开展示的内容，不要填写正确答案。"/><label htmlFor="public-clue">公开线索</label><input id="public-clue" value={liveDisplay.publicClue} onChange={(event) => setLiveDisplay({ ...liveDisplay, publicClue: event.target.value })} maxLength={500} placeholder="留空则不显示"/><label htmlFor="timer-minutes">重新开始倒计时（分钟，0 表示关闭）</label><input id="timer-minutes" type="number" min={0} max={120} value={liveDisplay.timerMinutes} onChange={(event) => setLiveDisplay({ ...liveDisplay, timerMinutes: event.target.value })}/><button disabled={busy}>发布到大屏</button></form></article>
      <article className="section-card"><div className="section-heading"><div><small>TEAM GAME SCORE</small><h2>团队游戏计分</h2></div><span className={data.game?.team_clues_settled_at ? 'ready-badge' : ''}>{data.game?.team_clues_settled_at ? '已结算' : data.game?.stage === 'group_game' ? '可计分' : '等待团队挑战'}</span></div><div className="team-total-list">{teamTotals.map((item) => <div key={item.team}><strong>{item.team}</strong><span>{item.points > 0 ? '+' : ''}{item.points} 团队分</span></div>)}</div>{data.game?.stage !== 'group_game' && <div className="control-state">团队积分只记录婚宴互动 · 团队挑战的现场成绩。请先切换到该环节。</div>}{data.game?.team_clues_settled_at && <div className="control-state on">团队积分已锁定，团队排名线索已发放。</div>}<form onSubmit={(event) => { event.preventDefault(); const body = { type: 'adjustTeamPoints', team: teamScore.team, amount: Number(teamScore.amount), reason: teamScore.reason, rehearsalRunId: data.game?.rehearsal_run_id }; const signature = JSON.stringify(body); const pending = pendingScoreRef.current?.signature === signature ? pendingScoreRef.current : { signature, eventKey: createEventKey() }; pendingScoreRef.current = pending; if (!window.confirm(`确认记录 ${teamScore.team} 本次 ${Number(teamScore.amount) > 0 ? '+' : ''}${teamScore.amount} 团队分？\n这会累加到当前团队分。\n原因：${teamScore.reason}`)) return; void action({ ...body, eventKey: pending.eventKey }, '团队积分已记录').then((ok) => { if (ok) pendingScoreRef.current = null; }); }}><fieldset className="score-lock-fieldset" disabled={data.game?.stage !== 'group_game' || Boolean(data.game?.team_clues_settled_at) || finalResultsLocked}><label htmlFor="score-team">组别</label><select id="score-team" value={teamScore.team} onChange={(event) => setTeamScore({ ...teamScore, team: event.target.value })}>{TEAMS.map((teamName) => <option key={teamName}>{teamName}</option>)}</select><div className="form-grid"><div><label htmlFor="score-amount">本次分数变化（累加）</label><input id="score-amount" type="number" min={-1000} max={1000} value={teamScore.amount} onChange={(event) => setTeamScore({ ...teamScore, amount: event.target.value })} required/></div><div><label htmlFor="score-reason">原因</label><input id="score-reason" value={teamScore.reason} onChange={(event) => setTeamScore({ ...teamScore, reason: event.target.value })} maxLength={200} required/></div></div><div className="score-presets"><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '5', reason: '团队挑战得分' })}>常用 +5</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '3', reason: '团队挑战得分' })}>常用 +3</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '1', reason: '团队挑战得分' })}>常用 +1</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '0', reason: '团队挑战最终成绩为零' })}>记录 0 分</button></div><button disabled={busy || teamScore.amount === '' || !teamScore.reason.trim()}>记录团队积分</button></fieldset></form></article>
    </section>
    </>}
    <fieldset className="score-lock-fieldset" disabled={finalResultsLocked}>

    {activePanel === 'review' && <><section className="section-card admin-score-shortcut"><div><small>MANUAL SCORE</small><h2>现场需要给宾客加分？</h2><p>个人加分不改变团队挑战分；家人组也能获得个人积分并进入个人排名。</p></div><button type="button" onClick={openManualScoreTools} disabled={finalResultsLocked}>{finalResultsLocked ? '终局后已冻结' : '调整个人积分 →'}</button></section><section className="section-card"><div className="section-heading"><div><small>APPROVAL QUEUE</small><h2>待审核任务</h2></div><span>{data.submissions.length}</span></div>{data.submissions.length === 0 ? <div className="empty-state">暂无待审核提交。</div> : data.submissions.map((submission) => <article className="approval-row" key={submission.id}><div className="approval-copy"><strong>{submission.guest?.name}</strong><p>{submission.task?.title} · {submission.task?.points} 分</p><div className="verification-note"><strong>核验要求</strong><span>{submission.task?.verification_method}</span></div>{submission.completion_note && <div className="submission-note"><strong>宾客完成说明</strong><span>{submission.completion_note}</span></div>}{submission.evidence_url && <figure className="evidence-preview compact"><a href={submission.evidence_url} target="_blank" rel="noreferrer"><img src={submission.evidence_url} alt={`${submission.task?.title || '任务'}的验证照片`} loading="lazy"/></a><figcaption>点击查看验证照片</figcaption></figure>}{submission.evidence_uploaded_at && !submission.evidence_url && <div className="inline-feedback error" role="status"><span>验证照片暂时无法打开，请刷新后重试，或当面核验后再结算。</span></div>}</div><div className="approval-actions"><label htmlFor={`review-note-${submission.id}`}>审核备注 <small>通过可留空；退回必须填写</small></label><input id={`review-note-${submission.id}`} value={reviewNotes[submission.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [submission.id]: event.target.value }))} maxLength={500} placeholder="例如：照片不清楚，请重新提交"/><div><button data-testid={`approve-${submission.id}`} disabled={busy} onClick={() => void approveSubmission(submission)}>{busy ? '处理中…' : '通过并结算'}</button><button disabled={busy || !reviewNotes[submission.id]?.trim()} className="danger" onClick={() => void rejectSubmission(submission)}>退回</button></div></div></article>)}</section>

    <details ref={operatorToolsRef} className="admin-advanced-tools" open={operatorToolsOpen} onToggle={(event) => setOperatorToolsOpen(event.currentTarget.open)}><summary>宾客操作：个人加分、预设身份、临时任务与线索</summary><section className="section-card"><div className="section-heading"><div><small>QUICK OPERATIONS</small><h2>宾客操作台</h2></div></div>
      <label htmlFor="operation-guest">选择宾客</label><select id="operation-guest" value={selectedGuestId} onChange={(event) => { setSelectedGuestId(event.target.value); setSelectedAssignmentId(''); setSelectedTaskId(''); setPointAmount(''); setPointReason(''); setSelectedClueId(''); pendingScoreRef.current = null; }}>{activeGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team} · {guest.points} 分</option>)}</select>
      {selectedGuest && <div className="operation-grid">
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'configureGuest', guestId: selectedGuest.id, team, role }, role === 'spy' ? '同队恶作剧者身份已预设' : '已恢复为抽卡时随机身份'); }}><h3>预设恶作剧者</h3><p className="muted">正式名单的组别已经固定。开场前可以预设一名同队恶作剧者；选择“随机身份”会取消预设，由系统在抽卡时决定。</p>{formalConfigurationLocked && <div className="notice">名单已经进入使用，身份预设已锁定。如需重排，请先完成彩排清场。</div>}<label htmlFor="guest-team">正式组别（不可在这里改动）</label><select id="guest-team" value={selectedGuest.phase_two_eligible ? team : ''} disabled={data.game?.task_catalog_mode === 'live' || finalResultsLocked || !selectedGuest.phase_two_eligible} onChange={(event) => setTeam(event.target.value)}><option value="">家人组或非竞技玩家</option>{TEAMS.map((value) => <option key={value} value={value}>{value}</option>)}</select><label htmlFor="guest-role">抽卡身份</label><select id="guest-role" value={role} disabled={finalResultsLocked || formalConfigurationLocked || !selectedGuestCanPresetTrickster} onChange={(event) => setRole(event.target.value)}><option value="guest">随机身份（默认）</option><option value="spy">预设为恶作剧者</option></select><button disabled={busy || finalResultsLocked || formalConfigurationLocked || Boolean(selectedGuest.drawn_at) || !selectedGuestCanPresetTrickster}>{finalResultsLocked ? '终局后已冻结' : formalConfigurationLocked ? '开场后已锁定' : selectedGuestCanPresetTrickster ? '保存恶作剧者预设' : '这位宾客不进入恶作剧者池'}</button></form>
        {data.game?.task_catalog_mode === 'live' ? <div className="tool-empty-state"><strong>正式剧情职务由名单固定</strong><span>仪式角色、爱心与星星持有者会按版本化清单抽取，现场不能逐人覆盖，避免固定任务人数漂移。</span></div> : <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'configureStoryRole', guestId: selectedGuest.id, storyRole }, '剧情职务已保存，抽卡时会领取对应任务'); }}><h3>指定剧情职务</h3><p className="muted">剧情职务不是阵营。固定仪式、爱心和星星职务不会进入恶作剧者池；爱心与星星各五人。</p><label htmlFor="guest-story-role">剧情职务</label><select id="guest-story-role" value={storyRole} disabled={finalResultsLocked} onChange={(event) => setStoryRole(event.target.value)}>{Object.entries(STORY_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{value === 'NONE' ? '无固定职务' : label}</option>)}</select><div className="control-state">玩家编号：{selectedGuest.player_code} · 后天角色：{selectedGuest.unlocked_role === 'NONE' ? '尚未解锁' : selectedGuest.unlocked_role}</div><button disabled={busy || finalResultsLocked || Boolean(selectedGuest.drawn_at) || selectedGuest.participation_mode !== 'ACTIVE_PLAYER'}>{finalResultsLocked ? '终局后已冻结' : '保存剧情职务'}</button></form>}
        {selectedGuest.phase_two_eligible && (data.game?.task_catalog_mode === 'live' ? <div className="tool-empty-state"><strong>第二轮由流程统一派发</strong><span>晚宴任务、双重裁决、超级幸运星和领航星会在进入婚宴前奏时一次性校验并自动分配，不能逐人提前覆盖。</span></div> : <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'configurePhaseTwoProfile', guestId: selectedGuest.id, ...phaseTwoForm, extraVote: phaseTwoForm.primaryMission === 'EXTRA_VOTE', superLucky: phaseTwoForm.primaryMission === 'SUPER_LUCKY', isCaptain: phaseTwoForm.primaryMission === 'TEAM_CAPTAIN' }, '第二轮任务与能力已保存'); }}><h3>第二轮任务配置</h3><p className="muted">每人只领取一项晚宴任务或能力卡；双重裁决、超级幸运星和领航星队长都不会再叠加普通任务。</p><label htmlFor="phase-two-mission">任务或能力卡</label><select id="phase-two-mission" value={phaseTwoForm.primaryMission} disabled={finalResultsLocked || Boolean(selectedPhaseTwoProfile?.unlocked_at)} onChange={(event) => { const primaryMission = event.target.value; setPhaseTwoForm({ ...phaseTwoForm, primaryMission, isCaptain: primaryMission === 'TEAM_CAPTAIN' }); }}><option value="">尚未指定</option>{Object.entries(PHASE_TWO_MISSION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label htmlFor="phase-two-theme">互动/合影主题（仅新人互动任务）</label><input id="phase-two-theme" value={phaseTwoForm.interactionTheme} disabled={finalResultsLocked || Boolean(selectedPhaseTwoProfile?.unlocked_at)} onChange={(event) => setPhaseTwoForm({ ...phaseTwoForm, interactionTheme: event.target.value })} maxLength={120} placeholder="例如：电影海报照"/><button disabled={busy || finalResultsLocked || Boolean(selectedPhaseTwoProfile?.unlocked_at)}>{finalResultsLocked ? '终局后已冻结' : '保存第二轮任务配置'}</button></form>)}
        {data.game?.task_catalog_mode === 'demo' ? <form onSubmit={(event) => { event.preventDefault(); if (!activeCatalogTasks.some((task) => task.id === selectedTaskId)) { setError(manualTaskAvailability.reason || '请选择当前可手动派发的任务'); return; } if (selectedAssignmentId && !reassignableAssignments.some((assignment) => assignment.id === selectedAssignmentId)) { setError("要替换的任务已经变化，请刷新后重试"); return; } if (!window.confirm(`确认任务派发给 ${selectedGuest.name}？`)) return; void action(selectedAssignmentId ? { type: 'reassignTask', assignmentId: selectedAssignmentId, taskId: selectedTaskId, reason: '管理员在宾客操作台重新分配任务' } : { type: 'assignTask', guestId: selectedGuest.id, taskId: selectedTaskId }, selectedAssignmentId ? '原任务已取消，新任务已经派发' : '任务已派发'); }}><h3>演示任务派发</h3><p className="muted">仅用于演示模式；改派会保留旧任务的审计记录并将其标记为已取消。</p><label htmlFor="replace-assignment">要替换的任务</label><select id="replace-assignment" value={selectedAssignmentId} disabled={finalResultsLocked} onChange={(event) => setSelectedAssignmentId(event.target.value)}><option value="">不替换，新增一项任务</option>{reassignableAssignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.task?.title} · {assignment.status}</option>)}</select>{activeCatalogTasks.length ? <><label htmlFor="assign-task">选择当前可派发任务</label><select id="assign-task" value={activeCatalogTasks.some((task) => task.id === selectedTaskId) ? selectedTaskId : ''} disabled={finalResultsLocked} onChange={(event) => setSelectedTaskId(event.target.value)}><option value="">请选择</option>{activeCatalogTasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.points} 分</option>)}</select></> : <div className="tool-empty-state"><strong>当前无法派发演示任务</strong><span>{manualTaskAvailability.reason}</span></div>}<button disabled={busy || finalResultsLocked || !activeCatalogTasks.some((task) => task.id === selectedTaskId)}>{finalResultsLocked ? '终局后已冻结' : selectedAssignmentId ? `重新分配给 ${selectedGuest.name}` : `派发给 ${selectedGuest.name}`}</button></form> : <div className="tool-empty-state"><strong>正式婚礼不开放临时任务</strong><span>当前只执行已确认的 23 项正式任务；第一轮由抽卡、第二轮由流程切换自动派发。</span></div>}
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'grantClue', guestId: selectedGuest.id, clueId: selectedClueId }, '本轮已赢得线索已补发'); }}><h3>补发本轮已赢得线索</h3><p className="muted">{selectedGuestClueEligible ? `这里只显示 ${selectedGuest.team} 在本次团队结算中已经赢得的线索；不能从线索库另选一条发给宾客。` : '线索只能补发给已抽卡、参加第二轮的海岛组或沙漠组正式玩家。'}</p>{!data.game?.team_clues_settled_at && <div className="notice">团队结算前不能补发线索；请先在终局流程完成“结算团队积分并发放线索”。</div>}{finalResultsLocked && <div className="notice">终局结果已经发布，不能继续补发线索。</div>}{selectedGuestClueEligible && selectableCluesForSelectedGuest.length ? <><label htmlFor="grant-clue">选择 {selectedGuest.team} 本轮已结算线索</label><select id="grant-clue" value={selectableCluesForSelectedGuest.some((clue) => clue.id === selectedClueId) ? selectedClueId : ''} disabled={finalResultsLocked || !data.game?.team_clues_settled_at} onChange={(event) => setSelectedClueId(event.target.value)}><option value="">请选择</option>{selectableCluesForSelectedGuest.map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</select></> : selectedGuestClueEligible ? <div className="tool-empty-state"><strong>{selectedGuest.team} 当前没有可补发线索</strong><span>请核对团队结算记录；新增线索不会进入本轮补发列表。</span></div> : <div className="tool-empty-state"><strong>这位宾客不符合线索补发条件</strong><span>固定仪式角色和恶作剧者只要参加第二轮并已抽卡，也属于正式玩家，可以收到同队线索。</span></div>}<button disabled={busy || finalResultsLocked || !data.game?.team_clues_settled_at || !selectedGuestClueEligible || !selectableCluesForSelectedGuest.some((clue) => clue.id === selectedClueId)}>{finalResultsLocked ? '终局后已冻结' : !data.game?.team_clues_settled_at ? '团队结算后可补发' : `补发给 ${selectedGuest.name}`}</button></form>
        <form id="manual-personal-score" onSubmit={(event) => { event.preventDefault(); const amount = Number(pointAmount); const body = { type: 'adjustPoints', guestId: selectedGuest.id, amount, reason: pointReason, rehearsalRunId: data.game?.rehearsal_run_id }; const signature = JSON.stringify(body); const pending = pendingScoreRef.current?.signature === signature ? pendingScoreRef.current : { signature, eventKey: createEventKey() }; pendingScoreRef.current = pending; if (!window.confirm(`确认调整 ${selectedGuest.name} 的个人积分？\n当前 ${selectedGuest.points} 分 · 本次 ${amount > 0 ? '+' : ''}${amount} 分\n原因：${pointReason}`)) return; void action({ ...body, eventKey: pending.eventKey }, '个人积分已调整').then((ok) => { if (ok) { setPointAmount(''); setPointReason(''); pendingScoreRef.current = null; } }); }}><h3>人工调整个人积分</h3><p className="muted">只改变个人积分，不改变团队分；家人组也可以获得个人分，但不会被计入海岛组或沙漠组的团队分，并会进入最终个人排名。可输入正数或负数，必须填写原因并会写入审计流水。</p>{finalResultsLocked && <div className="notice">终局结果已经发布，所有个人积分已锁定。</div>}{!selectedGuest.eligible_for_personal_score && <div className="notice">这位宾客当前不参与个人计分，不能在此调整。</div>}<div className="selected-score-target"><span>本次调整对象</span><strong>{selectedGuest.name}</strong><small>{selectedGuest.team} · 当前 {selectedGuest.points} 分</small></div><label htmlFor="point-amount">分数变化</label><input id="point-amount" type="number" min={-1000} max={1000} value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="例如 2 或 -1" disabled={finalResultsLocked || !selectedGuest.eligible_for_personal_score} required/><label htmlFor="point-reason">调整原因</label><input id="point-reason" value={pointReason} onChange={(event) => setPointReason(event.target.value)} maxLength={200} placeholder="例如：现场游戏奖励或纠正误计分" disabled={finalResultsLocked || !selectedGuest.eligible_for_personal_score} required/><button disabled={busy || finalResultsLocked || !selectedGuest.eligible_for_personal_score || !pointAmount || Number(pointAmount) === 0 || !pointReason.trim()}>{finalResultsLocked ? '终局后已冻结' : `确认调整 ${selectedGuest.name}`}</button></form>
      </div>}
    </section></details></>}
    </fieldset>

    {activePanel === 'content' && <><section className="section-card settings-safety-shortcut"><div><small>SECURITY &amp; DATA</small><strong>安全、备份与清场</strong><p>更换管理员密码、导出数据或在正式开始前清空彩排记录。</p></div><button type="button" className="secondary" onClick={() => openPanel('data')}>{rehearsalDataCount ? `${rehearsalDataCount} 条运行记录 · 进入管理` : '当前已清场 · 进入管理'} →</button></section><section className="admin-grid settings-module-grid">
      <details className="section-card admin-collapsible-card settings-module-card">
        <summary><div><small>TASK LIBRARY</small><strong>任务库管理</strong><span>编辑任务内容、积分与开放阶段</span></div><i>{data.tasks.filter((task) => task.active).length}/{data.tasks.length} 启用</i></summary>
        <div className="admin-collapsible-body">
        <a className="text-link" href="/admin/cards" target="_blank" rel="noreferrer">打开可打印宾客卡片 ↗</a>
        {data.game?.task_catalog_mode === 'demo' && <div className="demo-task-note"><strong>当前使用演示任务池</strong><p>宾客抽卡只会获得标记为“演示”的任务；现有候选任务仍保留，收到最终清单后再切换为正式模式。</p></div>}
        <label htmlFor="library-task">选择任务或新建</label>
        <select id="library-task" value={libraryTaskId} onChange={(event) => setLibraryTaskId(event.target.value)}>{data.game?.task_catalog_mode === 'demo' && <option value="new">＋ 新建演示任务</option>}{data.tasks.filter((task) => data.game?.task_catalog_mode === 'demo' || /^P[12]-/i.test(task.mission_code || '')).map((task) => <option key={task.id} value={task.id}>{task.active ? '●' : '○'} {task.is_demo ? '演示 · ' : ''}{/^P[12]-/i.test(task.mission_code || '') ? '正式 · ' : '自定义 · '}{task.title}</option>)}</select>
        {officialLibraryTask && libraryTask ? <div className="library-preview"><div><strong>正式任务 · {libraryTask.mission_code}</strong><h3>{libraryTask.title}</h3><p>{libraryTask.description}</p><small>{libraryTask.points} 分 · {CATEGORY_LABELS[libraryTask.category] || libraryTask.category} · {libraryTask.verification_method}</small></div><div className="notice">正式 P1/P2 任务由版本化任务清单维护，这里仅供核对，不能在婚礼现场修改或停用。</div></div> : data.game?.task_catalog_mode === 'live' ? <div className="tool-empty-state"><strong>正式模式已锁定任务清单</strong><span>婚礼现场不能新建、编辑或人工派发临时任务，避免宾客收到正式清单之外的内容。</span></div> : <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveTask', taskId: libraryTaskId === 'new' ? null : libraryTaskId, ...newTask, points: Number(newTask.points) }, libraryTaskId === 'new' ? '演示任务已加入任务库' : '演示任务已保存').then((ok) => { if (ok && libraryTaskId === 'new') setLibraryTaskId('new'); }); }}><fieldset className="score-lock-fieldset" disabled={finalResultsLocked}><div className="notice"><strong>演示任务不会进入正式任务清单</strong><br/>它只在演示模式使用，不会替换 23 项正式 P1/P2 任务。</div>
          <label htmlFor="task-title">标题</label><input id="task-title" value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} maxLength={120} required/>
          <label htmlFor="task-description">任务说明</label><textarea id="task-description" value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} maxLength={1000} required/>
          <label htmlFor="task-verification">验证方式</label><textarea id="task-verification" value={newTask.verificationMethod} onChange={(event) => setNewTask({ ...newTask, verificationMethod: event.target.value })} maxLength={500} required/>
          <p className="field-help">写清需要出示照片、提供口令、由相关宾客确认，或由工作人员现场观察。</p>
          <div className="form-grid">
            <div><label htmlFor="task-points">个人积分</label><input id="task-points" type="number" min={0} max={12} value={newTask.points} onChange={(event) => setNewTask({ ...newTask, points: event.target.value })} required/><p className="field-help">根据现场奖励强度设置，正式婚礼任务不在这里修改。</p></div>
            <div><label htmlFor="task-role">适用身份</label><select id="task-role" value={newTask.roleScope === 'helper' ? 'guest' : newTask.roleScope} onChange={(event) => { const roleScope = event.target.value; setNewTask({ ...newTask, roleScope, points: String(recommendedTaskPoints(newTask.category, roleScope)) }); }}><option value="all">所有身份</option><option value="guest">婚礼守护者</option><option value="spy">丘比特的恶作剧者</option></select></div>
            <div><label htmlFor="task-category">类型</label><select id="task-category" value={newTask.category} onChange={(event) => { const category = event.target.value; setNewTask({ ...newTask, category, points: String(recommendedTaskPoints(category, newTask.roleScope)) }); }}>{Object.entries(CATEGORY_LABELS).filter(([value]) => value !== 'hidden').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
            <div><label htmlFor="task-stage">开放阶段</label><select id="task-stage" value={newTask.stage} onChange={(event) => setNewTask({ ...newTask, stage: event.target.value })}>{STAGES.filter(([value]) => ['task_round_1', 'task_round_2', 'group_game'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <label className="ready-check"><input type="checkbox" checked={newTask.active} onChange={(event) => setNewTask({ ...newTask, active: event.target.checked })}/><span><strong>允许继续派发</strong><small>停用后不会影响已领取这项任务的宾客。</small></span></label>
          {libraryTaskId !== 'new' && <p className="field-help">自定义任务一旦派发，积分、身份范围、类型和阶段会锁定；仍可修正文案或停用。</p>}
          <button disabled={busy}>{libraryTaskId === 'new' ? '创建演示任务' : '保存演示任务'}</button>
        </fieldset></form>}
        </div>
      </details>
      <details className="section-card admin-collapsible-card settings-module-card">
        <summary><div><small>TEAM CLUE LIBRARY</small><strong>团队线索库</strong><span>按队伍准备现场发放的秘密线索</span></div><i>{activeClues.length} 条</i></summary>
        <div className="admin-collapsible-body">
          <p className="muted">这里默认保持为空。现场创建线索时必须指定海岛组或沙漠组。最高团队分大于 0 时，第一名自动获得 2 条、另一队获得 1 条；正分并列第一时两队各获得 2 条；0:0 时没有第一名，两队各获得 1 条基础线索。</p>
          <label htmlFor="library-clue">选择线索或新建</label>
          <select id="library-clue" value={libraryClueId} onChange={(event) => setLibraryClueId(event.target.value)}><option value="new">＋ 新建线索</option>{TEAMS.map((teamName) => <optgroup key={teamName} label={`${teamName} · ${activeClues.filter((clue) => clue.team_scope === teamName).length} 条`}>{activeClues.filter((clue) => clue.team_scope === teamName).map((clue) => <option key={clue.id} value={clue.id}>{clue.group_name} · {clue.title}</option>)}</optgroup>)}{activeClues.some((clue) => !clue.team_scope) && <optgroup label="待指定队伍">{activeClues.filter((clue) => !clue.team_scope).map((clue) => <option key={clue.id} value={clue.id}>{clue.group_name} · {clue.title}</option>)}</optgroup>}</select>
          <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveClue', clueId: libraryClueId === 'new' ? null : libraryClueId, title: newClue.title, content: newClue.content, groupName: newClue.groupName, teamScope: newClue.teamScope }, libraryClueId === 'new' ? '团队线索已加入线索库' : '团队线索已保存').then((ok) => { if (ok && libraryClueId === 'new') setNewClue({ ...newClue, title: '', content: '' }); }); }}>
            <fieldset className="score-lock-fieldset" disabled={finalResultsLocked}>
              <label htmlFor="clue-team">适用队伍</label><select id="clue-team" value={newClue.teamScope} onChange={(event) => setNewClue({ ...newClue, teamScope: event.target.value as '' | typeof TEAMS[number] })} required><option value="">请选择队伍</option>{TEAMS.map((teamName) => <option key={teamName} value={teamName}>{teamName}</option>)}</select>
              <label htmlFor="clue-group">分类标签</label><input id="clue-group" value={newClue.groupName} onChange={(event) => setNewClue({ ...newClue, groupName: event.target.value })} maxLength={60} list="clue-group-options" required/><datalist id="clue-group-options">{clueGroups.map((group) => <option key={group} value={group}/>)}</datalist>
              <label htmlFor="clue-title">线索名称</label><input id="clue-title" value={newClue.title} onChange={(event) => setNewClue({ ...newClue, title: event.target.value })} maxLength={120} required/>
              <label htmlFor="clue-content">线索内容</label><textarea id="clue-content" value={newClue.content} onChange={(event) => setNewClue({ ...newClue, content: event.target.value })} maxLength={1000} required/>
              <button disabled={busy || finalResultsLocked || !newClue.teamScope}>{finalResultsLocked ? '终局后已冻结' : libraryClueId === 'new' ? '添加团队线索' : '保存团队线索'}</button>
              {libraryClueId !== 'new' && libraryClue && <button type="button" className="danger secondary" disabled={busy || finalResultsLocked || settledClueIdSet.has(libraryClue.id)} onClick={() => { if (window.confirm(`确认停用线索“${libraryClue.title}”？\n尚未结算发放的线索可以停用。`)) void action({ type: 'deactivateClue', clueId: libraryClue.id }, '线索已停用'); }}>{finalResultsLocked ? '终局后已冻结' : settledClueIdSet.has(libraryClue.id) ? '本轮已发放，需保持启用' : '停用这条线索'}</button>}
            </fieldset>
          </form>
          {libraryClueId !== 'new' && libraryClue && <div className="library-preview"><div><strong>{newClue.teamScope || '待指定队伍'} · {newClue.groupName} · {newClue.title}</strong><p>{newClue.content}</p></div></div>}
        </div>
      </details>
    </section>

    <section className="admin-grid settings-module-grid">
      <details className="section-card admin-collapsible-card settings-module-card"><summary><div><small>SYMBOL PAIRING</small><strong>自由图案配对</strong><span>查看爱心、星星与玩家确认关系</span></div><i>{data.symbolPairings.filter((item) => item.status === 'PAIRED').length}/10 已配对</i></summary><div className="admin-collapsible-body"><p className="muted">爱心和星星玩家开局完全相同，系统不会预先绑定伙伴或指定最后一人。只有双方确认后才正式成立联盟。</p><div className="heart-slot-admin">{(['HEART','STAR'] as const).map((symbol) => <div key={symbol}><strong>{symbol === 'HEART' ? '♡ 爱心' : '☆ 星星'}</strong><span>{data.symbolPairings.filter((item) => item.symbol === symbol).length}/5 人已抽卡</span><small>{data.symbolPairings.filter((item) => item.symbol === symbol && item.status === 'PAIRED').length}/4 人已结对 · {data.symbolPairings.filter((item) => item.symbol === symbol && item.status === 'PENDING').length} 人待确认</small></div>)}</div><p className="muted">下方列出每位玩家持有的具体半边，方便主办方按左右半边提示；宾客自己的任务卡也会显示相同信息。</p><div className="symbol-side-admin-list" aria-label="爱心和星星左右半边名单">{(['HEART','STAR'] as const).map((symbol) => <section key={symbol}><header><strong>{symbol === 'HEART' ? '♡ 爱心半边' : '☆ 星星半边'}</strong><span>{data.symbolPairings.filter((item) => item.symbol === symbol).length} 人</span></header>{data.symbolPairings.filter((item) => item.symbol === symbol).length === 0 ? <div className="empty-state">尚无人抽到这一图案。</div> : data.symbolPairings.filter((item) => item.symbol === symbol).map((item) => <article key={item.guest_id}><strong>{item.guest?.name ?? '未知宾客'}</strong><b>{symbol === 'HEART' ? item.fragment_side === 'LEFT' ? '爱心左半' : '爱心右半' : item.fragment_side === 'LEFT' ? '星星左半' : '星星右半'}</b><small>{item.status === 'PAIRED' ? `已配对 · ${item.partner?.name ?? '伙伴'}` : item.status === 'PENDING' ? '正在等待双方确认' : item.status === 'UNPAIRED_FINAL' ? '本轮最终落单' : '可自由寻找另一半'}</small></article>)}</section>)}</div><div className="relationship-admin-list">{data.playerRelationships.length === 0 ? <div className="empty-state">尚无玩家关系确认。</div> : data.playerRelationships.map((relationship) => <div key={relationship.id}><strong>{relationship.relationship_type === 'CUPID_ALLIANCE' ? '丘比特联盟' : relationship.relationship_type === 'STAR_ALLIANCE' ? '星光联盟' : '恶作剧者同伴'}</strong><span>{relationship.player_a?.name} ↔ {relationship.player_b?.name}</span><small>{relationship.status === 'ACTIVE' ? '已双向确认' : relationship.status === 'REJECTED' ? '已拒绝/撤销' : '等待另一方确认'}</small>{relationship.relationship_type !== 'TRICKSTER_CONNECTION' && ['PENDING','ACTIVE'].includes(relationship.status) && <button className="mini-button danger" disabled={busy || finalResultsLocked} onClick={() => { if (window.confirm(`确认撤销 ${relationship.player_a?.name} 与 ${relationship.player_b?.name} 的配对？双方将恢复为可配对状态。`)) void action({ type: 'undoRelationship', relationshipId: relationship.id, reason: '管理员在关系面板确认撤销误配' }, '配对已撤销，双方恢复可配对状态'); }}>{finalResultsLocked ? '终局后已冻结' : '管理员撤销'}</button>}</div>)}</div></div></details>
    </section>

    </>}

    {activePanel === 'guests' && formalConfigurationLocked && !finalResultsLocked && <div className="notice">正式名单已经进入使用。为避免任务人数、固定职务和分组漂移，名单编辑请求会被数据库拒绝；密码重置仍可在宾客列表中操作。</div>}

    {activePanel === 'guests' && <><details className="admin-advanced-tools guest-roster-editor"><summary>名单资料与新增宾客</summary><section className="section-card"><div className="section-heading"><div><small>GUEST ROSTER</small><h2>宾客名单管理</h2></div><span>{activeGuests.length} 位启用</span></div>{finalResultsLocked && <div className="notice">终局结果已经发布，宾客名单和显示姓名已冻结。</div>}<fieldset className="score-lock-fieldset" disabled={finalResultsLocked}><details className="roster-import"><summary>从表格或文本批量新增</summary><p className="muted">每行填写“显示姓名 | 登录名 | 桌号”，也可以直接从三列表格复制。导入只新增，不覆盖已有宾客；长辈和仪式标记可在导入后逐人设置。</p><form onSubmit={importRoster}><label htmlFor="roster-import-text">待导入名单</label><textarea id="roster-import-text" rows={7} value={rosterImportText} onChange={(event) => { setRosterImportText(event.target.value); setRosterImportConfirmed(false); }} placeholder={'陈方舟 | Fangzhou Chen | 3 号桌\n李思冉 | Siran Li | 3 号桌'} spellCheck={false}/>{data.game?.registration_open && <div className="notice error">为避免宾客正在认领时名单变化，请先在“当前流程”关闭注册。</div>}{rosterImportPreview.issues.length > 0 && <div className="import-issues">{rosterImportPreview.issues.slice(0, 6).map((issue) => <p key={`${issue.line}-${issue.message}`}><strong>{issue.line ? `第 ${issue.line} 行` : '名单'}：</strong>{issue.message}</p>)}</div>}{rosterImportPreview.rows.length > 0 && <div className="import-preview"><strong>预览 · {rosterImportPreview.rows.length} 位可新增</strong>{rosterImportPreview.rows.slice(0, 8).map((row) => <span key={row.loginName}>{row.name}<small>{row.loginName}{row.tableLabel ? ` · ${row.tableLabel}` : ''}</small></span>)}{rosterImportPreview.rows.length > 8 && <em>另有 {rosterImportPreview.rows.length - 8} 位</em>}</div>}<label className="ready-check"><input type="checkbox" checked={rosterImportConfirmed} onChange={(event) => setRosterImportConfirmed(event.target.checked)} disabled={!rosterImportPreview.rows.length || Boolean(rosterImportPreview.issues.length)}/><span><strong>我已核对预览中的显示姓名和登录名</strong><small>登录名用于搜索和登录，导入后仍可在下方逐人修改。</small></span></label><button disabled={busy || Boolean(data.game?.registration_open) || !rosterImportConfirmed || !rosterImportPreview.rows.length || Boolean(rosterImportPreview.issues.length)}>{busy ? '正在导入…' : `确认新增 ${rosterImportPreview.rows.length} 位宾客`}</button></form></details><label htmlFor="roster-guest">选择宾客或新增</label><select id="roster-guest" value={rosterGuestId} onChange={(event) => setRosterGuestId(event.target.value)}><option value="new">＋ 新增宾客</option>{data.guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.active ? '●' : '○'} {guest.name} · {guest.login_name}</option>)}</select><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveGuestRoster', guestId: rosterGuestId === 'new' ? null : rosterGuestId, ...guestForm }, rosterGuestId === 'new' ? '宾客已加入名单' : '宾客资料已保存'); }}><div className="form-grid"><div><label htmlFor="roster-name">显示姓名</label><input id="roster-name" value={guestForm.name} onChange={(event) => setGuestForm({ ...guestForm, name: event.target.value })} maxLength={120} required/></div><div><label htmlFor="roster-login">登录名</label><input id="roster-login" value={guestForm.loginName} disabled={Boolean(rosterGuest?.claimed_at)} onChange={(event) => setGuestForm({ ...guestForm, loginName: event.target.value })} maxLength={80} placeholder="例如 Fangzhou Chen" required/></div><div><label htmlFor="roster-table">桌号或座位</label><input id="roster-table" value={guestForm.tableLabel} onChange={(event) => setGuestForm({ ...guestForm, tableLabel: event.target.value })} maxLength={40} placeholder="例如 3 号桌"/></div></div>{rosterGuest?.claimed_at && <p className="field-help">宾客已设置密码，登录名已锁定；显示姓名、桌号和标记仍可修改。</p>}<label htmlFor="roster-notes">工作人员备注</label><textarea id="roster-notes" value={guestForm.staffNotes} onChange={(event) => setGuestForm({ ...guestForm, staffNotes: event.target.value })} maxLength={300} placeholder="仅主办方和导出文件可见，不填写不必要的个人信息。"/><div className="form-grid"><label className="ready-check"><input type="checkbox" checked={guestForm.isElder} onChange={(event) => setGuestForm({ ...guestForm, isElder: event.target.checked })}/><span><strong>长辈或轻量参与</strong><small>便于优先安排简单任务。</small></span></label><label className="ready-check"><input type="checkbox" checked={guestForm.ceremonyEligible} onChange={(event) => setGuestForm({ ...guestForm, ceremonyEligible: event.target.checked })}/><span><strong>适合仪式任务</strong><small>可承担递戒指、领掌等指定环节。</small></span></label><label className="ready-check"><input type="checkbox" checked={guestForm.active} disabled={Boolean(rosterGuest?.drawn_at)} onChange={(event) => setGuestForm({ ...guestForm, active: event.target.checked })}/><span><strong>允许认领和参与</strong><small>{rosterGuest?.drawn_at ? '已经抽卡，现场期间不能停用。' : '停用会撤销该宾客所有登录会话。'}</small></span></label></div><button disabled={busy}>{rosterGuestId === 'new' ? '添加到宾客名单' : '保存宾客资料'}</button></form></fieldset></section></details>

    <section className="section-card guest-progress-card" id="guest-progress"><div className="section-heading"><div><small>GUEST MANAGEMENT</small><h2>宾客注册与游戏进度</h2></div><span>{claimed}/{activeGuests.length} 已认领</span></div><p className="muted">这里显示真实的注册、自拍和任务卡领取进度；专属卡宾客无需抽取任务卡。头像来自宾客登记时上传的婚礼自拍，方便后台现场辨认。</p><div className="guest-progress-summary" aria-label="宾客进度汇总"><div><strong>{claimed}</strong><span>已认领</span><small>共 {activeGuests.length} 位</small></div><div><strong>{avatarCount}</strong><span>已上传头像</span><small>{activeGuests.length - avatarCount} 位待自拍</small></div><div><strong>{drawn}/{drawEligibleGuests.length}</strong><span>已完成抽卡</span><small>{waitingToDraw} 位任务玩家待抽；专属卡无需抽取</small></div><div><strong>{activeGuests.length - claimed}</strong><span>尚未注册</span><small>需要现场提醒</small></div></div><details className="guest-directory-details"><summary><span>查看宾客明细</span><small>{visibleGuests.length} 位 · 可搜索、筛选和重置密码</small></summary><div className="guest-directory-body"><div className="guest-management-toolbar"><div><label htmlFor="guest-progress-search">搜索宾客</label><input id="guest-progress-search" type="search" value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="输入中文名、英文名或分组"/></div><div><label htmlFor="guest-progress-filter">筛选状态</label><select id="guest-progress-filter" value={guestStatusFilter} onChange={(event) => setGuestStatusFilter(event.target.value as typeof guestStatusFilter)}><option value="all">全部宾客</option><option value="unclaimed">尚未注册</option><option value="claimed">已注册、待抽卡</option><option value="drawn">已完成抽卡</option><option value="missing-avatar">缺少头像</option></select></div></div>{visibleGuests.length === 0 ? <div className="empty-state">没有符合当前筛选条件的宾客。</div> : <div className="guest-admin-list">{visibleGuests.map((guest) => <article key={guest.id}>{guest.avatar_url ? <img className="guest-avatar" src={guest.avatar_url} alt={`${guest.name}的婚礼头像`} loading="lazy"/> : <div className="guest-avatar guest-avatar-fallback" aria-label="尚未上传头像">{guest.name.slice(0, 1)}</div>}<div className="guest-admin-copy"><strong>{guest.name}</strong><small>{guest.login_name} · {PARTICIPATION_LABELS[guest.participation_mode] || guest.participation_mode}{guest.relationship ? ` · ${guest.relationship}` : ''}{guest.story_role !== 'NONE' ? ` · ${STORY_ROLE_LABELS[guest.story_role] || guest.story_role}` : ''}</small><small>{guest.drawn_at ? `${guest.team} · ${ROLE_LABELS[guest.role] || guest.role}` : guest.eligible_for_mission ? '尚未抽卡' : '专属卡'}{guest.eligible_for_personal_score ? ` · ${guest.points} 分` : ''}</small></div><span className={!guest.active || !guest.claimed_at ? 'unclaimed' : !guest.avatar_path ? 'pending' : guest.drawn_at || !guest.eligible_for_mission ? 'claimed' : 'pending'}>{!guest.active ? '已停用' : !guest.claimed_at ? '未注册' : !guest.avatar_path ? '待自拍' : guest.drawn_at ? '已抽卡' : guest.eligible_for_mission ? '待抽卡' : '专属卡'}</span>{guest.active && guest.claimed_at && <button className="mini-button" disabled={busy} onClick={() => { if (window.confirm(`确认重置 ${guest.name} 的密码并退出其所有设备？不会清除抽卡、任务、积分或头像。`)) void action({ type: 'resetGuestClaim', guestId: guest.id }, '宾客密码已重置'); }}>重置密码</button>}</article>)}</div>}</div></details></section></>}


    {activePanel === 'finale' && <>
    <section className="section-card finale-workflow-card">
      <div className="section-heading"><div><small>FINALE WORKFLOW</small><h2>终局结算流程</h2></div><span className={finalResultsLocked ? 'ready-badge' : 'warning-badge'}>{finalResultsLocked ? '已公布并永久冻结' : data.game?.voting_open ? '投票进行中' : '等待开始'}</span></div>
      <p className="muted">按顺序确认奖项、结算团队挑战并发放线索，再开启最终投票和公开揭晓。团队线索结算完成前，系统不会允许投票。</p>
      {!data.game?.team_clues_settled_at && <div className={teamSettlementReady ? 'notice success' : 'notice error'} role="status"><strong>{teamSettlementReady ? '结算条件已齐备' : '结算条件尚未齐备'}</strong><br/>{teamSettlementStatus}{!hasBothTeamScores ? ' · 两队都必须明确记录最终成绩（0 分也要记录）' : ''}{!teamSettlementReady && <><br/>请先完成 20 位竞技组玩家抽卡，确保每队恰好 1 名恶作剧者，并按当前成绩为每队准备页面上标明的线索数量。</>}</div>}
      <div className="finale-workflow-steps">
        <article className={preparedAwards > 0 ? 'done' : 'current'}><span className="finale-step-index">01</span><div><strong>确认颁奖结果</strong><small>{data.awards.length === 0 ? '当前没有预设奖项，可直接进入投票' : `${preparedAwards}/${data.awards.length} 个奖项已选择获奖者并设为公布`}</small></div><button type="button" className="secondary" onClick={() => document.getElementById('final-awards')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看奖项</button></article>
        <article className={data.game?.team_clues_settled_at ? 'done' : 'current'}><span className="finale-step-index">02</span><div><strong>结算团队积分并发放线索</strong><small>{data.game?.team_clues_settled_at ? `已结算 · ${teamTotals.map((item) => `${item.team} ${item.points} 分`).join(' · ')}` : teamSettlementReady ? '条件已齐备；确认后正分第一名每人获 2 条线索，其余队伍每人获 1 条' : '请先完成上方列出的抽卡、恶作剧者、线索和团队成绩条件'}</small></div><button type="button" className={data.game?.team_clues_settled_at ? 'secondary' : ''} disabled={busy || finalResultsLocked || Boolean(data.game?.team_clues_settled_at) || data.game?.stage !== 'group_game' || !teamSettlementReady} onClick={() => setPendingFinaleAction('settle-team-clues')}>{data.game?.team_clues_settled_at ? '已完成发放' : '结算并发放线索'}</button></article>
        <article className={finalResultsLocked ? 'done' : data.game?.voting_open ? 'current' : ''}><span className="finale-step-index">03</span><div><strong>开启并收集最终投票</strong><small>{data.game?.voting_open ? `第 ${data.game.voting_round} 轮进行中 · ${data.votes.length}/${competitiveDrawn} 人已投` : data.game?.stage === 'voting' ? `第 ${data.game.voting_round} 轮已关闭 · 已投 ${data.votes.length} / 应投 ${competitiveDrawn} / 缺席 ${missingFinalVotes}` : '开启新一轮会清除上一轮选票，并自动关闭宾客注册'}</small></div><button type="button" disabled={busy || finalResultsLocked || (!data.game?.voting_open && (!data.game?.team_clues_settled_at || !['group_game', 'voting'].includes(data.game?.stage || '')))} onClick={toggleVoting}>{finalResultsLocked ? '投票已永久结算' : data.game?.voting_open ? '关闭本轮投票' : '开启新投票'}</button></article>
        <article className={finalResultsLocked ? 'done' : ''}><span className="finale-step-index">04</span><div><strong>公布身份并结算终局个人奖励</strong><small>{finalResultsLocked ? `投票奖励已结算 +${settledPersonalPoints} 分 · 本场数据已永久冻结` : data.game?.voting_open ? '请先关闭本轮投票，再公布身份并结算' : data.votes.length === 0 ? '至少收到 1 份本轮投票后才能进行不可撤回的公布' : `已投 ${data.votes.length} / 应投 ${competitiveDrawn} / 缺席 ${missingFinalVotes}；抓住后投中 +2、其他已投 +1，逃脱队伍 +0`}</small></div><button type="button" className={finalResultsLocked ? 'secondary' : ''} disabled={busy || finalResultsLocked || Boolean(data.game?.voting_open) || (data.game?.voting_round ?? 0) < 1 || data.votes.length === 0} onClick={requestResultsToggle}>{finalResultsLocked ? '终局已永久发布' : data.game?.voting_open ? '请先关闭投票' : data.votes.length === 0 ? '等待本轮投票' : '公布身份并结算个人奖励'}</button></article>
        <article className={finalResultsLocked ? 'current' : ''}><span className="finale-step-index">05</span><div><strong>发放奖项并核对流水</strong><small>按已公布奖项现场颁发，并在下方核对个人积分流水与投票结果</small></div><button type="button" className="secondary" onClick={() => document.getElementById('final-points-ledger')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>查看流水</button></article>
      </div>
      {pendingResultsVisible !== null && <section className="finale-confirmation" role="dialog" aria-label="确认公布身份"><div><small>请确认不可撤回的终局操作</small><strong>公布身份并结算终局个人奖励</strong><p>本轮已投 {data.votes.length} 人 / 应投 {competitiveDrawn} 人 / 缺席 {missingFinalVotes} 人。系统逐队判断：抓住恶作剧者后投中者 +2、其他已投票者 +1；逃脱队伍和未投票者 +0。继续后会永久冻结任务审核、积分、线索、奖项和任务配置，公开结果不能撤回。</p></div><div><button type="button" onClick={() => void confirmResultsToggle()} disabled={busy || Boolean(data.game?.voting_open)}>确认公布并永久冻结</button><button type="button" className="secondary" onClick={() => setPendingResultsVisible(null)} disabled={busy}>取消</button></div></section>}
      {pendingFinaleAction && <section className="finale-confirmation" role="dialog" aria-modal="true" aria-label="确认终局流程操作"><div><small>请确认现场操作</small><strong>{pendingFinaleAction === 'settle-team-clues' ? '结算团队积分并发放线索' : pendingFinaleAction === 'open-voting' ? '开启新一轮最终投票' : '关闭本轮最终投票'}</strong><p>{pendingFinaleAction === 'settle-team-clues' ? `${teamTotals.map((item) => `${item.team} ${item.points} 分`).join(' · ')}。确认后系统按排名自动发放线索。` : pendingFinaleAction === 'open-voting' ? '开启一轮新的最终投票会关闭宾客注册、清空大屏旧题目；每位宾客本轮只能提交一次。' : `已投 ${data.votes.length} / 应投 ${competitiveDrawn} / 缺席 ${missingFinalVotes}。关闭后可核对结果，再决定是否公布结算。`}</p></div><div><button type="button" disabled={busy} onClick={() => void confirmFinaleAction()}>{busy ? '处理中…' : '确认执行'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPendingFinaleAction(null)}>取消</button></div></section>}
      <div className={`control-state ${data.game?.voting_open || finalResultsLocked ? 'on' : ''}`}>{finalResultsLocked ? `● 第 ${data.game?.voting_round ?? 0} 轮已公布并永久锁定` : data.game?.voting_open ? `● 第 ${data.game.voting_round} 轮投票中 · ${data.votes.length}/${competitiveDrawn} 人已投` : data.game?.stage === 'voting' ? `○ 第 ${data.game.voting_round} 轮投票已关闭 · 已投 ${data.votes.length} / 应投 ${competitiveDrawn} / 缺席 ${missingFinalVotes}` : '○ 最终投票尚未开放'}</div>
    </section>

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>VOTE RESULT</small><h2>第 {data.game?.voting_round || 0} 轮投票</h2></div><span>{data.votes.length}/{competitiveDrawn} 人已投</span></div><p className="muted">投票结束前只显示参与人数。揭晓后逐队结算：抓住后投中者 +2、其他已投票者 +1；逃脱队伍和未投票者 +0。</p>{data.game?.results_visible ? <><div className="control-state on">投票个人奖励已结算：共 +{settledPersonalPoints} 分 · 团队挑战分未改变</div><div className="revealed-grid admin-finale-reveal">{data.finale.tricksters.map((guest) => <article className={guest.escaped ? 'escaped' : 'caught'} key={guest.id}><small>{guest.team}</small><strong>{guest.name}</strong><span>丘比特的恶作剧者</span><em>{guest.escaped ? '成功逃脱 · 本队投票奖励为 0' : '已被队友识破 · 已投票者获得奖励'}</em></article>)}</div><div className="staff-vote-breakdown">{data.finale.voteCounts.map((guest) => <article key={guest.id}><div><strong>{guest.name} · {guest.team}</strong><b>{guest.votes} 票</b></div><small>{guest.voters.map((voter) => `${voter.name}${voter.votes > 1 ? `（${voter.votes}票）` : ''}`).join('、')}</small></article>)}</div></> : votesByTarget.length === 0 ? <div className="empty-state">暂无投票。</div> : <div className="control-state">已收到 {data.votes.length}/{competitiveDrawn} 份密封投票，揭晓前不展示投票对象。</div>}</article>
      <article className="section-card finale-guide-card"><div className="section-heading"><div><small>OPERATOR NOTE</small><h2>主持操作提示</h2></div></div><ol><li>先在下方确认需要公开的奖项和获奖人。</li><li>团队挑战结束后核对两队分数，结算并自动发放排名线索。</li><li>宾客查看线索后开启投票，等待提交完成再关闭投票。</li><li>确认投票结果无误后，公布身份并自动结算终局积分。</li><li>现场颁奖，最后核对积分流水；需要展示时再开放大屏。</li></ol></article>
    </section>

    {data.game?.results_visible && <section className="section-card host-final-rankings" aria-label="主控完整最终个人排名"><div className="section-heading"><div><small>FINAL INDIVIDUAL RANKING</small><h2>完整最终个人排名</h2></div><span>共 {data.rankings.personal.length} 人</span></div><p className="final-ranking-note">恶作剧者的伪装积分不参与终局：逃脱者置顶、被识破者置底且均不显示积分；其他宾客按个人总分排序。</p>{data.rankings.personal.length ? <ol className="host-personal-ranking">{data.rankings.personal.map((guest, index) => { const tricksterResult = guest.undetectedTrickster ? '成功逃脱' : guest.caughtTrickster ? '已被识破' : null; return <li className={guest.undetectedTrickster ? 'undetected-trickster' : guest.caughtTrickster ? 'caught-trickster' : ''} key={guest.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{guest.name}{guest.undetectedTrickster && <em>完美伪装</em>}{guest.caughtTrickster && <em>已被识破</em>}</strong><small>{guest.team} · {tricksterResult ? '终局按身份结果结算' : `完成 ${guest.completedTasks} 项任务`}</small></div><span>{tricksterResult ?? `${guest.points} 分`}</span></li>; })}</ol> : <div className="empty-state">尚无个人积分。</div>}</section>}

    <section className="section-card" id="final-awards"><div className="section-heading"><div><small>FINAL HONORS</small><h2>颁奖结果</h2></div><span>{preparedAwards}/{data.awards.length} 已准备</span></div><p className="muted">只有勾选“随身份揭晓公布”且已选择获奖者的奖项，才会在结果阶段显示到公开大屏。终局发布后奖项会随本场数据一起冻结。</p><div className="award-admin-grid"><div className="award-picker">{data.awards.map((award) => <button key={award.id} className={selectedAwardId === award.id ? 'selected' : ''} onClick={() => setSelectedAwardId(award.id)}><strong>{award.title}</strong><small>{award.published ? '已公布' : award.winner_guest_id || award.winner_team ? '待公布' : '待设置'}</small></button>)}</div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'saveAward', awardId: selectedAwardId, ...awardForm, sortOrder: Number(awardForm.sortOrder) }, '奖项已保存'); }}><fieldset className="score-lock-fieldset" disabled={finalResultsLocked}><label htmlFor="award-title">奖项名称</label><input id="award-title" value={awardForm.title} onChange={(event) => setAwardForm({ ...awardForm, title: event.target.value })} maxLength={120} required/><label htmlFor="winner-kind">获奖对象</label><select id="winner-kind" value={awardForm.winnerKind} onChange={(event) => setAwardForm({ ...awardForm, winnerKind: event.target.value, published: false })}><option value="none">暂不指定</option><option value="guest">宾客</option><option value="team">队伍</option></select>{awardForm.winnerKind === 'guest' && <><label htmlFor="award-guest">获奖宾客</label><select id="award-guest" value={awardForm.winnerGuestId} onChange={(event) => setAwardForm({ ...awardForm, winnerGuestId: event.target.value })} required><option value="">请选择</option>{activeGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team}</option>)}</select></>}{awardForm.winnerKind === 'team' && <><label htmlFor="award-team">获奖队伍</label><select id="award-team" value={awardForm.winnerTeam} onChange={(event) => setAwardForm({ ...awardForm, winnerTeam: event.target.value })}>{TEAMS.map((teamName) => <option key={teamName}>{teamName}</option>)}</select></>}<label htmlFor="award-reason">颁奖理由</label><textarea id="award-reason" value={awardForm.reason} onChange={(event) => setAwardForm({ ...awardForm, reason: event.target.value })} maxLength={500} placeholder="例如：完成任务最多，并帮助多位宾客参与游戏。"/><label htmlFor="award-order">展示顺序</label><input id="award-order" type="number" min={0} max={9999} value={awardForm.sortOrder} onChange={(event) => setAwardForm({ ...awardForm, sortOrder: event.target.value })}/><label className="ready-check"><input type="checkbox" checked={awardForm.published} disabled={awardForm.winnerKind === 'none'} onChange={(event) => setAwardForm({ ...awardForm, published: event.target.checked })}/><span><strong>随身份揭晓公布</strong><small>结果尚未公布时，即使勾选也不会提前显示。</small></span></label><button disabled={busy || !selectedAwardId}>{finalResultsLocked ? '终局已冻结奖项' : '保存奖项'}</button></fieldset></form></div></section>

    <details className="section-card admin-advanced-tools" id="final-points-ledger"><summary>完整个人积分流水 · {data.pointLedger.length} 条</summary>{data.pointLedger.length === 0 ? <div className="empty-state">暂无积分记录。</div> : <div className="activity-list">{data.pointLedger.map((entry) => <div key={entry.id}><span className={entry.amount > 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</span><p><strong>{entry.guest?.name || '未知宾客'}</strong><small>{entry.reason}</small></p></div>)}</div>}</details></>}

    {activePanel === 'data' && <><section className="section-card"><div className="section-heading"><div><small>DATA &amp; AUDIT</small><h2>清场前核对导出与最近操作</h2></div></div><p className="muted">建议在彩排后和婚礼结束后各导出一次。八类 CSV 用于人工核对，不是可一键恢复的完整备份包；不包含照片文件、密码与会话、密封选择等私密运行数据，也不会包含服务器密钥。</p><div className="export-actions"><a href="/api/admin-export?type=guests">导出宾客</a><a href="/api/admin-export?type=assignments">导出任务</a><a href="/api/admin-export?type=points">个人积分</a><a href="/api/admin-export?type=team-points">团队积分</a><a href="/api/admin-export?type=clues">线索库</a><a href="/api/admin-export?type=guest-clues">线索发放</a><a href="/api/admin-export?type=awards">导出奖项</a><a href="/api/admin-export?type=audit">导出审计</a></div>{data.auditLog.length === 0 ? <div className="empty-state">暂无后台操作。</div> : <div className="audit-list">{data.auditLog.slice(0, 20).map((entry) => <div key={entry.id}><strong>{ACTION_LABELS[entry.action] || entry.action}</strong><span>{new Date(entry.created_at).toLocaleString('zh-CN')}</span><small>{entry.actor}</small></div>)}</div>}</section>

    <section className="section-card danger-zone">
      <div className="section-heading"><div><small>REHEARSAL RESET</small><h2>彩排数据安全清场</h2></div><span className={resetControlsClosed ? 'ready-badge' : 'warning-badge'}>{resetControlsClosed ? '公开入口已关闭' : '清场时将自动关闭公开入口'}</span></div>
      <div className="reset-assurance"><strong>清场后，运行数据和线索库应全部归零</strong><p>系统会先自动关闭宾客注册、投票和公开大屏。保留宾客名单、锁定的队伍与初始身份、正式任务清单、历史主持内容和奖项名称；清除所有宾客密码与登录、宾客自拍、抽卡结果、任务进度、验证照片、投票、个人与团队积分、已发线索与整个线索库；同时清除配对、互认和第二轮临时状态。正式婚礼线索需要在清场后重新创建。</p></div>
      <div className="reset-preview-grid"><div><strong>{Number(resetPreview.claimed_guests || 0)}</strong><span>已认领宾客</span></div><div><strong>{Number(resetPreview.assignments || 0)}</strong><span>任务记录</span></div><div><strong>{Number(resetPreview.votes || 0)}</strong><span>投票记录</span></div><div><strong>{Number(resetPreview.guest_clues || 0)}</strong><span>已发线索</span></div><div><strong>{Number(resetPreview.clue_library_entries || 0)}</strong><span>线索库条目</span></div><div><strong>{Number(resetPreview.avatar_files || 0)}</strong><span>宾客自拍</span></div><div><strong>{Number(resetPreview.evidence_files || 0)}</strong><span>验证照片</span></div></div>
      {data.storageReconciliationFailed && <div className="notice error" role="alert"><strong>暂时无法核对私密照片存储</strong><br/>为防止旧彩排照片混入正式场次，注册保持关闭。请刷新后台；恢复后系统会自动登记待清理照片。</div>}
      {photoCleanupPending && <div className="notice error" role="status"><strong>数据库清场已完成，仍有私密照片待删除</strong><br/>{data.pendingRehearsalCleanup ? `验证照片 ${data.pendingRehearsalCleanup.evidenceCount} 张 · 宾客自拍 ${data.pendingRehearsalCleanup.avatarCount} 张。` : '照片存储清理尚未完成。'} 即使刷新或重新登录也不会丢失清理记录。<br/><button type="button" className="secondary" disabled={busy} onClick={() => void retryPendingRehearsalCleanup()}>{busy ? '正在继续清理…' : '继续删除剩余私密照片'}</button></div>}
      <form onSubmit={resetRehearsal}><label className="ready-check"><input type="checkbox" checked={resetForm.backupConfirmed} onChange={(event) => setResetForm({ ...resetForm, backupConfirmed: event.target.checked })}/><span><strong>我已下载上方八类清场前核对记录</strong><small>包括线索库和线索发放记录；这些 CSV 不是完整恢复包。清场不可从网页撤销，审计日志会永久保留本次操作摘要。</small></span></label><label htmlFor="reset-reason">清场原因</label><input id="reset-reason" value={resetForm.reason} onChange={(event) => setResetForm({ ...resetForm, reason: event.target.value })} minLength={3} maxLength={300} required/><label htmlFor="reset-confirmation">输入 RESET WEDDING 确认</label><input id="reset-confirmation" value={resetForm.confirmation} onChange={(event) => setResetForm({ ...resetForm, confirmation: event.target.value })} autoComplete="off" spellCheck={false} placeholder="RESET WEDDING" required/><button className="danger" disabled={busy || photoCleanupPending || !resetForm.backupConfirmed || resetForm.confirmation !== 'RESET WEDDING' || resetForm.reason.trim().length < 3}>{busy ? '正在安全清场…' : photoCleanupPending ? '请先完成私密照片清理' : '清空全部彩排运行数据'}</button></form>
    </section></>}
    {pendingResetConfirmation && <section className="finale-confirmation" role="dialog" aria-modal="true" aria-label="最后确认彩排清场"><div><small>不可撤销的运行数据清理</small><strong>确认清空本次彩排？</strong><p>系统会先关闭注册、投票和公开大屏，再退出全部宾客并清除抽卡、任务进度、投票、个人与团队积分、已发线索、线索库、宾客自拍和验证照片。{activeGuests.length} 位启用宾客、{activeGuests.filter((guest) => guest.uses_app).length} 个软件账号与正式任务配置会保留；当前 {Number(resetPreview.clue_library_entries || 0)} 条线索库内容不会保留。</p></div><div><button type="button" className="danger" disabled={busy} onClick={() => void confirmResetRehearsal()}>{busy ? '正在安全清场…' : '确认清空彩排数据'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPendingResetConfirmation(false)}>取消</button></div></section>}
  </main>;
}
