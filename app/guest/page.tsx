'use client';
import { useEffect, useState } from 'react';

type GuestData = {
  guest: { id:string; name:string; team:string; points:number };
  assignments: Array<{ id:string; status:string; task:{ title:string; description:string; points:number } }>;
  clues: Array<{ id:string; content:string }>;
  game: { voting_open:boolean; results_visible:boolean } | null;
  candidates: Array<{ id:string; name:string; team:string }>;
  existingVote: string | null;
};

export default function GuestPage() {
  const [name,setName]=useState(''); const [code,setCode]=useState('');
  const [data,setData]=useState<GuestData|null>(null); const [error,setError]=useState(''); const [msg,setMsg]=useState('');
  const [loading,setLoading]=useState(false);

  async function load(){
    const r=await fetch('/api/guest-me');
    if(r.ok) setData(await r.json());
  }
  useEffect(()=>{load()},[]);

  async function login(e:React.FormEvent){e.preventDefault(); setLoading(true); setError('');
    const r=await fetch('/api/guest-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,code})});
    const j=await r.json(); setLoading(false); if(!r.ok){setError(j.error||'登录失败');return;} await load();
  }
  async function submit(assignmentId:string){setMsg('');
    const r=await fetch('/api/submit-task',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({assignmentId})});
    const j=await r.json(); if(!r.ok){setError(j.error||'提交失败');return;} setMsg('已提交，等待主办方确认。'); await load();
  }
  async function vote(targetGuestId:string){
    const r=await fetch('/api/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetGuestId})});
    const j=await r.json(); if(!r.ok){setError(j.error||'投票失败');return;} setMsg('投票已保存。'); await load();
  }

  if(!data) return <main><section className="hero"><h1>宾客入口</h1><p>输入姓名和专属四位码。</p></section><form className="card" onSubmit={login}><label>姓名</label><input value={name} onChange={e=>setName(e.target.value)} required/><label>四位登录码</label><input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" maxLength={8} required/><button disabled={loading}>{loading?'登录中…':'进入任务页面'}</button>{error&&<div className="error">{error}</div>}</form></main>;

  return <main>
    <section className="hero"><div className="pill">{data.guest.team}</div><h1>{data.guest.name}</h1><p>当前积分：<strong>{data.guest.points}</strong></p></section>
    {msg&&<div className="card success">{msg}</div>}{error&&<div className="card error">{error}</div>}
    <section className="card"><h2>我的秘密任务</h2>{data.assignments.length===0?<p className="muted">任务尚未派发。</p>:data.assignments.map(a=><div className="task" key={a.id}><h3>{a.task.title}</h3><p>{a.task.description}</p><span className="pill">{a.task.points} 分</span><span className="pill">{a.status}</span>{a.status==='assigned'&&<button onClick={()=>submit(a.id)}>我已完成</button>}</div>)}</section>
    <section className="card"><h2>已解锁线索</h2>{data.clues.length===0?<p className="muted">暂无线索。</p>:data.clues.map(c=><p key={c.id}>🔎 {c.content}</p>)}</section>
    {data.game?.voting_open&&<section className="card"><h2>最终投票</h2><p className="muted">请选择你认为最可疑的人。提交后再次选择会覆盖原投票。</p><div className="grid">{data.candidates.filter(c=>c.id!==data.guest.id).map(c=><button className={data.existingVote===c.id?'':'secondary'} key={c.id} onClick={()=>vote(c.id)}>{c.name} · {c.team}</button>)}</div></section>}
    {data.game?.results_visible&&<section className="card"><h2>结果已公布</h2><p>请跟随主持人的现场公布与颁奖。</p></section>}
    <button className="secondary" onClick={load}>刷新最新状态</button>
  </main>;
}
