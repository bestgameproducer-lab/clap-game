'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StaffLogoutButton } from '../staff-logout-button';
import { useLiveRefresh } from '@/lib/use-live-refresh';

const STAGES = [
  ['registration', '宾客报到'],
  ['waiting', '等待开场'], ['task_round_1', '第一轮任务'], ['task_round_2', '第二轮任务'],
  ['group_game', '团队挑战'], ['voting', '最终投票'], ['results', '身份揭晓'],
] as const;
const TEAMS = ['玫瑰组', '月桂组', '星辰组', '琥珀组'] as const;
const HOST_CACHE_KEY = 'wedding-host-private-cache-v2';
const HOST_CACHE_KEYS = ['wedding-host-private-cache-v1', HOST_CACHE_KEY];

type Segment = {
  id: string; title: string; stage: string; public_prompt: string; host_notes: string; correct_answer: string;
  public_clue: string; timer_minutes: number; sort_order: number; ready: boolean; active: boolean; updated_at: string;
};
type HostData = {
  segments: Segment[];
  game: { stage: string; registration_open: boolean; voting_open: boolean; voting_round: number; results_visible: boolean; scoreboard_visible: boolean; current_host_segment_id: string | null; display_title: string | null; timer_ends_at: string | null } | null;
  teamPoints: Array<{ id: number; team: string; amount: number; reason: string; created_at: string }>;
  resources: Array<{ team: string; balance: number; updated_at: string }>;
  resourceLedger: Array<{ id: number; team: string; amount: number; balance_after: number; reason: string; actor: string; created_at: string }>;
  drawnGuestCount: number;
  voteCount: number;
  voteCounts: Array<{ guest: { id: string; name: string; team: string }; count: number }>;
};
type SegmentForm = { title: string; stage: string; publicPrompt: string; hostNotes: string; correctAnswer: string; publicClue: string; timerMinutes: string; sortOrder: string; ready: boolean };

const EMPTY_FORM: SegmentForm = { title: '', stage: 'group_game', publicPrompt: '', hostNotes: '', correctAnswer: '', publicClue: '', timerMinutes: '2', sortOrder: '500', ready: false };

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }
function clearHostCache() { try { for (const key of HOST_CACHE_KEYS) window.sessionStorage.removeItem(key); } catch {} }

