'use client';

import { useEffect, useMemo, useState } from 'react';

const STATUS_LABELS: Record<string, string> = { assigned: '进行中', submitted: '待核验', approved: '已完成', rejected: '已退回' };
const CATEGORY_LABELS: Record<string, string> = { standard: '普通', ceremony: '仪式', group: '团队', upgrade: '升级', hidden: '隐藏' };

type Guest = { id: string; name: string; login_name: string; team: string; points: number; claimed_at: string | null; drawn_at: string | null };
type Task = { id: string; title: string; description: string; points: number; category: string; stage: string };
type Assignment = { id: string; guest_id: string; status: string; is_initial: boolean; completion_rank: number | null; submitted_at: string | null; approved_at: string | null; rejected_at: string | null; rejection_reason: string | null; task?: Task };
type StationData = { guests: Guest[]; assignments: Assignment[]; tasks: Task[]; clues: Array<{ id: string; title: string; content: string }>; game: { stage: string } | null };

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }

export default function StationPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<StationData | null>(null);
  const [query, setQuery] = useState('');
  const [guestId, setGuestId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [clueId, setClueId] = useState('');
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('现场隐藏任务或特别表现');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const response = await fetch('/api/station-data', { cache: 'no-store' });
      if (response.status === 401) { setData(null); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '任务站数据加载失败');
      setData(body);
      if (!guestId && body.guests?.[0]) setGuestId(body.guests[0].id);
      const preferredTask = body.tasks?.find((task: Task) => task.category === 'hidden') || body.tasks?.[0];
      if (!taskId && preferredTask) setTaskId(preferredTask.id);
      if (!clueId && body.clues?.[0]) setClueId(body.clues[0].id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '任务站数据加载失败'); }
  }

  useEffect(() => { void load(); }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '登录失败');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败'); }
    finally { setBusy(false); }
  }

  async function action(body: Record<string, unknown>, success: string) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success); await load(); return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); return false; }
    finally { setBusy(false); }
  }

  const filteredGuests = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!data) return [];
    if (!needle) return data.guests;
    return data.guests.filter((guest) => `${guest.name} ${guest.login_name} ${guest.team}`.toLocaleLowerCase().includes(needle));
  }, [data, query]);
  const guest = data?.guests.find((item) => item.id === guestId) || null;
  const assignments = data?.assignments.filter((item) => item.guest_id === guestId) || [];
  const hiddenTasks = data?.tasks.filter((task) => ['hidden', 'upgrade', 'group', 'ceremony'].includes(task.category)) || [];

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">CUPID STATION</div><div className="heart-mark">♡</div><h1>丘比特<br/>任务站</h1><p className="lead">核验任务、发放线索和隐藏奖励。</p><form onSubmit={login}><label htmlFor="station-password">管理员密码</label><input id="station-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入任务站'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  return <main className="station-shell">
    <header className="station-hero"><div><div className="eyebrow">REDEMPTION DESK</div><h1>丘比特任务站</h1><p>当前阶段：{data.game?.stage || '未知'} · 本页面不显示任何隐藏身份</p></div><div className="host-links"><a href="/admin">主办方后台</a><a href="/host">主持人流程台</a></div></header>
    {message && <div className="notice success sticky-notice">{message}</div>}{error && <div className="notice error sticky-notice">{error}</div>}
    <div className="station-layout">
      <aside className="station-guests section-card"><label htmlFor="station-search">搜索宾客</label><input id="station-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="姓名、拼音或组别"/><div className="station-guest-list">{filteredGuests.map((item) => <button key={item.id} className={item.id === guestId ? 'selected' : ''} onClick={() => setGuestId(item.id)}><span>{item.name.slice(0, 1)}</span><p><strong>{item.name}</strong><small>{item.team} · {item.points} 分</small></p><b>{item.drawn_at ? '已抽卡' : item.claimed_at ? '待抽卡' : '未认领'}</b></button>)}</div>{filteredGuests.length === 0 && <div className="empty-state">没有找到宾客。</div>}</aside>
      <section className="station-workspace">
        {!guest ? <article className="section-card empty-state">请选择一位宾客。</article> : <>
          <article className="station-profile section-card"><div><small>SELECTED GUEST</small><h2>{guest.name}</h2><p>{guest.login_name} · {guest.team}</p></div><strong>{guest.points}<small>个人积分</small></strong></article>
          <article className="section-card"><div className="section-heading"><div><small>VERIFY MISSIONS</small><h2>任务核验</h2></div><span>{assignments.filter((item) => item.status === 'approved').length}/{assignments.length}</span></div>{assignments.length === 0 ? <div className="empty-state">这位宾客还没有任务。</div> : <div className="station-assignment-list">{assignments.map((assignment) => <article key={assignment.id} className={`status-${assignment.status}`}><div><small>{CATEGORY_LABELS[assignment.task?.category || ''] || assignment.task?.category} · {assignment.task?.points} 分 {assignment.completion_rank ? `· 第 ${assignment.completion_rank} 名完成` : ''}</small><h3>{assignment.task?.title}</h3><p>{assignment.task?.description}</p>{assignment.rejection_reason && <div className="rejection-copy">上次退回：{assignment.rejection_reason}</div>}</div><div><span>{STATUS_LABELS[assignment.status] || assignment.status}</span>{assignment.status !== 'approved' && <button disabled={busy} onClick={() => { if (window.confirm(`确认已现场核验“${assignment.task?.title}”并立即加 ${assignment.task?.points} 分？`)) void action({ type: 'completeAtStation', assignmentId: assignment.id }, '任务已核验通过并加分'); }}>现场通过</button>}{assignment.status === 'submitted' && <button className="danger" disabled={busy} onClick={() => { const reason = window.prompt('退回原因：', '请补充照片或请相关宾客确认'); if (reason?.trim()) void action({ type: 'reject', assignmentId: assignment.id, reason }, '任务已退回'); }}>退回</button>}</div></article>)}</div>}</article>
          <div className="station-tools">
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'assignTask', guestId: guest.id, taskId }, '新任务已发放'); }}><small>HIDDEN REWARD</small><h2>发放特别任务</h2><select value={taskId} onChange={(event) => setTaskId(event.target.value)}>{hiddenTasks.map((task) => <option key={task.id} value={task.id}>{CATEGORY_LABELS[task.category]} · {task.title} · {task.points} 分</option>)}</select><button disabled={busy || !taskId}>发放给 {guest.name}</button></form>
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'grantClue', guestId: guest.id, clueId }, '私人线索已发放'); }}><small>PRIVATE CLUE</small><h2>发放线索</h2><select value={clueId} onChange={(event) => setClueId(event.target.value)}>{data.clues.map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</select><button disabled={busy || !clueId}>发放给 {guest.name}</button></form>
            <form className="section-card" onSubmit={(event) => { event.preventDefault(); void action({ type: 'adjustPoints', guestId: guest.id, amount: Number(pointAmount), reason: pointReason }, '积分已补记').then((ok) => { if (ok) setPointAmount(''); }); }}><small>MANUAL REWARD</small><h2>补记积分</h2><input aria-label="积分变化" type="number" min={-1000} max={1000} value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="例如 1 或 3" required/><input aria-label="积分原因" value={pointReason} onChange={(event) => setPointReason(event.target.value)} maxLength={200} required/><button disabled={busy || !pointAmount || !pointReason.trim()}>保存积分</button></form>
          </div>
        </>}
      </section>
    </div>
  </main>;
}
