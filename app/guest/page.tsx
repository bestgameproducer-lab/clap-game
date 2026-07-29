'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const GUEST_CACHE_KEY = 'wedding-guest-session-cache-v1';

type RegistrationGuest = { id: string; name: string; loginName: string; hasPassword: boolean };
type SecretCard = { team: string; role: string; task: { id: string; title: string; description: string; points: number }; drawnAt: string };
type GuestData = {
  guest: { id: string; name: string; team: string; role: string; points: number; drawn_at: string | null };
  assignments: Array<{ id: string; status: string; is_initial: boolean; completion_rank: number | null; reward_task_id: string | null; reward_clue_id: string | null; rejection_reason: string | null; task: { title: string; description: string; points: number; category: string; stage: string } }>;
  clues: Array<{ id: string; title: string; content: string }>;
  game: { registration_open: boolean; stage: string; voting_open: boolean; results_visible: boolean; scoreboard_visible: boolean; phase_note: string | null } | null;
  candidates: Array<{ id: string; name: string; team: string }>;
  existingVote: string | null;
  results: null | {
    teamMembers: Array<{ id: string; name: string; role: string }>;
    votedTargetId: string | null;
    votedTargetName: string | null;
    voteCorrect: boolean | null;
  };
};

const STAGES: Record<string, { label: string; note: string }> = {
  registration: { label: '宾客报到', note: '领取身份，准备进入丘比特的考验。' },
  waiting: { label: '等待开场', note: '和队友打个招呼，任务即将开始。' },
  task_round_1: { label: '秘密任务 · 第一轮', note: '悄悄完成任务，不要暴露你的卡片。' },
  task_round_2: { label: '升级任务 · 第二轮', note: '新的挑战已经开启。' },
  group_game: { label: '团队挑战', note: '与队友协作，也别忘了观察可疑行为。' },
  voting: { label: '最终投票', note: '选择本队最可疑的宾客。' },
  results: { label: '身份揭晓', note: '跟随主持人一起揭晓答案。' },
};

const STATUS_LABELS: Record<string, string> = {
  assigned: '进行中', submitted: '等待审核', approved: '已完成', rejected: '请补充验证',
};

const ROLE_LABELS: Record<string, { title: string; note: string }> = {
  spy: { title: '丘比特的恶作剧者（间谍）', note: '隐藏自己，完成你的秘密干扰任务。' },
  helper: { title: '丘比特的秘密信使', note: '暗中帮助队友，让线索自然流动。' },
  guest: { title: '丘比特的祝福见证者', note: '完成祝福任务，并留意身边的可疑行动。' },
};

