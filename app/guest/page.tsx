'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { compressTaskEvidence } from '@/lib/client-image';
import { isTaskActionOpenAtStage, isTaskWaitingForStage } from '@/lib/game-rules';
import { gameStageCopy } from '@/lib/game-stages';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const GUEST_CACHE_KEY = 'wedding-guest-session-cache-v1';

type RegistrationGuest = { id: string; name: string; loginName: string; hasPassword: boolean };
type SecretCard = { team: string; role: string; storyRole: string; hiddenRole: 'NONE' | 'CUPID_HELPER'; task: { id: string; title: string; description: string; verificationMethod: string; points: number }; drawnAt: string };
type GuestData = {
  guest: { id: string; name: string; team: string; role: string; hidden_role: 'NONE' | 'CUPID_HELPER'; is_hidden_spy: boolean; points: number; drawn_at: string | null; special_card_revealed_at: string | null; participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL'; relationship: string; story_role: string; eligible_for_mission: boolean; eligible_for_secret_role: boolean; eligible_for_personal_score: boolean; special_card_title: string; special_card_body: string; player_code: string; unlocked_role: string };
  assignments: Array<{ id: string; status: string; is_initial: boolean; completion_rank: number | null; early_bonus_points: number; reward_task_id: string | null; reward_clue_id: string | null; completion_note: string; verification_note: string; verified_at: string | null; evidence_uploaded_at: string | null; evidence_url: string | null; rejection_reason: string | null; task: { title: string; description: string; verification_method: string; points: number; category: string; stage: string; mission_code: string | null; mechanic: string; score_policy: string } }>;
  clues: Array<{ id: string; title: string; content: string }>;
  game: { registration_open: boolean; stage: string; voting_open: boolean; voting_round: number; results_visible: boolean; scoreboard_visible: boolean; phase_note: string | null; task_catalog_mode: 'demo' | 'live'; trickster_max_attempts: number; phase_one_completed_at: string | null } | null;
  candidates: Array<{ id: string; name: string; team: string }>;
  existingVote: string | null;
  results: null | {
    teamMembers: Array<{ id: string; name: string; role: string; is_hidden_spy: boolean }>;
    votedTargetId: string | null;
    votedTargetName: string | null;
    voteCorrect: boolean | null;
    bonusPoints: number;
    spyPoints: number | null;
  };
  missionStory?: {
    playerCode: string;
    unlockedRole: string;
    symbolPairing: null | { symbol: 'HEART' | 'STAR'; status: 'AVAILABLE' | 'PENDING' | 'PAIRED' | 'UNPAIRED_FINAL'; pendingRelationshipId: string | null; finalizedAt: string | null };
    relationships: Array<{ id: string; type: 'CUPID_ALLIANCE' | 'STAR_ALLIANCE' | 'TRICKSTER_CONNECTION'; status: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REVEALED'; partnerName: string; confirmedByMe: boolean; confirmedByPartner: boolean; activatedAt: string | null }>;
    tricksterAttemptsUsed: number;
    tricksterMaxAttempts: number;
    helper: null | { tricksters: Array<{ id: string; name: string; team: string }>; actions: Array<{ id: string; tricksterGuestId: string; tricksterName: string; note: string; status: string; createdAt: string }> };
    mutualConfirmations: Array<{ id: string; assignmentId: string; direction: 'INCOMING' | 'OUTGOING'; otherGuestName: string; status: 'PENDING' | 'ACTIVE' | 'REJECTED'; createdAt: string }>;
    allianceClue: null | { title: string; fragment: string };
  };
};

const STATUS_LABELS: Record<string, string> = {
  assigned: '进行中', submitted: '等待审核', approved: '已完成', rejected: '请补充验证', cancelled: '本阶段已结束',
};

const ROLE_LABELS: Record<string, { title: string; note: string }> = {
  spy: { title: '丘比特的恶作剧者', note: '第一阶段正常完成表面任务，并使用暗号悄悄寻找同伴。' },
  helper: { title: '丘比特的秘密信使', note: '暗中帮助队友，让线索自然流动。' },
  guest: { title: '婚礼守护者', note: '完成阶段任务，并留意身边的可疑行动。' },
};

const STORY_ROLE_LABELS: Record<string, { title: string; note: string }> = {
  OFFICIANT: { title: '誓词引导人', note: '在工作人员提示的环节，引导新人完成誓词。请在仪式开始前保守这个秘密。' },
  RING_KEEPER: { title: '戒指守护者', note: '在工作人员提示后领取戒指盒，并在交换戒指环节将它送到新人身边。' },
  GROOM_CHEERLEADER: { title: '新郎应援者', note: '等待主持人的合适节点，再送出为新郎准备的那句应援。' },
  BRIDE_CHEERLEADER: { title: '新娘应援者', note: '等待主持人的合适节点，再送出为新娘准备的那句应援。' },
  APPLAUSE_STARTER: { title: '掌声发起者', note: '在仪式完成的自然节点率先鼓掌，带动周围宾客。' },
  HEART_HOLDER: { title: '爱心持有者', note: '保管好你的爱心编号，悄悄寻找真正匹配的另一半。' },
  STAR_HOLDER: { title: '星星持有者', note: '悄悄寻找另一位星星玩家，和对方组成星光联盟。' },
};

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

export default function GuestPage() {
  const [data, setData] = useState<GuestData | null>(null);
  const [checking, setChecking] = useState(true);
  const [invitationCode, setInvitationCode] = useState('');
  const [guests, setGuests] = useState<RegistrationGuest[] | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(true);
  const [selectedGuest, setSelectedGuest] = useState<RegistrationGuest | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimCodeConfirm, setClaimCodeConfirm] = useState('');
  const [search, setSearch] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [revealedCard, setRevealedCard] = useState<SecretCard | null>(null);
  const [specialCardRevealed, setSpecialCardRevealed] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [secretReaderOpen, setSecretReaderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState('');
  const [contentNotice, setContentNotice] = useState<{ title: string; detail: string } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [connectionTargetCode, setConnectionTargetCode] = useState('');
  const [helperTargetId, setHelperTargetId] = useState('');
  const [helperNote, setHelperNote] = useState('');
  const [mutualTargetCodes, setMutualTargetCodes] = useState<Record<string, string>>({});
  const [expandedAssignments, setExpandedAssignments] = useState<Record<string, boolean>>({});
  const loadRequestRef = useRef(0);
  const manualRefreshRef = useRef(false);
  const refreshNoticeTimerRef = useRef<number | null>(null);
  const contentSnapshotRef = useRef<null | { stage: string; phaseNote: string; assignmentIds: string[]; clueIds: string[]; confirmationIds: string[] }>(null);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    try {
      const response = await fetch('/api/guest-me', { cache: 'no-store' });
      if (requestId !== loadRequestRef.current) return false;
      if (response.ok) {
        const nextData = await response.json();
        const nextSnapshot = {
          stage: nextData.game?.stage ?? 'registration',
          phaseNote: nextData.game?.phase_note ?? '',
          assignmentIds: nextData.assignments.map((assignment: GuestData['assignments'][number]) => assignment.id),
          clueIds: nextData.clues.map((clue: GuestData['clues'][number]) => clue.id),
          confirmationIds: (nextData.missionStory?.mutualConfirmations ?? [])
            .filter((confirmation: { direction: string; status: string }) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING')
            .map((confirmation: { id: string }) => confirmation.id),
        };
        const previousSnapshot = contentSnapshotRef.current;
        let nextNotice: { title: string; detail: string } | null = null;
        if (previousSnapshot) {
          const newAssignment = nextData.assignments.find((assignment: GuestData['assignments'][number]) => !previousSnapshot.assignmentIds.includes(assignment.id));
          const newClue = nextData.clues.find((clue: GuestData['clues'][number]) => !previousSnapshot.clueIds.includes(clue.id));
          const newConfirmation = (nextData.missionStory?.mutualConfirmations ?? []).find((confirmation: { id: string; direction: string; status: string; otherGuestName: string }) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING' && !previousSnapshot.confirmationIds.includes(confirmation.id));
          if (previousSnapshot.stage !== nextSnapshot.stage) {
            const stageCopy = gameStageCopy(nextSnapshot.stage);
            nextNotice = { title: `已进入「${stageCopy.label}」`, detail: nextSnapshot.phaseNote || stageCopy.note };
          } else if (newAssignment) nextNotice = { title: '你收到了一项新任务', detail: newAssignment.task.title };
          else if (newClue) nextNotice = { title: '一条新的秘密线索已经解锁', detail: newClue.title };
          else if (newConfirmation) nextNotice = { title: '你收到了一项好友确认请求', detail: `${newConfirmation.otherGuestName} 正在等待你的确认` };
          else if (previousSnapshot.phaseNote !== nextSnapshot.phaseNote && nextSnapshot.phaseNote) nextNotice = { title: '主办方发布了新的现场提示', detail: nextSnapshot.phaseNote };
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

  useEffect(() => {
    setOffline(!window.navigator.onLine);
    void load();
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
  }, [load]);

  useEffect(() => {
    if (!secretReaderOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSecretReaderOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [secretReaderOpen]);

  useLiveRefresh(async () => { if (!manualRefreshRef.current) await load(); }, undefined, Boolean(data));

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
    const refreshForNewVersion = () => {
      if (!active || refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    window.navigator.serviceWorker.addEventListener('controllerchange', refreshForNewVersion);
    window.navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        await registration.update();
        await window.navigator.serviceWorker.ready;
        if (active) setOfflineReady(true);
      })
      .catch(() => { if (active) setOfflineReady(false); });
    return () => {
      active = false;
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
      setGuests(body.guests); setRegistrationOpen(body.registrationOpen !== false); setSearch('');
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
        body: JSON.stringify({ invitationCode, loginName: selectedGuest.loginName, claimCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '身份认领失败');
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
      setMessage('任务已送到丘比特任务站，等待主办方确认。'); await load();
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
    if (!window.confirm('每位宾客本轮只能投一次，提交后不能修改。确认投给这位宾客吗？')) return;
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetGuestId }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '投票失败'); return; }
      setMessage('投票已提交并锁定。结果公布后会自动结算侦探积分。'); await load();
    } catch { setOffline(true); setError('当前处于离线状态，投票尚未保存，请联网后重试。'); }
    finally { setBusy(false); }
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
    setData(null); setInvitationCode(''); setGuests(null); setSelectedGuest(null); setClaimCode(''); setClaimCodeConfirm(''); setSearch(''); setShowSecrets(false); setSecretReaderOpen(false); setRevealedCard(null); setSpecialCardRevealed(false);
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
      setRevealedCard(body.card);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '抽卡失败，请重试'); }
    finally { setDrawing(false); }
  }

  async function enterMissionPage() {
    setRevealedCard(null);
    setShowSecrets(false);
    await load();
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

  async function connectPlayer(relationshipType: 'CUPID_ALLIANCE' | 'STAR_ALLIANCE' | 'TRICKSTER_CONNECTION') {
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
      setMessage(status === 'ACTIVE'
        ? relationshipType === 'CUPID_ALLIANCE' ? '双向确认成功，丘比特联盟已经成立。' : relationshipType === 'STAR_ALLIANCE' ? '双向确认成功，星光联盟已经成立。' : '暗号双向确认成功，你已经找到一位同伴。'
        : status === 'NO_MATCH' ? '暗号没有匹配。请保持自然，你还可以继续试探。'
        : '你的编号确认已提交，等待对方输入你的玩家编号。');
      await load();
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

  async function saveHelperAction() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/helper-action', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tricksterGuestId: helperTargetId, note: helperNote }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '帮助记录保存失败');
      setHelperTargetId(''); setHelperNote(''); setMessage('保护行动已秘密记录。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '帮助记录保存失败'); }
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
      setMessage('确认邀请已发送，请让对方打开自己的页面处理。');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '确认邀请发送失败'); }
    finally { setBusy(false); }
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

  if (checking) return <main className="welcome-shell"><section className="welcome-card"><div className="heart-mark">♡</div><h1>正在打开婚礼任务</h1><p>丘比特正在确认你的身份…</p></section></main>;

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
    const role = revealedCard ? STORY_ROLE_LABELS[revealedCard.storyRole] ?? (revealedCard.hiddenRole === 'CUPID_HELPER' ? { title: '丘比特的帮手', note: '你知道所有恶作剧者身份。请暗中保护他们，并在主页记录真实发生的帮助。' } : ROLE_LABELS[revealedCard.role] ?? ROLE_LABELS.guest) : null;
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
          <div className="card-task"><span>{data.game?.task_catalog_mode === 'demo' ? '演示任务 · 之后会替换' : '第一项秘密任务'} · {revealedCard?.role === 'spy' ? '完成但不计个人分' : `${revealedCard?.task.points} 分`}</span><strong>{revealedCard?.task.title}</strong><p>{revealedCard?.task.description}</p></div>
        </div>
      </div></CardScene>
      {!revealedCard && <button className="draw-button" disabled={drawing || !drawOpen} onClick={drawCard}>{drawing ? '丘比特正在洗牌…' : drawOpen ? '抽取我的秘密卡' : '抽卡入口暂未开放'}</button>}
      {!revealedCard && !drawOpen && <div className="notice">主办方目前已关闭宾客抽卡，请联系现场工作人员协助。</div>}
      {revealedCard && <button className="draw-button" onClick={enterMissionPage}>我已经看清楚 · 收起卡片</button>}
      {!revealedCard && <button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button>}
      <p className="privacy-hint"><strong>全员保密规则：</strong>请遮挡屏幕，不告诉任何人你的身份、阵营或任务。卡片不会自动消失，只有你点击上方按钮后才会隐藏。</p>
    </section></main>;
  }

  const stage = gameStageCopy(data.game?.stage);
  const isActivePlayer = data.guest.participation_mode === 'ACTIVE_PLAYER';
  const isHonorGuest = data.guest.participation_mode === 'HONOR_GUEST';
  const isTrickster = data.guest.role === 'spy' || data.guest.is_hidden_spy;
  const hasPublicIdentity = isHonorGuest || data.guest.story_role !== 'NONE' || Boolean(data.game?.results_visible);
  const identityVisible = hasPublicIdentity || showSecrets;
  const role = isHonorGuest
    ? { title: '家庭荣誉宾客', note: '参与现场互动并累积个人积分；不领取秘密任务、隐藏身份或秘密线索。' }
    : data.guest.story_role !== 'NONE' && STORY_ROLE_LABELS[data.guest.story_role]
    ? STORY_ROLE_LABELS[data.guest.story_role]
    : data.guest.hidden_role === 'CUPID_HELPER'
    ? { title: '丘比特的帮手', note: '你知道所有恶作剧者的身份。暗中保护他们，并为真实发生的帮助留下秘密记录。' }
    : data.guest.is_hidden_spy
    ? { title: '丘比特的暗线恶作剧者', note: '你的阵营已经改变。请继续伪装成普通宾客，直到最终揭晓。' }
    : ROLE_LABELS[data.guest.role] ?? ROLE_LABELS.guest;
  const rankedReward = data.game?.stage === 'task_round_1' ? undefined : data.assignments.find((assignment) => assignment.is_initial && assignment.completion_rank);
  const missionStory = data.missionStory;
  const symbolRelationshipType = missionStory?.symbolPairing?.symbol === 'STAR' ? 'STAR_ALLIANCE' : 'CUPID_ALLIANCE';
  const symbolRelationship = missionStory?.relationships.find((relationship) => relationship.type === symbolRelationshipType && relationship.status !== 'REJECTED');
  const tricksterRelationship = missionStory?.relationships.find((relationship) => relationship.type === 'TRICKSTER_CONNECTION');
  const canUseTricksterSignal = data.guest.role === 'spy' && data.game?.stage === 'task_round_1';
  return <main className="dashboard-shell">
    <section className="mission-hero">
      <div className="eyebrow">丘比特的婚礼考验</div>
      <div className="hero-line"><div><span className="team-chip">{isHonorGuest ? data.guest.special_card_title || '亲爱的家人' : data.guest.team}</span><h1>{data.guest.name}</h1></div><div className="score-orb"><strong>{data.guest.points}</strong><small>积分</small></div></div>
      <div className={`identity-strip ${identityVisible ? 'visible' : 'concealed'} ${isTrickster && identityVisible && !data.game?.results_visible ? 'trickster-identity' : ''}`}>
        <div className="identity-strip-heading">
          <small>{hasPublicIdentity ? '你的公开身份' : '你的秘密身份'}</small>
          {!hasPublicIdentity && <div className="identity-private-actions">
            <button type="button" className="identity-hold-button" aria-pressed={identityVisible} onPointerDown={(event) => { event.preventDefault(); try { event.currentTarget.setPointerCapture(event.pointerId); } catch {} setShowSecrets(true); }} onPointerUp={() => setShowSecrets(false)} onPointerCancel={() => setShowSecrets(false)} onLostPointerCapture={() => setShowSecrets(false)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowSecrets(true); } }} onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShowSecrets(false); } }} onBlur={() => setShowSecrets(false)} onContextMenu={(event) => event.preventDefault()}>{identityVisible ? '松开隐藏' : '按住查看'}</button>
            <button type="button" className="identity-reader-button" onClick={() => { setShowSecrets(false); setSecretReaderOpen(true); }}>展开阅读</button>
          </div>}
        </div>
        {identityVisible ? <><strong>{role.title}</strong><p>{role.note}</p></> : <><strong className="identity-mask" aria-hidden="true">••••••</strong><p>短按住可快速查看；内容较长时请点“展开阅读”，可安全滚动。</p></>}
      </div>
      {isActivePlayer && !data.game?.results_visible && <div className="identity-game-rule"><strong>所有宾客共同规则</strong><span>最终揭晓前，不主动告诉别人你的身份、阵营或任务，也不要要求别人展示手机。</span></div>}
      <div className="stage-card"><small>当前婚礼环节</small><strong>{stage.label}</strong><p className="stage-default-prompt">{stage.note}</p>{data.game?.phase_note && <div className="stage-live-note"><b>主办方最新提示</b><span>{data.game.phase_note}</span></div>}</div>
    </section>
    {offline && <div className="connection-banner offline" role="status">离线只读模式 · 已显示最近同步的任务，提交和投票暂不可用</div>}
    {message && <div className="notice success" aria-live="polite">{message}</div>}{error && <div className="notice error" aria-live="polite">{error}</div>}
    {isTrickster && !data.game?.results_visible && identityVisible && <section className="reward-banner trickster-warning"><small>必须保密 · DO NOT REVEAL</small><strong>你是丘比特的恶作剧者</strong><p>隐藏身份是这项角色的核心规则。不要承认身份、不要展示本页、不要直接询问别人是不是同伴；请继续伪装成普通宾客，只使用规定暗号行动。</p></section>}
    {rankedReward && <section className="reward-banner"><small>EARLY COMPLETION HONOR</small><strong>你是第 {rankedReward.completion_rank} 位完成首轮任务的宾客</strong><p>{rankedReward.reward_task_id && rankedReward.reward_clue_id ? `升级任务、${rankedReward.early_bonus_points ? '额外 1 分和' : ''}一条秘密线索已经发放。` : rankedReward.reward_task_id ? '升级任务已经发放，将在第二轮开放。' : '你的首轮任务已经记录。'}</p></section>}
    {isHonorGuest && <section className="section-card honor-participation-card"><div className="section-heading"><div><small>FAMILY PARTICIPATION</small><h2>家人参与区</h2></div><span>♡</span></div><p>你可以和大家一起参加现场互动，获得的个人积分会显示在上方并进入个人积分榜。</p><div className="honor-boundary-note"><strong>轻松参与</strong><span>系统不会向你发放秘密任务、隐藏阵营或秘密线索。</span></div></section>}
    {isActivePlayer && missionStory?.symbolPairing && <section className="section-card story-connection-card"><div className="section-heading"><div><small>{missionStory.symbolPairing.symbol} MATCH</small><h2>{missionStory.symbolPairing.symbol === 'HEART' ? '爱心配对' : '星星配对'}</h2></div><span>{missionStory.symbolPairing.symbol === 'HEART' ? '♡' : '☆'}</span></div><div className="player-code-card"><small>我的玩家编号</small><strong>{missionStory.playerCode}</strong><button type="button" className="mini-button" onClick={() => void navigator.clipboard?.writeText(missionStory.playerCode)}>复制编号</button></div><p className="muted">所有同图案玩家开局完全平等。你可以与任意一名尚未配对的同图案玩家组成联盟。</p>{missionStory.symbolPairing.status === 'UNPAIRED_FINAL' ? <div className="story-unlock lonely"><strong>{missionStory.symbolPairing.symbol === 'HEART' ? '孤单丘比特' : '领航星'}</strong><p>{missionStory.symbolPairing.symbol === 'HEART' ? '你就是帮助别人相遇的丘比特。任务已完成，并获得与成功配对者相同的积分。' : '你不属于某一个固定组合，而是为所有人指引方向。任务已完成。'}</p></div> : symbolRelationship?.status === 'ACTIVE' ? <div className="story-unlock"><strong>{missionStory.symbolPairing.symbol === 'HEART' ? '丘比特联盟' : '星光联盟'}已成立</strong><p>你与 {symbolRelationship.partnerName} 已完成双向确认。</p></div> : <div className="connection-form"><label htmlFor="symbol-partner-code">对方的玩家编号</label><div><input id="symbol-partner-code" value={connectionTargetCode} onChange={(event) => setConnectionTargetCode(event.target.value.toUpperCase())} maxLength={7} placeholder="例如 P012"/><button disabled={busy || offline || data.game?.stage !== 'task_round_1' || !/^P[0-9]{3,6}$/.test(connectionTargetCode)} onClick={() => void connectPlayer(symbolRelationshipType)}>{missionStory.symbolPairing.symbol === 'HEART' ? '邀请爱心伙伴' : '邀请星星伙伴'}</button></div>{symbolRelationship?.status === 'PENDING' && <div className="pending-connection"><p>{symbolRelationship.confirmedByMe ? `已提交，等待 ${symbolRelationship.partnerName} 输入你的编号。` : `${symbolRelationship.partnerName} 邀请你配对；输入对方编号即可接受。`}</p><button type="button" className="text-button" disabled={busy || offline} onClick={() => void rejectConnection(symbolRelationship.id)}>拒绝这项邀请</button></div>}</div>}</section>}
    {isActivePlayer && canUseTricksterSignal && missionStory && <section className="section-card story-connection-card trickster"><div className="section-heading"><div><small>CUPID'S CALL</small><h2>丘比特的召集令</h2></div><span>{missionStory.tricksterAttemptsUsed}/{missionStory.tricksterMaxAttempts}</span></div><div className="player-code-card dark"><small>我的玩家编号</small><strong>{missionStory.playerCode}</strong><button type="button" className="mini-button" onClick={() => void navigator.clipboard?.writeText(missionStory.playerCode)}>复制编号</button></div><div className="signal-script"><small>暗号问句</small><strong>你觉得丘比特今天心情怎么样？</strong><small>正确回答</small><strong>他好像想开个玩笑。</strong></div>{tricksterRelationship?.status === 'ACTIVE' ? <div className="story-unlock"><strong>已找到同伴</strong><p>你和 {tricksterRelationship.partnerName} 已完成双向确认。继续隐藏身份。</p></div> : <div className="connection-form"><label htmlFor="trickster-partner-code">暗号匹配后，输入对方玩家编号</label><div><input id="trickster-partner-code" value={connectionTargetCode} onChange={(event) => setConnectionTargetCode(event.target.value.toUpperCase())} maxLength={7} placeholder="例如 P012"/><button disabled={busy || offline || missionStory.tricksterAttemptsUsed >= missionStory.tricksterMaxAttempts || !/^P[0-9]{3,6}$/.test(connectionTargetCode)} onClick={() => void connectPlayer('TRICKSTER_CONNECTION')}>秘密确认</button></div>{tricksterRelationship?.status === 'PENDING' && <p>{tricksterRelationship.confirmedByMe ? `已提交，等待 ${tricksterRelationship.partnerName} 输入你的编号。` : `${tricksterRelationship.partnerName} 已通过暗号找到你，请输入对方编号。`}</p>}<p>本阶段最多试探 {missionStory.tricksterMaxAttempts} 位宾客。不要连续询问，也不要直接暴露身份。</p></div>}</section>}
    {isActivePlayer && data.guest.hidden_role === 'CUPID_HELPER' && missionStory?.helper && <section className="section-card helper-secret-card"><div className="section-heading"><div><small>CUPID'S HELPER</small><h2>秘密保护记录</h2></div><span>{missionStory.helper.actions.length}</span></div><p className="muted">下列名单只对你可见。只有真实发生且被确认的帮助，才会进入最终计分。</p><div className="helper-spy-list">{missionStory.helper.tricksters.map((trickster) => <div key={trickster.id}><strong>{trickster.name}</strong><span>{trickster.team}</span></div>)}</div><div className="submission-form"><label htmlFor="helper-target">这次帮助了谁</label><select id="helper-target" value={helperTargetId} onChange={(event) => setHelperTargetId(event.target.value)}><option value="">请选择恶作剧者</option>{missionStory.helper.tricksters.map((trickster) => <option key={trickster.id} value={trickster.id}>{trickster.name}</option>)}</select><label htmlFor="helper-note">发生了什么</label><textarea id="helper-note" value={helperNote} onChange={(event) => setHelperNote(event.target.value)} maxLength={500} placeholder="简短记录你如何帮助对方隐藏身份"/><button disabled={busy || offline || !helperTargetId || !helperNote.trim()} onClick={() => void saveHelperAction()}>秘密保存帮助记录</button></div>{missionStory.helper.actions.map((action) => <div className="submission-note" key={action.id}><strong>{action.tricksterName}</strong><span>{action.note}</span></div>)}</section>}
    {isActivePlayer && missionStory?.mutualConfirmations.some((confirmation) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING') && <section className="section-card mutual-confirmation-card"><div className="section-heading"><div><small>FRIEND CONFIRMATION</small><h2>好友确认请求</h2></div><span>待处理</span></div>{missionStory.mutualConfirmations.filter((confirmation) => confirmation.direction === 'INCOMING' && confirmation.status === 'PENDING').map((confirmation) => <div className="approval-row" key={confirmation.id}><div className="approval-copy"><strong>{confirmation.otherGuestName}</strong><p>对方表示你们今天第一次见面，并已完成互相介绍。请按真实情况确认。</p></div><div className="approval-actions"><button disabled={busy || offline} onClick={() => void respondMutualConfirmation(confirmation.id, true)}>确实完成</button><button className="danger" disabled={busy || offline} onClick={() => void respondMutualConfirmation(confirmation.id, false)}>不符合</button></div></div>)}</section>}
    {isActivePlayer && data.assignments.some((assignment) => assignment.task.mission_code === 'P1-SOCIAL-001' && ['assigned','rejected'].includes(assignment.status)) && <section className="section-card mutual-confirmation-card"><div className="section-heading"><div><small>MUTUAL PROOF</small><h2>请新朋友确认</h2></div><span>无需照片</span></div><p className="muted">如果不方便合影，可以输入对方的玩家编号。对方确认后，任务会自动完成；同一位宾客最多帮助两人验证。</p>{data.assignments.filter((assignment) => assignment.task.mission_code === 'P1-SOCIAL-001' && ['assigned','rejected'].includes(assignment.status)).map((assignment) => { const outgoing = missionStory?.mutualConfirmations.find((confirmation) => confirmation.assignmentId === assignment.id && confirmation.direction === 'OUTGOING' && confirmation.status === 'PENDING'); return <div className="connection-form" key={assignment.id}>{outgoing ? <p>已邀请 {outgoing.otherGuestName}，等待对方确认。</p> : <><label htmlFor={`mutual-code-${assignment.id}`}>新朋友的玩家编号</label><div><input id={`mutual-code-${assignment.id}`} value={mutualTargetCodes[assignment.id] ?? ''} onChange={(event) => setMutualTargetCodes((current) => ({ ...current, [assignment.id]: event.target.value.toUpperCase() }))} maxLength={7} placeholder="例如 P012"/><button disabled={busy || offline || !/^P[0-9]{3,6}$/.test(mutualTargetCodes[assignment.id] ?? '')} onClick={() => void requestMutualConfirmation(assignment.id)}>发送确认邀请</button></div></>}</div>; })}</section>}
    {isActivePlayer && <section className="section-card"><div className="section-heading"><div><small>SECRET MISSIONS</small><h2>我的秘密任务</h2></div><span>{data.assignments.length}</span></div>
      {data.game?.task_catalog_mode === 'demo' && <div className="demo-task-note"><strong>当前是演示任务</strong><p>用于测试领取、提交和审核流程，不代表婚礼当天的最终任务设计。</p></div>}
      {data.assignments.length === 0 ? <div className="empty-state">抽卡后，你领取的第一项任务会立即显示在这里。</div> : data.assignments.map((assignment, index) => <details className="mission-item" key={assignment.id} open={expandedAssignments[assignment.id] ?? false} onToggle={(event) => { const open = event.currentTarget.open; setExpandedAssignments((current) => current[assignment.id] === open ? current : { ...current, [assignment.id]: open }); }}><summary className="mission-summary"><span className="mission-number">{String(index + 1).padStart(2, '0')}</span><span className="mission-summary-copy"><span className="mission-meta"><span>{assignment.task.score_policy === 'NO_PERSONAL' || (assignment.is_initial && data.guest.role === 'spy') ? '完成记录 · 不计个人分' : `${assignment.task.points} 分`}</span><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></span><strong>{assignment.task.title}</strong></span><span className="mission-chevron" aria-hidden="true">⌄</span></summary><div className="mission-body"><p>{assignment.task.description}</p>{!isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && <div className="task-feedback">{isTaskWaitingForStage(assignment.task.stage, data.game?.stage) ? '任务已领取。请先记住内容，等待主持人宣布本轮开始后再执行并提交。' : '本环节已停止提交；如需补录，请到任务站联系工作人员。'}</div>}<div className="verification-note"><strong>如何验证</strong><span>{assignment.task.verification_method}</span></div>{assignment.evidence_url && <figure className="evidence-preview"><a href={assignment.evidence_url} target="_blank" rel="noreferrer"><img src={assignment.evidence_url} alt={`${assignment.task.title}的验证照片`} loading="lazy"/></a><figcaption>验证照片 · 仅你和工作人员可见</figcaption></figure>}{isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && assignment.task.mechanic === 'STANDARD' && <div className="evidence-controls"><label htmlFor={`evidence-${assignment.id}`}>{assignment.evidence_url ? '更换验证照片' : '添加验证照片（选填）'}</label><input id={`evidence-${assignment.id}`} type="file" accept="image/*" disabled={offline || evidenceBusyId === assignment.id} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadEvidence(assignment.id, file); }}/>{assignment.evidence_url && <button type="button" className="text-button" disabled={offline || evidenceBusyId === assignment.id} onClick={() => { if (window.confirm('删除这张验证照片？')) void removeEvidence(assignment.id); }}>删除照片</button>}{evidenceBusyId === assignment.id && <small>正在压缩并安全上传…</small>}</div>}{assignment.completion_note && <div className="submission-note"><strong>我的完成说明</strong><span>{assignment.completion_note}</span></div>}{assignment.status === 'approved' && assignment.verification_note && <div className="submission-note approved"><strong>任务站核验记录</strong><span>{assignment.verification_note}</span></div>}{assignment.status === 'rejected' && <div className="task-feedback">任务站留言：{assignment.rejection_reason || '请补充验证后再次提交。'}</div>}{isTaskActionOpenAtStage(assignment.task.stage, data.game?.stage) && (assignment.status === 'assigned' || assignment.status === 'rejected') && !['HEART_MATCH','STAR_MATCH','TRICKSTER_SIGNAL','INSTANT_BONUS'].includes(assignment.task.mechanic) && <div className="submission-form"><label htmlFor={`completion-note-${assignment.id}`}>完成说明（选填）</label><textarea id={`completion-note-${assignment.id}`} value={completionNotes[assignment.id] ?? assignment.completion_note ?? ''} onChange={(event) => setCompletionNotes({ ...completionNotes, [assignment.id]: event.target.value })} maxLength={500} placeholder="例如：已完成合影，照片会在任务站出示。"/><button disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => submit(assignment.id, completionNotes[assignment.id] ?? assignment.completion_note ?? '')}>{offline ? '联网后可提交' : assignment.status === 'rejected' ? '补充完成 · 再次提交' : '我已完成 · 提交验证'}</button></div>}</div></details>)}
    </section>}
    {isActivePlayer && <section className="section-card"><div className="section-heading"><div><small>SPY CLUES</small><h2>已解锁线索</h2></div><span>{data.clues.length}</span></div>{data.clues.length === 0 ? <div className="empty-state">完成任务后，线索会在这里出现。</div> : data.clues.map((clue) => <div className="clue" key={clue.id}><strong>{clue.title}</strong><p>{clue.content}</p></div>)}</section>}
    {isActivePlayer && data.game?.voting_open && <section className="section-card"><div className="section-heading"><div><small>FINAL VOTE</small><h2>谁是恶作剧者？</h2></div><span>第 {data.game.voting_round} 轮</span></div><p className="muted">只能选择本队宾客。每人只有一次机会，确认后不能改票。</p><div className="vote-grid">{data.candidates.filter((candidate) => candidate.id !== data.guest.id).map((candidate) => <button disabled={busy || offline || Boolean(data.existingVote)} className={data.existingVote === candidate.id ? 'vote-choice selected' : 'vote-choice'} key={candidate.id} onClick={() => vote(candidate.id)}>{data.existingVote === candidate.id ? '✓ ' : ''}{candidate.name}</button>)}</div>{data.existingVote && <p className="vote-offline-note">你的本轮投票已安全保存。</p>}{offline && <p className="vote-offline-note">恢复网络后才能提交投票。</p>}</section>}
    {isActivePlayer && data.game?.results_visible && data.results && <section className="reveal-card"><small>THE FINAL REVEAL</small><h2>身份揭晓</h2>{data.results.votedTargetName ? <div className={`vote-verdict ${data.results.voteCorrect ? 'correct' : 'missed'}`}><span>你投给了 {data.results.votedTargetName}</span><strong>{data.results.voteCorrect ? `成功找到恶作剧者 · 获得 ${data.results.bonusPoints} 分` : '恶作剧者成功隐藏了自己'}</strong></div> : <div className="vote-verdict missed"><strong>你没有提交最终投票</strong></div>}{typeof data.results.spyPoints === 'number' && <div className="spy-score-result"><span>你的恶作剧积分</span><strong>{data.results.spyPoints} 分</strong><small>此积分独立计算，不影响公开团队排名。</small></div>}<div className="team-role-reveal">{data.results.teamMembers.map((member) => <div key={member.id}><span>{member.name}</span><strong>{member.is_hidden_spy ? '丘比特的暗线恶作剧者' : ROLE_LABELS[member.role]?.title ?? member.role}</strong></div>)}</div><p>感谢你成为这场婚礼故事的一部分。</p></section>}
    <div className="footer-actions"><button className={`secondary refresh-button ${manualRefreshing ? 'refreshing' : ''}`} disabled={manualRefreshing} onClick={() => void refreshManually()}><span className="refresh-icon" aria-hidden="true">↻</span><span>{manualRefreshing ? '刷新中…' : '刷新状态'}</span></button><button className="text-button" disabled={busy} onClick={logout}>{busy ? '安全退出中…' : '退出此身份'}</button></div>
    {refreshNotice && <div className="notice success manual-refresh-notice" role="status">{refreshNotice}</div>}
    {offlineReady && <div className="offline-ready" role="status">弱网备用已准备 · 刷新后仍可打开本页</div>}
    {secretReaderOpen && !hasPublicIdentity && <div className="secret-reader-backdrop">
      <section className={`secret-reader-dialog ${isTrickster ? 'trickster' : ''}`} role="dialog" aria-modal="true" aria-labelledby="secret-reader-title">
        <header className="secret-reader-header"><div><small>PRIVATE VIEW</small><strong id="secret-reader-title">身份与秘密任务</strong></div><button type="button" aria-label="隐藏并关闭秘密内容" onClick={() => setSecretReaderOpen(false)}>×</button></header>
        <div className="secret-reader-content">
          <section className="secret-reader-identity"><small>你的秘密身份</small><h2>{role.title}</h2><p>{role.note}</p></section>
          <section className={`secret-reader-rule ${isTrickster ? 'critical' : ''}`}><strong>{isTrickster ? '必须隐藏身份' : '阅读时请遮挡屏幕'}</strong><p>{isTrickster ? '不要承认身份、不要展示本页、不要直接询问别人是不是同伴；请继续伪装成普通宾客，只使用规定暗号行动。' : '最终揭晓前，不要向任何人透露你的身份、阵营或任务。'}</p></section>
          <section className="secret-reader-missions"><div className="secret-reader-section-heading"><small>SECRET MISSIONS</small><strong>我的秘密任务</strong><span>{data.assignments.length}</span></div>{data.assignments.length === 0 ? <p className="secret-reader-empty">本轮任务尚未开放。</p> : data.assignments.map((assignment, index) => <article key={assignment.id}><div><small>任务 {String(index + 1).padStart(2, '0')}</small><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></div><h3>{assignment.task.title}</h3><p>{assignment.task.description}</p><aside><strong>如何验证</strong><span>{assignment.task.verification_method}</span></aside></article>)}</section>
        </div>
        <footer className="secret-reader-footer"><button type="button" onClick={() => setSecretReaderOpen(false)}>隐藏并关闭</button><small>切换应用或锁屏时会自动隐藏。</small></footer>
      </section>
    </div>}
    {contentNotice && <div className="new-content-backdrop"><section className="new-content-dialog" role="dialog" aria-modal="true" aria-labelledby="new-content-title"><header><span>NEW ACTIVITY</span><button type="button" aria-label="关闭新活动提示" onClick={() => setContentNotice(null)}>×</button></header><strong id="new-content-title">{contentNotice.title}</strong><p>{contentNotice.detail}</p><button type="button" onClick={() => setContentNotice(null)}>知道了 · 查看更新</button></section></div>}
  </main>;
}
