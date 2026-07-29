'use client';

import { useEffect, useState } from 'react';

const STAGES = [
  ['registration','宾客报到'],['waiting','等待开场'],['task_round_1','第一轮任务'],
  ['task_round_2','第二轮任务'],['group_game','团队挑战'],['voting','最终投票'],['results','身份揭晓'],
];

type AdminData = {
  guests: Array<{ id:string; name:string; login_name:string; team:string; role:string; points:number; claimed_at:string|null; drawn_at:string|null }>;
  assignments: Array<{ id:string; guest_id:string; status:string; task?:{title:string} }>;
  submissions: Array<{ id:string; guest?:{name:string}; task?:{title:string;points:number} }>;
  votes: Array<{ id:string; target?:{name:string} }>;
  game: { registration_open:boolean; stage:string; voting_open:boolean; results_visible:boolean } | null;
};

export default function AdminPage() {
  const [password,setPassword] = useState('');
  const [data,setData] = useState<AdminData|null>(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/admin-data',{cache:'no-store'});
    if (response.ok) setData(await response.json());
  }
  useEffect(() => { load(); }, []);

  async function login(event:React.FormEvent) {
    event.preventDefault(); setError(''); setBusy(true);
    const response = await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    const body = await response.json(); setBusy(false);
    if (!response.ok) { setError(body.error || '登录失败'); return; }
    await load();
  }

  async function action(body:Record<string,unknown>) {
    setError(''); setBusy(true);
    const response = await fetch('/api/admin-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result = await response.json(); setBusy(false);
    if (!response.ok) { setError(result.error || '操作失败'); return; }
    await load();
  }

  if (!data) return <main className="welcome-shell"><section className="welcome-card admin-login"><div className="eyebrow">ORGANIZER ONLY</div><div className="heart-mark">⌘</div><h1>主办方<br/>控制台</h1><p className="lead">管理婚礼流程、审核任务与揭晓结果。</p><form onSubmit={login}><label htmlFor="admin-password">管理员密码</label><input id="admin-password" type="password" value={password} onChange={(event)=>setPassword(event.target.value)} required/><button disabled={busy}>{busy?'登录中…':'进入控制台'}</button>{error&&<div className="notice error">{error}</div>}</form></section></main>;

  const claimed = data.guests.filter((guest)=>guest.claimed_at).length;
  return <main className="admin-shell">
    <section className="admin-hero"><div><div className="eyebrow">LIVE CONTROL</div><h1>婚礼游戏控制台</h1><p>{claimed}/{data.guests.length} 位宾客已认领身份</p></div><div className="live-dot">LIVE</div></section>
    {error&&<div className="notice error">{error}</div>}
    <section className="admin-grid">
      <article className="section-card"><div className="section-heading"><div><small>REGISTRATION</small><h2>宾客注册</h2></div></div><p className="muted">宾客首次进入时自己设置四位密码，以后可用同一密码再次登录。</p><button disabled={busy} onClick={()=>action({type:'toggleRegistration',value:!data.game?.registration_open})}>{data.game?.registration_open?'关闭注册':'开放注册'}</button><div className={`control-state ${data.game?.registration_open?'on':''}`}>{data.game?.registration_open?'● 注册开放中':'○ 注册已关闭'}</div></article>
      <article className="section-card"><div className="section-heading"><div><small>GAME STAGE</small><h2>当前流程</h2></div></div><label htmlFor="game-stage">切换婚礼环节</label><select id="game-stage" value={data.game?.stage||'registration'} onChange={(event)=>action({type:'setStage',stage:event.target.value})}>{STAGES.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><div className="grid"><button disabled={busy} onClick={()=>action({type:'toggleVoting',value:!data.game?.voting_open})}>{data.game?.voting_open?'关闭投票':'开启投票'}</button><button disabled={busy} className="secondary" onClick={()=>action({type:'toggleResults',value:!data.game?.results_visible})}>{data.game?.results_visible?'隐藏结果':'公布结果'}</button></div></article>
    </section>
    <section className="section-card"><div className="section-heading"><div><small>APPROVAL QUEUE</small><h2>待审核任务</h2></div><span>{data.submissions.length}</span></div>{data.submissions.length===0?<div className="empty-state">暂无待审核提交。</div>:data.submissions.map((submission)=><div className="approval-row" key={submission.id}><div><strong>{submission.guest?.name}</strong><p>{submission.task?.title} · {submission.task?.points} 分</p></div><div><button disabled={busy} onClick={()=>action({type:'approve',assignmentId:submission.id})}>通过</button><button disabled={busy} className="danger" onClick={()=>action({type:'reject',assignmentId:submission.id})}>退回</button></div></div>)}</section>
    <section className="section-card"><div className="section-heading"><div><small>GUESTS</small><h2>宾客进度</h2></div><span>{data.guests.length}</span></div><div className="guest-admin-list">{data.guests.map((guest)=><article key={guest.id}><div className="guest-avatar">{guest.name.slice(0,1)}</div><div><strong>{guest.name}</strong><small>{guest.login_name} · {guest.drawn_at ? `${guest.team} / ${guest.role}` : '待抽卡'} · {guest.points} 分</small></div><span className={guest.claimed_at?'claimed':'unclaimed'}>{guest.claimed_at?(guest.drawn_at?'已抽卡':'待抽卡'):'未设置'}</span>{guest.claimed_at&&<button className="mini-button" disabled={busy} onClick={()=>action({type:'resetGuestClaim',guestId:guest.id})}>重置密码</button>}</article>)}</div></section>
    <section className="section-card"><div className="section-heading"><div><small>VOTE COUNT</small><h2>投票统计</h2></div></div>{data.votes.length===0?<div className="empty-state">暂无投票。</div>:<ul>{Object.entries(data.votes.reduce<Record<string,number>>((counts,vote)=>{const name=vote.target?.name||'未知';counts[name]=(counts[name]||0)+1;return counts;},{})).sort((a,b)=>b[1]-a[1]).map(([name,count])=><li key={name}>{name}: {count} 票</li>)}</ul>}</section>
  </main>;
}
