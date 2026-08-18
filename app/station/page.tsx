'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { compressTaskEvidence } from '@/lib/client-image';
import { gameStageCopy } from '@/lib/game-stages';
import { createEventKey } from '@/lib/event-key';
import { StaffLogoutButton } from '../staff-logout-button';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { WeddingSignature } from '../wedding-signature';
import { isTaskActionOpenAtStage } from '@/lib/game-rules';

const STATUS_LABELS: Record<string, string> = { assigned: '进行中', submitted: '待核验', approved: '已完成', rejected: '已退回' };
const CATEGORY_LABELS: Record<string, string> = { standard: '普通', ceremony: '仪式', group: '团队', upgrade: '升级', hidden: '隐藏' };
const LEGACY_STATION_CACHE_KEYS = ['wedding-station-private-cache-v1'];

type Guest = { id: string; name: string; login_name: string; team: string; points: number; claimed_at: string | null; drawn_at: string | null; eligible_for_personal_score: boolean; phase_two_eligible: boolean; participation_mode: string };
type Task = { id: string; title: string; description: string; verification_method: string; verification_type: string; points: number; category: string; stage: string; mission_code: string | null; is_demo: boolean };
type Assignment = { id: string; guest_id: string; status: string; is_initial: boolean; completion_rank: number | null; early_bonus_points: number; completion_note: string; verification_note: string; verified_at: string | null; evidence_uploaded_at: string | null; evidence_url: string | null; submitted_at: string | null; approved_at: string | null; rejected_at: string | null; rejection_reason: string | null; task?: Task };
type StationData = { guests: Guest[]; assignments: Assignment[]; tasks: Task[]; manualTaskIdsByGuest: Record<string, string[]>; manualTaskReasonsByGuest: Record<string, string>; clues: Array<{ id: string; title: string; content: string; group_name: string; team_scope: string | null }>; game: { stage: string; team_clues_settled_at: string | null; results_visible: boolean; results_published_at: string | null; rehearsal_run_id: string; task_catalog_mode: 'demo' | 'live' } | null; finalLocked: boolean };

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }

