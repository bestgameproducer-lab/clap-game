'use client';

import { useCallback, useEffect, useState } from 'react';

type ScoreboardData = {
  visible: boolean;
  stage: string;
  resultsVisible: boolean;
  updatedAt: string;
  teams: Array<{ team: string; points: number; guests: number; completedTasks: number }>;
  leaders: Array<{ id: string; name: string; team: string; points: number; completedTasks: number }>;
  voteCounts: Array<{ id: string; name: string; team: string; votes: number }>;
  revealedRoles: Array<{ id: string; name: string; team: string; role: string }>;
};

const STAGE_LABELS: Record<string, string> = {
  registration: '宾客报到', waiting: '等待开场', task_round_1: '第一轮秘密任务', task_round_2: '第二轮升级任务',
  group_game: '团队挑战', voting: '最终投票', results: '身份揭晓',
};

export default function ScoreboardPage() {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/public-scoreboard', { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '积分大屏加载失败');
      setData(body); setError(''); setOffline(false);
      try { window.localStorage.setItem('wedding-scoreboard-cache', JSON.stringify(body)); } catch {}
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '积分大屏加载失败');
      setOffline(true);
      if (!data) {
        try {
          const cached = window.localStorage.getItem('wedding-scoreboard-cache');
          if (cached) setData(JSON.parse(cached));
        } catch {}
      }
    }
  }, [data]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10_000);
    const reconnect = () => void load();
    window.addEventListener('online', reconnect);
    return () => { window.clearInterval(timer); window.removeEventListener('online', reconnect); };
  }, [load]);

  if (!data) return <main className="scoreboard-shell"><section className="scoreboard-wait"><div className="rings">♡</div><h1>丘比特正在统计</h1><p>{error || '正在读取现场积分…'}</p><button onClick={() => void load()}>重新连接</button></section></main>;
  if (!data.visible) return <main className="scoreboard-shell"><section className="scoreboard-wait"><div className="eyebrow">ZIMIN &amp; ANRONG</div><div className="rings">♡</div><h1>积分大屏尚未开放</h1><p>当前环节：{STAGE_LABELS[data.stage] || data.stage}</p><small>主办方开放后，本页面会自动更新。</small>{offline && <div className="offline-pill">离线 · 正在等待网络恢复</div>}</section></main>;

  return <main className="scoreboard-shell">
    <header className="scoreboard-header"><div><div className="eyebrow">LIVE WEDDING MISSION</div><h1>丘比特积分榜</h1><p>{STAGE_LABELS[data.stage] || data.stage}</p></div><div className="scoreboard-live">{offline ? 'OFFLINE' : 'LIVE'}</div></header>
    {error && <div className="scoreboard-error">{error} · 正在显示最近一次结果</div>}
    <section className="team-score-grid">{data.teams.map((team, index) => <article className={index === 0 ? 'team-score winner' : 'team-score'} key={team.team}><span>0{index + 1}</span><div><small>{index === 0 ? 'LEADING TEAM' : 'TEAM'}</small><h2>{team.team}</h2><p>{team.guests} 位宾客 · {team.completedTasks} 项任务完成</p></div><strong>{team.points}<small>分</small></strong></article>)}</section>
    <section className="scoreboard-panel"><div className="scoreboard-title"><div><small>INDIVIDUAL HONORS</small><h2>个人荣誉榜</h2></div><span>TOP {Math.min(10, data.leaders.length)}</span></div>{data.leaders.length === 0 ? <div className="empty-state">积分尚未产生。</div> : <ol className="leaderboard-list">{data.leaders.map((guest, index) => <li key={guest.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{guest.name}</strong><small>{guest.team} · 完成 {guest.completedTasks} 项任务</small></div><span>{guest.points}</span></li>)}</ol>}</section>
    {data.resultsVisible && <section className="scoreboard-panel reveal-panel"><div className="scoreboard-title"><div><small>THE FINAL REVEAL</small><h2>身份揭晓</h2></div></div><div className="revealed-grid">{data.revealedRoles.map((guest) => <article key={guest.id}><small>{guest.team}</small><strong>{guest.name}</strong><span>{guest.role === 'spy' ? '丘比特的恶作剧者' : '丘比特的秘密信使'}</span></article>)}</div>{data.voteCounts.length > 0 && <><h3>宾客投票</h3><div className="vote-result-list">{data.voteCounts.map((guest) => <div key={guest.id}><span>{guest.name} · {guest.team}</span><strong>{guest.votes} 票</strong></div>)}</div></>}</section>}
    <footer className="scoreboard-footer">每 10 秒自动更新 · {new Date(data.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</footer>
  </main>;
}
