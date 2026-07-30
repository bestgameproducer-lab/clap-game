'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveRefresh } from '@/lib/use-live-refresh';

type ScoreboardData = {
  visible: boolean;
  stage: string;
  resultsVisible: boolean;
  displayTitle: string | null;
  displayBody: string | null;
  publicClue: string | null;
  timerEndsAt: string | null;
  updatedAt: string;
  teams: Array<{ team: string; points: number; guests: number; completedTasks: number }>;
  leaders: Array<{ id: string; name: string; team: string; points: number; completedTasks: number }>;
  voteCounts: Array<{ id: string; name: string; team: string; votes: number }>;
  revealedRoles: Array<{ id: string; name: string; team: string; role: string; is_hidden_spy: boolean }>;
  awards: Array<{ id: string; title: string; winnerName: string; winnerTeam: string | null; reason: string }>;
  spyScores: Array<{
    id: string;
    name: string;
    team: string;
    isHiddenSpy?: boolean;
    points: number;
    actions?: Array<{ reason: string; label: string; count: number; points: number }>;
    missions?: Array<{ title: string; completed: boolean }>;
  }>;
};

const STAGE_LABELS: Record<string, string> = {
  registration: '宾客报到', waiting: '等待开场', task_round_1: '第一轮秘密任务', task_round_2: '第二轮升级任务',
  group_game: '团队挑战', voting: '最终投票', results: '身份揭晓',
};

const SCOREBOARD_CACHE_KEY = 'wedding-scoreboard-cache-v2';

function readScoreboardCache() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SCOREBOARD_CACHE_KEY) || 'null') as { data?: ScoreboardData; cachedAt?: number } | null;
    if (!parsed?.data || typeof parsed.cachedAt !== 'number') return null;
    return { data: parsed.data, cachedAt: parsed.cachedAt };
  } catch { return null; }
}

