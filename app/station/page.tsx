'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { compressTaskEvidence } from '@/lib/client-image';
import { StaffLogoutButton } from '../staff-logout-button';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const STATUS_LABELS: Record<string, string> = { assigned: '进行中', submitted: '待核验', approved: '已完成', rejected: '已退回' };
const CATEGORY_LABELS: Record<string, string> = { standard: '普通', ceremony: '仪式', group: '团队', upgrade: '升级', hidden: '隐藏' };
const STATION_CACHE_KEY = 'wedding-station-private-cache-v1';

type Guest = { id: string; name: string; login_name: string; team: string; points: number; claimed_at: string | null; drawn_at: string | null };
type Task = { id: string; title: string; description: string; verification_method: string; points: number; category: string; stage: string };
type Assignment = { id: string; guest_id: string; status: string; is_initial: boolean; completion_rank: number | null; early_bonus_points: number; completion_note: string; verification_note: string; verified_at: string | null; evidence_uploaded_at: string | null; evidence_url: string | null; submitted_at: string | null; approved_at: string | null; rejected_at: string | null; rejection_reason: string | null; task?: Task };
type StationData = { guests: Guest[]; assignments: Assignment[]; tasks: Task[]; clues: Array<{ id: string; title: string; content: string; group_name: string }>; game: { stage: string } | null };

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }

