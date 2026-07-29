'use client';

import { useEffect, useMemo, useState } from 'react';

const STAGES = [
  ['registration', '宾客报到'], ['waiting', '等待开场'], ['task_round_1', '第一轮任务'],
  ['task_round_2', '第二轮任务'], ['group_game', '团队挑战'], ['voting', '最终投票'], ['results', '身份揭晓'],
] as const;

const ROLE_LABELS: Record<string, string> = { guest: '祝福见证者', spy: '恶作剧者（间谍）', helper: '秘密信使' };
const CATEGORY_LABELS: Record<string, string> = { standard: '普通任务', ceremony: '仪式任务', group: '团队任务', upgrade: '升级任务', hidden: '隐藏任务' };
const ACTION_LABELS: Record<string, string> = {
  'assignment.approve': '审核通过', 'assignment.reject': '退回任务', 'assignment.create': '派发任务',
  'guest.points_adjust': '调整积分', 'guest.profile_configure': '配置身份', 'guest.claim_reset': '重置密码',
  'clue.grant': '发放线索', 'clue.create': '创建线索', 'task.create': '创建任务',
  'game_state.stage': '切换阶段', 'game_state.registration_open': '切换注册',
  'game_state.voting_open': '切换投票', 'game_state.results_visible': '切换揭晓',
  'game_state.scoreboard_visible': '切换大屏',
};

type Guest = { id: string; name: string; login_name: string; team: string; role: string; points: number; claimed_at: string | null; drawn_at: string | null };
type Task = { id: string; title: string; description: string; points: number; role_scope: string; category: string; stage: string; active: boolean };
type Clue = { id: string; title: string; content: string; active: boolean };
type AdminData = {
  guests: Guest[];
  assignments: Array<{ id: string; guest_id: string; status: string; rejection_reason: string | null; task?: Task }>;
  tasks: Task[];
  clues: Clue[];
  submissions: Array<{ id: string; guest?: { name: string }; task?: { title: string; points: number } }>;
  votes: Array<{ id: string; target?: { name: string } }>;
  pointLedger: Array<{ id: string; amount: number; reason: string; actor: string; created_at: string; guest?: { name: string } }>;
  auditLog: Array<{ id: number; actor: string; action: string; target_type: string; details: Record<string, unknown>; created_at: string }>;
  game: { registration_open: boolean; stage: string; voting_open: boolean; results_visible: boolean; scoreboard_visible: boolean } | null;
};

