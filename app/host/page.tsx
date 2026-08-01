'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StaffLogoutButton } from '../staff-logout-button';
import { createEventKey } from '@/lib/event-key';
import { GAME_STAGE_OPTIONS, gameStageCopy } from '@/lib/game-stages';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const TEAMS = ['海岛组', '沙漠组'] as const;
const HOST_CACHE_KEY = 'wedding-host-score-cache-v2';
const HOST_CACHE_KEYS = ['wedding-host-private-cache-v1', 'wedding-host-private-cache-v2', 'wedding-host-score-cache-v1', HOST_CACHE_KEY];

type Guest = {
  id: string;
  name: string;
  team: string;
  role: 'guest' | 'spy';
  is_hidden_spy: boolean;
  points: number;
  participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL';
  special_card_title: string;
  eligible_for_personal_score: boolean;
  drawn_at: string | null;
};

type HostData = {
  guests: Guest[];
  teamPoints: Array<{ id: number; team: string; amount: number; reason: string; created_at: string }>;
  personalPoints: Array<{ id: string; guest_id: string; amount: number; reason: string; created_at: string; guest: { id: string; name: string } | null }>;
  game: { stage: string; voting_open: boolean; voting_round: number; results_visible: boolean } | null;
  voteCount: number;
  rankings: {
    personal: Array<{ id: string; name: string; team: string; points: number; completedTasks: number }>;
    teams: Array<{ team: string; points: number; guests: number; completedTasks: number }>;
  };
};

type FinaleAction = 'open-voting' | 'close-voting' | 'publish-results';
const HOST_STAGE_OPTIONS = GAME_STAGE_OPTIONS.filter(([stage]) => !['voting', 'results'].includes(stage));

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }
function clearHostCache() { try { for (const key of HOST_CACHE_KEYS) window.sessionStorage.removeItem(key); } catch {} }

