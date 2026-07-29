'use client';

import { useEffect, useState } from 'react';
type GuestData = {
  guest: { id: string; name: string; team: string; points: number };
  assignments: Array<{ id: string; status: string; task: { title: string; description: string; points: number } }>;
  clues: Array<{ id: string; content: string }>;
  game: { registration_open: boolean; stage: string; voting_open: boolean; results_visible: boolean } | null;
  candidates: Array<{ id: string; name: string; team: string }>;
  existingVote: string | null;
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
  assigned: '进行中', submitted: '等待审核', approved: '已完成',
};

export default function GuestPage() {
  const [data, setData] = useState<GuestData | null>(null);
  const [checking, setChecking] = useState(true);
  const [invitationCode, setInvitationCode] = useState('');
  const [loginName, setLoginName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const response = await fetch('/api/guest-me', { cache: 'no-store' });
      if (response.ok) setData(await response.json());
      else if (response.status === 401) setData(null);
      else setError('暂时无法加载游戏，请稍后重试。');
    } catch { setError('网络连接不稳定，请检查网络后重试。'); }
    finally { setChecking(false); }
  }

  useEffect(() => { load(); }, []);

  async function claimIdentity(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch('/api/registration/claim', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invitationCode, loginName }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '身份认领失败');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '身份认领失败'); }
    finally { setBusy(false); }
  }

  async function submit(assignmentId: string) {
    setMessage(''); setError('');
    const response = await fetch('/api/submit-task', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignmentId }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error || '提交失败'); return; }
    setMessage('任务已送到丘比特任务站，等待主办方确认。'); await load();
  }

  async function vote(targetGuestId: string) {
    setError('');
    const response = await fetch('/api/vote', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetGuestId }),
    });
    const body = await response.json();
    if (!response.ok) { setError(body.error || '投票失败'); return; }
    setMessage('投票已保存，投票关闭前仍可修改。'); await load();
  }

  async function logout() {
    await fetch('/api/guest-logout', { method: 'POST' });
    setData(null); setInvitationCode(''); setLoginName('');
  }

  if (checking) return <main className="welcome-shell"><section className="welcome-card"><div className="heart-mark">♡</div><h1>正在打开婚礼任务</h1><p>丘比特正在确认你的身份…</p></section></main>;

  if (!data) return <main className="welcome-shell">
    <section className="welcome-card">
      <div className="eyebrow">ZIMIN &amp; ANRONG</div><div className="heart-mark">♡</div>
      <h1>丘比特的<br/>婚礼考验</h1>
      <p className="lead">从你来到婚礼现场的这一刻起，故事已经开始。</p>
      <div className="step-row"><span className="active">1</span><i/><span>2</span></div>
      {error && <div className="notice error">{error}</div>}
      <form onSubmit={claimIdentity}>
        <div className="step-copy"><strong>领取你的婚礼身份</strong><small>宾客名单不会公开，每个身份只能认领一次</small></div>
        <label htmlFor="invite-code">婚礼邀请码</label>
        <input id="invite-code" value={invitationCode} onChange={(event) => setInvitationCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" placeholder="例如 LOVE2026" required/>
        <label htmlFor="login-name">拼音用户名</label>
        <input id="login-name" value={loginName} onChange={(event) => setLoginName(event.target.value)} autoCapitalize="words" autoComplete="username" placeholder="例如 Ming Chen" required/>
        <p className="login-note">使用邀请名单中的拼音或英文姓名，大小写均可。</p>
        <button disabled={busy}>{busy ? '确认身份中…' : '确认身份 · 领取任务'}</button>
      </form>
    </section>
  </main>;

  const stage = STAGES[data.game?.stage ?? 'registration'] ?? STAGES.registration;
  return <main className="dashboard-shell">
    <section className="mission-hero">
      <div className="eyebrow">丘比特的婚礼考验</div>
      <div className="hero-line"><div><span className="team-chip">{data.guest.team}</span><h1>{data.guest.name}</h1></div><div className="score-orb"><strong>{data.guest.points}</strong><small>积分</small></div></div>
      <div className="stage-card"><small>当前环节</small><strong>{stage.label}</strong><p>{stage.note}</p></div>
    </section>
    {message && <div className="notice success">{message}</div>}{error && <div className="notice error">{error}</div>}
    <section className="section-card"><div className="section-heading"><div><small>SECRET MISSIONS</small><h2>我的秘密任务</h2></div><span>{data.assignments.length}</span></div>
      {data.assignments.length === 0 ? <div className="empty-state">任务尚未派发，先享受婚礼吧。</div> : data.assignments.map((assignment, index) => <article className="mission-item" key={assignment.id}><div className="mission-number">0{index + 1}</div><div className="mission-body"><div className="mission-meta"><span>{assignment.task.points} 分</span><span className={`status ${assignment.status}`}>{STATUS_LABELS[assignment.status] ?? assignment.status}</span></div><h3>{assignment.task.title}</h3><p>{assignment.task.description}</p>{assignment.status === 'assigned' && <button onClick={() => submit(assignment.id)}>我已完成 · 提交验证</button>}</div></article>)}
    </section>
    <section className="section-card"><div className="section-heading"><div><small>SPY CLUES</small><h2>已解锁线索</h2></div><span>{data.clues.length}</span></div>{data.clues.length === 0 ? <div className="empty-state">完成任务后，线索会在这里出现。</div> : data.clues.map((clue) => <div className="clue" key={clue.id}>⌁ {clue.content}</div>)}</section>
    {data.game?.voting_open && <section className="section-card"><div className="section-heading"><div><small>FINAL VOTE</small><h2>谁是恶作剧者？</h2></div></div><p className="muted">只能选择本队宾客，投票关闭前可以修改。</p><div className="vote-grid">{data.candidates.filter((candidate) => candidate.id !== data.guest.id).map((candidate) => <button className={data.existingVote === candidate.id ? 'vote-choice selected' : 'vote-choice'} key={candidate.id} onClick={() => vote(candidate.id)}>{candidate.name}</button>)}</div></section>}
    {data.game?.results_visible && <section className="reveal-card"><small>THE STORY CONTINUES</small><h2>身份揭晓时刻</h2><p>请跟随主持人的现场公布与颁奖。</p></section>}
    <div className="footer-actions"><button className="secondary" onClick={load}>刷新状态</button><button className="text-button" onClick={logout}>退出此身份</button></div>
  </main>;
}
