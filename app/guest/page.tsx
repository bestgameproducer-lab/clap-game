'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { compressTaskEvidence } from '@/lib/client-image';
import { isPhaseOneInteractionOpenAtStage, isTaskActionOpenAtStage, isTaskPausedDuringCeremony, isTaskWaitingForStage } from '@/lib/game-rules';
import { gameStageCopy } from '@/lib/game-stages';
import { isPlayerCode, normalizePlayerCode } from '@/lib/player-code';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const GUEST_CACHE_KEY = 'wedding-guest-session-cache-v1';
const ACTIVITY_ACK_KEY = 'wedding-guest-activity-ack-v1';
const PENDING_CONNECTION_MESSAGE = '你的编号确认已提交，等待对方输入你的玩家编号。';
const PENDING_ASSIGNMENT_MESSAGE = '任务已送到丘比特任务站，等待主办方确认。';
const PENDING_VOTE_MESSAGE = '投票已提交并锁定。结果公布后会自动结算侦探积分。';
const PENDING_MUTUAL_CONFIRMATION_MESSAGE = '确认邀请已发送，请让对方打开自己的页面处理。';
const PENDING_DILEMMA_MESSAGE = '秘密选择已密封提交';
const PENDING_COPY_MESSAGE = '命运复制目标已锁定';
const DINNER_MENU_STAGES = new Set(['task_round_2', 'banquet', 'group_game', 'voting', 'results']);

type RegistrationGuest = { id: string; name: string; loginName: string; hasPassword: boolean };
type PlayerDirectoryEntry = { name: string; playerCode: string };
type SecretCard = { team: string; role: string; storyRole: string; task: { id: string; title: string; description: string; verificationMethod: string; points: number }; drawnAt: string };
type ConnectionRelationshipType = 'CUPID_ALLIANCE' | 'STAR_ALLIANCE' | 'TRICKSTER_CONNECTION';
type PendingNotice =
  | { kind: 'CONNECTION'; relationshipType: ConnectionRelationshipType }
  | { kind: 'ASSIGNMENT_REVIEW'; assignmentId: string }
  | { kind: 'MUTUAL_CONFIRMATION'; assignmentId: string }
  | { kind: 'VOTE_RESULT'; votingRound: number }
  | { kind: 'PHASE_TWO_DILEMMA' }
  | { kind: 'PHASE_TWO_COPY' };
