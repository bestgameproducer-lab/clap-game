'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { gameStageCopy } from '@/lib/game-stages';
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
  leaders: Array<{ id: string; name: string; team: string; points: number; completedTasks: number; undetectedTrickster: boolean }>;
  voteCounts: Array<{ id: string; name: string; team: string; votes: number }>;
  revealedRoles: Array<{ id: string; name: string; team: string; role: string; is_hidden_spy: boolean }>;
  awards: Array<{ id: string; title: string; winnerName: string; winnerTeam: string | null; reason: string }>;
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
    window.navigator.serviceWorker.register('/sw.js?v=6-dinner-menu', { scope: '/', updateViaCache: 'none' })
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
  if (!data.visible) return <main className="scoreboard-shell"><section className="scoreboard-wait"><div className="eyebrow">ZIMIN &amp; ANRONG</div><div className="rings">♡</div><h1>婚礼现场战报</h1><p>当前环节：{gameStageCopy(data.stage).label}</p><div className="scoreboard-wait-note"><strong>战报暂未开放</strong><span>主办方开放后，团队分数、个人荣誉与现场消息会在这里自动更新。</span></div>{offline && <div className="offline-pill">离线副本 · 最近同步 {lastSyncLabel}</div>}</section></main>;

  const remainingSeconds = data.timerEndsAt ? Math.max(0, Math.ceil((new Date(data.timerEndsAt).getTime() - now) / 1000)) : null;
  const timerLabel = remainingSeconds === null ? null : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return <main className="scoreboard-shell">
    <header className="scoreboard-header"><div><div className="eyebrow">LIVE WEDDING MISSION</div><h1>婚礼现场战报</h1><p>{gameStageCopy(data.stage).label}</p></div><div className={`scoreboard-live ${offline ? 'cached' : ''}`}>{offline ? 'CACHED' : 'LIVE'}</div></header>
    {error && <div className="scoreboard-error" role="status"><span>{error} · 正在显示 {lastSyncLabel} 的最近副本</span><button className="mini-button" onClick={() => void load()}>重新连接</button></div>}
    {(data.displayTitle || data.displayBody || data.publicClue || timerLabel) && <section className="live-display-panel"><div><small>NOW PLAYING</small><h2>{data.displayTitle || gameStageCopy(data.stage).label}</h2>{data.displayBody && <p>{data.displayBody}</p>}{data.publicClue && <div className="public-clue"><b>公开线索</b><span>{data.publicClue}</span></div>}</div>{timerLabel && <strong className={remainingSeconds === 0 ? 'timer-ended' : ''}>{timerLabel}<small>{remainingSeconds === 0 ? 'TIME' : 'REMAINING'}</small></strong>}</section>}
    <section className="team-score-grid">{data.teams.map((team, index) => <article className={index === 0 && team.points > 0 ? 'team-score winner' : 'team-score'} key={team.team}><span>0{index + 1}</span><div><small>{index === 0 && team.points > 0 ? 'LEADING TEAM' : 'TEAM'}</small><h2>{team.team}</h2><p>{team.guests} 位宾客 · {team.completedTasks} 项任务完成</p></div><strong>{team.points}<small>团队分</small></strong></article>)}</section>
    <p className="scoreboard-scope-note">团队榜显示已结算的团队挑战分；个人任务与投票奖励只进入下方个人总积分。</p>
    <section className="scoreboard-panel"><div className="scoreboard-title"><div><small>INDIVIDUAL HONORS</small><h2>{data.resultsVisible ? '最终个人积分排名' : '个人荣誉榜'}</h2></div><span>{data.resultsVisible ? `共 ${data.leaders.length} 人` : `TOP ${Math.min(10, data.leaders.length)}`}</span></div>{data.resultsVisible && data.leaders.some((guest) => guest.undetectedTrickster) && <p className="final-ranking-note">未被本队最高票抓出的恶作剧者获得“完美伪装”荣誉，置于最终榜首；其个人积分不额外增加。</p>}{data.leaders.length === 0 ? <div className="empty-state">积分尚未产生。</div> : <ol className="leaderboard-list">{data.leaders.map((guest, index) => <li className={guest.undetectedTrickster ? 'undetected-trickster' : ''} key={guest.id}><b>{String(index + 1).padStart(2, '0')}</b><div><strong>{guest.name}{guest.undetectedTrickster && <em>完美伪装</em>}</strong><small>{guest.team} · 完成 {guest.completedTasks} 项任务</small></div><span>{guest.points}</span></li>)}</ol>}</section>
    {data.resultsVisible && <section className="scoreboard-panel reveal-panel"><div className="scoreboard-title"><div><small>THE FINAL REVEAL</small><h2>身份揭晓</h2></div></div><div className="revealed-grid">{data.revealedRoles.map((guest) => <article key={guest.id}><small>{guest.team}</small><strong>{guest.name}</strong><span>{guest.is_hidden_spy ? '丘比特的暗线恶作剧者' : guest.role === 'spy' ? '丘比特的恶作剧者' : '婚礼守护者'}</span></article>)}</div>{data.voteCounts.length > 0 && <><h3>宾客投票</h3><div className="vote-result-list">{data.voteCounts.map((guest) => <div key={guest.id}><span>{guest.name} · {guest.team}</span><strong>{guest.votes} 票</strong></div>)}</div></>}</section>}
    {data.resultsVisible && data.awards.length > 0 && <section className="scoreboard-panel awards-panel"><div className="scoreboard-title"><div><small>CUPID HONORS</small><h2>今晚荣誉榜</h2></div></div><div className="award-grid">{data.awards.map((award) => <article key={award.id}><small>{award.title}</small><strong>{award.winnerName}</strong>{award.winnerTeam && award.winnerName !== award.winnerTeam && <span>{award.winnerTeam}</span>}{award.reason && <p>{award.reason}</p>}</article>)}</div></section>}
    <footer className="scoreboard-footer">自动更新已开启{offline ? ` · 最近同步 ${lastSyncLabel}` : ''}{offlineReady ? ' · 离线刷新备用已准备' : ''}</footer>
  </main>;
}
