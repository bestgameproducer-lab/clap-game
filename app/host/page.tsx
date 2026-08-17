'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { StaffLogoutButton } from '../staff-logout-button';
import { createEventKey } from '@/lib/event-key';
import { GAME_STAGE_OPTIONS, gameStageCopy, isNextLiveGameStage } from '@/lib/game-stages';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { WeddingSignature } from '../wedding-signature';
import { requiredTeamClueCount } from '@/lib/team-clue-readiness';

const TEAMS = ['海岛组', '沙漠组'] as const;
const HOST_CACHE_KEYS = ['wedding-host-private-cache-v1', 'wedding-host-private-cache-v2', 'wedding-host-score-cache-v1', 'wedding-host-score-cache-v2'];

type Guest = {
  id: string;
  name: string;
  team: string;
  role: 'guest' | 'spy';
  is_hidden_spy: boolean;
  points: number;
  participation_mode: 'ACTIVE_PLAYER' | 'HONOR_GUEST' | 'PRINCIPAL';
  phase_two_eligible: boolean;
  special_card_title: string;
  eligible_for_personal_score: boolean;
  drawn_at: string | null;
  special_card_revealed_at: string | null;
};

type HostData = {
  guests: Guest[];
  teamPoints: Array<{ id: number; team: string; amount: number; reason: string; created_at: string }>;
  personalPoints: Array<{ id: string; guest_id: string; amount: number; reason: string; created_at: string; guest: { id: string; name: string } | null }>;
  ceremonyAssignments: Array<{ id: string; status: string; ceremony_status: string | null; ring_variant: 'GROOM_RING' | 'BRIDE_RING' | null; guest: { id: string; name: string } | null; task: { title: string; mission_code: string | null; category: string } | null }>;
  game: { stage: string; voting_open: boolean; voting_round: number; results_visible: boolean; results_published_at: string | null; team_clues_settled_at: string | null; team_score_snapshot: Record<string, number> | null; rehearsal_run_id: string } | null;
  finalLocked: boolean;
  voteCount: number;
  teamClueCounts: Record<string, number>;
  rankings: {
    personal: Array<{ id: string; name: string; team: string; points: number; completedTasks: number; undetectedTrickster: boolean }>;
    teams: Array<{ team: string; points: number; guests: number; completedTasks: number }>;
  };
  finale: {
    tricksters: Array<{ id: string; name: string; team: string; escaped: boolean }>;
    voteCounts: Array<{ id: string; name: string; team: string; votes: number; voters: Array<{ id: string; name: string; team: string; votes: number }> }>;
  };
};

type FinaleAction = 'settle-team-clues' | 'open-voting' | 'close-voting' | 'publish-results';
const HOST_STAGE_OPTIONS = GAME_STAGE_OPTIONS.filter(([stage]) => !['voting', 'results'].includes(stage));

async function responseBody(response: Response) { try { return await response.json(); } catch { return {}; } }
function clearHostCache() { try { for (const key of HOST_CACHE_KEYS) window.sessionStorage.removeItem(key); } catch {} }