export default function ScoreboardPage() {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const loadRequestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    try {
      const response = await fetch('/api/public-scoreboard', { cache: 'no-store' });
      const body = await response.json();
      if (requestId !== loadRequestRef.current) return;
      if (!response.ok) throw new Error(body.error || '积分大屏加载失败');
      const cachedAt = Date.now();
      setData(body); setError(''); setOffline(false);
      setLastSyncedAt(cachedAt);
      try { window.sessionStorage.setItem(SCOREBOARD_CACHE_KEY, JSON.stringify({ data: body, cachedAt })); } catch {}
    } catch (cause) {
      if (requestId !== loadRequestRef.current) return;
      setError(cause instanceof Error ? cause.message : '积分大屏加载失败');
      setOffline(true);
      setData((current) => {
        if (current) return current;
        const cached = readScoreboardCache();
        if (cached) setLastSyncedAt(cached.cachedAt);
        return cached?.data ?? null;
      });
    }
  }, []);

  useEffect(() => {
    try { window.localStorage.removeItem('wedding-scoreboard-cache'); } catch {}
    void load();
    const disconnect = () => setOffline(true);
    window.addEventListener('offline', disconnect);
    return () => window.removeEventListener('offline', disconnect);
  }, [load]);
  useLiveRefresh(load);

  useEffect(() => {
    if (!('serviceWorker' in window.navigator)) return;
    let active = true;
    window.navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(async (registration) => {
        await registration.update();
        await window.navigator.serviceWorker.ready;
        if (active) setOfflineReady(true);
      })
      .catch(() => { if (active) setOfflineReady(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!data?.timerEndsAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data?.timerEndsAt]);

  if (!data) return <main className="scoreboard-shell"><section className="scoreboard-wait"><div className="rings">♡</div><h1>丘比特正在统计</h1><p>{error || '正在读取现场积分…'}</p><button onClick={() => void load()}>重新连接</button></section></main>;
  const lastSyncLabel = lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '尚未成功同步';
  if (!data.visible) return <main className="scoreboard-shell"><section className="scoreboard-wait"><div className="eyebrow">ZIMIN &amp; ANRONG</div><div className="rings">♡</div><h1>积分大屏尚未开放</h1><p>当前环节：{STAGE_LABELS[data.stage] || data.stage}</p><small>主办方开放后，本页面会自动更新。</small>{offline && <div className="offline-pill">离线副本 · 最近同步 {lastSyncLabel}</div>}</section></main>;

  const remainingSeconds = data.timerEndsAt ? Math.max(0, Math.ceil((new Date(data.timerEndsAt).getTime() - now) / 1000)) : null;
  const timerLabel = remainingSeconds === null ? null : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return <main className="scoreboard-shell">
    <header className="scoreboard-header"><div><div className="eyebrow">LIVE WEDDING MISSION</div><h1>丘比特积分榜</h1><p>{STAGE_LABELS[data.stage] || data.stage}</p></div><div className={`scoreboard-live ${offline ? 'cached' : ''}`}>{offline ? 'CACHED' : 'LIVE'}</div></header>
    {error && <div className="scoreboard-error" role="status"><span>{error} · 正在显示 {lastSyncLabel} 的最近副本</span><button className="mini-button" onClick={() => void load()}>重新连接</button></div>}
    {(data.displayTitle || data.displayBody || data.publicClue || timerLabel) && <section className="live-display-panel"><div><small>NOW PLAYING</small><h2>{data.displayTitle || STAGE_LABELS[data.stage] || data.stage}</h2>{data.displayBody && <p>{data.displayBody}</p>}{data.publicClue && <div className="public-clue"><b>公开线索</b><span>{data.publicClue}</span></div>}</div>{timerLabel && <strong className={remainingSeconds === 0 ? 'timer-ended' : ''}>{timerLabel}<small>{remainingSeconds === 0 ? 'TIME' : 'REMAINING'}</small></strong>}</section>}
    <section className="team-score-grid">{data.teams.map((team, index) => <article className={index === 0 && team.points > 0 ? 'team-score winner' : 'team-score'} key={team.team}><span>0{index + 1}</span><div><small>{index === 0 && team.points > 0 ? 'LEADING TEAM' : 'TEAM'}</small><h2>{team.team}</h2><p>{team.guests} 位宾客 · {team.completedTasks} 项任务完成</p></div><strong>{team.points}<small>团队分</small></strong></article>)}</section>
    <p className="scoreboard-scope-note">团队榜只计算团队游戏、任务完成率和侦探奖励；个人任务积分仅进入下方个人荣誉榜。</p>
    <section className="scoreboard-panel"><div className="scoreboard-title"><div><small>INDIVIDUAL HONORS</small><h2>个人荣誉榜</h2></div><span>TOP {Math.min(10, data.leaders.length)}</span></div>{data.leaders.length === 0 ? <div className="empty-state">积分尚未产生。</div> : <ol className="leaderboard-list">{data.leaders.map((guest, index) => <li key={guest.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{guest.name}</strong><small>{guest.team} · 完成 {guest.completedTasks} 项任务</small></div><span>{guest.points}</span></li>)}</ol>}</section>
    {data.resultsVisible && <section className="scoreboard-panel reveal-panel"><div className="scoreboard-title"><div><small>THE FINAL REVEAL</small><h2>身份揭晓</h2></div></div><div className="revealed-grid">{data.revealedRoles.map((guest) => <article key={guest.id}><small>{guest.team}</small><strong>{guest.name}</strong><span>{guest.is_hidden_spy ? '丘比特的暗线恶作剧者' : guest.role === 'spy' ? '丘比特的恶作剧者' : '婚礼守护者'}</span></article>)}</div>{data.voteCounts.length > 0 && <><h3>宾客投票</h3><div className="vote-result-list">{data.voteCounts.map((guest) => <div key={guest.id}><span>{guest.name} · {guest.team}</span><strong>{guest.votes} 票</strong></div>)}</div></>}</section>}
    {data.resultsVisible && (data.spyScores ?? []).length > 0 && <section className="scoreboard-panel reveal-panel"><div className="scoreboard-title"><div><small>SPY DOSSIER</small><h2>恶作剧者行动档案</h2></div><span>揭晓后公开</span></div><div className="spy-dossier-grid">{(data.spyScores ?? []).map((spy, index) => <article className={index === 0 ? 'spy-dossier winner' : 'spy-dossier'} key={spy.id}><header><div><small>{spy.team} · {spy.isHiddenSpy ? '隐藏间谍' : '初始间谍'}</small><strong>{spy.name}</strong></div><span>{spy.points}<small>间谍分</small></span></header><div className="spy-dossier-section"><b>行动得分</b>{(spy.actions ?? []).length > 0 ? <ul>{(spy.actions ?? []).map((action) => <li key={action.reason}><span>{action.label}{action.count > 1 ? ` × ${action.count}` : ''}</span><strong>+{action.points}</strong></li>)}</ul> : <p>本场没有记录到可公开的恶作剧得分。</p>}</div><div className="spy-dossier-section"><b>秘密任务</b>{(spy.missions ?? []).length > 0 ? <ul>{(spy.missions ?? []).map((mission, missionIndex) => <li key={`${mission.title}-${missionIndex}`}><span>{mission.title}</span><strong className={mission.completed ? 'completed' : 'incomplete'}>{mission.completed ? '完成' : '未完成'}</strong></li>)}</ul> : <p>本场没有领取间谍专属任务。</p>}</div></article>)}</div></section>}
    {data.resultsVisible && data.awards.length > 0 && <section className="scoreboard-panel awards-panel"><div className="scoreboard-title"><div><small>CUPID HONORS</small><h2>今晚荣誉榜</h2></div></div><div className="award-grid">{data.awards.map((award) => <article key={award.id}><small>{award.title}</small><strong>{award.winnerName}</strong>{award.winnerTeam && award.winnerName !== award.winnerTeam && <span>{award.winnerTeam}</span>}{award.reason && <p>{award.reason}</p>}</article>)}</div></section>}
    <footer className="scoreboard-footer">自动更新已开启{offline ? ` · 最近同步 ${lastSyncLabel}` : ''}{offlineReady ? ' · 离线刷新备用已准备' : ''}</footer>
  </main>;
}