export default function HostPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<HostData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState<SegmentForm>(EMPTY_FORM);
  const [teamScore, setTeamScore] = useState({ team: '玫瑰组', amount: '5', reason: '团队游戏第一名' });
  const [resourceForm, setResourceForm] = useState({ team: '玫瑰组', amount: '-1', reason: '竞拍道具成交' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const loadRequestRef = useRef(0);

  async function load(preferredId?: string, interactive = false) {
    const requestId = ++loadRequestRef.current;
    if (interactive) setSyncing(true);
    try {
      const response = await fetch('/api/host-data', { cache: 'no-store' });
      if (requestId !== loadRequestRef.current) return;
      if (response.status === 401) { clearHostCache(); setData(null); setOffline(false); return; }
      const body = await responseBody(response);
      if (!response.ok) throw new Error(body.error || '主持人数据加载失败');
      setData(body);
      try { window.sessionStorage.setItem(HOST_CACHE_KEY, JSON.stringify(body)); } catch {}
      setOffline(false); setError('');
      setSelectedId((current) => preferredId || current || body.segments?.[0]?.id || 'new');
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setOffline(true); setError(cause instanceof Error ? cause.message : '主持人数据加载失败');
      try {
        const cached = window.sessionStorage.getItem(HOST_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached) as HostData;
          setData((current) => current ?? parsed);
          setSelectedId((current) => preferredId || current || parsed.segments?.[0]?.id || 'new');
        }
      } catch {
        clearHostCache();
      }
    } finally { if (interactive) setSyncing(false); }
  }

  useEffect(() => {
    void load();
  }, []);
  useLiveRefresh(() => load(), undefined, Boolean(data));

  const selected = useMemo(() => data?.segments.find((segment) => segment.id === selectedId) || null, [data, selectedId]);
  const selectedSignature = JSON.stringify(selected ?? null);
  useEffect(() => {
    if (!selected) { if (selectedId === 'new') setForm(EMPTY_FORM); return; }
    setForm({ title: selected.title, stage: selected.stage, publicPrompt: selected.public_prompt, hostNotes: selected.host_notes, correctAnswer: selected.correct_answer, publicClue: selected.public_clue, timerMinutes: String(selected.timer_minutes), sortOrder: String(selected.sort_order), ready: selected.ready });
  }, [selectedId, selectedSignature]);

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

  async function hostAction(body: Record<string, unknown>, success: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，只能查看最近同步的主持内容'); return false; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/host-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success); await load(result.id || selectedId); return true;
    } catch (cause) { setOffline(!navigator.onLine); setError(cause instanceof Error ? cause.message : '操作失败'); return false; }
    finally { setBusy(false); }
  }

  async function adminAction(body: Record<string, unknown>, success: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能记录团队积分'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await responseBody(response);
      if (!response.ok) throw new Error(result.error || '操作失败');
      setMessage(success); await load();
    } catch (cause) { setOffline(!navigator.onLine); setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">HOST ONLY</div><div className="heart-mark">♡</div><h1>主持人<br/>流程台</h1><p className="lead">私密查看台词和答案，一键控制公开大屏。</p><form onSubmit={login}><label htmlFor="host-password">管理员密码</label><input id="host-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入主持人流程台'}</button>{error && <div className="notice error">{error}</div>}</form></section></main>;

  const teamTotals = TEAMS.map((team) => ({ team, points: data.teamPoints.filter((entry) => entry.team === team).reduce((sum, entry) => sum + entry.amount, 0) }));
  const isCurrent = Boolean(selected && data.game?.current_host_segment_id === selected.id);
  const currentStageLabel = STAGES.find(([value]) => value === data.game?.stage)?.[1] || data.game?.stage || '未设置';

  return <main className="host-shell">
    <header className="host-hero"><div><div className="eyebrow">PRIVATE HOST VIEW</div><h1>主持人流程台</h1><p>正确答案只在这里显示，不会发送给宾客或公开大屏。</p></div><div className="host-links"><a href="/scoreboard" target="_blank" rel="noreferrer">打开大屏 ↗</a><a href="/admin">主办方后台</a><StaffLogoutButton clearSessionStorageKeys={HOST_CACHE_KEYS}/></div></header>
    {offline && <div className="connection-banner offline" role="status"><span>离线只读 · 正在显示本标签页最近同步的私密主持内容，发布与计分已禁用</span><button className="mini-button" disabled={syncing} onClick={() => void load(undefined, true)}>{syncing ? '重连中…' : '重新连接'}</button></div>}
    {message && <div className="notice success sticky-notice">{message}</div>}{error && <div className="notice error sticky-notice">{error}</div>}
    <section className="section-card host-status-card"><div className="section-heading"><div><small>LIVE OPERATIONS</small><h2>现场流程状态</h2></div><span className={data.game?.results_visible ? 'ready-badge' : ''}>{data.game?.results_visible ? '身份已揭晓' : '身份保密中'}</span></div><div className="host-status-grid"><div><span>当前阶段</span><strong>{currentStageLabel}</strong></div><div><span>公开大屏</span><strong>{data.game?.scoreboard_visible ? '已开放' : '未开放'}</strong></div><div><span>宾客注册</span><strong>{data.game?.registration_open ? '开放中' : '已关闭'}</strong></div><div><span>第 {data.game?.voting_round || 0} 轮投票</span><strong>{data.game?.voting_open ? `${data.voteCount}/${data.drawnGuestCount} 已投` : data.game?.results_visible ? '已锁定' : '未开放'}</strong></div></div>{data.game?.display_title && <p className="host-screen-now"><span>大屏当前内容</span><strong>{data.game.display_title}</strong></p>}{data.game?.results_visible ? (data.voteCounts.length > 0 ? <div className="host-vote-summary"><h3>揭晓票数</h3>{data.voteCounts.map((item) => <div key={item.guest.id}><span>{item.guest.name}<small>{item.guest.team}</small></span><strong>{item.count} 票</strong></div>)}</div> : <div className="empty-state">本轮没有投票。</div>) : <p className="field-help">票数排名会在身份揭晓后显示；投票期间这里只显示完成人数，避免影响主持判断。</p>}</section>
    <div className="host-layout">
      <aside className="host-queue section-card"><div className="section-heading"><div><small>RUN OF SHOW</small><h2>流程题库</h2></div><button className="mini-button" onClick={() => setSelectedId('new')}>＋ 新建</button></div><div className="host-segment-list">{data.segments.map((segment, index) => <button key={segment.id} className={`${selectedId === segment.id ? 'selected' : ''} ${data.game?.current_host_segment_id === segment.id ? 'current' : ''}`} onClick={() => setSelectedId(segment.id)}><b>{String(index + 1).padStart(2, '0')}</b><span><strong>{segment.title}</strong><small>{STAGES.find(([value]) => value === segment.stage)?.[1] || segment.stage} · {segment.ready ? '可发布' : '待完善'}</small></span></button>)}</div></aside>
      <section className="host-editor section-card"><div className="section-heading"><div><small>{isCurrent ? 'NOW ON SCREEN' : selected ? 'EDIT SEGMENT' : 'NEW SEGMENT'}</small><h2>{isCurrent ? '当前已发布环节' : selected ? '编辑主持环节' : '新建主持环节'}</h2></div>{isCurrent && <span className="ready-badge">LIVE</span>}</div>
        <form onSubmit={(event) => { event.preventDefault(); void hostAction({ type: 'saveSegment', segmentId: selected?.id || null, ...form, timerMinutes: Number(form.timerMinutes), sortOrder: Number(form.sortOrder) }, '主持环节已保存'); }}>
          <div className="form-grid"><div><label htmlFor="host-title">环节标题</label><input id="host-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={120} required/></div><div><label htmlFor="host-stage">对应阶段</label><select id="host-stage" value={form.stage} onChange={(event) => setForm({ ...form, stage: event.target.value })}>{STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
          <label htmlFor="host-public">公开题目或规则</label><textarea id="host-public" value={form.publicPrompt} onChange={(event) => setForm({ ...form, publicPrompt: event.target.value })} maxLength={1000} required/><p className="field-help">这段文字会出现在投影大屏上。</p>
          <div className="private-fields"><div className="private-label">PRIVATE · 仅主持人可见</div><label htmlFor="host-notes">主持词与操作提示</label><textarea id="host-notes" value={form.hostNotes} onChange={(event) => setForm({ ...form, hostNotes: event.target.value })} maxLength={2000}/><label htmlFor="host-answer">正确答案与判分口径</label><textarea id="host-answer" value={form.correctAnswer} onChange={(event) => setForm({ ...form, correctAnswer: event.target.value })} maxLength={2000} placeholder="允许发布前必须填写；规则页可填写“主持人确认规则已宣读”。"/></div>
          <label htmlFor="host-clue">可公开线索</label><input id="host-clue" value={form.publicClue} onChange={(event) => setForm({ ...form, publicClue: event.target.value })} maxLength={500} placeholder="留空则大屏不显示线索"/>
          <div className="form-grid"><div><label htmlFor="host-timer">倒计时（分钟）</label><input id="host-timer" type="number" min={0} max={120} value={form.timerMinutes} onChange={(event) => setForm({ ...form, timerMinutes: event.target.value })}/></div><div><label htmlFor="host-order">流程顺序</label><input id="host-order" type="number" min={0} max={9999} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}/></div></div>
          <label className="ready-check"><input type="checkbox" checked={form.ready} onChange={(event) => setForm({ ...form, ready: event.target.checked })}/><span><strong>允许发布到大屏</strong><small>勾选前请确认正确答案和公开内容已经复核。</small></span></label>
          <div className="host-editor-actions"><button disabled={busy || offline}>保存环节</button><button type="button" className="secondary" disabled={busy || offline || !selected || !form.ready} onClick={() => { if (selected && window.confirm(`确认把“${selected.title}”发布到大屏并启动倒计时？`)) void hostAction({ type: 'publishSegment', segmentId: selected.id }, '环节已发布到大屏'); }}>{offline ? '联网后可发布' : form.ready ? '发布到大屏' : '完善答案后发布'}</button></div>
        </form>
      </section>
    </div>
    <section className="section-card host-resource-card"><div className="section-heading"><div><small>CUPID COINS</small><h2>资源竞拍钱包</h2></div><span>每队初始 10 枚</span></div><p className="muted">成交时输入负数扣除金币，返还或奖励输入正数。余额不能低于 0，金币不会计入团队积分。</p><div className="resource-balance-grid">{TEAMS.map((team) => <div key={team}><span>{team}</span><strong>{data.resources.find((wallet) => wallet.team === team)?.balance ?? 10}<small> 枚</small></strong></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void hostAction({ type: 'adjustResources', team: resourceForm.team, amount: Number(resourceForm.amount), reason: resourceForm.reason, eventKey: crypto.randomUUID() }, '丘比特金币已记录'); }}><div className="form-grid"><div><label htmlFor="resource-team">组别</label><select id="resource-team" value={resourceForm.team} onChange={(event) => setResourceForm({ ...resourceForm, team: event.target.value })}>{TEAMS.map((team) => <option key={team}>{team}</option>)}</select></div><div><label htmlFor="resource-amount">金币变化</label><input id="resource-amount" type="number" min={-100} max={100} value={resourceForm.amount} onChange={(event) => setResourceForm({ ...resourceForm, amount: event.target.value })} required/></div></div><label htmlFor="resource-reason">成交或调整原因</label><input id="resource-reason" value={resourceForm.reason} onChange={(event) => setResourceForm({ ...resourceForm, reason: event.target.value })} maxLength={200} required/><div className="score-presets"><button type="button" onClick={() => setResourceForm({ ...resourceForm, amount: '-1', reason: '竞拍道具成交' })}>扣 1 枚</button><button type="button" onClick={() => setResourceForm({ ...resourceForm, amount: '-3', reason: '竞拍道具成交' })}>扣 3 枚</button><button type="button" onClick={() => setResourceForm({ ...resourceForm, amount: '1', reason: '主持人返还金币' })}>返还 1 枚</button></div><button disabled={busy || offline || !resourceForm.amount || Number(resourceForm.amount) === 0 || !resourceForm.reason.trim()}>{offline ? '联网后可记录' : '保存金币变化'}</button></form>{data.resourceLedger.length > 0 && <div className="resource-history"><h3>最近记录</h3>{data.resourceLedger.slice(0, 10).map((entry) => <div key={entry.id}><span>{entry.team}</span><p>{entry.reason}<small>{new Date(entry.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</small></p><strong className={entry.amount > 0 ? 'amount-positive' : 'amount-negative'}>{entry.amount > 0 ? '+' : ''}{entry.amount} → {entry.balance_after}</strong></div>)}</div>}</section>

    <section className="section-card host-score-card"><div className="section-heading"><div><small>QUICK TEAM SCORE</small><h2>现场团队计分</h2></div></div><div className="team-total-list">{teamTotals.map((item) => <div key={item.team}><strong>{item.team}</strong><span>{item.points > 0 ? '+' : ''}{item.points} 团队分</span></div>)}</div><form onSubmit={(event) => { event.preventDefault(); void adminAction({ type: 'adjustTeamPoints', team: teamScore.team, amount: Number(teamScore.amount), reason: teamScore.reason }, '团队积分已记录'); }}><select aria-label="计分组别" value={teamScore.team} onChange={(event) => setTeamScore({ ...teamScore, team: event.target.value })}>{TEAMS.map((team) => <option key={team}>{team}</option>)}</select><input aria-label="团队分数" type="number" min={-1000} max={1000} value={teamScore.amount} onChange={(event) => setTeamScore({ ...teamScore, amount: event.target.value })}/><input aria-label="计分原因" value={teamScore.reason} onChange={(event) => setTeamScore({ ...teamScore, reason: event.target.value })} maxLength={200}/><div className="score-presets"><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '5', reason: '团队游戏第一名' })}>第一名 +5</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '3', reason: '团队游戏第二名' })}>第二名 +3</button><button type="button" onClick={() => setTeamScore({ ...teamScore, amount: '1', reason: '团队游戏第三名' })}>第三名 +1</button></div><button disabled={busy || offline || !teamScore.amount || !teamScore.reason.trim()}>{offline ? '联网后可记录' : '记录分数'}</button></form></section>
  </main>;
}