async function responseBody(response: Response) {
  try { return await response.json(); } catch { return {}; }
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedClueId, setSelectedClueId] = useState('');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('guest');
  const [pointAmount, setPointAmount] = useState('');
  const [pointReason, setPointReason] = useState('');
  const [newTask, setNewTask] = useState({ title: '', description: '', points: '20', roleScope: 'all', category: 'standard', stage: 'task_round_1' });
  const [newClue, setNewClue] = useState({ title: '', content: '' });

  async function load() {
    try {
      const response = await fetch('/api/admin-data', { cache: 'no-store' });
      if (response.ok) setData(await response.json());
      else if (response.status !== 401) setError((await responseBody(response)).error || '后台数据加载失败');
    } catch { setError('网络连接不稳定，请稍后重试。'); }
  }

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!data?.guests.length) return;
    if (!selectedGuestId || !data.guests.some((guest) => guest.id === selectedGuestId)) setSelectedGuestId(data.guests[0].id);
    if (!selectedTaskId && data.tasks[0]) setSelectedTaskId(data.tasks[0].id);
    if (!selectedClueId && data.clues[0]) setSelectedClueId(data.clues[0].id);
  }, [data, selectedGuestId, selectedTaskId, selectedClueId]);

  const selectedGuest = useMemo(() => data?.guests.find((guest) => guest.id === selectedGuestId) ?? null, [data, selectedGuestId]);

  useEffect(() => {
    if (!selectedGuest) return;
    setTeam(selectedGuest.team);
    setRole(selectedGuest.role);
  }, [selectedGuest]);

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
    setError(''); setMessage(''); setBusy(true);
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

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">ORGANIZER ONLY</div><div className="heart-mark">♡</div><h1>主办方<br/>控制台</h1><p className="lead">管理婚礼流程、审核任务与揭晓结果。</p><form onSubmit={login}><label htmlFor="admin-password">管理员密码</label><input id="admin-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入控制台'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  const claimed = data.guests.filter((guest) => guest.claimed_at).length;
  const votesByTarget = Object.entries(data.votes.reduce<Record<string, number>>((counts, vote) => {
    const name = vote.target?.name || '未知'; counts[name] = (counts[name] || 0) + 1; return counts;
  }, {})).sort((a, b) => b[1] - a[1]);

  return <main className="admin-shell">
    <section className="admin-hero"><div><div className="eyebrow">LIVE CONTROL</div><h1>婚礼游戏控制台</h1><p>{claimed}/{data.guests.length} 位宾客已认领 · {data.submissions.length} 项待审核</p></div><div className="live-dot">LIVE</div></section>
    {message && <div className="notice success sticky-notice">{message}</div>}{error && <div className="notice error sticky-notice">{error}</div>}

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>REGISTRATION</small><h2>宾客注册</h2></div></div><p className="muted">首次进入由宾客自行设置四位密码，忘记后可在宾客列表中重置。</p><button disabled={busy} onClick={() => action({ type: 'toggleRegistration', value: !data.game?.registration_open })}>{data.game?.registration_open ? '关闭注册' : '开放注册'}</button><div className={`control-state ${data.game?.registration_open ? 'on' : ''}`}>{data.game?.registration_open ? '● 注册开放中' : '○ 注册已关闭'}</div></article>
      <article className="section-card"><div className="section-heading"><div><small>GAME STAGE</small><h2>当前流程</h2></div></div><label htmlFor="game-stage">切换婚礼环节</label><select id="game-stage" value={data.game?.stage || 'registration'} disabled={busy} onChange={(event) => action({ type: 'setStage', stage: event.target.value }, '游戏阶段已切换')}>{STAGES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><div className="control-buttons"><button disabled={busy} onClick={() => action({ type: 'toggleVoting', value: !data.game?.voting_open })}>{data.game?.voting_open ? '关闭投票' : '开启投票'}</button><button disabled={busy} className="secondary" onClick={() => action({ type: 'toggleResults', value: !data.game?.results_visible })}>{data.game?.results_visible ? '隐藏揭晓' : '公布揭晓'}</button><button disabled={busy} className="secondary" onClick={() => action({ type: 'toggleScoreboard', value: !data.game?.scoreboard_visible })}>{data.game?.scoreboard_visible ? '关闭大屏' : '开放大屏'}</button></div></article>
    </section>

    <section className="section-card"><div className="section-heading"><div><small>APPROVAL QUEUE</small><h2>待审核任务</h2></div><span>{data.submissions.length}</span></div>{data.submissions.length === 0 ? <div className="empty-state">暂无待审核提交。</div> : data.submissions.map((submission) => <div className="approval-row" key={submission.id}><div><strong>{submission.guest?.name}</strong><p>{submission.task?.title} · {submission.task?.points} 分</p></div><div><button disabled={busy} onClick={() => action({ type: 'approve', assignmentId: submission.id }, '任务已通过并自动加分')}>通过</button><button disabled={busy} className="danger" onClick={() => { const reason = window.prompt('请写明退回原因，宾客会看到这条说明：', '请补充照片或请相关宾客确认'); if (reason?.trim()) void action({ type: 'reject', assignmentId: submission.id, reason }, '任务已退回'); }}>退回</button></div></div>)}</section>

    <section className="section-card"><div className="section-heading"><div><small>QUICK OPERATIONS</small><h2>宾客操作台</h2></div></div>
      <label htmlFor="operation-guest">选择宾客</label><select id="operation-guest" value={selectedGuestId} onChange={(event) => setSelectedGuestId(event.target.value)}>{data.guests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.team} · {guest.points} 分</option>)}</select>
      {selectedGuest && <div className="operation-grid">
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'configureGuest', guestId: selectedGuest.id, team, role }, '组别和身份已保存'); }}><h3>预设组别与身份</h3><p className="muted">仅限尚未抽卡的宾客。抽卡后为保护身份不可直接修改。</p><label htmlFor="guest-team">组别</label><input id="guest-team" value={team} onChange={(event) => setTeam(event.target.value)} maxLength={40}/><label htmlFor="guest-role">身份</label><select id="guest-role" value={role} onChange={(event) => setRole(event.target.value)}><option value="guest">祝福见证者</option><option value="spy">恶作剧者（间谍）</option><option value="helper">秘密信使</option></select><button disabled={busy || Boolean(selectedGuest.drawn_at)}>保存预设</button></form>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'assignTask', guestId: selectedGuest.id, taskId: selectedTaskId }, '任务已派发'); }}><h3>派发任务</h3><p className="muted">任务会在对应游戏阶段开放时出现在宾客手机上。</p><label htmlFor="assign-task">任务</label><select id="assign-task" value={selectedTaskId} onChange={(event) => setSelectedTaskId(event.target.value)}>{data.tasks.map((task) => <option key={task.id} value={task.id}>{task.title} · {task.points} 分</option>)}</select><button disabled={busy || !selectedTaskId}>派发给 {selectedGuest.name}</button></form>
        <form onSubmit={(event) => { event.preventDefault(); void action({ type: 'grantClue', guestId: selectedGuest.id, clueId: selectedClueId }, '线索已发放'); }}><h3>发放线索</h3><p className="muted">线索只会显示在这位宾客的私人任务页。</p><label htmlFor="grant-clue">线索</label><select id="grant-clue" value={selectedClueId} onChange={(event) => setSelectedClueId(event.target.value)}>{data.clues.map((clue) => <option key={clue.id} value={clue.id}>{clue.title}</option>)}</select><button disabled={busy || !selectedClueId}>发放给 {selectedGuest.name}</button></form>
        <form onSubmit={(event) => { event.preventDefault(); const amount = Number(pointAmount); void action({ type: 'adjustPoints', guestId: selectedGuest.id, amount, reason: pointReason }, '积分已调整').then((ok) => { if (ok) { setPointAmount(''); setPointReason(''); } }); }}><h3>人工调整积分</h3><p className="muted">可输入正数或负数；积分不会降到零以下，必须填写原因。</p><label htmlFor="point-amount">分数变化</label><input id="point-amount" type="number" min={-1000} max={1000} value={pointAmount} onChange={(event) => setPointAmount(event.target.value)} placeholder="例如 10 或 -5" required/><label htmlFor="point-reason">调整原因</label><input id="point-reason" value={pointReason} onChange={(event) => setPointReason(event.target.value)} maxLength={200} placeholder="例如：完成现场隐藏任务" required/><button disabled={busy || !pointAmount || !pointReason.trim()}>保存积分调整</button></form>
      </div>}
    </section>

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>TASK LIBRARY</small><h2>新建任务</h2></div><span>{data.tasks.length}</span></div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'createTask', ...newTask, points: Number(newTask.points) }, '任务已加入任务库').then((ok) => { if (ok) setNewTask((current) => ({ ...current, title: '', description: '' })); }); }}><label htmlFor="task-title">标题</label><input id="task-title" value={newTask.title} onChange={(event) => setNewTask({ ...newTask, title: event.target.value })} maxLength={120} required/><label htmlFor="task-description">任务说明</label><textarea id="task-description" value={newTask.description} onChange={(event) => setNewTask({ ...newTask, description: event.target.value })} maxLength={1000} required/><div className="form-grid"><div><label htmlFor="task-points">积分</label><input id="task-points" type="number" min={1} max={500} value={newTask.points} onChange={(event) => setNewTask({ ...newTask, points: event.target.value })} required/></div><div><label htmlFor="task-role">适用身份</label><select id="task-role" value={newTask.roleScope} onChange={(event) => setNewTask({ ...newTask, roleScope: event.target.value })}><option value="all">所有身份</option><option value="guest">祝福见证者</option><option value="spy">间谍</option><option value="helper">秘密信使</option></select></div><div><label htmlFor="task-category">类型</label><select id="task-category" value={newTask.category} onChange={(event) => setNewTask({ ...newTask, category: event.target.value })}>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div><label htmlFor="task-stage">开放阶段</label><select id="task-stage" value={newTask.stage} onChange={(event) => setNewTask({ ...newTask, stage: event.target.value })}>{STAGES.filter(([value]) => ['task_round_1', 'task_round_2', 'group_game'].includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div><button disabled={busy}>创建任务</button></form></article>
      <article className="section-card"><div className="section-heading"><div><small>CLUE LIBRARY</small><h2>新建线索</h2></div><span>{data.clues.length}</span></div><form onSubmit={(event) => { event.preventDefault(); void action({ type: 'createClue', ...newClue }, '线索已加入线索库').then((ok) => { if (ok) setNewClue({ title: '', content: '' }); }); }}><label htmlFor="clue-title">线索标题</label><input id="clue-title" value={newClue.title} onChange={(event) => setNewClue({ ...newClue, title: event.target.value })} maxLength={120} required/><label htmlFor="clue-content">线索内容</label><textarea id="clue-content" value={newClue.content} onChange={(event) => setNewClue({ ...newClue, content: event.target.value })} maxLength={1000} required/><button disabled={busy}>创建线索</button></form><div className="library-preview">{data.clues.slice(0, 5).map((clue) => <div key={clue.id}><strong>{clue.title}</strong><p>{clue.content}</p></div>)}</div></article>
    </section>

    <section className="section-card"><div className="section-heading"><div><small>GUESTS</small><h2>宾客进度</h2></div><span>{data.guests.length}</span></div><div className="guest-admin-list">{data.guests.map((guest) => <article key={guest.id}><div className="guest-avatar">{guest.name.slice(0, 1)}</div><div><strong>{guest.name}</strong><small>{guest.login_name} · {guest.drawn_at ? `${guest.team} / ${ROLE_LABELS[guest.role] || guest.role}` : '待抽卡'} · {guest.points} 分</small></div><span className={guest.claimed_at ? 'claimed' : 'unclaimed'}>{guest.claimed_at ? (guest.drawn_at ? '已抽卡' : '待抽卡') : '未设置'}</span>{guest.claimed_at && <button className="mini-button" disabled={busy} onClick={() => { if (window.confirm(`确认重置 ${guest.name} 的密码并退出其所有设备？`)) void action({ type: 'resetGuestClaim', guestId: guest.id }, '宾客密码已重置'); }}>重置密码</button>}</article>)}</div></section>

    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>VOTE COUNT</small><h2>投票统计</h2></div><span>{data.votes.length}</span></div>{votesByTarget.length === 0 ? <div className="empty-state">暂无投票。</div> : <ol className="ranking-list">{votesByTarget.map(([name, count]) => <li key={name}><strong>{name}</strong><span>{count} 票</span></li>)}</ol>}</article>
      <article className="section-card"><div className="section-heading"><div><small>POINTS LEDGER</small><h2>积分流水</h2></div></div>{data.pointLedger.length === 0 ? <div className="empty-state">暂无积分记录。</div> : <div className="activity-list">{data.pointLedger.slice(0, 12).map((entry) => <div key={entry.id}><span className={entry.amount > 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</span><p><strong>{entry.guest?.name || '未知宾客'}</strong><small>{entry.reason}</small></p></div>)}</div>}</article>
    </section>

    <section className="section-card"><div className="section-heading"><div><small>AUDIT LOG</small><h2>最近操作记录</h2></div></div>{data.auditLog.length === 0 ? <div className="empty-state">暂无后台操作。</div> : <div className="audit-list">{data.auditLog.slice(0, 20).map((entry) => <div key={entry.id}><strong>{ACTION_LABELS[entry.action] || entry.action}</strong><span>{new Date(entry.created_at).toLocaleString('zh-CN')}</span><small>{entry.actor}</small></div>)}</div>}</section>
  </main>;
}