export default function HostPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<HostData | null>(null);
  const [mode, setMode] = useState<'overview' | 'team' | 'guest' | 'finale'>('overview');
  const [teamForm, setTeamForm] = useState({ team: '海岛组', amount: '1', reason: '主持人现场奖励' });
  const [guestForm, setGuestForm] = useState({ guestId: '', amount: '1', reason: '主持人现场奖励' });
  const [guestSearch, setGuestSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pendingFinaleAction, setPendingFinaleAction] = useState<FinaleAction | null>(null);
  const [pendingStage, setPendingStage] = useState('');
  const loadRequestRef = useRef(0);
  const pendingScoreRef = useRef<{ signature: string; eventKey: string } | null>(null);

  async function load(interactive = false) {
    const requestId = ++loadRequestRef.current;
    if (interactive) setSyncing(true);
    try {
      const response = await fetch('/api/host-data', { cache: 'no-store' });
      if (requestId !== loadRequestRef.current) return;
      if (response.status === 401) { clearHostCache(); setData(null); setOffline(false); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '计分数据加载失败');
      setData(body);
      setGuestForm((current) => ({ ...current, guestId: current.guestId || body.guests?.find((guest: Guest) => guest.eligible_for_personal_score)?.id || '' }));
      try { window.sessionStorage.setItem(HOST_CACHE_KEY, JSON.stringify(body)); } catch {}
      setOffline(false); setError('');
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setOffline(true); setError(cause instanceof Error ? cause.message : '计分数据加载失败');
      try {
        const cached = window.sessionStorage.getItem(HOST_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as HostData;
          setData((current) => current ?? parsed);
          setGuestForm((current) => ({ ...current, guestId: current.guestId || parsed.guests?.find((guest) => guest.eligible_for_personal_score)?.id || '' }));
        }
      } catch { clearHostCache(); }
    } finally { if (interactive) setSyncing(false); }
  }

  useEffect(() => { void load(); }, []);
  useLiveRefresh(() => load(), undefined, Boolean(data));

  async function login(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '登录失败');
      setPassword(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败'); }
    finally { setBusy(false); }
  }

  async function addScore(body: Record<string, unknown>, success: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能加分'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const signature = JSON.stringify(body);
      const pending = pendingScoreRef.current?.signature === signature
        ? pendingScoreRef.current
        : { signature, eventKey: createEventKey() };
      pendingScoreRef.current = pending;
      const response = await fetch('/api/host-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, eventKey: pending.eventKey }) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '加分失败');
      pendingScoreRef.current = null;
      setMessage(`${success} · 当前 ${result.total} 分`); await load();
    } catch (cause) { setOffline(!navigator.onLine); setError(cause instanceof Error ? cause.message : '加分失败'); }
    finally { setBusy(false); }
  }

  async function runFinaleAction(finaleAction: FinaleAction) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能操作终局流程'); return; }
    const request = finaleAction === 'open-voting'
      ? { type: 'toggleVoting', value: true }
      : finaleAction === 'close-voting'
        ? { type: 'toggleVoting', value: false }
        : { type: 'publishResults' };
    const success = finaleAction === 'open-voting'
      ? '新一轮最终投票已开启'
      : finaleAction === 'close-voting'
        ? '本轮最终投票已关闭'
        : '身份已公布，全部终局积分已结算';
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/host-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '终局操作失败');
      setPendingFinaleAction(null); setMessage(success); await load();
    } catch (cause) { setOffline(!navigator.onLine); setError(cause instanceof Error ? cause.message : '终局操作失败'); }
    finally { setBusy(false); }
  }

  async function runStageChange(stage: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能切换婚礼流程'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/host-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'setStage', stage }) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '婚礼流程切换失败');
      setPendingStage(''); setPendingFinaleAction(null); setMessage(`已切换到「${gameStageCopy(stage).label}」`); await load();
    } catch (cause) { setOffline(!navigator.onLine); setError(cause instanceof Error ? cause.message : '婚礼流程切换失败'); }
    finally { setBusy(false); }
  }

  const filteredGuests = useMemo(() => {
    const term = guestSearch.trim().toLocaleLowerCase();
    const scoreEligible = (data?.guests ?? []).filter((guest) => guest.eligible_for_personal_score);
    if (!term) return scoreEligible;
    return scoreEligible.filter((guest) => `${guest.name} ${guest.team} ${guest.special_card_title}`.toLocaleLowerCase().includes(term));
  }, [data?.guests, guestSearch]);
  const effectiveGuestId = filteredGuests.some((guest) => guest.id === guestForm.guestId) ? guestForm.guestId : filteredGuests[0]?.id || '';
  const selectedGuest = data?.guests.find((guest) => guest.id === effectiveGuestId) ?? null;
  const teamTotals = TEAMS.map((team) => ({ team, points: (data?.teamPoints ?? []).filter((entry) => entry.team === team).reduce((sum, entry) => sum + entry.amount, 0) }));

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">HOST ONLY</div><div className="heart-mark">♡</div><h1>主持人<br/>流程台</h1><p className="lead">查看全员分组、积分和恶作剧者，并处理现场加分。</p><form onSubmit={login}><label htmlFor="host-password">管理员密码</label><input id="host-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入主持人流程台'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  return <main className="host-shell host-score-shell">
    <header className="host-hero host-score-hero"><div><div className="eyebrow">LIVE HOST DESK</div><h1>主持人流程台</h1><p>身份信息仅供主持人与主办方现场查看，请勿投屏。</p></div><StaffLogoutButton clearSessionStorageKeys={HOST_CACHE_KEYS}/></header>
    {offline && <div className="connection-banner offline" role="status"><span>离线只读 · 加分功能暂时停用</span><button className="mini-button" disabled={syncing} onClick={() => void load(true)}>{syncing ? '重连中…' : '重新连接'}</button></div>}
    {message && <div className="notice success sticky-notice" role="status">{message}</div>}
    {error && <div className="notice error sticky-notice" role="alert">{error}</div>}

    <nav className="host-score-tabs" aria-label="主持人功能"><button className={mode === 'overview' ? 'active' : ''} aria-pressed={mode === 'overview'} onClick={() => { setMode('overview'); setMessage(''); setError(''); }}>全员总览</button><button className={mode === 'team' ? 'active' : ''} aria-pressed={mode === 'team'} onClick={() => { setMode('team'); setMessage(''); setError(''); }}>团队加分</button><button className={mode === 'guest' ? 'active' : ''} aria-pressed={mode === 'guest'} onClick={() => { setMode('guest'); setMessage(''); setError(''); }}>个人加分</button><button className={mode === 'finale' ? 'active' : ''} aria-pressed={mode === 'finale'} onClick={() => { setMode('finale'); setMessage(''); setError(''); }}>流程控制</button></nav>

    {mode === 'overview' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>PRIVATE ROSTER</small><h2>分组、积分与身份</h2></div><span>{data.guests.length} 人</span></div><div className="host-roster-list">{data.guests.map((guest) => <article key={guest.id} className={(guest.role === 'spy' || guest.is_hidden_spy) && guest.drawn_at ? 'spy' : ''}><div><strong>{guest.name}</strong><small>{guest.team || '未分组'} · {guest.drawn_at ? '已抽卡' : guest.participation_mode === 'ACTIVE_PLAYER' ? '待抽卡' : '专属卡'}</small></div><span>{guest.eligible_for_personal_score ? `${guest.points} 分` : '不计分'}</span>{(guest.role === 'spy' || guest.is_hidden_spy) && guest.drawn_at && <b>{guest.is_hidden_spy ? '隐藏间谍' : '恶作剧者'}</b>}</article>)}</div></section> : mode === 'team' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>TEAM SCORE</small><h2>给团队加分</h2></div></div>
      <div className="team-total-list">{teamTotals.map((item) => <button type="button" className={teamForm.team === item.team ? 'selected' : ''} key={item.team} onClick={() => setTeamForm({ ...teamForm, team: item.team })}><strong>{item.team}</strong><span>{item.points} 分</span></button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); void addScore({ type: 'adjustTeamPoints', team: teamForm.team, amount: Number(teamForm.amount), reason: teamForm.reason }, `${teamForm.team} 已加 ${teamForm.amount} 分`); }}>
        <label htmlFor="team-score-amount">增加分数</label><input id="team-score-amount" type="number" inputMode="numeric" min={1} max={100} value={teamForm.amount} onChange={(event) => setTeamForm({ ...teamForm, amount: event.target.value })} required/>
        <div className="score-presets">{[1,2,3,5,10].map((amount) => <button type="button" className={Number(teamForm.amount) === amount ? 'selected' : ''} key={amount} onClick={() => setTeamForm({ ...teamForm, amount: String(amount) })}>+{amount}</button>)}</div>
        <label htmlFor="team-score-reason">加分原因</label><input id="team-score-reason" value={teamForm.reason} onChange={(event) => setTeamForm({ ...teamForm, reason: event.target.value })} maxLength={200} required/>
        <button disabled={busy || offline || Number(teamForm.amount) < 1 || Number(teamForm.amount) > 100 || !teamForm.reason.trim()}>{busy ? '保存中…' : `确认给${teamForm.team}加 ${teamForm.amount || 0} 分`}</button>
      </form>
      {data.teamPoints.length > 0 && <details className="score-history"><summary>查看最近团队加分</summary>{data.teamPoints.slice(0,10).map((entry) => <div key={entry.id}><span><strong>{entry.team}</strong><small>{entry.reason}</small></span><b>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</details>}
    </section> : mode === 'guest' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>PERSONAL SCORE</small><h2>给宾客个人加分</h2></div></div>
      <label htmlFor="guest-score-search">搜索宾客</label><input id="guest-score-search" type="search" value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="输入姓名或组别"/>
      <label htmlFor="guest-score-person">选择宾客</label><select id="guest-score-person" value={effectiveGuestId} onChange={(event) => setGuestForm({ ...guestForm, guestId: event.target.value })}>{filteredGuests.length ? filteredGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.participation_mode === 'HONOR_GUEST' ? guest.special_card_title : guest.team} · {guest.points} 分</option>) : <option value="">没有匹配的宾客</option>}</select>
      {selectedGuest && <div className="selected-score-target"><span>本次加分对象</span><strong>{selectedGuest.name}</strong><small>{selectedGuest.participation_mode === 'HONOR_GUEST' ? selectedGuest.special_card_title : selectedGuest.team} · 当前 {selectedGuest.points} 分</small></div>}
      <form onSubmit={(event) => { event.preventDefault(); if (selectedGuest) void addScore({ type: 'adjustGuestPoints', guestId: selectedGuest.id, amount: Number(guestForm.amount), reason: guestForm.reason }, `${selectedGuest.name} 已加 ${guestForm.amount} 分`); }}>
        <label htmlFor="guest-score-amount">增加分数</label><input id="guest-score-amount" type="number" inputMode="numeric" min={1} max={100} value={guestForm.amount} onChange={(event) => setGuestForm({ ...guestForm, amount: event.target.value })} required/>
        <div className="score-presets">{[1,2,3,5,10].map((amount) => <button type="button" className={Number(guestForm.amount) === amount ? 'selected' : ''} key={amount} onClick={() => setGuestForm({ ...guestForm, amount: String(amount) })}>+{amount}</button>)}</div>
        <label htmlFor="guest-score-reason">加分原因</label><input id="guest-score-reason" value={guestForm.reason} onChange={(event) => setGuestForm({ ...guestForm, reason: event.target.value })} maxLength={200} required/>
        <button disabled={busy || offline || !selectedGuest || Number(guestForm.amount) < 1 || Number(guestForm.amount) > 100 || !guestForm.reason.trim()}>{busy ? '保存中…' : `确认给${selectedGuest?.name || '宾客'}加 ${guestForm.amount || 0} 分`}</button>
      </form>
      {data.personalPoints.length > 0 && <details className="score-history"><summary>查看最近个人加分</summary>{data.personalPoints.slice(0,10).map((entry) => <div key={entry.id}><span><strong>{entry.guest?.name || '宾客'}</strong><small>{entry.reason}</small></span><b>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</details>}
    </section> : <section className="section-card host-score-panel host-finale-panel"><div className="section-heading"><div><small>RUN OF SHOW</small><h2>婚礼流程控制</h2></div><span className={data.game?.results_visible ? 'ready-badge' : data.game?.voting_open ? 'warning-badge' : ''}>{data.game?.results_visible ? '已结算' : data.game?.voting_open ? '投票中' : gameStageCopy(data.game?.stage).label}</span></div>
      <div className="host-stage-grid" aria-label="婚礼流程快捷切换">{HOST_STAGE_OPTIONS.map(([stage, label], index) => <button type="button" className={data.game?.stage === stage ? 'active' : ''} aria-current={data.game?.stage === stage ? 'step' : undefined} disabled={busy || offline || data.game?.stage === stage} key={stage} onClick={() => { setPendingFinaleAction(null); setPendingStage(stage); }}><small>{String(index + 1).padStart(2, '0')}</small><strong>{label.split(' · ')[1] || label}</strong></button>)}</div>
      {pendingStage && <section className="finale-confirmation" role="dialog" aria-label="确认切换婚礼流程"><div><small>请确认流程切换</small><strong>{gameStageCopy(pendingStage).label}</strong><p>{['voting', 'results'].includes(data.game?.stage || '') ? '切换后会关闭当前投票并隐藏公开揭晓；已经结算的积分不会撤销。' : gameStageCopy(pendingStage).note}</p></div><div><button type="button" disabled={busy} onClick={() => void runStageChange(pendingStage)}>{busy ? '切换中…' : '确认切换'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPendingStage('')}>取消</button></div></section>}
      <div className="section-divider"/>
      <div className="section-heading host-finale-heading"><div><small>FINAL VOTE</small><h3>投票与终局结算</h3></div></div>
      <div className="host-finale-status"><small>当前状态</small><strong>{data.game?.results_visible ? '身份已公布，积分已结算' : data.game?.voting_open ? `第 ${data.game.voting_round} 轮投票进行中` : data.game?.voting_round ? `第 ${data.game.voting_round} 轮投票已关闭` : '最终投票尚未开始'}</strong><span>{data.voteCount} 人已提交本轮投票</span></div>
      {!data.game?.results_visible && <div className="host-finale-actions">{data.game?.voting_open ? <button type="button" disabled={busy || offline} onClick={() => { setPendingStage(''); setPendingFinaleAction('close-voting'); }}>关闭本轮投票</button> : <><button type="button" disabled={busy || offline || data.game?.stage !== 'group_game'} onClick={() => { setPendingStage(''); setPendingFinaleAction('open-voting'); }}>开启新一轮投票</button>{(data.game?.voting_round ?? 0) > 0 && <button type="button" className="finale-publish-button" disabled={busy || offline} onClick={() => { setPendingStage(''); setPendingFinaleAction('publish-results'); }}>公布身份并结算</button>}</>}</div>}
      {!data.game?.results_visible && !data.game?.voting_open && data.game?.stage !== 'group_game' && data.game?.stage !== 'voting' && <p className="muted">请先在上方把婚礼流程切换到“团队挑战”，再开启最终投票。</p>}
      {pendingFinaleAction && <section className="finale-confirmation" role="dialog" aria-label="确认主持人终局操作"><div><small>请确认现场操作</small><strong>{pendingFinaleAction === 'open-voting' ? '开启新一轮最终投票' : pendingFinaleAction === 'close-voting' ? '关闭本轮最终投票' : '公布身份并结算全部积分'}</strong><p>{pendingFinaleAction === 'open-voting' ? '系统会关闭宾客注册并创建新一轮投票，每位宾客只能提交一次。' : pendingFinaleAction === 'close-voting' ? `当前已有 ${data.voteCount} 人投票。关闭后可检查结果，再决定是否公布结算。` : `当前已有 ${data.voteCount} 人投票。确认后将公开恶作剧者，并一次性结算个人、团队与第二阶段奖励。`}</p></div><div><button type="button" disabled={busy} onClick={() => void runFinaleAction(pendingFinaleAction)}>{busy ? '处理中…' : '确认执行'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPendingFinaleAction(null)}>取消</button></div></section>}
      {data.game?.results_visible && <><div className="control-state on">结算具有幂等保护，重复刷新不会再次加分。</div><section className="host-final-rankings" aria-label="最终积分排名"><div className="section-heading"><div><small>FINAL RANKING</small><h3>最终积分排名</h3></div></div><div className="host-team-ranking">{data.rankings.teams.filter((team) => TEAMS.includes(team.team as typeof TEAMS[number])).map((team, index) => <article key={team.team}><b>{index + 1}</b><div><strong>{team.team}</strong><small>团队挑战与终局奖励</small></div><span>{team.points} 分</span></article>)}</div><h4>个人积分 TOP {Math.min(10, data.rankings.personal.length)}</h4>{data.rankings.personal.length ? <ol className="host-personal-ranking">{data.rankings.personal.map((guest, index) => <li key={guest.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{guest.name}</strong><small>{guest.team} · 完成 {guest.completedTasks} 项任务</small></div><span>{guest.points} 分</span></li>)}</ol> : <div className="empty-state">尚无个人积分。</div>}</section></>}
    </section>}
  </main>;
}