export default function StationPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<StationData | null>(null);
  const [query, setQuery] = useState('');
  const [guestFilter, setGuestFilter] = useState<'pending' | 'all'>('pending');
  const [guestId, setGuestId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [clueId, setClueId] = useState('');
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('现场特别表现或临时奖励');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const loadRequestRef = useRef(0);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const pendingScoreRef = useRef<{ signature: string; eventKey: string } | null>(null);

  async function load(interactive = false) {
    const requestId = ++loadRequestRef.current;
    if (interactive) setSyncing(true);
    try {
      const response = await fetch('/api/station-data', { cache: 'no-store' });
      if (requestId !== loadRequestRef.current) return;
      if (response.status === 401) { try { LEGACY_STATION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key)); } catch {} setData(null); setOffline(false); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '任务站数据加载失败');
      setData(body);
      setOffline(false); setError('');
      const firstPendingGuestId = body.assignments?.find((assignment: Assignment) => ['submitted', 'rejected'].includes(assignment.status))?.guest_id;
      setGuestId((current) => body.guests?.some((guest: Guest) => guest.id === current) ? current : firstPendingGuestId || body.guests?.[0]?.id || '');
      setClueId((current) => body.clues?.some((clue: { id: string }) => clue.id === current) ? current : body.clues?.[0]?.id || '');
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setOffline(true); setError(cause instanceof Error ? cause.message : '任务站数据加载失败');
      // Keep the latest successful response in memory for this open tab only. Persisting
      // assignments would let a cleared rehearsal reappear after a refresh while offline.
    } finally { if (interactive) setSyncing(false); }
  }

  useEffect(() => {
    try { LEGACY_STATION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key)); } catch {}
    void load();
  }, []);
  useLiveRefresh(load, undefined, Boolean(data));

  useEffect(() => {
    if (!data) return;
    const allowedTaskIds = data.manualTaskIdsByGuest?.[guestId] ?? [];
    setTaskId((current) => allowedTaskIds.includes(current) ? current : allowedTaskIds[0] || '');
  }, [data, guestId]);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '登录失败');
      setPassword('');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败'); }
    finally { setBusy(false); }
  }

  async function action(body: Record<string, unknown>, success: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，只能查看最近同步的任务站数据'); return false; }
    setBusy(true); setError(''); setMessage('');
    let responseReceived = false;
    try {
      const response = await fetch('/api/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      responseReceived = true;
      const result = await responseBody(response);
      if (response.status === 401) { try { LEGACY_STATION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key)); } catch {} setData(null); }
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success); await load(); return true;
    } catch (cause) { if (!responseReceived) setOffline(true); setError(cause instanceof Error ? cause.message : '操作失败'); return false; }
    finally { setBusy(false); }
  }

  async function approveAtStation(assignment: Assignment) {
    const verificationNote = (reviewNotes[assignment.id]?.trim()
      || `已按任务要求核验：${assignment.task?.verification_method || '工作人员现场确认'}`).slice(0, 500);
    const approved = await action(
      { type: 'completeAtStation', assignmentId: assignment.id, verificationNote },
      '任务已核验通过，积分已按任务规则结算',
    );
    if (approved) setReviewNotes((current) => {
      const next = { ...current };
      delete next[assignment.id];
      return next;
    });
  }

  async function rejectAtStation(assignment: Assignment) {
    const reason = reviewNotes[assignment.id]?.trim();
    if (!reason) {
      setError('退回任务前，请先填写退回原因。');
      return;
    }
    const rejected = await action(
      { type: 'reject', assignmentId: assignment.id, reason },
      '任务已退回',
    );
    if (rejected) setReviewNotes((current) => {
      const next = { ...current };
      delete next[assignment.id];
      return next;
    });
  }

  async function uploadEvidence(assignmentId: string, file: File) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，验证照片尚未上传'); return; }
    setMessage(''); setError(''); setEvidenceBusyId(assignmentId);
    try {
      const image = await compressTaskEvidence(file);
      const authorization = await fetch('/api/station-evidence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      const uploadInfo = await responseBody(authorization);
      if (authorization.status === 401) { try { LEGACY_STATION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key)); } catch {} setData(null); }
      if (!authorization.ok) throw new Error(uploadInfo.error || '无法准备照片上传');
      const upload = await fetch(uploadInfo.signedUrl, {
        method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: image,
      });
      if (!upload.ok) throw new Error('照片上传失败，请检查网络后重试');
      const confirmation = await fetch('/api/station-evidence', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, path: uploadInfo.path, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      const confirmationBody = await responseBody(confirmation);
      if (confirmation.status === 401) { try { LEGACY_STATION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key)); } catch {} setData(null); }
      if (!confirmation.ok) throw new Error(confirmationBody.error || '照片确认失败，请重试');
      setMessage('工作人员验证照片已安全保存。');
      await load();
    } catch (cause) {
      setOffline(!navigator.onLine);
      setError(cause instanceof Error ? cause.message : '照片上传失败');
    } finally { setEvidenceBusyId(null); }
  }

  async function removeEvidence(assignmentId: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，不能删除验证照片'); return; }
    setMessage(''); setError(''); setEvidenceBusyId(assignmentId);
    try {
      const response = await fetch('/api/station-evidence', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      const body = await responseBody(response);
      if (response.status === 401) { try { LEGACY_STATION_CACHE_KEYS.forEach((key) => window.sessionStorage.removeItem(key)); } catch {} setData(null); }
      if (!response.ok) throw new Error(body.error || '删除照片失败');
      setMessage('验证照片已删除。');
      await load();
    } catch (cause) {
      setOffline(!navigator.onLine);
      setError(cause instanceof Error ? cause.message : '删除照片失败');
    } finally { setEvidenceBusyId(null); }
  }

  const filteredGuests = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!data) return [];
    const pendingGuestIds = new Set(data.assignments.filter((assignment) => ['submitted', 'rejected'].includes(assignment.status)).map((assignment) => assignment.guest_id));
    return data.guests
      .filter((guest) => guestFilter === 'all' || pendingGuestIds.has(guest.id))
      .filter((guest) => !needle || `${guest.name} ${guest.login_name} ${guest.team}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => Number(pendingGuestIds.has(b.id)) - Number(pendingGuestIds.has(a.id)) || a.name.localeCompare(b.name, 'zh-CN'));
  }, [data, guestFilter, query]);
  const guest = data?.guests.find((item) => item.id === guestId) || null;
  const assignments = data?.assignments.filter((item) => item.guest_id === guestId) || [];
  const manualTaskIdSet = new Set(data?.manualTaskIdsByGuest?.[guestId] ?? []);
  const specialTasks = data?.tasks.filter((task) => manualTaskIdSet.has(task.id)) || [];
  const manualTaskUnavailableReason = data?.manualTaskReasonsByGuest?.[guestId]
    || '当前没有适合这位宾客的演示任务。';
  const availableClues = (data?.clues ?? []).filter((clue) => clue.team_scope === guest?.team);
  const clueGroups = Array.from(new Set(availableClues.map((clue) => clue.group_name || '未命名分组')));
  const pendingGuestCount = new Set((data?.assignments ?? []).filter((assignment) => ['submitted', 'rejected'].includes(assignment.status)).map((assignment) => assignment.guest_id)).size;
  const finalResultsLocked = Boolean(data?.finalLocked);

  function selectGuest(nextGuestId: string) {
    setGuestId(nextGuestId);
    setTaskId(data?.manualTaskIdsByGuest?.[nextGuestId]?.[0] || '');
    setPointAmount('');
    setPointReason('现场特别表现或临时奖励');
    setClueId('');
    pendingScoreRef.current = null;
    if (window.matchMedia('(max-width: 800px)').matches) {
      window.requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">CUPID STATION</div><WeddingSignature compact/><div className="heart-mark">♡</div><h1>丘比特<br/>任务站</h1><p className="lead">核验任务、补发团队线索和调整个人积分。</p><div className="staff-privacy-note">面向工作人员 · 核验时请避免让宾客看到他人的任务</div><form onSubmit={login}><label htmlFor="station-password">管理员密码</label><input id="station-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入任务站'}</button>{error && <div className="notice error" role="alert">{error}</div>}</form></section></main>;

  return <main className="station-shell">
    <header className="station-hero"><div><div className="eyebrow">REDEMPTION DESK</div><h1>丘比特任务站</h1><p>当前流程：{data.game ? gameStageCopy(data.game.stage).label : '尚未读取'} · 本页面不显示任何隐藏身份</p></div><div className="host-links"><a href="/admin">主办方后台</a><a href="/host">主持人流程台</a><StaffLogoutButton clearSessionStorageKeys={LEGACY_STATION_CACHE_KEYS}/></div></header>
    {offline && <div className="connection-banner offline" role="status"><span>离线只读 · 可查看最近同步的宾客与任务文字，验证照片可能需要联网；所有记录操作已禁用</span><button className="mini-button" disabled={syncing} onClick={() => void load(true)}>{syncing ? '重连中…' : '重新连接'}</button></div>}
    {message && <div className="notice success sticky-notice"><span>{message}</span><button type="button" aria-label="关闭成功提示" onClick={() => setMessage('')}>×</button></div>}{error && <div className="notice error sticky-notice"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}
    <div className="station-layout">
      <aside className="station-guests section-card"><div className="station-guest-heading"><div><small>选择宾客</small><strong>{guestFilter === 'pending' ? `${pendingGuestCount} 人待处理` : `${data.guests.length} 位宾客`}</strong></div><div className="station-filter-tabs"><button type="button" className={guestFilter === 'pending' ? 'active' : ''} aria-pressed={guestFilter === 'pending'} onClick={() => setGuestFilter('pending')}>待处理</button><button type="button" className={guestFilter === 'all' ? 'active' : ''} aria-pressed={guestFilter === 'all'} onClick={() => setGuestFilter('all')}>全部</button></div></div><label htmlFor="station-search">搜索宾客</label><input id="station-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、拼音或组别"/><div className="station-guest-list">{filteredGuests.map((item) => <button type="button" key={item.id} className={item.id === guestId ? 'selected' : ''} onClick={() => selectGuest(item.id)}><span>{item.name.slice(0, 1)}</span><p><strong>{item.name}</strong><small>{item.team} · {item.points} 分</small></p><b>{item.drawn_at ? '已抽卡' : item.claimed_at ? '待抽卡' : '未认领'}</b></button>)}</div>{filteredGuests.length === 0 && <div className="empty-state">{guestFilter === 'pending' ? '当前没有待处理任务。可切换到“全部”查找宾客。' : '没有找到宾客。'}</div>}</aside>
      <section className="station-workspace" ref={workspaceRef}>
        {!guest ? <article className="section-card empty-state">请选择一位宾客。</article> : <>
          <article className="station-profile section-card"><div><small>SELECTED GUEST</small><h2>{guest.name}</h2><p>{guest.login_name} · {guest.team}</p></div><strong>{guest.points}<small>个人积分</small></strong></article>
          <article className="section-card">
            <div className="section-heading"><div><small>VERIFY MISSIONS</small><h2>任务核验</h2></div><span>{assignments.filter((item) => item.status === 'approved').length}/{assignments.length}</span></div>
            {assignments.length === 0 ? <div className="empty-state">这位宾客还没有任务。</div> : <div className="station-assignment-list">{assignments.map((assignment) => { const actionOpen = isTaskActionOpenAtStage(assignment.task?.stage, data.game?.stage); const stationCompletable = ['HOST_CONFIRM', 'STAFF_CONFIRM', 'PHOTO', 'MUTUAL_CONFIRM'].includes(assignment.task?.verification_type || ''); const acceptsStaffPhoto = assignment.task?.verification_type === 'PHOTO'; return <article key={assignment.id} className={`status-${assignment.status}`}>
              <div>
                <small>{CATEGORY_LABELS[assignment.task?.category || ''] || assignment.task?.category} · {assignment.task?.points} 分 {assignment.completion_rank ? `· 第 ${assignment.completion_rank} 名完成${assignment.early_bonus_points ? ' · 额外 +1' : ''}` : ''}</small>
                <h3>{assignment.task?.title}</h3><p>{assignment.task?.description}</p>
                <div className="verification-note"><strong>核验要求</strong><span>{assignment.task?.verification_method}</span></div>
                {assignment.completion_note && <div className="submission-note"><strong>宾客完成说明</strong><span>{assignment.completion_note}</span></div>}
                {assignment.evidence_url && <figure className="evidence-preview compact"><a href={assignment.evidence_url} target="_blank" rel="noreferrer"><img src={assignment.evidence_url} alt={`${assignment.task?.title || '任务'}的验证照片`} loading="lazy"/></a><figcaption>点击查看验证照片</figcaption></figure>}
                {assignment.evidence_uploaded_at && !assignment.evidence_url && <div className="inline-feedback error" role="status"><span>验证照片暂时无法打开，请刷新后重试，或当面核验后再处理。</span></div>}
                {!finalResultsLocked && actionOpen && acceptsStaffPhoto && ['assigned','submitted','rejected'].includes(assignment.status) && <div className="evidence-controls station-evidence-controls">
                  <label htmlFor={`station-evidence-${assignment.id}`}>{assignment.evidence_url ? '更换验证照片' : '工作人员添加验证照片'}</label>
                  <input id={`station-evidence-${assignment.id}`} type="file" accept="image/*" disabled={busy || offline || evidenceBusyId === assignment.id} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadEvidence(assignment.id, file); }}/>
                  {assignment.evidence_url && <button type="button" className="text-button" disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => { if (window.confirm('删除这张验证照片？')) void removeEvidence(assignment.id); }}>删除照片</button>}
                  {evidenceBusyId === assignment.id && <small>正在压缩并安全上传…</small>}
                </div>}
                {!finalResultsLocked && actionOpen && !acceptsStaffPhoto && assignment.evidence_url && ['assigned','submitted','rejected'].includes(assignment.status) && <div className="evidence-controls station-evidence-controls"><span>这项任务不再使用照片核验；可移除历史照片记录。</span><button type="button" className="text-button" disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => { if (window.confirm('移除这张不再适用的历史验证照片？')) void removeEvidence(assignment.id); }}>移除历史照片</button></div>}
                {assignment.status === 'approved' && assignment.verification_note && <div className="submission-note approved"><strong>已核验</strong><span>{assignment.verification_note}</span></div>}
                {assignment.rejection_reason && <div className="rejection-copy">上次退回：{assignment.rejection_reason}</div>}
              </div>
              <div className="station-review-actions"><span>{STATUS_LABELS[assignment.status] || assignment.status}</span>{finalResultsLocked && ['assigned','submitted','rejected'].includes(assignment.status) && <small>终局后已冻结</small>}{!finalResultsLocked && !stationCompletable && ['assigned','submitted','rejected'].includes(assignment.status) && <small>由宾客操作与系统自动结算，任务站无需处理</small>}{!finalResultsLocked && stationCompletable && !actionOpen && ['assigned','submitted','rejected'].includes(assignment.status) && <small>当前环节暂停核验，流程开放后再处理</small>}{!finalResultsLocked && stationCompletable && actionOpen && ['assigned','submitted','rejected'].includes(assignment.status) && <><label htmlFor={`station-review-note-${assignment.id}`}>核验备注 <small>通过可留空</small></label><input id={`station-review-note-${assignment.id}`} value={reviewNotes[assignment.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [assignment.id]: event.target.value }))} maxLength={500} placeholder="退回时请填写原因"/><button data-testid={`station-approve-${assignment.id}`} disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => void approveAtStation(assignment)}>{offline ? '联网后核验' : busy ? '处理中…' : '现场通过并结算'}</button></>}{!finalResultsLocked && stationCompletable && actionOpen && assignment.status === 'submitted' && <button className="danger" disabled={busy || offline || evidenceBusyId === assignment.id || !reviewNotes[assignment.id]?.trim()} onClick={() => void rejectAtStation(assignment)}>退回</button>}</div>
            </article>; })}</div>}
          </article>
          <details className="station-more-tools"><summary><span><strong>更多现场操作</strong><small>{data.game?.task_catalog_mode === 'demo' ? '补发同队线索、派发演示任务或调整个人积分' : '补发本轮已赢得线索或调整个人积分'}</small></span><b aria-hidden="true">＋</b></summary><div className="station-tools">
            {data.game?.task_catalog_mode === 'demo' ? <form className="section-card" onSubmit={(event) => { event.preventDefault(); if (!specialTasks.some((task) => task.id === taskId)) { setError(manualTaskUnavailableReason); return; } if (!window.confirm(`确认把这项演示任务发放给 ${guest.name}？`)) return; void action({ type: 'assignTask', guestId: guest.id, taskId }, '演示任务已发放'); }}><small>DEMO MISSION</small><h2>发放演示任务</h2><p className="muted">此入口只在演示任务池中开放；正式 P1/P2 任务始终由游戏流程自动派发。</p>{specialTasks.length ? <><label htmlFor="station-special-task">选择当前可派发任务</label><select id="station-special-task" value={specialTasks.some((task) => task.id === taskId) ? taskId : ''} onChange={(event) => setTaskId(event.target.value)}><option value="">请选择</option>{specialTasks.map((task) => <option key={task.id} value={task.id}>{CATEGORY_LABELS[task.category]} · {task.title} · {task.points} 分</option>)}</select></> : <div className="tool-empty-state"><strong>当前无法派发演示任务</strong><span>{manualTaskUnavailableReason}</span></div>}<button disabled={busy || offline || finalResultsLocked || !specialTasks.some((task) => task.id === taskId)}>{offline ? '联网后可发放' : finalResultsLocked ? '终局后已冻结' : `发放给 ${guest.name}`}</button></form> : <div className="section-card tool-empty-state"><strong>正式任务清单已锁定</strong><span>任务站只能核验已经派发的正式任务，不能临时创建或追加任务。</span></div>}
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'grantClue', guestId: guest.id, clueId }, '同队线索已补发'); }}><small>PRIVATE CLUE</small><h2>补发同队线索</h2><p className="muted">团队挑战结算后才可补发；这里只显示本轮系统已经选中并发给同队成员的线索，不会重新抽取或泄露额外线索。</p>{!data.game?.team_clues_settled_at && <div className="notice">请先由主持人结算团队积分并自动发放线索。</div>}{availableClues.length ? <><label htmlFor="station-private-clue">选择 {guest.team} 本轮已结算线索</label><select id="station-private-clue" value={availableClues.some((clue) => clue.id === clueId) ? clueId : ''} onChange={(event) => setClueId(event.target.value)}><option value="">请选择</option>{clueGroups.map((group) => <optgroup key={group} label={group}>{availableClues.filter((clue) => (clue.group_name || '未命名分组') === group).map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</optgroup>)}</select></> : <div className="tool-empty-state"><strong>{guest.team} 当前没有可补发的已结算线索</strong><span>请让主办方核对团队结算记录；任务站不能现场改选其他线索。</span></div>}<button disabled={busy || offline || finalResultsLocked || !data.game?.team_clues_settled_at || !guest.phase_two_eligible || guest.participation_mode !== 'ACTIVE_PLAYER' || !guest.drawn_at || !availableClues.some((clue) => clue.id === clueId)}>{offline ? '联网后可发放' : finalResultsLocked ? '终局后已冻结' : !data.game?.team_clues_settled_at ? '团队结算后可补发' : `补发给 ${guest.name}`}</button></form>
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); const body = { type: 'adjustPoints', guestId: guest.id, amount: Number(pointAmount), reason: pointReason, rehearsalRunId: data.game?.rehearsal_run_id }; const signature = JSON.stringify(body); const pending = pendingScoreRef.current?.signature === signature ? pendingScoreRef.current : { signature, eventKey: createEventKey() }; pendingScoreRef.current = pending; if (!window.confirm(`确认调整 ${guest.name} 的个人积分？\n当前 ${guest.points} 分 · 本次 ${Number(pointAmount) > 0 ? '+' : ''}${pointAmount} 分\n原因：${pointReason}`)) return; void action({ ...body, eventKey: pending.eventKey }, '个人积分已调整').then((ok) => { if (ok) { setPointAmount(''); pendingScoreRef.current = null; } }); }}><small>MANUAL SCORE</small><h2>人工调整个人积分</h2><p className="muted">只改变个人积分，不会改变团队挑战分；家人组也可以获得个人积分，但不会计入任何竞技队团分。每次都会写入积分流水和审计记录。</p>{!guest.eligible_for_personal_score && <div className="notice">这位宾客不参与个人计分，不能在此调整。</div>}{finalResultsLocked && <div className="notice">终局结算已经产生，所有个人积分已锁定。</div>}<input aria-label="积分变化" type="number" min={-1000} max={1000} value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="例如 1 或 -1" disabled={!guest.eligible_for_personal_score || finalResultsLocked} required/><input aria-label="积分原因" value={pointReason} onChange={(event) => setPointReason(event.target.value)} maxLength={200} disabled={!guest.eligible_for_personal_score || finalResultsLocked} required/><button disabled={busy || offline || finalResultsLocked || !guest.eligible_for_personal_score || !pointAmount || Number(pointAmount) === 0 || !pointReason.trim()}>{offline ? '联网后可保存' : finalResultsLocked ? '终局后已冻结' : `确认调整 ${guest.name}`}</button></form>
          </div></details>
        </>}
      </section>
    </div>
  </main>;
}
