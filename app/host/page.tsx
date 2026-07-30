'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StaffLogoutButton } from '../staff-logout-button';
import { createEventKey } from '@/lib/event-key';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const TEAMS = ['玫瑰组', '月桂组', '星辰组', '琥珀组'] as const;
const HOST_CACHE_KEY = 'wedding-host-score-cache-v1';
const HOST_CACHE_KEYS = ['wedding-host-private-cache-v1', 'wedding-host-private-cache-v2', HOST_CACHE_KEY];

type Guest = {
  id: string;
  name: string;
  team: string;
  points: number;
  participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST';
  special_card_title: string;
};

type HostData = {
  guests: Guest[];
  teamPoints: Array<{ id: number; team: string; amount: number; reason: string; created_at: string }>;
  personalPoints: Array<{ id: string; guest_id: string; amount: number; reason: string; created_at: string; guest: { id: string; name: string } | null }>;
};

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }
function clearHostCache() { try { for (const key of HOST_CACHE_KEYS) window.sessionStorage.removeItem(key); } catch {} }

export default function HostPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<HostData | null>(null);
  const [mode, setMode] = useState<'team' | 'guest'>('team');
  const [teamForm, setTeamForm] = useState({ team: '玫瑰组', amount: '1', reason: '主持人现场奖励' });
  const [guestForm, setGuestForm] = useState({ guestId: '', amount: '1', reason: '主持人现场奖励' });
  const [guestSearch, setGuestSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
      setGuestForm((current) => ({ ...current, guestId: current.guestId || body.guests?.[0]?.id || '' }));
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
          setGuestForm((current) => ({ ...current, guestId: current.guestId || parsed.guests?.[0]?.id || '' }));
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

  const filteredGuests = useMemo(() => {
    const term = guestSearch.trim().toLocaleLowerCase();
    if (!term) return data?.guests ?? [];
    return (data?.guests ?? []).filter((guest) => `${guest.name} ${guest.team} ${guest.special_card_title}`.toLocaleLowerCase().includes(term));
  }, [data?.guests, guestSearch]);
  const effectiveGuestId = filteredGuests.some((guest) => guest.id === guestForm.guestId) ? guestForm.guestId : filteredGuests[0]?.id || '';
  const selectedGuest = data?.guests.find((guest) => guest.id === effectiveGuestId) ?? null;
  const teamTotals = TEAMS.map((team) => ({ team, points: (data?.teamPoints ?? []).filter((entry) => entry.team === team).reduce((sum, entry) => sum + entry.amount, 0) }));

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">HOST ONLY</div><div className="heart-mark">♡</div><h1>主持人<br/>计分台</h1><p className="lead">现场只开放团队加分与个人加分。</p><form onSubmit={login}><label htmlFor="host-password">管理员密码</label><input id="host-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入主持人计分台'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  return <main className="host-shell host-score-shell">
    <header className="host-hero host-score-hero"><div><div className="eyebrow">LIVE SCORE DESK</div><h1>主持人计分台</h1><p>个人加分同步给对应宾客，团队加分进入团队积分榜。</p></div><StaffLogoutButton clearSessionStorageKeys={HOST_CACHE_KEYS}/></header>
    {offline && <div className="connection-banner offline" role="status"><span>离线只读 · 加分功能暂时停用</span><button className="mini-button" disabled={syncing} onClick={() => void load(true)}>{syncing ? '重连中…' : '重新连接'}</button></div>}
    {message && <div className="notice success sticky-notice" role="status">{message}</div>}
    {error && <div className="notice error sticky-notice" role="alert">{error}</div>}

    <nav className="host-score-tabs" aria-label="计分类型"><button className={mode === 'team' ? 'active' : ''} aria-pressed={mode === 'team'} onClick={() => { setMode('team'); setMessage(''); setError(''); }}>团队加分</button><button className={mode === 'guest' ? 'active' : ''} aria-pressed={mode === 'guest'} onClick={() => { setMode('guest'); setMessage(''); setError(''); }}>个人加分</button></nav>

    {mode === 'team' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>TEAM SCORE</small><h2>给团队加分</h2></div></div>
      <div className="team-total-list">{teamTotals.map((item) => <button type="button" className={teamForm.team === item.team ? 'selected' : ''} key={item.team} onClick={() => setTeamForm({ ...teamForm, team: item.team })}><strong>{item.team}</strong><span>{item.points} 分</span></button>)}</div>
      <form onSubmit={(event) => { event.preventDefault(); void addScore({ type: 'adjustTeamPoints', team: teamForm.team, amount: Number(teamForm.amount), reason: teamForm.reason }, `${teamForm.team} 已加 ${teamForm.amount} 分`); }}>
        <label htmlFor="team-score-amount">增加分数</label><input id="team-score-amount" type="number" inputMode="numeric" min={1} max={100} value={teamForm.amount} onChange={(event) => setTeamForm({ ...teamForm, amount: event.target.value })} required/>
        <div className="score-presets">{[1,2,3,5,10].map((amount) => <button type="button" className={Number(teamForm.amount) === amount ? 'selected' : ''} key={amount} onClick={() => setTeamForm({ ...teamForm, amount: String(amount) })}>+{amount}</button>)}</div>
        <label htmlFor="team-score-reason">加分原因</label><input id="team-score-reason" value={teamForm.reason} onChange={(event) => setTeamForm({ ...teamForm, reason: event.target.value })} maxLength={200} required/>
        <button disabled={busy || offline || Number(teamForm.amount) < 1 || Number(teamForm.amount) > 100 || !teamForm.reason.trim()}>{busy ? '保存中…' : `确认给${teamForm.team}加 ${teamForm.amount || 0} 分`}</button>
      </form>
      {data.teamPoints.length > 0 && <details className="score-history"><summary>查看最近团队加分</summary>{data.teamPoints.slice(0,10).map((entry) => <div key={entry.id}><span><strong>{entry.team}</strong><small>{entry.reason}</small></span><b>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</details>}
    </section> : <section className="section-card host-score-panel"><div className="section-heading"><div><small>PERSONAL SCORE</small><h2>给宾客个人加分</h2></div></div>
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
    </section>}
  </main>;
}