type AwakeningKind = 'LONELY_CUPID' | 'GUIDING_STAR';
type ContentNotice = { title: string; detail: string; signature: string; variant?: 'awakening'; awakeningKind?: AwakeningKind };
type GuestData = {
  guest: { id: string; name: string; team: string; role: string; is_hidden_spy: boolean; points: number; drawn_at: string | null; special_card_revealed_at: string | null; participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL'; relationship: string; story_role: string; eligible_for_mission: boolean; eligible_for_secret_role: boolean; eligible_for_personal_score: boolean; special_card_title: string; special_card_body: string; player_code: string; unlocked_role: string };
  assignments: Array<{ id: string; status: string; is_initial: boolean; completion_rank: number | null; early_bonus_points: number; reward_task_id: string | null; reward_clue_id: string | null; completion_note: string; verification_note: string; verified_at: string | null; evidence_uploaded_at: string | null; evidence_url: string | null; rejection_reason: string | null; task: { title: string; description: string; verification_method: string; points: number; category: string; stage: string; mission_code: string | null; mechanic: string; score_policy: string } }>;
  clues: Array<{ id: string; title: string; content: string; groupName: string }>;
  game: { registration_open: boolean; stage: string; voting_open: boolean; voting_round: number; results_visible: boolean; scoreboard_visible: boolean; phase_note: string | null; task_catalog_mode: 'demo' | 'live'; trickster_max_attempts: number; phase_one_completed_at: string | null } | null;
  candidates: Array<{ id: string; name: string; team: string }>;
  existingVote: string | null;
  pointLedger?: Array<{ id: number; amount: number; label: string; createdAt: string }>;
  teamScores?: Array<{ team: string; points: number }>;
  results: null | {
    teamMembers: Array<{ id: string; name: string; role: string; is_hidden_spy: boolean }>;
    votedTargetId: string | null;
    votedTargetName: string | null;
    voteCorrect: boolean | null;
    bonusPoints: number;
  };
  missionStory?: {
    playerCode: string;
    unlockedRole: string;
    symbolPairing: null | { symbol: 'HEART' | 'STAR'; status: 'AVAILABLE' | 'PENDING' | 'PAIRED' | 'UNPAIRED_FINAL'; fragmentSide: 'LEFT' | 'RIGHT' | null; pendingRelationshipId: string | null; finalizedAt: string | null };
    relationships: Array<{ id: string; type: ConnectionRelationshipType; status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVEALED'; partnerName: string; confirmedByMe: boolean; confirmedByPartner: boolean; activatedAt: string | null }>;
    tricksterAttemptsUsed: number;
    tricksterMaxAttempts: number;
    mutualConfirmations: Array<{ id: string; assignmentId: string; direction: 'INCOMING' | 'OUTGOING'; otherGuestName: string; status: 'PENDING' | 'ACTIVE' | 'REJECTED'; createdAt: string }>;
    allianceClue: null | { title: string; fragment: string };
  };
  phaseTwo?: null | {
    mission: string | null;
    extraVote: boolean;
    superLucky: boolean;
    isCaptain: boolean;
    unlockedAt: string | null;
    phaseOnePointsSnapshot: number | null;
    luckySettled: boolean;
    captainSettled: boolean;
    dilemma: null | { allianceType: 'HEART' | 'STAR'; submitted: boolean; settled: boolean; myChoice: string | null; partnerChoice: string | null; myPoints: number | null; partnerPoints: number | null };
    copyChoice: null | { targetGuestId: string; targetName: string; targetTeam: string; settledPoints: number | null; settled: boolean };
    copyCandidates: Array<{ id: string; name: string; team: string }>;
  };
};

const STATUS_LABELS: Record<string, string> = {
  assigned: '进行中', submitted: '等待审核', approved: '已完成', rejected: '请补充验证', cancelled: '本阶段已结束',
};

const ROLE_LABELS: Record<string, { title: string; note: string }> = {
  spy: { title: '丘比特的恶作剧者', note: '第一轮正常完成表面任务，并使用暗号悄悄寻找同伴。' },
  guest: { title: '婚礼守护者', note: '完成阶段任务，并留意身边的可疑行动。' },
};

const STORY_ROLE_LABELS: Record<string, { title: string; note: string }> = {
  OFFICIANT: { title: '誓词引导人', note: '在工作人员提示的环节，引导新人完成誓词。请在仪式开始前保守这个秘密。' },
  RING_KEEPER: { title: '戒指守护者', note: '在工作人员提示后领取戒指盒，并在交换戒指环节将它送到新人身边。' },
  GROOM_CHEERLEADER: { title: '新郎应援者', note: '等待主持人的合适节点，再送出为新郎准备的那句应援。' },
  BRIDE_CHEERLEADER: { title: '新娘应援者', note: '等待主持人的合适节点，再送出为新娘准备的那句应援。' },
  APPLAUSE_STARTER: { title: '掌声发起者', note: '在仪式完成的自然节点率先鼓掌，带动周围宾客。' },
  HEART_HOLDER: { title: '爱心持有者', note: '保管好你的爱心编号，悄悄寻找真正匹配的另一半。' },
  STAR_HOLDER: { title: '星光寻觅者', note: '藏好你的半颗星光，悄悄寻找持有另一半星星的伙伴。' },
};

const PUBLIC_STORY_ROLES = new Set(['OFFICIANT', 'RING_KEEPER', 'GROOM_CHEERLEADER', 'BRIDE_CHEERLEADER', 'APPLAUSE_STARTER']);

function CardScene({ className, label, disabled = false, onActivate, children }: {
  className: string;
  label: string;
  disabled?: boolean;
  onActivate?: () => void;
  children: ReactNode;
}) {
  if (onActivate) return <button type="button" className={`${className} secret-card-trigger`} aria-label={label} disabled={disabled} onClick={onActivate}>{children}</button>;
  return <div className={className}>{children}</div>;
}

function activityFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function phaseTwoAwakening(data: GuestData): Omit<ContentNotice, 'signature'> | null {
  if (!data.phaseTwo?.unlockedAt || !['task_round_2', 'banquet', 'group_game', 'voting', 'results'].includes(data.game?.stage ?? '')) return null;
  if (data.phaseTwo.mission === 'COPY_SCORE' && data.guest.unlocked_role === 'LONELY_CUPID') return {
    title: '原来，你从未被遗忘',
    detail: '第一幕没有找到爱心另一半，并不是失败。丘比特刻意留下了你，让你成为「孤单丘比特」。现在，你可以选择一名竞技玩家；最终揭晓时，你会复制他在第二幕获得的个人积分。',
    variant: 'awakening',
    awakeningKind: 'LONELY_CUPID',
  };
  if (data.phaseTwo.mission === 'TEAM_CAPTAIN' && data.guest.unlocked_role === 'GUIDING_STAR') return {
    title: '落单的星光，成为了领航星',
    detail: '第一幕没有找到另一半星星，并不是失败。丘比特留下了这颗独行的星，让你成为本队公开的「领航星」。现在请召集队友、理解团队挑战并带领大家前进；你的领航星身份可以公开。',
    variant: 'awakening',
    awakeningKind: 'GUIDING_STAR',
  };
  return null;
}

export default function GuestPage() {
  const [data, setData] = useState<GuestData | null>(null);
  const [scoreLedgerOpen, setScoreLedgerOpen] = useState(false);
  const [dinnerMenuOpen, setDinnerMenuOpen] = useState(false);
  const [playerDirectoryOpen, setPlayerDirectoryOpen] = useState(false);
  const [playerDirectory, setPlayerDirectory] = useState<PlayerDirectoryEntry[] | null>(null);
  const [playerDirectorySearch, setPlayerDirectorySearch] = useState('');
  const [playerDirectoryLoading, setPlayerDirectoryLoading] = useState(false);
  const [playerDirectoryError, setPlayerDirectoryError] = useState('');
  const [directoryCopiedCode, setDirectoryCopiedCode] = useState('');
  const [checking, setChecking] = useState(true);
  const [deviceAccessChecking, setDeviceAccessChecking] = useState(true);
  const [invitationCode, setInvitationCode] = useState('');
  const [guests, setGuests] = useState<RegistrationGuest[] | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [selectedGuest, setSelectedGuest] = useState<RegistrationGuest | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimCodeConfirm, setClaimCodeConfirm] = useState('');
  const [search, setSearch] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [enteringMissionPage, setEnteringMissionPage] = useState(false);
  const [revealedCard, setRevealedCard] = useState<SecretCard | null>(null);
  const [specialCardRevealed, setSpecialCardRevealed] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [secretReaderOpen, setSecretReaderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const [contentNotice, setContentNotice] = useState<ContentNotice | null>(null);
  const [selectedVoteTargetId, setSelectedVoteTargetId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pendingNotice, setPendingNotice] = useState<PendingNotice | null>(null);
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [connectionTargetCode, setConnectionTargetCode] = useState('');
  const [mutualTargetCodes, setMutualTargetCodes] = useState<Record<string, string>>({});
  const [phaseTwoDilemmaChoice, setPhaseTwoDilemmaChoice] = useState('');
  const [phaseTwoCopyTarget, setPhaseTwoCopyTarget] = useState('');
  const [expandedAssignments, setExpandedAssignments] = useState<Record<string, boolean>>({});
  const [completedMissionsOpen, setCompletedMissionsOpen] = useState(false);
  const [playerCodeCopied, setPlayerCodeCopied] = useState(false);
  const loadRequestRef = useRef(0);
  const manualRefreshRef = useRef(false);
  const refreshNoticeTimerRef = useRef<number | null>(null);
  const contentSnapshotRef = useRef<null | { guestId: string; stage: string; phaseNote: string; awakeningKey: string; assignmentIds: string[]; assignmentStatuses: Record<string, string>; clueIds: string[]; confirmationIds: string[] }>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    try {
      const response = await fetch('/api/guest-me', { cache: 'no-store' });
      if (requestId !== loadRequestRef.current) return false;
      if (response.ok) {
        const nextData = await response.json();
        const nextSnapshot = {
          guestId: nextData.guest.id,
          stage: nextData.game?.stage ?? 'registration',
          phaseNote: nextData.game?.phase_note ?? '',
          awakeningKey: nextData.phaseTwo?.unlockedAt && ['COPY_SCORE', 'TEAM_CAPTAIN'].includes(nextData.phaseTwo.mission ?? '') ? `${nextData.phaseTwo.mission}:${nextData.phaseTwo.unlockedAt}` : '',
          assignmentIds: nextData.assignments.map((assignment: GuestData['assignments'][number]) => assignment.id),
          assignmentStatuses: Object.fromEntries(nextData.assignments.map((assignment: GuestData['assignments'][number]) => [assignment.id, assignment.status])),
          clueIds: nextData.clues.map((clue: GuestData['clues'][number]) => clue.id),
          confirmationIds: (nextData.missionStory?.mutualConfirmations ?? [])
            .filter((confirmation: { direction: string; status: string }) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING')
            .map((confirmation: { id: string }) => confirmation.id),
        };
        const activitySignature = activityFingerprint(JSON.stringify(nextSnapshot));
        const previousSnapshot = contentSnapshotRef.current;
        const awakening = phaseTwoAwakening(nextData);
        let nextNotice: ContentNotice | null = null;
        if (previousSnapshot && previousSnapshot.guestId === nextSnapshot.guestId) {
          const newAssignment = nextData.assignments.find((assignment: GuestData['assignments'][number]) => ['assigned', 'rejected'].includes(assignment.status) && !previousSnapshot.assignmentIds.includes(assignment.id) && !(nextData.guest.role === 'spy' && assignment.task.category === 'hidden'));
          const updatedAssignment = nextData.assignments.find((assignment: GuestData['assignments'][number]) => previousSnapshot.assignmentStatuses[assignment.id] && previousSnapshot.assignmentStatuses[assignment.id] !== assignment.status && ['approved', 'rejected'].includes(assignment.status));
          const newClue = nextData.clues.find((clue: GuestData['clues'][number]) => !previousSnapshot.clueIds.includes(clue.id));
          const newConfirmation = (nextData.missionStory?.mutualConfirmations ?? []).find((confirmation: { id: string; direction: string; status: string; otherGuestName: string }) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING' && !previousSnapshot.confirmationIds.includes(confirmation.id));
          if (awakening && previousSnapshot.awakeningKey !== nextSnapshot.awakeningKey) {
            nextNotice = { ...awakening, signature: activitySignature };
          } else if (previousSnapshot.stage !== nextSnapshot.stage) {
            const stageCopy = gameStageCopy(nextSnapshot.stage);
            nextNotice = { title: `已进入「${stageCopy.label}」`, detail: nextSnapshot.phaseNote || stageCopy.note, signature: activitySignature };
          } else if (updatedAssignment) {
            nextNotice = {
              title: '你的任务已更新',
              detail: `${updatedAssignment.task.title} · ${STATUS_LABELS[updatedAssignment.status] ?? '状态已更新'}`,
              signature: activitySignature,
            };
          } else if (newAssignment) nextNotice = { title: '你收到了一项新任务', detail: newAssignment.task.title, signature: activitySignature };
          else if (newClue) nextNotice = { title: '一条新的秘密线索已经解锁', detail: newClue.title, signature: activitySignature };
          else if (newConfirmation) nextNotice = { title: '你收到了一项好友确认请求', detail: `${newConfirmation.otherGuestName} 正在等待你的确认`, signature: activitySignature };
          else if (previousSnapshot.phaseNote !== nextSnapshot.phaseNote && nextSnapshot.phaseNote) nextNotice = { title: '主办方发布了新的现场提示', detail: nextSnapshot.phaseNote, signature: activitySignature };
        } else {
          try {
            const guestKey = activityFingerprint(nextSnapshot.guestId);
            const saved = JSON.parse(window.localStorage.getItem(ACTIVITY_ACK_KEY) || 'null') as { guestKey?: string; signature?: string } | null;
            if (awakening && (!saved || saved.guestKey !== guestKey || saved.signature !== activitySignature)) {
              nextNotice = { ...awakening, signature: activitySignature };
            } else if (saved?.guestKey === guestKey && saved.signature && saved.signature !== activitySignature) {
              nextNotice = { title: '你离开期间有新的活动', detail: '任务、线索或婚礼环节已有更新，请查看最新内容。', signature: activitySignature };
            } else if (!saved || saved.guestKey !== guestKey) {
              window.localStorage.setItem(ACTIVITY_ACK_KEY, JSON.stringify({ guestKey, signature: activitySignature }));
            }
          } catch {}
        }
        contentSnapshotRef.current = nextSnapshot;
        if (nextNotice) setContentNotice(nextNotice);
        setData(nextData); setOffline(false); setError('');
        try {
          const offlineSnapshot = {
            ...nextData,
            assignments: nextData.assignments.map((assignment: GuestData['assignments'][number]) => ({ ...assignment, evidence_url: null })),
          };
          window.sessionStorage.setItem(GUEST_CACHE_KEY, JSON.stringify(offlineSnapshot));
        } catch {}
        return true;
      }
      else if (response.status === 401) {
        setData(null);
        setShowSecrets(false);
        setSecretReaderOpen(false);
        setContentNotice(null);
        contentSnapshotRef.current = null;
        try { window.sessionStorage.removeItem(GUEST_CACHE_KEY); } catch {}
      }
      else setError('暂时无法加载游戏，请稍后重试。');
    } catch {
      if (requestId !== loadRequestRef.current) return false;
      setOffline(true); setError('网络连接不稳定，正在显示本机最近一次任务。');
      try {
        const cached = window.sessionStorage.getItem(GUEST_CACHE_KEY);
        if (cached) setData(JSON.parse(cached));
      } catch {}
    } finally {
      if (requestId === loadRequestRef.current) setChecking(false);
    }
    return false;
  }, []);

  const restoreInvitationAccess = useCallback(async () => {
    try {
      const response = await fetch('/api/registration/guests', { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      setGuests(body.guests);
      setRegistrationOpen(body.registrationOpen !== false);
      setSearch('');
    } catch {
      // Device access is only a convenience; the invitation form remains available on failure.
    } finally {
      setDeviceAccessChecking(false);
    }
  }, []);

  useEffect(() => {
    setOffline(!window.navigator.onLine);
    void load();
    void restoreInvitationAccess();
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setShowSecrets(false);
        setSecretReaderOpen(false);
      }
    };
    const handleWindowBlur = () => { setShowSecrets(false); setSecretReaderOpen(false); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load, restoreInvitationAccess]);

  const usesFullPagePrivateView = data?.guest.role === 'spy' && !data.game?.results_visible;
  const pageScrollLocked = dinnerMenuOpen || (secretReaderOpen && !usesFullPagePrivateView);

  useEffect(() => {
    document.body.classList.toggle('modal-scroll-locked', pageScrollLocked);
    return () => document.body.classList.remove('modal-scroll-locked');
  }, [pageScrollLocked]);

  useEffect(() => {
    if (!secretReaderOpen && !dinnerMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSecretReaderOpen(false);
      setDinnerMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [secretReaderOpen, dinnerMenuOpen]);

  useLiveRefresh(async () => { if (!manualRefreshRef.current) await load(); }, undefined, Boolean(data));

  useEffect(() => {
    if (!data || !pendingNotice) return;
    let expectedMessage = '';
    let stillWaiting = false;
    if (pendingNotice.kind === 'CONNECTION') {
      expectedMessage = PENDING_CONNECTION_MESSAGE;
      stillWaiting = Boolean(data.missionStory?.relationships.some((relationship) => (
        relationship.type === pendingNotice.relationshipType
        && relationship.status === 'PENDING'
        && relationship.confirmedByMe
      )));
    } else if (pendingNotice.kind === 'ASSIGNMENT_REVIEW') {
      expectedMessage = PENDING_ASSIGNMENT_MESSAGE;
      stillWaiting = data.assignments.some((assignment) => assignment.id === pendingNotice.assignmentId && assignment.status === 'submitted');
    } else if (pendingNotice.kind === 'MUTUAL_CONFIRMATION') {
      expectedMessage = PENDING_MUTUAL_CONFIRMATION_MESSAGE;
      stillWaiting = Boolean(data.missionStory?.mutualConfirmations.some((confirmation) => confirmation.assignmentId === pendingNotice.assignmentId && confirmation.direction === 'OUTGOING' && confirmation.status === 'PENDING'));
    } else if (pendingNotice.kind === 'VOTE_RESULT') {
      expectedMessage = PENDING_VOTE_MESSAGE;
      stillWaiting = Boolean(data.existingVote && !data.game?.results_visible && data.game?.voting_round === pendingNotice.votingRound);
    } else if (pendingNotice.kind === 'PHASE_TWO_DILEMMA') {
      expectedMessage = PENDING_DILEMMA_MESSAGE;
      stillWaiting = Boolean(data.phaseTwo?.dilemma?.submitted && !data.phaseTwo.dilemma.settled);
    } else if (pendingNotice.kind === 'PHASE_TWO_COPY') {
      expectedMessage = PENDING_COPY_MESSAGE;
      stillWaiting = Boolean(data.phaseTwo?.copyChoice && !data.phaseTwo.copyChoice.settled);
    }
    if (message !== expectedMessage || !stillWaiting) {
      setMessage('');
      setPendingNotice(null);
    }
  }, [data, message, pendingNotice]);

  useEffect(() => () => {
    if (refreshNoticeTimerRef.current !== null) window.clearTimeout(refreshNoticeTimerRef.current);
  }, []);

  async function refreshManually() {
    if (manualRefreshRef.current) return;
    manualRefreshRef.current = true;
    setManualRefreshing(true);
    setRefreshNotice('');
    try {
      const refreshed = await load();
      if (!refreshed) return;
      setRefreshNotice('状态已刷新');
      if (refreshNoticeTimerRef.current !== null) window.clearTimeout(refreshNoticeTimerRef.current);
      refreshNoticeTimerRef.current = window.setTimeout(() => setRefreshNotice(''), 1800);
    } finally {
      manualRefreshRef.current = false;
      setManualRefreshing(false);
    }
  }

  useEffect(() => {
    if (!('serviceWorker' in window.navigator)) return;
    let active = true;
    let refreshing = false;
    let removeUpdateChecks = () => {};
    const refreshForNewVersion = () => {
      if (!active || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    window.navigator.serviceWorker.addEventListener('controllerchange', refreshForNewVersion);
    window.navigator.serviceWorker.register('/sw.js?v=6-dinner-menu', { scope: '/', updateViaCache: 'none' })
      .then(async (registration) => {
        const checkForUpdate = () => {
          if (active && document.visibilityState === 'visible') void registration.update();
        };
        window.addEventListener('pageshow', checkForUpdate);
        window.addEventListener('focus', checkForUpdate);
        document.addEventListener('visibilitychange', checkForUpdate);
        removeUpdateChecks = () => {
          window.removeEventListener('pageshow', checkForUpdate);
          window.removeEventListener('focus', checkForUpdate);
          document.removeEventListener('visibilitychange', checkForUpdate);
        };
        await registration.update();
        await window.navigator.serviceWorker.ready;
        if (active) setOfflineReady(true);
        if (!active) removeUpdateChecks();
      })
      .catch(() => { if (active) setOfflineReady(false); });
    return () => {
      active = false;
      removeUpdateChecks();
      window.navigator.serviceWorker.removeEventListener('controllerchange', refreshForNewVersion);
    };
  }, []);

  async function unlockInvitation(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/registration/guests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '邀请码验证失败');
      setInvitationCode(''); setGuests(body.guests); setRegistrationOpen(body.registrationOpen !== false); setSearch('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '邀请码验证失败'); }
    finally { setBusy(false); }
  }

  async function claimIdentity(event: React.FormEvent) {
    event.preventDefault(); if (!selectedGuest) return;
    if (!selectedGuest.hasPassword && claimCode !== claimCodeConfirm) {
      setError('两次输入的四位密码不一致'); return;
    }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/registration/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginName: selectedGuest.loginName, claimCode }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 401 && String(body.error ?? '').includes('邀请码')) {
          setGuests(null); setSelectedGuest(null);
        }
        throw new Error(body.error || '身份认领失败');
      }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '身份认领失败'); }
    finally { setBusy(false); }
  }

  async function submit(assignmentId: string, completionNote: string) {
    setMessage(''); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/submit-task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId, completionNote }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '提交失败'); return; }
      await load();
      setPendingNotice({ kind: 'ASSIGNMENT_REVIEW', assignmentId });
      setMessage(PENDING_ASSIGNMENT_MESSAGE);
    } catch { setOffline(true); setError('当前处于离线状态，任务尚未提交，请联网后重试。'); }
    finally { setBusy(false); }
  }

  async function uploadEvidence(assignmentId: string, file: File) {
    setMessage(''); setError(''); setEvidenceBusyId(assignmentId);
    try {
      const image = await compressTaskEvidence(file);
      const authorization = await fetch('/api/task-evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const uploadInfo = await authorization.json();
      if (!authorization.ok) throw new Error(uploadInfo.error || '无法准备照片上传');
      const upload = await fetch(uploadInfo.signedUrl, {
        method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: image,
      });
      if (!upload.ok) throw new Error('照片上传失败，请检查网络后重试');
      const confirmation = await fetch('/api/task-evidence', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, path: uploadInfo.path }),
      });
      const confirmationBody = await confirmation.json();
      if (!confirmation.ok) throw new Error(confirmationBody.error || '照片确认失败，请重试');
      setMessage('验证照片已安全保存，只有你和工作人员可以查看。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '照片上传失败');
    } finally { setEvidenceBusyId(null); }
  }

  async function removeEvidence(assignmentId: string) {
    setMessage(''); setError(''); setEvidenceBusyId(assignmentId);
    try {
      const response = await fetch('/api/task-evidence', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '删除照片失败');
      setMessage('验证照片已删除。');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除照片失败');
    } finally { setEvidenceBusyId(null); }
  }

  async function vote(targetGuestId: string) {
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetGuestId }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '投票失败'); return; }
      const votingRound = data?.game?.voting_round ?? 0;
      await load();
      setSelectedVoteTargetId('');
      setPendingNotice({ kind: 'VOTE_RESULT', votingRound });
      setMessage(PENDING_VOTE_MESSAGE);
    } catch { setOffline(true); setError('当前处于离线状态，投票尚未保存，请联网后重试。'); }
    finally { setBusy(false); }
  }

  function acknowledgeContentNotice() {
    if (contentNotice && data?.guest.id) {
      try {
        window.localStorage.setItem(ACTIVITY_ACK_KEY, JSON.stringify({ guestKey: activityFingerprint(data.guest.id), signature: contentNotice.signature }));
      } catch {}
    }
    setContentNotice(null);
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/guest-logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout_failed');
    } catch {
      setOffline(true); setError('安全退出需要联网完成。请恢复网络后重试，当前身份仍保持登录。'); setBusy(false); return;
    }
    try { window.sessionStorage.removeItem(GUEST_CACHE_KEY); } catch {}
    contentSnapshotRef.current = null; setContentNotice(null);
    setData(null); setInvitationCode(''); setSelectedGuest(null); setClaimCode(''); setClaimCodeConfirm(''); setSearch(''); setShowSecrets(false); setSecretReaderOpen(false); setRevealedCard(null); setSpecialCardRevealed(false);
    setBusy(false);
  }

  async function drawCard() {
    setDrawing(true); setError('');
    try {
      const [response] = await Promise.all([
        fetch('/api/draw-card', { method: 'POST' }),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '抽卡失败');
      setData((current) => current ? { ...current, guest: { ...current.guest, drawn_at: body.card.drawnAt } } : current);
      setRevealedCard(body.card);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '抽卡失败，请重试'); }
    finally { setDrawing(false); }
  }

  async function enterMissionPage() {
    if (enteringMissionPage) return;
    setEnteringMissionPage(true);
    setShowSecrets(false);
    try {
      if (!data?.guest.drawn_at) {
        const refreshed = await load();
        if (!refreshed) return;
      }
      setRevealedCard(null);
      void load();
    } finally {
      setEnteringMissionPage(false);
    }
  }

  async function revealSpecialCard() {
    setDrawing(true); setError('');
    try {
      const [response] = await Promise.all([
        fetch('/api/reveal-special-card', { method: 'POST' }),
        new Promise((resolve) => window.setTimeout(resolve, 1500)),
      ]);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '惊喜卡暂时无法揭晓');
      setData((current) => current ? { ...current, guest: { ...current.guest, special_card_revealed_at: body.revealedAt } } : current);
      setSpecialCardRevealed(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '惊喜卡暂时无法揭晓，请重试');
    } finally { setDrawing(false); }
  }

  async function connectPlayer(relationshipType: ConnectionRelationshipType) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/guest-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relationshipType, targetCode: connectionTargetCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '编号确认失败');
      const status = body.result?.status;
      setConnectionTargetCode('');
      await load();
      setPendingNotice(status === 'PENDING' ? { kind: 'CONNECTION', relationshipType } : null);
      setMessage(status === 'ACTIVE'
        ? relationshipType === 'CUPID_ALLIANCE' ? '双向确认成功，丘比特联盟已经成立。' : relationshipType === 'STAR_ALLIANCE' ? '双向确认成功，星光联盟已经成立。' : '暗号双向确认成功，你已经找到一位同伴。'
        : status === 'NO_MATCH' ? '暗号没有匹配。请保持自然，你还可以继续试探。'
        : PENDING_CONNECTION_MESSAGE);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '编号确认失败'); }
    finally { setBusy(false); }
  }

  async function rejectConnection(relationshipId: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/reject-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relationshipId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '拒绝邀请失败');
      setMessage('这项配对邀请已拒绝，你和对方都可以重新寻找伙伴。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '拒绝邀请失败'); }
    finally { setBusy(false); }
  }

  async function requestMutualConfirmation(assignmentId: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/mutual-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'REQUEST', assignmentId, targetCode: mutualTargetCodes[assignmentId] }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '确认邀请发送失败');
      setMutualTargetCodes((current) => ({ ...current, [assignmentId]: '' }));
      await load();
      setPendingNotice({ kind: 'MUTUAL_CONFIRMATION', assignmentId });
      setMessage(PENDING_MUTUAL_CONFIRMATION_MESSAGE);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '确认邀请发送失败'); }
    finally { setBusy(false); }
  }

  async function openPlayerDirectory() {
    setPlayerDirectoryOpen(true);
    setPlayerDirectorySearch('');
    setPlayerDirectoryError('');
    if (playerDirectory) return;
    setPlayerDirectoryLoading(true);
    try {
      const response = await fetch('/api/player-directory', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '玩家编号暂时无法查询');
      setPlayerDirectory(Array.isArray(body.players) ? body.players : []);
    } catch (cause) {
      setPlayerDirectoryError(cause instanceof Error ? cause.message : '玩家编号暂时无法查询');
    } finally {
      setPlayerDirectoryLoading(false);
    }
  }

  async function respondMutualConfirmation(confirmationId: string, accept: boolean) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/mutual-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESPOND', confirmationId, accept }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '确认处理失败');
      setMessage(accept ? '双方确认完成，对方的任务状态已经更新。' : '这项确认邀请已拒绝。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '确认处理失败'); }
    finally { setBusy(false); }
  }

  const filteredGuests = useMemo(() => {
    if (!guests) return [];
    const term = search.trim().toLowerCase();
    return term ? guests.filter((guest) => `${guest.name} ${guest.loginName}`.toLowerCase().includes(term)) : guests;
  }, [guests, search]);
  const playerDirectoryMatches = useMemo(() => {
    const term = playerDirectorySearch.trim().toLocaleLowerCase('zh-CN');
    if (!term || !playerDirectory) return [];
    return playerDirectory
      .filter((player) => player.name.toLocaleLowerCase('zh-CN').includes(term))
      .slice(0, 8);
  }, [playerDirectory, playerDirectorySearch]);

  if (checking || deviceAccessChecking) return <main className="welcome-shell"><section className="welcome-card"><div className="heart-mark">♡</div><h1>正在打开婚礼任务</h1><p>丘比特正在确认你的身份…</p></section></main>;

  if (!data) return <main className="welcome-shell">
    <section className={`welcome-card ${guests ? 'compact-registration' : ''}`}>
      <div className="eyebrow">ZIMIN &amp; ANRONG</div><div className="heart-mark">♡</div>
      <h1>丘比特的<br/>婚礼考验</h1>
      <p className="lead">从你来到婚礼现场的这一刻起，故事已经开始。</p>
      <div className="step-row"><span className={!guests ? 'active' : 'done'}>1</span><i/><span className={guests && !selectedGuest ? 'active' : selectedGuest ? 'done' : ''}>2</span><i/><span className={selectedGuest ? 'active' : ''}>3</span></div>
      {error && <div className="notice error">{error}</div>}
      {!guests && <form onSubmit={unlockInvitation}>
        <div className="step-copy"><strong>打开婚礼入口</strong><small>请输入请柬上的共享邀请码</small></div>
        <label htmlFor="invite-code">婚礼邀请码</label>
        <input id="invite-code" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="例如 LOVE2026" required/>
        <button disabled={busy}>{busy ? '验证中…' : '进入宾客名单'}</button>
      </form>}
      {guests && !selectedGuest && <div>
        <div className="step-copy"><strong>找到你的名字</strong><small>{registrationOpen ? '首次进入时，由你自己设置四位密码' : '新宾客注册已结束；已设置密码的宾客仍可登录'}</small></div>
        <label htmlFor="guest-search">搜索宾客</label>
        <input id="guest-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入中文、拼音或英文名"/>
        <div className="guest-list">{filteredGuests.map((guest) => <button type="button" className="guest-choice" key={guest.id} onClick={() => { setSelectedGuest(guest); setClaimCode(''); setClaimCodeConfirm(''); setError(''); }}><span><strong>{guest.name}</strong><small>{guest.loginName}</small></span><b>{guest.hasPassword ? '登录' : '首次设置'}</b></button>)}</div>
        <button className="text-button" onClick={() => { setGuests(null); setError(''); }}>返回修改邀请码</button>
      </div>}
      {selectedGuest && <form onSubmit={claimIdentity}>
        <div className="selected-identity"><small>{selectedGuest.hasPassword ? '欢迎回来' : '请确认你的身份'}</small><strong>{selectedGuest.name}</strong><span>{selectedGuest.loginName}</span></div>
        <div className="pin-heading"><strong>{selectedGuest.hasPassword ? '输入你的四位密码' : '设置你的四位密码'}</strong><small>{selectedGuest.hasPassword ? '这是你首次进入时自己设置的密码' : '只有你知道，用于以后再次登录'}</small></div>
        <label htmlFor="claim-code">四位数字密码</label>
        <input id="claim-code" className="claim-code-input" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete={selectedGuest.hasPassword ? 'current-password' : 'new-password'} value={claimCode} onChange={(event) => setClaimCode(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" required/>
        {!selectedGuest.hasPassword && <><label htmlFor="claim-code-confirm">再次输入密码</label><input id="claim-code-confirm" className="claim-code-input" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="new-password" value={claimCodeConfirm} onChange={(event) => setClaimCodeConfirm(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" required/></>}
        <p className="login-note">请记住这个密码。忘记后可联系主办方在后台重置。</p>
        <button disabled={busy || claimCode.length !== 4 || (!selectedGuest.hasPassword && claimCodeConfirm.length !== 4)}>{busy ? (selectedGuest.hasPassword ? '登录中…' : '设置中…') : (selectedGuest.hasPassword ? '登录我的身份' : '设置密码 · 开始抽卡')}</button>
        <button type="button" className="text-button" onClick={() => { setSelectedGuest(null); setError(''); }}>返回宾客名单</button>
      </form>}
    </section>
  </main>;

  if (data.guest.participation_mode === 'HONOR_GUEST' && (!data.guest.special_card_revealed_at || specialCardRevealed)) return <main className="draw-shell honor-draw-shell"><section className="draw-stage honor-draw-stage">
    <div className="eyebrow">A SURPRISE FOR FAMILY</div>
    <h1>{specialCardRevealed ? '这张卡，送给你' : `${data.guest.name}，准备好了吗？`}</h1>
    <p>{specialCardRevealed ? '谢谢你一路陪伴新人走到今天。请慢慢读完，这张卡不会自动消失。' : '丘比特为你准备了一张特别的惊喜卡。轻触卡片，或使用下方按钮亲自揭晓。'}</p>
    <CardScene className={`secret-card-scene honor-surprise-scene ${drawing ? 'drawing' : ''} ${specialCardRevealed ? 'revealed' : ''}`} label="抽取我的家庭惊喜卡" disabled={drawing} onActivate={specialCardRevealed ? undefined : () => void revealSpecialCard()}><div className="secret-card">
      <div className="secret-card-back"><span>♡</span><strong>CUPID&apos;S<br/>SECRET</strong><small>ZIMIN &amp; ANRONG</small>{!specialCardRevealed && <em>轻触卡片抽取</em>}</div>
      <div className="secret-card-front honor-surprise-front">
        <small>FAMILY HONOR</small>
        <div className="special-card-heart">♡</div>
        <h2>{data.guest.special_card_title || '家庭守护者'}</h2>
        <h3>{data.guest.name}</h3>
        <p>{data.guest.special_card_body || '你已经完成了最重要的任务：陪伴新人长大，并见证他们建立自己的家庭。'}</p>
        <div className="special-card-seal">ZIMIN &amp; ANRONG</div>
      </div>
    </div></CardScene>
    {error && <div className="notice error" role="alert">{error}</div>}
    {!specialCardRevealed && <button className="draw-button" disabled={drawing} onClick={revealSpecialCard}>{drawing ? '丘比特正在洗牌…' : '抽取我的惊喜卡'}</button>}
    {specialCardRevealed && <button className="draw-button" onClick={() => { setSpecialCardRevealed(false); setShowSecrets(false); }}>我已读完 · 进入游戏主页</button>}
    <button className="text-button" disabled={busy || drawing} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>
    <p className="privacy-hint">惊喜卡看完后可进入游戏主页，参与现场互动并累积个人积分；不会收到秘密任务、隐藏阵营或秘密线索。</p>
  </section></main>;

  if (data.guest.participation_mode === 'PRINCIPAL') return <main className="special-card-shell">
    <section className="special-guest-card principal">
      <div className="eyebrow">A PLACE JUST FOR YOU</div>
      <div className="special-card-heart">♡</div>
      <small>{data.guest.relationship || '特别宾客'}</small>
      <h1>{data.guest.special_card_title || '你的专属席位'}</h1>
      <h2>{data.guest.name}</h2>
      <p>{data.guest.special_card_body || '这是一张只属于你的卡片。'}</p>
      <div className="special-card-seal">ZIMIN &amp; ANRONG</div>
      <button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>
    </section>
  </main>;

  // A background refresh can observe drawn_at before the guest has finished reading.
  // Keep the reveal on screen until the guest explicitly dismisses it.
  if (data.guest.participation_mode === 'ACTIVE_PLAYER' && (!data.guest.drawn_at || revealedCard)) {
    const drawOpen = Boolean(data.game?.registration_open);
    const role = revealedCard ? STORY_ROLE_LABELS[revealedCard.storyRole] ?? ROLE_LABELS[revealedCard.role] ?? ROLE_LABELS.guest : null;
    const isTricksterCard = revealedCard?.role === 'spy';
    return <main className="draw-shell"><section className="draw-stage">
      <div className="eyebrow">YOUR SECRET AWAITS</div>
      <h1>{revealedCard ? '命运之卡已经揭晓' : `${data.guest.name}，准备好了吗？`}</h1>
      <p>{revealedCard ? '慢慢看完你的组别和身份，确认记住后再亲自收起卡片。' : '丘比特将同时为你抽取组别与秘密身份。每个人只有一次机会。'}</p>
      {error && <div className="notice error">{error}</div>}
      <CardScene className={`secret-card-scene ${drawing ? 'drawing' : ''} ${revealedCard ? 'revealed' : ''}`} label="抽取我的秘密卡" disabled={drawing || !drawOpen} onActivate={revealedCard || !drawOpen ? undefined : () => void drawCard()}><div className="secret-card">
        <div className="secret-card-back"><span>♡</span><strong>CUPID&apos;S<br/>SECRET</strong><small>ZIMIN &amp; ANRONG</small>{!revealedCard && drawOpen && <em>轻触卡片抽取</em>}</div>
        <div className={`secret-card-front ${isTricksterCard ? 'trickster-card-front' : ''}`}><small>你被选中成为</small><h2>{role?.title}</h2><p>{role?.note}</p>
          {revealedCard && <div className={`identity-secrecy-callout ${isTricksterCard ? 'critical' : ''}`}><strong>{isTricksterCard ? '这是必须隐藏的身份' : '你的身份必须保密'}</strong><span>{isTricksterCard ? '请伪装成普通宾客：不要口头承认、不要展示本页、不要直接询问他人身份，只能使用规定暗号试探。' : '在最终揭晓前，不要说出身份、阵营或任务，也不要把手机页面展示给其他宾客。'}</span></div>}
          <div className="card-team"><span>你的组别</span><strong>{revealedCard?.team}</strong></div>
          <div className="card-task"><span>{isTricksterCard ? '你的伪装任务' : data.game?.task_catalog_mode === 'demo' ? '演示任务 · 之后会替换' : '第一项秘密任务'} · {revealedCard?.task.points} 分</span><strong>{revealedCard?.task.title}</strong><p>{revealedCard?.task.description}</p>{isTricksterCard && <aside className="trickster-facade-explainer"><strong>这不是你的真正任务</strong><span>记住：主页的“展开查看”通往真实界面。进入主页后，页面会看起来和普通宾客完全一样；请遮挡屏幕，点击身份卡旁普通的“展开查看”，当前页面才会替换为你的真正信息。</span></aside>}</div>
        </div>
      </div></CardScene>
      {!revealedCard && <button className="draw-button" disabled={drawing || !drawOpen} onClick={drawCard}>{drawing ? '丘比特正在洗牌…' : drawOpen ? '抽取我的秘密卡' : '抽卡入口暂未开放'}</button>}
      {!revealedCard && !drawOpen && <div className="notice">主办方目前已关闭宾客抽卡，请联系现场工作人员协助。</div>}
      {revealedCard && <button className="draw-button" disabled={enteringMissionPage} onClick={enterMissionPage}>{enteringMissionPage ? '正在打开游戏主页…' : '我已经看清楚 · 收起卡片'}</button>}
      {!revealedCard && <button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>}
      <p className="privacy-hint"><strong>全员保密规则：</strong>请遮挡屏幕，不告诉任何人你的身份、阵营或任务。卡片不会自动消失，只有你点击上方按钮后才会隐藏。</p>
    </section></main>;
  }

  const stage = gameStageCopy(data.game?.stage);
  const dinnerMenuVisible = DINNER_MENU_STAGES.has(data.game?.stage ?? '');
  const isActivePlayer = data.guest.participation_mode === 'ACTIVE_PLAYER';
  const isHonorGuest = data.guest.participation_mode === 'HONOR_GUEST';
  const isTrickster = data.guest.role === 'spy' || data.guest.is_hidden_spy;
  const hasPublicIdentity = isHonorGuest || PUBLIC_STORY_ROLES.has(data.guest.story_role) || Boolean(data.game?.results_visible);
  const identityVisible = hasPublicIdentity || showSecrets;
  const role = isHonorGuest
    ? { title: '家庭荣誉宾客', note: '参与现场互动并累积个人积分；不领取秘密任务、隐藏身份或秘密线索。' }
    : data.guest.story_role !== 'NONE' && STORY_ROLE_LABELS[data.guest.story_role]
    ? STORY_ROLE_LABELS[data.guest.story_role]
    : data.guest.is_hidden_spy
    ? { title: '丘比特的暗线恶作剧者', note: '你的阵营已经改变。请继续伪装成普通宾客，直到最终揭晓。' }
    : ROLE_LABELS[data.guest.role] ?? ROLE_LABELS.guest;
  const rankedReward = data.assignments.find((assignment) => assignment.is_initial && assignment.completion_rank !== null && assignment.completion_rank >= 1 && assignment.completion_rank <= 10);
  const missionStory = data.missionStory;
  const tricksterRelationship = missionStory?.relationships.find((relationship) => relationship.type === 'TRICKSTER_CONNECTION');
  const phaseOneInteractionsOpen = isPhaseOneInteractionOpenAtStage(data.game?.stage);
  const canUseTricksterSignal = data.guest.role === 'spy' && phaseOneInteractionsOpen;
  const usesTricksterFacade = data.guest.role === 'spy' && !data.game?.results_visible;
  const dashboardRole = usesTricksterFacade && !secretReaderOpen ? ROLE_LABELS.guest : role;
  const identityRevealRole = usesTricksterFacade ? role : dashboardRole;
  const trueTricksterAssignments = usesTricksterFacade ? data.assignments.filter((assignment) => assignment.task.category === 'hidden') : [];
  const facadeAssignments = usesTricksterFacade ? data.assignments.filter((assignment) => assignment.task.category !== 'hidden') : data.assignments;
  const allDashboardAssignments = usesTricksterFacade && secretReaderOpen ? trueTricksterAssignments : facadeAssignments;
  const readerAssignments = usesTricksterFacade ? trueTricksterAssignments : data.assignments;
  const openAssignments = allDashboardAssignments.filter((assignment) => !['approved', 'cancelled'].includes(assignment.status));
  const completedAssignments = allDashboardAssignments.filter((assignment) => ['approved', 'cancelled'].includes(assignment.status));
  const dashboardAssignments = completedMissionsOpen || openAssignments.length === 0 ? allDashboardAssignments : openAssignments;
  const pointLedger = data.pointLedger ?? [];
  const teamScores = data.teamScores ?? [];
  const guestClueGroups = Array.from(new Set(data.clues.map((clue) => clue.groupName || '通用线索'))).map((name) => ({ name, clues: data.clues.filter((clue) => (clue.groupName || '通用线索') === name) }));
  const incomingConfirmationCount = missionStory?.mutualConfirmations.filter((confirmation) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING').length ?? 0;
  const rejectedAssignment = openAssignments.find((assignment) => assignment.status === 'rejected');
  const actionableAssignment = rejectedAssignment ?? openAssignments.find((assignment) => assignment.status === 'assigned' && isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage));
  const waitingAssignment = openAssignments.find((assignment) => assignment.status === 'submitted');
  const primaryAction = data.game?.results_visible
    ? { label: '最终结果已经公布', detail: '查看身份揭晓、最终积分和今晚的婚礼荣誉。', button: '查看最终结果', target: 'guest-results', tone: 'complete' }
    : data.game?.voting_open && !data.existingVote
      ? { label: '现在请完成最终投票', detail: '每人只有一次机会，提交后不能修改。', button: '立即投票', target: 'guest-vote', tone: 'urgent' }
      : incomingConfirmationCount > 0
        ? { label: `你有 ${incomingConfirmationCount} 项好友确认`, detail: '请按真实情况确认，对方的任务会自动更新。', button: '处理确认', target: 'guest-confirmations', tone: 'urgent' }
        : actionableAssignment
          ? { label: rejectedAssignment ? '任务需要补充验证' : '现在可以继续任务', detail: actionableAssignment.task.title, button: rejectedAssignment ? '查看任务站留言' : '展开当前任务', target: 'guest-missions', tone: rejectedAssignment ? 'urgent' : 'active', assignmentId: actionableAssignment.id }
          : waitingAssignment
            ? { label: '任务已经提交', detail: '任务站确认后会自动更新状态和积分。', button: '查看提交状态', target: 'guest-missions', tone: 'waiting', assignmentId: waitingAssignment.id }
            : data.game?.stage === 'task_round_1'
              ? { label: '现在请专心见证仪式', detail: '任务提交与伙伴确认会在仪式结束后自动恢复。', button: '查看当前环节', target: 'guest-stage', tone: 'waiting' }
              : { label: '当前没有待处理事项', detail: '保持页面即可，新的任务、提示或投票会自动出现。', button: '查看我的任务', target: 'guest-missions', tone: 'complete' };

  function focusPrimaryAction() {
    if ('assignmentId' in primaryAction && primaryAction.assignmentId) {
      setExpandedAssignments((current) => ({ ...current, [primaryAction.assignmentId as string]: true }));
    }
    window.requestAnimationFrame(() => {
      const fallback = primaryAction.target === 'guest-vote'
        ? document.querySelector('.vote-grid')?.closest('section')
        : primaryAction.target === 'guest-results'
          ? document.querySelector('.reveal-card')
          : null;
      (document.getElementById(primaryAction.target) ?? fallback)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderMutualConfirmation(assignment: GuestData['assignments'][number]) {
    if (!['P1-SOCIAL-001', 'P1-SOCIAL-002'].includes(assignment.task.mission_code || '') || !['assigned', 'rejected'].includes(assignment.status)) return null;
    const outgoing = missionStory?.mutualConfirmations.find((confirmation) => confirmation.assignmentId === assignment.id && confirmation.direction === 'OUTGOING' && confirmation.status === 'PENDING');
    return <section className="inline-mutual-confirmation" aria-label="新朋友确认">
      <div className="inline-proof-heading"><strong>输入玩家编号</strong><span>不方便合影时，请新朋友确认。对方确认后任务会自动完成。</span></div>
      <div className="connection-form">
        {outgoing ? <p>已邀请 {outgoing.otherGuestName}，等待对方确认。</p> : <><label htmlFor={`mutual-code-${assignment.id}`}>新朋友的玩家编号</label><div><input id={`mutual-code-${assignment.id}`} value={mutualTargetCodes[assignment.id] ?? ''} onChange={(event) => setMutualTargetCodes((current) => ({ ...current, [assignment.id]: normalizePlayerCode(event.target.value) }))} maxLength={5} placeholder="例如 K7M4" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><button disabled={busy || offline || !phaseOneInteractionsOpen || !isPlayerCode(mutualTargetCodes[assignment.id] ?? '')} onClick={() => void requestMutualConfirmation(assignment.id)}>发送确认邀请</button></div><p className="player-code-attempt-note">每 10 分钟最多提交 3 次；不确定时请先用页面顶部查询编号。</p></>}
      </div>
      <div className="mission-proof-divider"><span>或者</span></div>
      <div className="mission-selfie-option"><strong>📷 一起自拍</strong><span>选择或拍摄合影，上传后在下方提交验证。</span></div>
    </section>;
  }

  function renderSymbolPairing(assignment: GuestData['assignments'][number]) {
    const pairing = missionStory?.symbolPairing;
    const isStarTask = assignment.task.mechanic === 'STAR_MATCH';
    const isHeartTask = assignment.task.mechanic === 'HEART_MATCH';
    if (!pairing || (!isStarTask && !isHeartTask) || pairing.symbol !== (isStarTask ? 'STAR' : 'HEART')) return null;
    const relationshipType = isStarTask ? 'STAR_ALLIANCE' : 'CUPID_ALLIANCE';
    const relationship = missionStory?.relationships.find((item) => item.type === relationshipType && item.status !== 'REJECTED');
    const isPaired = relationship?.status === 'ACTIVE';
    const symbolName = isStarTask ? '星星' : '爱心';
    const fragmentLabel = pairing.fragmentSide === 'LEFT' ? `左半${symbolName}` : pairing.fragmentSide === 'RIGHT' ? `右半${symbolName}` : `${symbolName}碎片`;
    const counterpartLabel = pairing.fragmentSide === 'LEFT' ? `右半${symbolName}` : pairing.fragmentSide === 'RIGHT' ? `左半${symbolName}` : `另一半${symbolName}`;
    const symbolGlyph = isStarTask ? '★' : '♥';
    const awakeningRevealed = Boolean(data?.phaseTwo?.unlockedAt && ['task_round_2', 'banquet', 'group_game', 'voting', 'results'].includes(data.game?.stage ?? ''));
    const inputId = `symbol-partner-code-${assignment.id}`;
    return <section className={`inline-symbol-pairing ${isStarTask ? 'star' : 'heart'}`} aria-label={isStarTask ? '星星伙伴配对' : '爱心伙伴配对'}>
      <div className={`symbol-fragment-stage ${isStarTask ? 'star' : 'heart'} ${isPaired ? 'merged' : ''}`} role="img" aria-label={isPaired ? `左右两半${symbolName}已经合并成完整${symbolName}` : `你持有${fragmentLabel}`}>
        {isPaired ? <><span className="symbol-merge-half left" aria-hidden="true">{symbolGlyph}</span><span className="symbol-merge-half right" aria-hidden="true">{symbolGlyph}</span><span className="symbol-merge-glow" aria-hidden="true">{isStarTask ? '✦' : '♡'}</span></> : <span className={`symbol-own-fragment ${pairing.fragmentSide?.toLowerCase() ?? 'unknown'}`} aria-hidden="true">{symbolGlyph}</span>}
        <div><small>{isPaired ? `${isStarTask ? 'STAR' : 'HEART'} MATCH COMPLETE` : `你的${symbolName}碎片`}</small><strong>{isPaired ? `完整${symbolName}` : fragmentLabel}</strong><p>{isPaired ? `两半${isStarTask ? '星光' : '爱心'}已经合二为一` : `寻找持有${counterpartLabel}的玩家`}</p></div>
      </div>
      {pairing.status === 'UNPAIRED_FINAL' ? awakeningRevealed ? <div className="story-unlock lonely awakened"><strong>{isStarTask ? '领航星已经觉醒' : '孤单丘比特已经觉醒'}</strong><p>{isStarTask ? '第一幕落单的星光没有消失，而是在第二幕成为所有人的方向。查看新任务了解你的带队能力。' : '第一幕没有完成配对并不是失败，而是丘比特留给你的伏笔。查看新任务，选择你要复制的命运。'}</p></div> : <div className="story-unlock unresolved"><strong>配对没有完成</strong><p>你没能在第一幕找到另一半。先保留这张未完成的命运卡——丘比特还没有说出最后的答案。</p></div> : isPaired ? <div className="story-unlock"><strong>{isStarTask ? '星光联盟' : '丘比特联盟'}已成立</strong><p>你与 {relationship.partnerName} 已完成双向确认。</p></div> : <div className="connection-form"><label htmlFor={inputId}>对方的玩家编号</label><div><input id={inputId} value={connectionTargetCode} onChange={(event) => setConnectionTargetCode(normalizePlayerCode(event.target.value))} maxLength={5} placeholder="例如 K7M4" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><button disabled={busy || offline || !phaseOneInteractionsOpen || !isPlayerCode(connectionTargetCode)} onClick={() => void connectPlayer(relationshipType)}>{isStarTask ? '邀请另一半星星' : '邀请爱心伙伴'}</button></div><p className="player-code-attempt-note">每 10 分钟最多提交 3 次；不确定时请先用页面顶部查询编号。</p>{relationship?.status === 'PENDING' && <div className="pending-connection"><p>{relationship.confirmedByMe ? `已提交，等待 ${relationship.partnerName} 输入你的编号。` : `${relationship.partnerName} 邀请你配对；输入对方编号即可接受。`}</p><button type="button" className="text-button" disabled={busy || offline} onClick={() => void rejectConnection(relationship.id)}>拒绝这项邀请</button></div>}</div>}
    </section>;
  }

  async function submitPhaseTwoAction(payload: Record<string, string>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/phase-two-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '第二轮任务选择提交失败');
      setPhaseTwoDilemmaChoice('');
      await load();
      setPendingNotice(payload.action === 'dilemma' ? { kind: 'PHASE_TWO_DILEMMA' } : { kind: 'PHASE_TWO_COPY' });
      setMessage(success);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '第二轮任务选择提交失败'); }
    finally { setBusy(false); }
  }

  function renderPhaseTwoAction(assignment: GuestData['assignments'][number]) {
    const phaseTwo = data?.phaseTwo;
    if (!phaseTwo || !['P2-HEART-001','P2-STAR-001','P2-LONELY-001'].includes(assignment.task.mission_code ?? '')) return null;
    const actionOpen = isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage);
    if (assignment.task.mission_code === 'P2-LONELY-001') {
      if (phaseTwo.copyChoice) return <div className="phase-two-choice-state"><strong>命运已经选定</strong><span>{phaseTwo.copyChoice.targetName} · {phaseTwo.copyChoice.targetTeam}</span><small>{phaseTwo.copyChoice.settled ? `最终复制 ${phaseTwo.copyChoice.settledPoints ?? 0} 分` : '最终揭晓时自动复制该玩家的第二轮个人积分。选择不可修改。'}</small></div>;
      return <div className="phase-two-action"><label htmlFor={`copy-target-${assignment.id}`}>选择要复制命运的玩家</label><select id={`copy-target-${assignment.id}`} value={phaseTwoCopyTarget} disabled={busy || offline || !actionOpen} onChange={(event) => setPhaseTwoCopyTarget(event.target.value)}><option value="">请选择一位竞技玩家</option>{phaseTwo.copyCandidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.team}</option>)}</select><p>提交后不能修改；最终只复制对方第二轮获得的个人积分。</p><button disabled={busy || offline || !actionOpen || !phaseTwoCopyTarget} onClick={() => void submitPhaseTwoAction({ action: 'copy', targetGuestId: phaseTwoCopyTarget }, PENDING_COPY_MESSAGE)}>确认并锁定目标</button></div>;
    }
    const dilemma = phaseTwo.dilemma;
    const isHeart = assignment.task.mission_code === 'P2-HEART-001';
    const choices = isHeart
      ? [{ value: 'LOVE', label: '选择「爱」' }, { value: 'HATE', label: '选择「恨」' }]
      : [{ value: 'TOGETHER', label: '选择「同行」' }, { value: 'TAKE_ALL', label: '选择「独占」' }];
    const labels: Record<string, string> = { LOVE: '爱', HATE: '恨', TOGETHER: '同行', TAKE_ALL: '独占' };
    if (dilemma?.settled) return <div className="phase-two-choice-state settled"><strong>双方选择已经揭晓</strong><span>你选择「{labels[dilemma.myChoice ?? '']}」· 获得 {dilemma.myPoints ?? 0} 分</span><span>伙伴选择「{labels[dilemma.partnerChoice ?? '']}」· 获得 {dilemma.partnerPoints ?? 0} 分</span></div>;
    if (dilemma?.submitted) return <div className="phase-two-choice-state"><strong>你的选择已密封保存</strong><span>等待伙伴提交后，系统才会同时揭晓结果。</span><small>任何人都不能提前查看或修改选择。</small></div>;
    const cooperative = isHeart ? '爱' : '同行';
    const selfish = isHeart ? '恨' : '独占';
    return <div className="phase-two-action"><section className="phase-two-payoff" aria-label={`${isHeart ? '爱与恨' : '星光'}抉择积分规则`}><strong>积分规则 · 必须秘密选择，不能商量</strong><div><span>双方都选「{cooperative}」</span><b>各得 3 分</b></div><div><span>你选「{cooperative}」，伙伴选「{selfish}」</span><b>你 0 分 · 伙伴 5 分</b></div><div><span>你选「{selfish}」，伙伴选「{cooperative}」</span><b>你 5 分 · 伙伴 0 分</b></div><div><span>双方都选「{selfish}」</span><b>各得 1 分</b></div></section><div className="phase-two-choice-buttons">{choices.map((choice) => <button type="button" className={phaseTwoDilemmaChoice === choice.value ? 'selected' : ''} disabled={busy || offline || !actionOpen} key={choice.value} onClick={() => setPhaseTwoDilemmaChoice(choice.value)}>{choice.label}</button>)}</div><button disabled={busy || offline || !actionOpen || !phaseTwoDilemmaChoice} onClick={() => void submitPhaseTwoAction({ action: 'dilemma', choice: phaseTwoDilemmaChoice }, PENDING_DILEMMA_MESSAGE)}>确认提交 · 不可修改</button></div>;
  }

  function renderTricksterSignal(assignment: GuestData['assignments'][number]) {
    if (!usesTricksterFacade || !secretReaderOpen || !missionStory || assignment.task.mechanic !== 'TRICKSTER_SIGNAL') return null;
    return <section className="story-connection-card trickster trickster-mission-action"><div className="signal-script"><small>暗号问句</small><strong>你今天早上吃了什么？</strong><small>正确回答</small><strong>吃了仙人掌。</strong></div>{!canUseTricksterSignal ? <p className="trickster-waiting-note">秘密确认入口当前已经关闭。</p> : tricksterRelationship?.status === 'ACTIVE' ? <div className="story-unlock"><strong>已找到同伴</strong><p>你和 {tricksterRelationship.partnerName} 已完成双向确认。继续隐藏身份。</p></div> : <div className="connection-form"><label htmlFor={`trickster-partner-code-${assignment.id}`}>暗号匹配后，输入对方玩家编号</label><div><input id={`trickster-partner-code-${assignment.id}`} value={connectionTargetCode} onChange={(event) => setConnectionTargetCode(normalizePlayerCode(event.target.value))} maxLength={5} placeholder="例如 K7M4" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/><button disabled={busy || offline || missionStory.tricksterAttemptsUsed >= missionStory.tricksterMaxAttempts || !isPlayerCode(connectionTargetCode)} onClick={() => void connectPlayer('TRICKSTER_CONNECTION')}>秘密确认</button></div>{tricksterRelationship?.status === 'PENDING' && <p>{tricksterRelationship.confirmedByMe ? `已提交，等待 ${tricksterRelationship.partnerName} 输入你的编号。` : `${tricksterRelationship.partnerName} 已通过暗号找到你，请输入对方编号。`}</p>}<p>整场婚礼最多试探 {missionStory.tricksterMaxAttempts} 位宾客。不要连续询问，也不要直接暴露身份。</p></div>}</section>;
  }

  return <main className={`dashboard-shell ${usesTricksterFacade && secretReaderOpen ? 'trickster-dashboard-revealed' : ''}`}>
    <section className={`mission-hero ${usesTricksterFacade && secretReaderOpen ? 'trickster-real-hero' : ''}`}>
      <div className="eyebrow">丘比特的婚礼考验</div>
      <div className="hero-line"><div><span className="team-chip">{isHonorGuest ? data.guest.special_card_title || '亲爱的家人' : data.guest.team}</span><h1>{data.guest.name}</h1></div><button type="button" className="score-orb" aria-label={`查看我的积分流水，当前 ${data.guest.points} 分`} onClick={() => setScoreLedgerOpen(true)}><strong>{data.guest.points}</strong><small>积分明细</small></button></div>
      <div className="hero-player-code"><div><small>我的玩家编号</small><strong>{data.guest.player_code}</strong></div><div className="hero-code-actions"><button type="button" className={playerCodeCopied ? 'copied' : ''} onClick={() => { void navigator.clipboard?.writeText(data.guest.player_code); setPlayerCodeCopied(true); window.setTimeout(() => setPlayerCodeCopied(false), 1800); }}>{playerCodeCopied ? '已复制 ✓' : '复制'}</button><button type="button" onClick={() => void openPlayerDirectory()}>查询他人</button></div></div>
      <div className={`identity-strip ${identityVisible || (usesTricksterFacade && secretReaderOpen) ? 'visible' : 'concealed'} ${isTrickster && identityVisible && !data.game?.results_visible && (!usesTricksterFacade || secretReaderOpen) ? 'trickster-identity' : ''} ${usesTricksterFacade && secretReaderOpen ? 'trickster-real-identity' : ''}`}>
        <div className="identity-strip-heading">
          <small>{usesTricksterFacade && secretReaderOpen ? '真实身份视图' : hasPublicIdentity ? '你的公开身份' : '你的秘密身份'}</small>
          {!hasPublicIdentity && !secretReaderOpen && <div className="identity-private-actions">
            <button type="button" className="identity-hold-button" aria-pressed={identityVisible} onPointerDown={(event) => { event.preventDefault(); try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} setShowSecrets(true); }} onPointerUp={() => setShowSecrets(false)} onPointerCancel={() => setShowSecrets(false)} onLostPointerCapture={() => setShowSecrets(false)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowSecrets(true); } }} onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowSecrets(false); } }} onBlur={() => setShowSecrets(false)} onContextMenu={(event) => event.preventDefault()}>{identityVisible ? '松开隐藏' : '按住查看'}</button>
            <button type="button" className="identity-reader-button" onClick={() => { setShowSecrets(false); setSecretReaderOpen(true); }}>展开查看</button>
          </div>}
          {usesTricksterFacade && secretReaderOpen && <button type="button" className="trickster-hide-button" onClick={() => setSecretReaderOpen(false)}>隐藏真实界面</button>}
        </div>
        {usesTricksterFacade && secretReaderOpen ? <><strong>{dashboardRole.title}</strong><p>{dashboardRole.note}</p><div className="trickster-inline-rule"><strong>必须隐藏身份</strong><span>不要承认身份、不要展示本页、不要直接询问别人是不是同伴；请继续使用伪装身份行动。</span></div></> : identityVisible ? <><strong>{identityRevealRole.title}</strong><p>{identityRevealRole.note}</p>{usesTricksterFacade && showSecrets && <span className="trickster-hold-hint">记住：点击右侧“展开查看”，可以进入你的真实界面。</span>}</> : <><strong className="identity-mask" aria-hidden="true">••••••</strong><p>短按住可快速查看；需要完整阅读时请点“展开查看”。</p></>}
      </div>
      {isActivePlayer && !data.game?.results_visible && <div className="identity-game-rule"><strong>所有宾客共同规则</strong><span>最终揭晓前，不主动告诉别人你的身份、阵营或任务，也不要要求别人展示手机。</span></div>}
      <div className="stage-card" id="guest-stage"><small>当前婚礼环节</small><strong>{stage.label}</strong><p className="stage-default-prompt">{stage.note}</p>{data.game?.phase_note && <div className="stage-live-note"><b>主办方最新提示</b><span>{data.game.phase_note}</span></div>}{dinnerMenuVisible && <button type="button" className="dinner-menu-entry" aria-haspopup="dialog" onClick={() => setDinnerMenuOpen(true)}><span aria-hidden="true">♧</span><span><small>DINNER MENU</small><strong>查看今日菜单</strong></span><b aria-hidden="true">→</b></button>}</div>
    </section>
    {offline && <div className="connection-banner offline" role="status">离线只读模式 · 已显示最近同步的任务，提交和投票暂不可用</div>}
    {message && <div className="notice success" aria-live="polite">{message}</div>}{error && <div className="notice error" aria-live="polite">{error}</div>}
    {usesTricksterFacade && secretReaderOpen && <section className="trickster-real-mode-banner" aria-live="polite"><div><small>TRUE VIEW ACTIVE</small><strong>真实界面已展开</strong><p>页面内容已原地替换为真正信息。切换应用、锁屏或离开页面时会自动恢复伪装。</p></div><button type="button" onClick={() => setSecretReaderOpen(false)}>隐藏并恢复伪装</button></section>}
    {isActivePlayer && <section className={`guest-primary-action ${primaryAction.tone}`} aria-label="现在请做"><div><small>现在请做</small><strong>{primaryAction.label}</strong><p>{primaryAction.detail}</p></div><button type="button" onClick={focusPrimaryAction}>{primaryAction.button}<span aria-hidden="true">→</span></button></section>}
    {isActivePlayer && data.phaseTwo?.isCaptain && data.phaseTwo.unlockedAt && <section className="captain-public-note"><small>LEADING STAR</small><strong>你是本队的领航星队长</strong><p>这是可以公开的身份。你可以主动告诉队友，并在团队环节组织协作。</p></section>}
    {isActivePlayer && data.game?.stage === 'task_round_1' && <div className="connection-banner ceremony-pause" role="status">婚礼仪式进行中 · 照片上传、任务提交和玩家确认暂时暂停，仪式结束后会自动恢复。</div>}
    {teamScores.length > 0 && <section className="section-card guest-team-score-card"><div className="section-heading"><div><small>TEAM SCORE</small><h2>团队实时积分</h2></div><span>LIVE</span></div><p className="muted">团队环节已开放，分数会随主持人现场计分自动更新。</p><div className="guest-team-score-grid">{teamScores.map((team, index) => <article className={team.team === data.guest.team ? 'mine' : ''} key={team.team}><small>第 {index + 1} 名</small><strong>{team.team}</strong><b>{team.points} 分</b>{team.team === data.guest.team && <span>我的团队</span>}</article>)}</div></section>}
    {rankedReward && <section className="reward-banner"><small>EARLY COMPLETION HONOR</small><strong>你是第 {rankedReward.completion_rank} 位完成首轮任务的宾客</strong><p>{rankedReward.reward_task_id && rankedReward.reward_clue_id ? `升级任务、${rankedReward.early_bonus_points ? '额外 1 分和' : ''}一条秘密线索已经发放。` : rankedReward.reward_task_id ? '升级任务已经发放，将在第二轮开放。' : '你的首轮任务已经记录。'}</p></section>}
    {isHonorGuest && <section className="section-card honor-participation-card"><div className="section-heading"><div><small>FAMILY PARTICIPATION</small><h2>家人参与区</h2></div><span>♡</span></div><p>你可以和大家一起参加现场互动，获得的个人积分会显示在上方并进入个人积分榜。</p><div className="honor-boundary-note"><strong>轻松参与</strong><span>系统不会向你发放秘密任务、隐藏阵营或秘密线索。</span></div></section>}
    {isActivePlayer && missionStory?.mutualConfirmations.some((confirmation) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING') && <section className="section-card mutual-confirmation-card" id="guest-confirmations"><div className="section-heading"><div><small>FRIEND CONFIRMATION</small><h2>好友确认请求</h2></div><span>待处理</span></div>{missionStory.mutualConfirmations.filter((confirmation) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING').map((confirmation) => <div className="approval-row" key={confirmation.id}><div className="approval-copy"><strong>{confirmation.otherGuestName}</strong><p>对方表示你们今天第一次见面，并已完成互相介绍。请按真实情况确认。</p></div><div className="approval-actions"><button disabled={busy || offline || !phaseOneInteractionsOpen} onClick={() => void respondMutualConfirmation(confirmation.id, true)}>确实完成</button><button className="danger" disabled={busy || offline || !phaseOneInteractionsOpen} onClick={() => void respondMutualConfirmation(confirmation.id, false)}>不符合</button></div></div>)}</section>}
    {isActivePlayer && <section className={`section-card ${usesTricksterFacade && secretReaderOpen ? 'trickster-real-missions' : ''}`} id="guest-missions"><div className="section-heading"><div><small>{usesTricksterFacade && secretReaderOpen ? 'TRUE MISSIONS' : 'SECRET MISSIONS'}</small><h2>{usesTricksterFacade && secretReaderOpen ? '恶作剧者真正任务' : '我的秘密任务'}</h2></div><span>{openAssignments.length} 待处理</span></div>
      {data.game?.task_catalog_mode === 'demo' && <div className="demo-task-note"><strong>当前是演示任务</strong><p>用于测试领取、提交和审核流程，不代表婚礼当天的最终任务设计。</p></div>}
      {completedAssignments.length > 0 && openAssignments.length > 0 && <button type="button" className="completed-missions-toggle" aria-expanded={completedMissionsOpen} onClick={() => setCompletedMissionsOpen((open) => !open)}><span>{completedMissionsOpen ? '收起已完成任务' : `查看已完成任务（${completedAssignments.length}）`}</span><b aria-hidden="true">{completedMissionsOpen ? '↑' : '↓'}</b></button>}
      {dashboardAssignments.length === 0 ? <div className="empty-state">抽卡后，你领取的第一项任务会立即显示在这里。</div> : dashboardAssignments.map((assignment, index) => { const isDilemmaTask = ['P2-HEART-001','P2-STAR-001'].includes(assignment.task.mission_code ?? ''); return <details className="mission-item" key={assignment.id} open={expandedAssignments[assignment.id] ?? false} onToggle={(event) => { const open = event.currentTarget.open; setExpandedAssignments((current) => current[assignment.id] === open ? current : { ...current, [assignment.id]: open }); }}><summary className="mission-summary"><span className="mission-number">{String(index + 1).padStart(2, '0')}</span><span className="mission-summary-copy"><span className="mission-meta"><span>{assignment.task.points} 分</span><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></span><strong>{assignment.task.title}</strong></span><span className="mission-chevron" aria-hidden="true"><span/></span></summary><div className="mission-body">{['P2-LONELY-001','P2-GUIDE-001'].includes(assignment.task.mission_code ?? '') && <div className={`destiny-origin-note ${assignment.task.mission_code === 'P2-GUIDE-001' ? 'star' : 'heart'}`}><small>第一幕伏笔揭晓</small><strong>你没有失败，这项能力正来自那次落单</strong><span>{assignment.task.mission_code === 'P2-GUIDE-001' ? '没有配成完整星星的你，被留下来成为全队的方向。' : '没有配成爱心的你，被留下来掌握复制他人命运的能力。'}</span></div>}{!isDilemmaTask && <p>{assignment.task.description}</p>}{!isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && <div className="task-feedback">{isTaskPausedDuringCeremony(assignment.task.stage, data.game?.stage) ? '婚礼仪式进行中，照片上传和任务提交暂时暂停；仪式结束后会自动恢复。' : isTaskWaitingForStage(assignment.task.stage, data.game?.stage) ? '这项任务将在相应婚礼环节开放，请先记住任务内容。' : '本环节已停止提交；如需补录，请到任务站联系工作人员。'}</div>}{!isDilemmaTask && <div className="verification-note"><strong>如何验证</strong><span>{assignment.task.verification_method}</span></div>}{renderSymbolPairing(assignment)}{renderMutualConfirmation(assignment)}{renderPhaseTwoAction(assignment)}{renderTricksterSignal(assignment)}{assignment.evidence_url && <figure className="evidence-preview"><a href={assignment.evidence_url} target="_blank" rel="noreferrer"><img src={assignment.evidence_url} alt={`${assignment.task.title}的验证照片`} loading="lazy"/></a><figcaption>验证照片 · 仅你和工作人员可见</figcaption></figure>}{isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && assignment.task.mechanic === 'STANDARD' && <div className="evidence-controls"><label htmlFor={`evidence-${assignment.id}`}>{assignment.evidence_url ? '更换验证照片' : assignment.task.mission_code === 'P1-SOCIAL-001' ? '选择或拍摄合影' : '添加验证照片（选填）'}</label><input id={`evidence-${assignment.id}`} type="file" accept="image/*" disabled={offline || evidenceBusyId === assignment.id} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadEvidence(assignment.id, file); }}/>{assignment.evidence_url && <button type="button" className="text-button" disabled={offline || evidenceBusyId === assignment.id} onClick={() => { if (window.confirm('删除这张验证照片？')) void removeEvidence(assignment.id); }}>删除照片</button>}{evidenceBusyId === assignment.id && <small>正在压缩并安全上传…</small>}</div>}{assignment.completion_note && <div className="submission-note"><strong>我的完成说明</strong><span>{assignment.completion_note}</span></div>}{assignment.status === 'approved' && assignment.verification_note && <div className="submission-note approved"><strong>任务站核验记录</strong><span>{assignment.verification_note}</span></div>}{assignment.status === 'rejected' && <div className="task-feedback">任务站留言：{assignment.rejection_reason || '请补充验证后再次提交。'}</div>}{isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && !['HEART_MATCH','STAR_MATCH','TRICKSTER_SIGNAL','INSTANT_BONUS','SECRET_DILEMMA','COPY_SCORE','TEAM_CAPTAIN','TRICKSTER_MISSION'].includes(assignment.task.mechanic) && <div className="submission-form"><label htmlFor={`completion-note-${assignment.id}`}>完成说明（选填）</label><textarea id={`completion-note-${assignment.id}`} value={completionNotes[assignment.id] ?? assignment.completion_note ?? ''} onChange={(event) => setCompletionNotes({ ...completionNotes, [assignment.id]: event.target.value })} maxLength={500} placeholder="例如：已完成合影，照片会在任务站出示。"/><button disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => submit(assignment.id, completionNotes[assignment.id] ?? assignment.completion_note ?? '')}>{offline ? '联网后可提交' : assignment.status === 'rejected' ? '补充完成 · 再次提交' : '我已完成 · 提交验证'}</button></div>}</div></details>; })}
    </section>}
    {isActivePlayer && <section className="section-card"><div className="section-heading"><div><small>SPY CLUES</small><h2>已解锁线索</h2></div><span>{data.clues.length}</span></div>{data.clues.length === 0 ? <div className="empty-state">完成任务后，线索会在这里出现。</div> : guestClueGroups.map((group) => <section className="guest-clue-group" key={group.name}><h3>{group.name}</h3>{group.clues.map((clue) => <div className="clue" key={clue.id}><strong>{clue.title}</strong><p>{clue.content}</p></div>)}</section>)}</section>}
    {isActivePlayer && data.game?.voting_open && <section className="section-card"><div className="section-heading"><div><small>FINAL VOTE</small><h2>谁是恶作剧者？</h2></div><span>第 {data.game.voting_round} 轮</span></div><p className="muted">只能选择本队宾客。每人只有一次机会，确认后不能改票；投对恶作剧者获得 2 点个人积分。</p><div className="vote-grid">{data.candidates.filter((candidate) => candidate.id !== data.guest.id).map((candidate) => <button type="button" disabled={busy || offline || Boolean(data.existingVote)} className={(data.existingVote || selectedVoteTargetId) === candidate.id ? 'vote-choice selected' : 'vote-choice'} key={candidate.id} onClick={() => setSelectedVoteTargetId(candidate.id)}>{(data.existingVote || selectedVoteTargetId) === candidate.id ? '✓ ' : ''}{candidate.name}</button>)}</div>{!data.existingVote && <div className="vote-confirm-row"><span>{selectedVoteTargetId ? `已选择：${data.candidates.find((candidate) => candidate.id === selectedVoteTargetId)?.name ?? ''}` : '请先选择一位宾客'}</span><button type="button" disabled={busy || offline || !selectedVoteTargetId} onClick={() => void vote(selectedVoteTargetId)}>确认投票</button></div>}{data.existingVote && <p className="vote-offline-note">你的本轮投票已安全保存。</p>}{offline && <p className="vote-offline-note">恢复网络后才能提交投票。</p>}</section>}
    {isActivePlayer && data.game?.results_visible && data.results && <section className="reveal-card"><small>THE FINAL REVEAL</small><h2>身份揭晓</h2>{data.results.votedTargetName ? <div className={`vote-verdict ${data.results.voteCorrect ? 'correct' : 'missed'}`}><span>你投给了 {data.results.votedTargetName}</span><strong>{data.results.voteCorrect ? `成功找到恶作剧者 · 获得 ${data.results.bonusPoints} 分` : '恶作剧者成功隐藏了自己'}</strong></div> : <div className="vote-verdict missed"><strong>你没有提交最终投票</strong></div>}<div className="team-role-reveal">{data.results.teamMembers.map((member) => <div key={member.id}><span>{member.name}</span><strong>{member.is_hidden_spy ? '丘比特的暗线恶作剧者' : ROLE_LABELS[member.role]?.title ?? member.role}</strong></div>)}</div><a className="final-ranking-link" href="/scoreboard">查看全员最终积分排名</a><p>感谢你成为这场婚礼故事的一部分。</p></section>}
    <div className="footer-actions"><button className={`secondary refresh-button ${manualRefreshing ? 'refreshing' : ''}`} disabled={manualRefreshing} onClick={() => void refreshManually()}><span className="refresh-icon" aria-hidden="true">↻</span><span>{manualRefreshing ? '刷新中…' : '刷新状态'}</span></button><button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button></div>
    {refreshNotice && <div className="notice success manual-refresh-notice" role="status">{refreshNotice}</div>}
    {offlineReady && <div className="offline-ready" role="status">弱网备用已准备 · 刷新后仍可打开本页</div>}
    {secretReaderOpen && !hasPublicIdentity && !usesTricksterFacade && <div className="secret-reader-backdrop">
      <section className={`secret-reader-dialog ${isTrickster ? 'trickster' : ''}`} role="dialog" aria-modal="true" aria-labelledby="secret-reader-title">
        <header className="secret-reader-header"><div><small>PRIVATE VIEW</small><strong id="secret-reader-title">身份与秘密任务</strong></div><button type="button" aria-label="隐藏并关闭秘密内容" onClick={() => setSecretReaderOpen(false)}>×</button></header>
        <div className="secret-reader-content">
          <section className="secret-reader-identity"><small>你的秘密身份</small><h2>{role.title}</h2><p>{role.note}</p></section>
          <section className={`secret-reader-rule ${isTrickster ? 'critical' : ''}`}><strong>{isTrickster ? '必须隐藏身份' : '阅读时请遮挡屏幕'}</strong><p>{isTrickster ? '不要承认身份、不要展示本页、不要直接询问别人是不是同伴；请继续伪装成普通宾客，只使用规定暗号行动。' : '最终揭晓前，不要向任何人透露你的身份、阵营或任务。'}</p></section>
          <section className="secret-reader-missions"><div className="secret-reader-section-heading"><small>SECRET MISSIONS</small><strong>{usesTricksterFacade ? '真正的间谍任务' : '我的秘密任务'}</strong><span>{readerAssignments.length}</span></div>{readerAssignments.length === 0 ? <p className="secret-reader-empty">本轮任务尚未开放。</p> : readerAssignments.map((assignment, index) => <article key={assignment.id}><div><small>任务 {String(index + 1).padStart(2, '0')}</small><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></div><h3>{assignment.task.title}</h3><p>{assignment.task.description}</p><aside><strong>如何验证</strong><span>{assignment.task.verification_method}</span></aside></article>)}</section>
        </div>
        <footer className="secret-reader-footer"><button type="button" onClick={() => setSecretReaderOpen(false)}>再次点击 · 隐藏内容</button><small>切换应用或锁屏时会自动隐藏。</small></footer>
      </section>
    </div>}
    {scoreLedgerOpen && <div className="score-ledger-backdrop" role="presentation"><section className="score-ledger-dialog" role="dialog" aria-modal="true" aria-labelledby="score-ledger-title"><header><div><small>MY POINTS</small><h2 id="score-ledger-title">我的积分流水</h2></div><button type="button" aria-label="关闭积分流水" onClick={() => setScoreLedgerOpen(false)}>×</button></header><div className="score-ledger-total"><span>当前积分</span><strong>{data.guest.points}</strong></div><div className="score-ledger-list">{pointLedger.length === 0 ? <p className="empty-state">积分尚未产生，完成任务后会显示在这里。</p> : pointLedger.map((entry) => <article key={entry.id}><div><strong>{entry.label}</strong><small>{new Date(entry.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</small></div><b className={entry.amount < 0 ? 'negative' : ''}>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></article>)}</div><footer><small>这里只显示个人积分；团队环节可查看团队实时积分。</small><button type="button" onClick={() => setScoreLedgerOpen(false)}>看清楚了 · 关闭</button></footer></section></div>}
    {playerDirectoryOpen && <div className="player-directory-backdrop" role="presentation"><section className="player-directory-dialog" role="dialog" aria-modal="true" aria-labelledby="player-directory-title"><header><div><small>PLAYER DIRECTORY</small><h2 id="player-directory-title">查询玩家编号</h2></div><button type="button" aria-label="关闭玩家编号查询" onClick={() => setPlayerDirectoryOpen(false)}>×</button></header><div className="player-directory-content"><p>输入对方姓名进行查询。这里只显示姓名和编号，不会公开分组、身份或任务。</p><label htmlFor="player-directory-search">宾客姓名</label><input id="player-directory-search" value={playerDirectorySearch} onChange={(event) => setPlayerDirectorySearch(event.target.value)} placeholder="输入中文名或英文名" autoComplete="off" autoFocus/>{playerDirectoryLoading ? <div className="directory-state">正在读取婚礼宾客名单…</div> : playerDirectoryError ? <div className="directory-state error"><span>{playerDirectoryError}</span><button type="button" onClick={() => { setPlayerDirectory(null); void openPlayerDirectory(); }}>重新查询</button></div> : !playerDirectorySearch.trim() ? <div className="directory-state">请先输入姓名，编号不会整表公开显示。</div> : playerDirectoryMatches.length === 0 ? <div className="directory-state">没有找到匹配姓名，请确认对方登记时使用的姓名。</div> : <div className="player-directory-results">{playerDirectoryMatches.map((player) => <article key={player.playerCode}><div><strong>{player.name}</strong><span>{player.playerCode}</span></div><button type="button" className={directoryCopiedCode === player.playerCode ? 'copied' : ''} onClick={() => { void navigator.clipboard?.writeText(player.playerCode); setDirectoryCopiedCode(player.playerCode); window.setTimeout(() => setDirectoryCopiedCode(''), 1800); }}>{directoryCopiedCode === player.playerCode ? '已复制 ✓' : '复制编号'}</button></article>)}</div>}<aside><strong>提交次数提醒</strong><span>为避免连续猜号，每位玩家每 10 分钟最多提交 3 次编号。查询和复制不计入次数。</span></aside></div><footer><button type="button" onClick={() => setPlayerDirectoryOpen(false)}>查好了 · 返回游戏</button></footer></section></div>}
    {dinnerMenuOpen && <div className="dinner-menu-backdrop" role="presentation"><section className="dinner-menu-dialog" role="dialog" aria-modal="true" aria-labelledby="dinner-menu-title"><header><div><small>ZIMIN &amp; ANRONG</small><h2 id="dinner-menu-title">今日晚宴菜单</h2></div><button type="button" aria-label="关闭今日菜单" onClick={() => setDinnerMenuOpen(false)}>×</button></header><div className="dinner-menu-scroll"><div className="dinner-menu-card"><div className="dinner-menu-monogram" aria-hidden="true">a<sub>Z</sub></div><p className="dinner-menu-kicker">THE MENU</p><section><small>STARTER · 前菜</small><h3>Minestrone soup with basil pistou</h3><p>意式蔬菜汤配青酱</p></section><section><small>FIRST COURSE · 头盘</small><h3>Tuna Tartare</h3><p>金枪鱼塔塔</p><p>裙带菜 · 毛豆 · 萝卜 · 水芹沙拉</p><p>日式酱汁 · 中式白菜 · 芝麻籽</p></section><section><small>MAIN PLATE · 主菜</small><h3>Grilled Stockyard beef sirloin</h3><p>炭烤西冷牛排</p><p>碳烤洋葱 · 烤蘑菇</p><p>芝麻菜 · 阿根廷香草酱 · 柠檬</p></section><section><small>DESSERT · 甜点</small><h3>Vanilla mascarpone, poached pears</h3><p>香草马斯卡彭 · 慢煮梨</p><p>咖啡 · 茶与精致小点</p></section><time dateTime="2026-08-22">08 · 22 · 2026</time></div></div><footer><span>清晰文字版 · 上下滑动查看全部菜品</span><button type="button" onClick={() => setDinnerMenuOpen(false)}>看完菜单 · 返回游戏</button></footer></section></div>}
    {contentNotice && <div className={`new-content-backdrop ${contentNotice.variant === 'awakening' ? 'awakening' : ''}`}><section className={`new-content-dialog ${contentNotice.variant === 'awakening' ? `awakening ${contentNotice.awakeningKind === 'GUIDING_STAR' ? 'star' : 'heart'}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="new-content-title"><header><span>{contentNotice.variant === 'awakening' ? 'DESTINY AWAKENED' : 'NEW ACTIVITY'}</span><button type="button" aria-label="关闭新活动提示" onClick={acknowledgeContentNotice}>×</button></header>{contentNotice.variant === 'awakening' && <div className="awakening-symbol" aria-hidden="true"><span>{contentNotice.awakeningKind === 'GUIDING_STAR' ? '★' : '♥'}</span><i>✦</i><i>✧</i><i>✦</i></div>}<strong id="new-content-title">{contentNotice.title}</strong><p>{contentNotice.detail}</p><button type="button" onClick={acknowledgeContentNotice}>{contentNotice.variant === 'awakening' ? '接受我的新命运 · 查看能力' : '知道了 · 查看更新'}</button></section></div>}
  </main>;
}