export default function StationPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<StationData | null>(null);
  const [query, setQuery] = useState('');
  const [guestFilter, setGuestFilter] = useState<'pending' | 'all'>('pending');
  const [guestId, setGuestId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [clueId, setClueId] = useState('');
  const [hiddenCode, setHiddenCode] = useState('');
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('现场隐藏任务或特别表现');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [evidenceBusyId, setEvidenceBusyId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const loadRequestRef = useRef(0);
  const workspaceRef = useRef<HTMLElement | null>(null);

  async function load(interactive = false) {
    const requestId = ++loadRequestRef.current;
    if (interactive) setSyncing(true);
    try {
      const response = await fetch('/api/station-data', { cache: 'no-store' });
      if (requestId !== loadRequestRef.current) return;
      if (response.status === 401) { try { window.sessionStorage.removeItem(STATION_CACHE_KEY); } catch {} setData(null); setOffline(false); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '任务站数据加载失败');
      setData(body);
      try { window.sessionStorage.setItem(STATION_CACHE_KEY, JSON.stringify(body)); } catch {}
      setOffline(false); setError('');
      const firstPendingGuestId = body.assignments?.find((assignment: Assignment) => ['submitted', 'rejected'].includes(assignment.status))?.guest_id;
      setGuestId((current) => current || firstPendingGuestId || body.guests?.[0]?.id || '');
      const preferredTask = body.tasks?.find((task: Task) => task.category === 'hidden') || body.tasks?.[0];
      setTaskId((current) => current || preferredTask?.id || '');
      setClueId((current) => current || body.clues?.[0]?.id || '');
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setOffline(true); setError(cause instanceof Error ? cause.message : '任务站数据加载失败');
      try {
        const cached = window.sessionStorage.getItem(STATION_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as StationData;
          setData((current) => current ?? parsed);
          const firstPendingGuestId = parsed.assignments?.find((assignment) => ['submitted', 'rejected'].includes(assignment.status))?.guest_id;
          setGuestId((current) => current || firstPendingGuestId || parsed.guests?.[0]?.id || '');
          const preferredTask = parsed.tasks?.find((task) => task.category === 'hidden') || parsed.tasks?.[0];
          setTaskId((current) => current || preferredTask?.id || '');
          setClueId((current) => current || parsed.clues?.[0]?.id || '');
        }
      } catch { try { window.sessionStorage.removeItem(STATION_CACHE_KEY); } catch {} }
    } finally { if (interactive) setSyncing(false); }
  }

  useEffect(() => {
    void load();
  }, []);
  useLiveRefresh(load, undefined, Boolean(data));

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
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success); await load(); return true;
    } catch (cause) { setOffline(!navigator.onLine); setError(cause instanceof Error ? cause.message : '操作失败'); return false; }
    finally { setBusy(false); }
  }

  async function approveAtStation(assignment: Assignment) {
    const verificationNote = (reviewNotes[assignment.id]?.trim()
      || `已按任务要求核验：${assignment.task?.verification_method || '工作人员现场确认'}`).slice(0, 500);
    const approved = await action(
      { type: 'completeAtStation', assignmentId: assignment.id, verificationNote },
      '任务已核验通过并加分',
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const uploadInfo = await responseBody(authorization);
      if (!authorization.ok) throw new Error(uploadInfo.error || '无法准备照片上传');
      const upload = await fetch(uploadInfo.signedUrl, {
        method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: image,
      });
      if (!upload.ok) throw new Error('照片上传失败，请检查网络后重试');
      const confirmation = await fetch('/api/station-evidence', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignmentId, path: uploadInfo.path }),
      });
      const confirmationBody = await responseBody(confirmation);
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
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const body = await responseBody(response);
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
  const hiddenTasks = data?.tasks.filter((task) => ['hidden', 'upgrade', 'group', 'ceremony'].includes(task.category)) || [];
  const clueGroups = Array.from(new Set((data?.clues ?? []).map((clue) => clue.group_name || '通用线索')));
  const pendingGuestCount = new Set((data?.assignments ?? []).filter((assignment) => ['submitted', 'rejected'].includes(assignment.status)).map((assignment) => assignment.guest_id)).size;

  function selectGuest(nextGuestId: string) {
    setGuestId(nextGuestId);
    if (window.matchMedia('(max-width: 800px)').matches) {
      window.requestAnimationFrame(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">CUPID STATION</div><div className="heart-mark">♡</div><h1>丘比特<br/>任务站</h1><p className="lead">核验任务、发放线索和隐藏奖励。</p><form onSubmit={login}><label htmlFor="station-password">管理员密码</label><input id="station-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入任务站'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  return <main className="station-shell">
    <header className="station-hero"><div><div className="eyebrow">REDEMPTION DESK</div><h1>丘比特任务站</h1><p>当前阶段：{data.game?.stage || '未知'} · 本页面不显示任何隐藏身份</p></div><div className="host-links"><a href="/admin">主办方后台</a><a href="/host">主持人流程台</a><StaffLogoutButton clearSessionStorageKeys={[STATION_CACHE_KEY]}/></div></header>
    {offline && <div className="connection-banner offline" role="status"><span>离线只读 · 可查看最近同步的宾客与任务文字，验证照片可能需要联网；所有记录操作已禁用</span><button className="mini-button" disabled={syncing} onClick={() => void load(true)}>{syncing ? '重连中…' : '重新连接'}</button></div>}
    {message && <div className="notice success sticky-notice">{message}</div>}{error && <div className="notice error sticky-notice">{error}</div>}
    <div className="station-layout">
      <aside className="station-guests section-card"><div className="station-guest-heading"><div><small>选择宾客</small><strong>{guestFilter === 'pending' ? `${pendingGuestCount} 人待处理` : `${data.guests.length} 位宾客`}</strong></div><div className="station-filter-tabs"><button type="button" className={guestFilter === 'pending' ? 'active' : ''} aria-pressed={guestFilter === 'pending'} onClick={() => setGuestFilter('pending')}>待处理</button><button type="button" className={guestFilter === 'all' ? 'active' : ''} aria-pressed={guestFilter === 'all'} onClick={() => setGuestFilter('all')}>全部</button></div></div><label htmlFor="station-search">搜索宾客</label><input id="station-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、拼音或组别"/><div className="station-guest-list">{filteredGuests.map((item) => <button type="button" key={item.id} className={item.id === guestId ? 'selected' : ''} onClick={() => selectGuest(item.id)}><span>{item.name.slice(0, 1)}</span><p><strong>{item.name}</strong><small>{item.team} · {item.points} 分</small></p><b>{item.drawn_at ? '已抽卡' : item.claimed_at ? '待抽卡' : '未认领'}</b></button>)}</div>{filteredGuests.length === 0 && <div className="empty-state">{guestFilter === 'pending' ? '当前没有待处理任务。可切换到“全部”查找宾客。' : '没有找到宾客。'}</div>}</aside>
      <section className="station-workspace" ref={workspaceRef}>
        {!guest ? <article className="section-card empty-state">请选择一位宾客。</article> : <>
          <article className="station-profile section-card"><div><small>SELECTED GUEST</small><h2>{guest.name}</h2><p>{guest.login_name} · {guest.team}</p></div><strong>{guest.points}<small>个人积分</small></strong></article>
          <article className="section-card">
            <div className="section-heading"><div><small>VERIFY MISSIONS</small><h2>任务核验</h2></div><span>{assignments.filter((item) => item.status === 'approved').length}/{assignments.length}</span></div>
            {assignments.length === 0 ? <div className="empty-state">这位宾客还没有任务。</div> : <div className="station-assignment-list">{assignments.map((assignment) => <article key={assignment.id} className={`status-${assignment.status}`}>
              <div>
                <small>{CATEGORY_LABELS[assignment.task?.category || ''] || assignment.task?.category} · {assignment.task?.points} 分 {assignment.completion_rank ? `· 第 ${assignment.completion_rank} 名完成${assignment.early_bonus_points ? ' · 额外 +1' : ''}` : ''}</small>
                <h3>{assignment.task?.title}</h3><p>{assignment.task?.description}</p>
                <div className="verification-note"><strong>核验要求</strong><span>{assignment.task?.verification_method}</span></div>
                {assignment.completion_note && <div className="submission-note"><strong>宾客完成说明</strong><span>{assignment.completion_note}</span></div>}
                {assignment.evidence_url && <figure className="evidence-preview compact"><a href={assignment.evidence_url} target="_blank" rel="noreferrer"><img src={assignment.evidence_url} alt={`${assignment.task?.title || '任务'}的验证照片`} loading="lazy"/></a><figcaption>点击查看验证照片</figcaption></figure>}
                {assignment.status !== 'approved' && <div className="evidence-controls station-evidence-controls">
                  <label htmlFor={`station-evidence-${assignment.id}`}>{assignment.evidence_url ? '更换验证照片' : '工作人员添加验证照片'}</label>
                  <input id={`station-evidence-${assignment.id}`} type="file" accept="image/*" disabled={busy || offline || evidenceBusyId === assignment.id} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void uploadEvidence(assignment.id, file); }}/>
                  {assignment.evidence_url && <button type="button" className="text-button" disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => { if (window.confirm('删除这张验证照片？')) void removeEvidence(assignment.id); }}>删除照片</button>}
                  {evidenceBusyId === assignment.id && <small>正在压缩并安全上传…</small>}
                </div>}
                {assignment.status === 'approved' && assignment.verification_note && <div className="submission-note approved"><strong>已核验</strong><span>{assignment.verification_note}</span></div>}
                {assignment.rejection_reason && <div className="rejection-copy">上次退回：{assignment.rejection_reason}</div>}
              </div>
              <div className="station-review-actions"><span>{STATUS_LABELS[assignment.status] || assignment.status}</span>{assignment.status !== 'approved' && <><label htmlFor={`station-review-note-${assignment.id}`}>核验备注 <small>通过可留空</small></label><input id={`station-review-note-${assignment.id}`} value={reviewNotes[assignment.id] || ''} onChange={(event) => setReviewNotes((current) => ({ ...current, [assignment.id]: event.target.value }))} maxLength={500} placeholder="退回时请填写原因"/><button data-testid={`station-approve-${assignment.id}`} disabled={busy || offline || evidenceBusyId === assignment.id} onClick={() => void approveAtStation(assignment)}>{offline ? '联网后核验' : busy ? '处理中…' : '现场通过并加分'}</button></>}{assignment.status === 'submitted' && <button className="danger" disabled={busy || offline || evidenceBusyId === assignment.id || !reviewNotes[assignment.id]?.trim()} onClick={() => void rejectAtStation(assignment)}>退回</button>}</div>
            </article>)}</div>}
          </article>
          <details className="station-more-tools"><summary><span><strong>更多现场操作</strong><small>兑换实体卡、派发特别任务、线索与人工积分</small></span><b aria-hidden="true">＋</b></summary><div className="station-tools">
            <form className="section-card redemption-code-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'redeemHiddenTaskCode', guestId: guest.id, code: hiddenCode }, `隐藏任务卡已兑换给 ${guest.name}`).then((ok) => { if (ok) setHiddenCode(''); }); }}><small>PHYSICAL CARD</small><h2>兑换隐藏任务卡</h2><p className="muted">输入宾客找到的实体卡代码。每张卡全场只能领取一次，任务会自动进入其手机。</p>{!['task_round_2', 'group_game'].includes(data.game?.stage ?? '') && <div className="notice">请在第二轮任务或团队挑战环节开放实体卡兑换。</div>}<label htmlFor="hidden-task-code">隐藏任务码</label><input id="hidden-task-code" className="redemption-code-input" value={hiddenCode} onChange={(event) => setHiddenCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="CUPID-XXXX-XXXX" required/><button disabled={busy || offline || !guest.drawn_at || !hiddenCode.trim() || !['task_round_2', 'group_game'].includes(data.game?.stage ?? '')}>{offline ? '联网后可兑换' : !['task_round_2', 'group_game'].includes(data.game?.stage ?? '') ? '当前环节不可兑换' : guest.drawn_at ? `兑换给 ${guest.name}` : '宾客抽卡后才能兑换'}</button></form>
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'assignTask', guestId: guest.id, taskId }, '新任务已发放'); }}><small>HIDDEN REWARD</small><h2>发放特别任务</h2><select value={taskId} onChange={(event) => setTaskId(event.target.value)}>{hiddenTasks.map((task) => <option key={task.id} value={task.id}>{CATEGORY_LABELS[task.category]} · {task.title} · {task.points} 分</option>)}</select><button disabled={busy || offline || !taskId}>{offline ? '联网后可发放' : `发放给 ${guest.name}`}</button></form>
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'grantClue', guestId: guest.id, clueId }, '私人线索已发放'); }}><small>PRIVATE CLUE</small><h2>发放线索</h2><select value={clueId} onChange={(event) => setClueId(event.target.value)}>{clueGroups.map((group) => <optgroup key={group} label={group}>{data.clues.filter((clue) => (clue.group_name || '通用线索') === group).map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</optgroup>)}</select><button disabled={busy || offline || !clueId}>{offline ? '联网后可发放' : `发放给 ${guest.name}`}</button></form>
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'adjustPoints', guestId: guest.id, amount: Number(pointAmount), reason: pointReason }, '积分已补记').then((ok) => { if (ok) setPointAmount(''); }); }}><small>MANUAL REWARD</small><h2>补记积分</h2><input aria-label="积分变化" type="number" min={-1000} max={1000} value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="例如 1 或 3" required/><input aria-label="积分原因" value={pointReason} onChange={(event) => setPointReason(event.target.value)} maxLength={200} required/><button disabled={busy || offline || !pointAmount || !pointReason.trim()}>{offline ? '联网后可保存' : '保存积分'}</button></form>
          </div></details>
        </>}
      </section>
    </div>
  </main>;
}