export default function GuestPage() {
  const [data, setData] = useState<GuestData | null>(null);
  const [checking, setChecking] = useState(true);
  const [invitationCode, setInvitationCode] = useState('');
  const [guests, setGuests] = useState<RegistrationGuest[] | null>(null);
  const [selectedGuest, setSelectedGuest] = useState<RegistrationGuest | null>(null);
  const [claimCode, setClaimCode] = useState('');
  const [claimCodeConfirm, setClaimCodeConfirm] = useState('');
  const [search, setSearch] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [revealedCard, setRevealedCard] = useState<SecretCard | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent) setSyncing(true);
    try {
      const response = await fetch('/api/guest-me', { cache: 'no-store' });
      if (response.ok) {
        const nextData = await response.json();
        setData(nextData); setOffline(false); setError('');
        try { window.sessionStorage.setItem(GUEST_CACHE_KEY, JSON.stringify(nextData)); } catch {}
      }
      else if (response.status === 401) {
        setData(null);
        try { window.sessionStorage.removeItem(GUEST_CACHE_KEY); } catch {}
      }
      else setError('暂时无法加载游戏，请稍后重试。');
    } catch {
      setOffline(true); setError('网络连接不稳定，正在显示本机最近一次任务。');
      try {
        const cached = window.sessionStorage.getItem(GUEST_CACHE_KEY);
        if (cached) setData(JSON.parse(cached));
      } catch {}
    } finally { setChecking(false); setSyncing(false); }
  }, []);

  useEffect(() => {
    setOffline(!window.navigator.onLine);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && window.navigator.onLine) void load(true); }, 15_000);
    const handleOnline = () => { setOffline(false); void load(true); };
    const handleOffline = () => setOffline(true);
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') setShowSecrets(false);
      else if (window.navigator.onLine) void load(true);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [load]);

  async function unlockInvitation(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/registration/guests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationCode }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '邀请码验证失败');
      setGuests(body.guests); setSearch('');
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

  async function submit(assignmentId: string) {
    setMessage(''); setError(''); setBusy(true);
    try {
      const response = await fetch('/api/submit-task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '提交失败'); return; }
      setMessage('任务已送到丘比特任务站，等待主办方确认。'); await load();
    } catch { setOffline(true); setError('当前处于离线状态，任务尚未提交，请联网后重试。'); }
    finally { setBusy(false); }
  }

  async function vote(targetGuestId: string) {
    setError(''); setBusy(true);
    try {
      const response = await fetch('/api/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetGuestId }),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error || '投票失败'); return; }
      setMessage('投票已保存，投票关闭前仍可修改。'); await load();
    } catch { setOffline(true); setError('当前处于离线状态，投票尚未保存，请联网后重试。'); }
    finally { setBusy(false); }
  }

  async function logout() {
    try { await fetch('/api/guest-logout', { method: 'POST' }); } catch {}
    try { window.sessionStorage.removeItem(GUEST_CACHE_KEY); } catch {}
    setData(null); setInvitationCode(''); setGuests(null); setSelectedGuest(null); setClaimCode(''); setClaimCodeConfirm(''); setSearch(''); setShowSecrets(false); setRevealedCard(null);
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
    setShowSecrets(true);
    await load();
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
        <div className="step-copy"><strong>找到你的名字</strong><small>首次进入时，由你自己设置四位密码</small></div>
        <label htmlFor="guest-search">搜索宾客</label>
        <input id="guest-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="输入中文、拼音或英文名" autoFocus/>
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

  if (!data.guest.drawn_at) {
    const role = revealedCard ? ROLE_LABELS[revealedCard.role] ?? ROLE_LABELS.guest : null;
    return <main className="draw-shell"><section className="draw-stage">
      <div className="eyebrow">YOUR SECRET AWAITS</div>
      <h1>{revealedCard ? '命运之卡已经揭晓' : `${data.guest.name}，准备好了吗？`}</h1>
      <p>{revealedCard ? '记住你的身份与任务，然后把卡片藏好。' : '丘比特将同时为你抽取组别、秘密身份和第一项任务。每个人只有一次机会。'}</p>
      {error && <div className="notice error">{error}</div>}
      <div className={`secret-card-scene ${drawing ? 'drawing' : ''} ${revealedCard ? 'revealed' : ''}`}><div className="secret-card">
        <div className="secret-card-back"><span>♡</span><strong>CUPID&apos;S<br/>SECRET</strong><small>ZIMIN &amp; ANRONG</small></div>
        <div className="secret-card-front"><small>你被选中成为</small><h2>{role?.title}</h2><p>{role?.note}</p>
          <div className="card-team"><span>你的组别</span><strong>{revealedCard?.team}</strong></div>
          <div className="card-task"><span>第一项秘密任务 · {revealedCard?.task.points} 分</span><strong>{revealedCard?.task.title}</strong><p>{revealedCard?.task.description}</p></div>
        </div>
      </div></div>
      {!revealedCard && <button className="draw-button" disabled={drawing} onClick={drawCard}>{drawing ? '丘比特正在洗牌…' : '抽取我的秘密卡'}</button>}
      {revealedCard && <button className="draw-button" onClick={enterMissionPage}>我记住了 · 进入任务页</button>}
      {!revealedCard && <button className="text-button" onClick={logout}>退出此身份</button>}
      <p className="privacy-hint">请遮挡屏幕，身份卡离开本页后会自动隐藏。</p>
    </section></main>;
  }

  const stage = STAGES[data.game?.stage ?? 'registration'] ?? STAGES.registration;
  if (!showSecrets) return <main className="privacy-shell"><section className="privacy-cover">
    <div className="privacy-lock">♡</div><div className="eyebrow">PRIVATE CARD</div>
    <h1>{data.guest.name}</h1><p>你的组别、身份和任务已隐藏，防止身边的人看到。</p>
    <button onClick={() => setShowSecrets(true)}>查看我的秘密卡片</button>
    <small>看完后可随时再次隐藏，刷新页面也会自动隐藏。</small>
    <button className="text-button" onClick={logout}>退出此身份</button>
  </section></main>;

  const role = ROLE_LABELS[data.guest.role] ?? ROLE_LABELS.guest;
  const rankedReward = data.assignments.find((assignment) => assignment.is_initial && assignment.completion_rank);
  return <main className="dashboard-shell">
    <section className="mission-hero">
      <div className="eyebrow">丘比特的婚礼考验</div>
      <div className="hero-line"><div><span className="team-chip">{data.guest.team}</span><h1>{data.guest.name}</h1></div><div className="score-orb"><strong>{data.guest.points}</strong><small>积分</small></div></div>
      <div className="identity-strip"><small>你的秘密身份</small><strong>{role.title}</strong><p>{role.note}</p></div>
      <div className="stage-card"><small>当前环节</small><strong>{stage.label}</strong><p>{data.game?.phase_note || stage.note}</p></div>
    </section>
    {(offline || syncing) && <div className={`connection-banner ${offline ? 'offline' : ''}`} role="status">{offline ? '离线只读模式 · 已显示最近同步的任务，提交和投票暂不可用' : '正在同步最新状态…'}</div>}
    {message && <div className="notice success" aria-live="polite">{message}</div>}{error && <div className="notice error" aria-live="polite">{error}</div>}
    {rankedReward && <section className="reward-banner"><small>EARLY COMPLETION HONOR</small><strong>你是第 {rankedReward.completion_rank} 位完成首轮任务的宾客</strong><p>{rankedReward.reward_task_id && rankedReward.reward_clue_id ? '升级任务与一条秘密线索已经发放。' : rankedReward.reward_task_id ? '升级任务已经发放，将在第二轮开放。' : '你的首轮任务已经记录。'}</p></section>}
    <section className="section-card"><div className="section-heading"><div><small>SECRET MISSIONS</small><h2>我的秘密任务</h2></div><span>{data.assignments.length}</span></div>
      {data.assignments.length === 0 ? <div className="empty-state">本轮任务尚未开放，先享受婚礼吧。</div> : data.assignments.map((assignment, index) => <article className="mission-item" key={assignment.id}><div className="mission-number">{String(index + 1).padStart(2, '0')}</div><div className="mission-body"><div className="mission-meta"><span>{assignment.task.points} 分</span><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></div><h3>{assignment.task.title}</h3><p>{assignment.task.description}</p>{assignment.status === 'rejected' && <div className="task-feedback">任务站留言：{assignment.rejection_reason || '请补充验证后再次提交。'}</div>}{(assignment.status === 'assigned' || assignment.status === 'rejected') && <button disabled={busy || offline} onClick={() => submit(assignment.id)}>{offline ? '联网后可提交' : assignment.status === 'rejected' ? '补充完成 · 再次提交' : '我已完成 · 提交验证'}</button>}</div></article>)}
    </section>
    <section className="section-card"><div className="section-heading"><div><small>SPY CLUES</small><h2>已解锁线索</h2></div><span>{data.clues.length}</span></div>{data.clues.length === 0 ? <div className="empty-state">完成任务后，线索会在这里出现。</div> : data.clues.map((clue) => <div className="clue" key={clue.id}><strong>{clue.title}</strong><p>{clue.content}</p></div>)}</section>
    {data.game?.voting_open && <section className="section-card"><div className="section-heading"><div><small>FINAL VOTE</small><h2>谁是恶作剧者？</h2></div></div><p className="muted">只能选择本队宾客，投票关闭前可以修改。选中后会立即保存。</p><div className="vote-grid">{data.candidates.filter((candidate) => candidate.id !== data.guest.id).map((candidate) => <button disabled={busy || offline} className={data.existingVote === candidate.id ? 'vote-choice selected' : 'vote-choice'} key={candidate.id} onClick={() => vote(candidate.id)}>{data.existingVote === candidate.id ? '✓ ' : ''}{candidate.name}</button>)}</div>{offline && <p className="vote-offline-note">恢复网络后才能提交投票。</p>}</section>}
    {data.game?.results_visible && data.results && <section className="reveal-card"><small>THE FINAL REVEAL</small><h2>身份揭晓</h2>{data.results.votedTargetName ? <div className={`vote-verdict ${data.results.voteCorrect ? 'correct' : 'missed'}`}><span>你投给了 {data.results.votedTargetName}</span><strong>{data.results.voteCorrect ? '成功找到了恶作剧者' : '恶作剧者成功隐藏了自己'}</strong></div> : <div className="vote-verdict missed"><strong>你没有提交最终投票</strong></div>}<div className="team-role-reveal">{data.results.teamMembers.map((member) => <div key={member.id}><span>{member.name}</span><strong>{ROLE_LABELS[member.role]?.title ?? member.role}</strong></div>)}</div><p>感谢你成为这场婚礼故事的一部分。</p></section>}
    <div className="footer-actions"><button onClick={() => setShowSecrets(false)}>隐藏我的秘密</button><button className="secondary" disabled={syncing} onClick={() => void load()}>{syncing ? '同步中…' : '刷新状态'}</button><button className="text-button" onClick={logout}>退出此身份</button></div>
  </main>;
}