export default function HostPage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState<HostData | null>(null);
  const [mode, setMode] = useState<'overview' | 'team' | 'guest' | 'finale'>('overview');
  const [teamForm, setTeamForm] = useState({ team: '海岛组', amount: '1', reason: '主持人现场计分' });
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
      if (!response.ok) throw new Error(body.error || '主持人数据加载失败');
      setData(body);
      setGuestForm((current) => ({ ...current, guestId: current.guestId || body.guests?.find((guest: Guest) => guest.eligible_for_personal_score)?.id || '' }));
      setOffline(false); setError('');
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setOffline(true); setError(cause instanceof Error ? cause.message : '主持人数据加载失败');
      // Keep an already-rendered dashboard in memory for a brief connection
      // loss, but never restore private identities from disk.  After a reset
      // or page reload the current run must be confirmed by the server.
      clearHostCache();
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
    let responseReceived = false;
    try {
      const signature = JSON.stringify(body);
      const pending = pendingScoreRef.current?.signature === signature
        ? pendingScoreRef.current
        : { signature, eventKey: createEventKey() };
      pendingScoreRef.current = pending;
      const response = await fetch('/api/host-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, eventKey: pending.eventKey, rehearsalRunId: data?.game?.rehearsal_run_id }) });
      responseReceived = true;
      const result = await responseBody(response);
      if (response.status === 401) { clearHostCache(); setData(null); }
      if (!response.ok) throw new Error(result.error || '加分失败');
      pendingScoreRef.current = null;
      setMessage(`${success} · 当前 ${result.total} 分`); await load();
    } catch (cause) { if (!responseReceived) setOffline(true); setError(cause instanceof Error ? cause.message : '加分失败'); }
    finally { setBusy(false); }
  }

  async function runFinaleAction(finaleAction: FinaleAction) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能操作终局流程'); return; }
    if (finaleAction === 'publish-results' && data?.game?.voting_open) {
      setPendingFinaleAction(null);
      setError('投票仍在开放中；请先关闭本轮投票，再公布身份。');
      return;
    }
    const request = finaleAction === 'settle-team-clues'
      ? { type: 'settleTeamClues' }
      : finaleAction === 'open-voting'
      ? { type: 'toggleVoting', value: true }
      : finaleAction === 'close-voting'
        ? { type: 'toggleVoting', value: false }
        : { type: 'publishResults' };
    const success = finaleAction === 'settle-team-clues'
      ? '团队积分已结算，排名线索已自动发放'
      : finaleAction === 'open-voting'
      ? '新一轮最终投票已开启'
      : finaleAction === 'close-voting'
        ? '本轮最终投票已关闭'
        : '身份已公布，终局个人奖励已结算；团队挑战分保持锁定';
    setBusy(true); setError(''); setMessage('');
    let responseReceived = false;
    try {
      const response = await fetch('/api/host-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      responseReceived = true;
      const result = await responseBody(response);
      if (response.status === 401) { clearHostCache(); setData(null); }
      if (!response.ok) throw new Error(result.error || '终局操作失败');
      setPendingFinaleAction(null); setMessage(success); await load();
    } catch (cause) { if (!responseReceived) setOffline(true); setError(cause instanceof Error ? cause.message : '终局操作失败'); }
    finally { setBusy(false); }
  }

  async function runStageChange(stage: string) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能切换婚礼流程'); return; }
    setBusy(true); setError(''); setMessage('');
    let responseReceived = false;
    try {
      const response = await fetch('/api/host-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'setStage', stage, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      responseReceived = true;
      const result = await responseBody(response);
      if (response.status === 401) { clearHostCache(); setData(null); }
      if (!response.ok) throw new Error(result.error || '婚礼流程切换失败');
      setPendingStage(''); setPendingFinaleAction(null); setMessage(`已切换到「${gameStageCopy(stage).label}」`); await load();
    } catch (cause) { if (!responseReceived) setOffline(true); setError(cause instanceof Error ? cause.message : '婚礼流程切换失败'); }
    finally { setBusy(false); }
  }

  async function completeCeremonyAssignment(assignmentId: string, ringVariant: string | null) {
    if (!navigator.onLine) { setOffline(true); setError('当前离线，联网后才能确认仪式任务'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/host-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'completeCeremonyAssignment', assignmentId, ringVariant, rehearsalRunId: data?.game?.rehearsal_run_id }),
      });
      const result = await responseBody(response);
      if (response.status === 401) { clearHostCache(); setData(null); }
      if (!response.ok) throw new Error(result.error || '仪式任务确认失败');
      setMessage('仪式任务已确认完成，积分已自动记录');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '仪式任务确认失败'); }
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
  const teamTotals = TEAMS.map((team) => ({ team, points: data?.game?.team_score_snapshot && data.game.team_clues_settled_at ? Number(data.game.team_score_snapshot[team] ?? 0) : (data?.teamPoints ?? []).filter((entry) => entry.team === team).reduce((sum, entry) => sum + entry.amount, 0) }));
  const competitiveDrawn = (data?.guests ?? []).filter((guest) => guest.participation_mode === 'ACTIVE_PLAYER'
    && guest.phase_two_eligible && TEAMS.includes(guest.team as typeof TEAMS[number]) && guest.drawn_at).length;
  const missingFinalVotes = Math.max(competitiveDrawn - (data?.voteCount ?? 0), 0);
  const topTeamScore = Math.max(...teamTotals.map((entry) => entry.points));
  const teamSettlementChecks = TEAMS.map((team) => ({
    team,
    spies: (data?.guests ?? []).filter((guest) => guest.participation_mode === 'ACTIVE_PLAYER'
      && guest.phase_two_eligible && guest.team === team && guest.drawn_at && guest.role === 'spy' && !guest.is_hidden_spy).length,
    clues: data?.teamClueCounts?.[team] ?? 0,
    requiredClues: requiredTeamClueCount(teamTotals.find((entry) => entry.team === team)?.points ?? 0, topTeamScore),
    scoreRecorded: (data?.teamPoints ?? []).some((entry) => entry.team === team),
  }));
  const hasBothTeamScores = teamSettlementChecks.every((check) => check.scoreRecorded);
  const teamSettlementReady = competitiveDrawn === 20 && hasBothTeamScores
    && teamSettlementChecks.every((check) => check.spies === 1 && check.clues >= check.requiredClues);
  const teamSettlementStatus = `${competitiveDrawn}/20 人已抽卡 · ${teamSettlementChecks.map((check) => `${check.team}：成绩${check.scoreRecorded ? '已记录' : '未记录'}、恶作剧者 ${check.spies}/1、线索 ${check.clues}/${check.requiredClues}`).join(' · ')}`;
  const finalLocked = Boolean(data?.finalLocked);
  const currentStageIndex = HOST_STAGE_OPTIONS.findIndex(([stage]) => stage === data?.game?.stage);
  const nextStage = currentStageIndex >= 0 ? HOST_STAGE_OPTIONS[currentStageIndex + 1] : null;
  const hostGuidance = finalLocked
    ? data?.game?.results_visible
      ? { eyebrow: '流程已完成', title: '身份与积分已经公布', detail: '现在可以带领宾客查看最终排名与婚礼荣誉。', action: '查看最终排名', mode: 'finale' as const }
      : { eyebrow: '终局已锁定', title: '终局奖励已经生成', detail: '计分与流程操作已停止；公开状态尚未同步，请联系主控核对终局状态。', action: '查看终局状态', mode: 'finale' as const }
    : data?.game?.voting_open
      ? { eyebrow: '当前进行中', title: `第 ${data.game.voting_round} 轮最终投票`, detail: `${data.voteCount}/${competitiveDrawn} 人已提交；确认人数后关闭投票，再公布身份。`, action: '管理投票', mode: 'finale' as const }
      : data?.game?.stage === 'group_game' && !hasBothTeamScores
        ? { eyebrow: '下一步建议', title: '记录团队挑战成绩', detail: '先为各队记录最终成绩，0 分也需要明确记录；随后才能结算并自动发放线索。', action: '前往团队计分', mode: 'team' as const }
        : data?.game?.stage === 'group_game' && !data.game.team_clues_settled_at
          ? { eyebrow: '下一步建议', title: '结算团队积分并发放线索', detail: teamSettlementReady ? '结算条件已齐备，可以继续进入最终投票。' : '仍有结算条件未满足，请先检查现场配置。', action: '前往流程控制', mode: 'finale' as const }
          : data?.game?.stage === 'group_game' && data.game.team_clues_settled_at
            ? { eyebrow: '下一步建议', title: '开启最终投票', detail: '团队线索已经发放，可以邀请宾客作出最终判断。', action: '前往流程控制', mode: 'finale' as const }
            : nextStage
              ? { eyebrow: '下一步建议', title: `进入${gameStageCopy(nextStage[0]).title}`, detail: gameStageCopy(nextStage[0]).note, action: '确认下一环节', mode: 'finale' as const, stage: nextStage[0] }
              : { eyebrow: '当前流程', title: gameStageCopy(data?.game?.stage).label, detail: gameStageCopy(data?.game?.stage).note, action: '查看流程控制', mode: 'finale' as const };

  function openHostGuidance() {
    setMode(hostGuidance.mode);
    if ('stage' in hostGuidance && hostGuidance.stage) setPendingStage(hostGuidance.stage);
    window.requestAnimationFrame(() => document.querySelector('.host-score-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">HOST ONLY</div><WeddingSignature compact/><div className="heart-mark">♡</div><h1>主持人<br/>流程台</h1><p className="lead">查看全员分组、积分和恶作剧者，并处理现场加分。</p><div className="staff-privacy-note">包含隐藏身份 · 仅限主持人与主办方查看</div><form onSubmit={login}><label htmlFor="host-password">管理员密码</label><input id="host-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/><button disabled={busy}>{busy ? '登录中…' : '进入主持人流程台'}</button>{error && <div className="notice error" role="alert">{error}</div>}</form></section></main>;

  return <main className="host-shell host-score-shell">
    <header className="host-hero host-score-hero"><div><div className="eyebrow">LIVE HOST DESK</div><WeddingSignature inverse compact/><h1>主持人流程台</h1><p>身份信息仅供主持人与主办方现场查看，请勿投屏。</p></div><StaffLogoutButton clearSessionStorageKeys={HOST_CACHE_KEYS}/></header>
    {offline && <div className="connection-banner offline" role="status"><span>离线只读 · 加分功能暂时停用</span><button className="mini-button" disabled={syncing} onClick={() => void load(true)}>{syncing ? '重连中…' : '重新连接'}</button></div>}
    {message && <div className="notice success sticky-notice" role="status"><span>{message}</span><button type="button" aria-label="关闭成功提示" onClick={() => setMessage('')}>×</button></div>}
    {error && <div className="notice error sticky-notice" role="alert"><span>{error}</span><button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>×</button></div>}

    <section className="host-guidance-card" aria-label="主持人下一步"><div><small>{hostGuidance.eyebrow}</small><strong>{hostGuidance.title}</strong><p>{hostGuidance.detail}</p></div><button type="button" onClick={openHostGuidance}>{hostGuidance.action}<span aria-hidden="true">→</span></button></section>

    <nav className="host-score-tabs" aria-label="主持人功能"><button className={mode === 'overview' ? 'active' : ''} aria-pressed={mode === 'overview'} onClick={() => { setMode('overview'); setMessage(''); setError(''); }}>全员总览</button><button className={mode === 'team' ? 'active' : ''} aria-pressed={mode === 'team'} onClick={() => { setMode('team'); setMessage(''); setError(''); }}>团队计分</button><button className={mode === 'guest' ? 'active' : ''} aria-pressed={mode === 'guest'} onClick={() => { setMode('guest'); setMessage(''); setError(''); }}>个人加分</button><button className={mode === 'finale' ? 'active' : ''} aria-pressed={mode === 'finale'} onClick={() => { setMode('finale'); setMessage(''); setError(''); }}>流程控制</button></nav>

    {mode === 'overview' && data.ceremonyAssignments.length > 0 && <section className="section-card host-score-panel"><div className="section-heading"><div><small>CEREMONY CHECK</small><h2>仪式任务确认</h2></div><span>{data.ceremonyAssignments.filter((assignment) => assignment.status === 'approved').length}/{data.ceremonyAssignments.length}</span></div><p className="muted">宾客端无需提交。仪式完成后由主持人在这里确认，系统会原子地通过任务并记录积分。</p><div className="host-roster-list">{data.ceremonyAssignments.map((assignment) => <form key={assignment.id} onSubmit={(event) => { event.preventDefault(); const ringVariant = String(new FormData(event.currentTarget).get('ringVariant') ?? '') || null; if (!window.confirm(`确认 ${assignment.guest?.name ?? '该宾客'} 已完成「${assignment.task?.title ?? '仪式任务'}」？确认后会立即通过并计分。`)) return; void completeCeremonyAssignment(assignment.id, ringVariant); }}><div><strong>{assignment.guest?.name ?? '未知宾客'}</strong><small>{assignment.task?.title ?? '仪式任务'} · {assignment.status === 'approved' ? '已完成并计分' : '等待主持人确认'}</small></div>{assignment.task?.mission_code === 'P1-CER-002' && assignment.status !== 'approved' && <select name="ringVariant" aria-label={`${assignment.guest?.name ?? '宾客'}负责的戒指`} defaultValue={assignment.ring_variant ?? ''} required><option value="">选择负责戒指</option><option value="GROOM_RING">新郎戒指</option><option value="BRIDE_RING">新娘戒指</option></select>}<button type="submit" disabled={busy || offline || finalLocked || assignment.status === 'approved'}>{assignment.status === 'approved' ? '已完成 ✓' : '确认完成并计分'}</button></form>)}</div></section>}
    {mode === 'overview' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>PRIVATE ROSTER</small><h2>分组、积分与身份</h2></div><span>{data.guests.length} 人</span></div><div className="host-roster-list">{data.guests.map((guest) => <article key={guest.id} className={(guest.role === 'spy' || guest.is_hidden_spy) && guest.drawn_at ? 'spy' : ''}><div><strong>{guest.name}</strong><small>{guest.team || '未分组'} · {guest.drawn_at ? '已抽卡' : guest.participation_mode === 'ACTIVE_PLAYER' ? '待抽卡' : '专属卡'}</small></div><span>{guest.eligible_for_personal_score ? `${guest.points} 分` : '不计分'}</span>{(guest.role === 'spy' || guest.is_hidden_spy) && guest.drawn_at && <b>恶作剧者</b>}</article>)}</div></section> : mode === 'team' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>TEAM SCORE</small><h2>记录团队挑战成绩</h2></div></div>
      <div className="team-total-list">{teamTotals.map((item) => <button type="button" disabled={finalLocked || data.game?.stage !== 'group_game' || Boolean(data.game?.team_clues_settled_at)} className={teamForm.team === item.team ? 'selected' : ''} key={item.team} onClick={() => setTeamForm({ ...teamForm, team: item.team })}><strong>{item.team}</strong><span>{item.points} 分</span></button>)}</div>
      {data.game?.stage !== 'group_game' && <div className="control-state">请先在“流程控制”进入婚宴互动 · 团队挑战；其他环节不能提前记录团队分。</div>}
      {data.game?.team_clues_settled_at && <div className="control-state on">团队积分已结算并锁定，不能继续计分。</div>}<form onSubmit={(event) => { event.preventDefault(); if (!window.confirm(`确认记录 ${teamForm.team} 本次 ${Number(teamForm.amount) > 0 ? '+' : ''}${teamForm.amount} 团队分？\n该分数会累加到当前团队总分。\n原因：${teamForm.reason}`)) return; void addScore({ type: 'adjustTeamPoints', team: teamForm.team, amount: Number(teamForm.amount), reason: teamForm.reason }, `${teamForm.team} 已记录 ${teamForm.amount} 分`); }}>
        <fieldset className="score-lock-fieldset" disabled={Boolean(data.game?.stage !== 'group_game' || data.game?.team_clues_settled_at || finalLocked)}><label htmlFor="team-score-amount">本次分数变化（累加）</label><input id="team-score-amount" type="number" inputMode="numeric" min={0} max={100} value={teamForm.amount} onChange={(event) => setTeamForm({ ...teamForm, amount: event.target.value })} required/>
        <div className="score-presets">{[0,1,2,3,5,10].map((amount) => <button type="button" className={Number(teamForm.amount) === amount ? 'selected' : ''} key={amount} onClick={() => setTeamForm({ ...teamForm, amount: String(amount) })}>{amount > 0 ? `+${amount}` : '记录 0 分'}</button>)}</div>
        <label htmlFor="team-score-reason">计分原因</label><input id="team-score-reason" value={teamForm.reason} onChange={(event) => setTeamForm({ ...teamForm, reason: event.target.value })} maxLength={200} required/>
        <button disabled={busy || offline || teamForm.amount === '' || Number(teamForm.amount) < 0 || Number(teamForm.amount) > 100 || !teamForm.reason.trim()}>{busy ? '保存中…' : `确认记录${teamForm.team} ${teamForm.amount || 0} 分`}</button></fieldset>
      </form>
      {data.teamPoints.length > 0 && <details className="score-history"><summary>查看最近团队计分</summary>{data.teamPoints.slice(0,10).map((entry) => <div key={entry.id}><span><strong>{entry.team}</strong><small>{entry.reason}</small></span><b>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</details>}
    </section> : mode === 'guest' ? <section className="section-card host-score-panel"><div className="section-heading"><div><small>PERSONAL SCORE</small><h2>给宾客个人加分</h2></div></div>
      <p className="muted">这里只增加个人积分，不改变团队挑战分。家人组也可以获得个人积分，但不计入海岛组或沙漠组的团队分；每次加分都必须填写原因并记入流水。</p>
      <label htmlFor="guest-score-search">搜索宾客</label><input id="guest-score-search" type="search" value={guestSearch} onChange={(event) => setGuestSearch(event.target.value)} placeholder="输入姓名或组别"/>
      <label htmlFor="guest-score-person">选择宾客</label><select id="guest-score-person" value={effectiveGuestId} onChange={(event) => setGuestForm({ ...guestForm, guestId: event.target.value })}>{filteredGuests.length ? filteredGuests.map((guest) => <option key={guest.id} value={guest.id}>{guest.name} · {guest.participation_mode === 'HONOR_GUEST' ? guest.special_card_title : guest.team} · {guest.points} 分</option>) : <option value="">没有匹配的宾客</option>}</select>
      {selectedGuest && <div className="selected-score-target"><span>本次加分对象</span><strong>{selectedGuest.name}</strong><small>{selectedGuest.participation_mode === 'HONOR_GUEST' ? selectedGuest.special_card_title : selectedGuest.team} · 当前 {selectedGuest.points} 分</small></div>}
      {finalLocked && <div className="control-state on">终局结算已经产生，本场个人积分已永久锁定。</div>}<form onSubmit={(event) => { event.preventDefault(); if (!selectedGuest) return; if (!window.confirm(`确认给 ${selectedGuest.name} 增加 ${guestForm.amount} 分？\n原因：${guestForm.reason}`)) return; void addScore({ type: 'adjustGuestPoints', guestId: selectedGuest.id, amount: Number(guestForm.amount), reason: guestForm.reason }, `${selectedGuest.name} 已加 ${guestForm.amount} 分`); }}>
        <fieldset className="score-lock-fieldset" disabled={finalLocked}>
        <label htmlFor="guest-score-amount">增加分数</label><input id="guest-score-amount" type="number" inputMode="numeric" min={1} max={100} value={guestForm.amount} onChange={(event) => setGuestForm({ ...guestForm, amount: event.target.value })} required/>
        <div className="score-presets">{[1,2,3,5,10].map((amount) => <button type="button" className={Number(guestForm.amount) === amount ? 'selected' : ''} key={amount} onClick={() => setGuestForm({ ...guestForm, amount: String(amount) })}>+{amount}</button>)}</div>
        <label htmlFor="guest-score-reason">加分原因</label><input id="guest-score-reason" value={guestForm.reason} onChange={(event) => setGuestForm({ ...guestForm, reason: event.target.value })} maxLength={200} required/>
        <button disabled={busy || offline || !selectedGuest || Number(guestForm.amount) < 1 || Number(guestForm.amount) > 100 || !guestForm.reason.trim()}>{busy ? '保存中…' : `确认给${selectedGuest?.name || '宾客'}加 ${guestForm.amount || 0} 分`}</button></fieldset>
      </form>
      {data.personalPoints.length > 0 && <details className="score-history"><summary>查看最近人工积分调整</summary>{data.personalPoints.slice(0,10).map((entry) => <div key={entry.id}><span><strong>{entry.guest?.name || '宾客'}</strong><small>{entry.reason}</small></span><b>{entry.amount > 0 ? '+' : ''}{entry.amount}</b></div>)}</details>}
    </section> : <section className="section-card host-score-panel host-finale-panel"><div className="section-heading"><div><small>RUN OF SHOW</small><h2>婚礼流程控制</h2></div><span className={finalLocked ? 'ready-badge' : data.game?.voting_open ? 'warning-badge' : ''}>{finalLocked ? data.game?.results_visible ? '已结算' : '已锁定' : data.game?.voting_open ? '投票中' : gameStageCopy(data.game?.stage).label}</span></div>
      <div className="host-stage-grid" aria-label="婚礼流程快捷切换">{HOST_STAGE_OPTIONS.map(([stage], index) => <button type="button" className={data.game?.stage === stage ? 'active' : ''} aria-current={data.game?.stage === stage ? 'step' : undefined} disabled={busy || offline || finalLocked || !isNextLiveGameStage(data.game?.stage, stage)} key={stage} onClick={() => { setPendingFinaleAction(null); setPendingStage(stage); }}><small>{String(index + 1).padStart(2, '0')}</small><strong>{gameStageCopy(stage).title}</strong><em>{gameStageCopy(stage).roundLabel}</em></button>)}</div>
      {pendingStage && <section className="finale-confirmation" role="dialog" aria-label="确认切换婚礼流程"><div><small>请确认流程切换</small><strong>{gameStageCopy(pendingStage).label}</strong><p>{gameStageCopy(pendingStage).note}</p></div><div><button type="button" disabled={busy} onClick={() => void runStageChange(pendingStage)}>{busy ? '切换中…' : '确认切换'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPendingStage('')}>取消</button></div></section>}
      <div className="section-divider"/>
      <div className="section-heading host-finale-heading"><div><small>FINAL VOTE</small><h3>投票与终局结算</h3></div></div>
      <div className="host-finale-status"><small>当前状态</small><strong>{finalLocked ? data.game?.results_visible ? '身份已公布，个人奖励已结算' : '终局奖励已生成，公开状态待核对' : data.game?.voting_open ? `第 ${data.game.voting_round} 轮投票进行中` : data.game?.voting_round ? `第 ${data.game.voting_round} 轮投票已关闭` : data.game?.team_clues_settled_at ? '团队积分已结算，线索已发放' : '等待结算团队积分'}</strong><span>已投 {data.voteCount} / 应投 {competitiveDrawn} / 缺席 {missingFinalVotes}</span></div>
      {!data.game?.team_clues_settled_at && <div className={teamSettlementReady ? 'notice success' : 'notice error'} role="status">{teamSettlementReady ? '结算条件已齐备' : `结算条件尚未齐备：${teamSettlementStatus}${!hasBothTeamScores ? ' · 两队都必须明确记录最终成绩（0 分也要记录）' : ''}`}</div>}
      {!finalLocked && <div className="host-finale-actions">{data.game?.voting_open ? <button type="button" disabled={busy || offline} onClick={() => { setPendingStage(''); setPendingFinaleAction('close-voting'); }}>关闭本轮投票</button> : <>{!data.game?.team_clues_settled_at && <button type="button" disabled={busy || offline || data.game?.stage !== 'group_game' || !teamSettlementReady} onClick={() => { setPendingStage(''); setPendingFinaleAction('settle-team-clues'); }}>结算团队积分并发放线索</button>}<button type="button" disabled={busy || offline || !['group_game', 'voting'].includes(data.game?.stage || '') || !data.game?.team_clues_settled_at} onClick={() => { setPendingStage(''); setPendingFinaleAction('open-voting'); }}>开启新一轮投票</button>{(data.game?.voting_round ?? 0) > 0 && <button type="button" className="finale-publish-button" disabled={busy || offline || Boolean(data.game?.voting_open) || data.voteCount === 0} onClick={() => { setPendingStage(''); setPendingFinaleAction('publish-results'); }}>{data.voteCount === 0 ? '等待本轮投票' : '公布身份并结算'}</button>}</>}</div>}
      {!finalLocked && !data.game?.voting_open && data.game?.stage !== 'group_game' && data.game?.stage !== 'voting' && <p className="muted">请先在上方把婚礼流程切换到“团队挑战”，再开启最终投票。</p>}
      {pendingFinaleAction && <section className="finale-confirmation" role="dialog" aria-label="确认主持人终局操作"><div><small>请确认现场操作</small><strong>{pendingFinaleAction === 'settle-team-clues' ? '结算团队积分并发放线索' : pendingFinaleAction === 'open-voting' ? '开启新一轮最终投票' : pendingFinaleAction === 'close-voting' ? '关闭本轮最终投票' : '公布身份并结算终局个人奖励'}</strong><p>{pendingFinaleAction === 'settle-team-clues' ? `${teamTotals.map((item) => `${item.team} ${item.points} 分`).join(' · ')}。确认后系统按排名自动发放线索，再开放投票。` : pendingFinaleAction === 'open-voting' ? '系统会关闭宾客注册并创建新一轮投票，每位宾客只能提交一次。' : pendingFinaleAction === 'close-voting' ? `已投 ${data.voteCount} / 应投 ${competitiveDrawn} / 缺席 ${missingFinalVotes}。关闭后可检查结果，再决定是否公布结算。` : `已投 ${data.voteCount} / 应投 ${competitiveDrawn} / 缺席 ${missingFinalVotes}。确认后将公开恶作剧者，结算投票命中与第二轮个人奖励；已冻结的团队挑战分不会变化。`}</p></div><div><button type="button" disabled={busy || (pendingFinaleAction === 'publish-results' && Boolean(data.game?.voting_open))} onClick={() => void runFinaleAction(pendingFinaleAction)}>{busy ? '处理中…' : '确认执行'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setPendingFinaleAction(null)}>取消</button></div></section>}
      {data.game?.results_visible && <><div className="control-state on">结算具有幂等保护，重复刷新不会再次加分。</div><section className="host-finale-reveal" aria-label="恶作剧者与投票结果"><div className="section-heading"><div><small>FINAL REVEAL</small><h3>恶作剧者与追捕结果</h3></div></div><div className="revealed-grid">{data.finale.tricksters.map((guest) => <article className={guest.escaped ? 'escaped' : 'caught'} key={guest.id}><small>{guest.team}</small><strong>{guest.name}</strong><span>丘比特的恶作剧者</span><em>{guest.escaped ? '成功逃脱 · 完美伪装' : '已被队友识破'}</em></article>)}</div><h4>本轮投票明细</h4><div className="staff-vote-breakdown">{data.finale.voteCounts.map((guest) => <article key={guest.id}><div><strong>{guest.name}</strong><b>{guest.votes} 票</b></div><small>{guest.voters.map((voter) => `${voter.name}${voter.votes > 1 ? `（${voter.votes}票）` : ''}`).join('、')}</small></article>)}</div></section><section className="host-final-rankings" aria-label="最终积分排名"><div className="section-heading"><div><small>FINAL RANKING</small><h3>完整最终积分排名</h3></div><span>共 {data.rankings.personal.length} 人</span></div><div className="host-team-ranking">{data.rankings.teams.filter((team) => TEAMS.includes(team.team as typeof TEAMS[number])).map((team, index) => <article key={team.team}><b>{index + 1}</b><div><strong>{team.team}</strong><small>已锁定的团队挑战分</small></div><span>{team.points} 分</span></article>)}</div><h4>完整个人积分排名</h4>{data.rankings.personal.length ? <ol className="host-personal-ranking">{data.rankings.personal.map((guest, index) => <li className={guest.undetectedTrickster ? 'undetected-trickster' : ''} key={guest.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{guest.name}{guest.undetectedTrickster && <em>完美伪装</em>}</strong><small>{guest.team} · 完成 {guest.completedTasks} 项任务</small></div><span>{guest.points} 分</span></li>)}</ol> : <div className="empty-state">尚无个人积分。</div>}</section></>}
    </section>}
  </main>;
}
