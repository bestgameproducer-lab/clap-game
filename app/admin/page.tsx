'use client';
import { useEffect, useState } from 'react';

type AdminData={guests:any[];assignments:any[];tasks:any[];submissions:any[];votes:any[];game:any};
export default function AdminPage(){
 const [password,setPassword]=useState(''); const [data,setData]=useState<AdminData|null>(null); const [error,setError]=useState('');
 async function load(){const r=await fetch('/api/admin-data'); if(r.ok)setData(await r.json());}
 useEffect(()=>{load()},[]);
 async function login(e:React.FormEvent){e.preventDefault(); const r=await fetch('/api/admin-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})}); const j=await r.json(); if(!r.ok){setError(j.error||'登录失败');return;} await load();}
 async function action(body:any){const r=await fetch('/api/admin-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); const j=await r.json(); if(!r.ok){setError(j.error||'操作失败');return;} await load();}
 if(!data)return <main><section className="hero"><h1>主办方后台</h1><p>仅供新人或主持人使用。</p></section><form className="card" onSubmit={login}><label>管理员密码</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/><button>登录</button>{error&&<div className="error">{error}</div>}</form></main>;
 return <main><section className="hero"><h1>游戏控制台</h1><p>{data.guests.length} 位宾客</p></section>{error&&<div className="card error">{error}</div>}
 <section className="card"><h2>全局状态</h2><div className="grid"><button onClick={()=>action({type:'toggleVoting',value:!data.game?.voting_open})}>{data.game?.voting_open?'关闭投票':'开启投票'}</button><button className="secondary" onClick={()=>action({type:'toggleResults',value:!data.game?.results_visible})}>{data.game?.results_visible?'隐藏结果':'公布结果'}</button></div></section>
 <section className="card"><h2>待审核任务</h2>{data.submissions.length===0?<p className="muted">暂无待审核提交。</p>:data.submissions.map((s:any)=><div className="task" key={s.id}><strong>{s.guest?.name}</strong><p>{s.task?.title}</p><div className="grid"><button onClick={()=>action({type:'approve',assignmentId:s.id})}>确认完成并加分</button><button className="danger" onClick={()=>action({type:'reject',assignmentId:s.id})}>退回</button></div></div>)}</section>
 <section className="card"><h2>宾客与任务</h2><div style={{overflowX:'auto'}}><table><thead><tr><th>宾客</th><th>组别</th><th>积分</th><th>任务状态</th></tr></thead><tbody>{data.guests.map((g:any)=><tr key={g.id}><td>{g.name}</td><td>{g.team}</td><td>{g.points}</td><td>{data.assignments.filter((a:any)=>a.guest_id===g.id).map((a:any)=><div key={a.id}>{a.task?.title}: {a.status}</div>)}</td></tr>)}</tbody></table></div></section>
 <section className="card"><h2>投票统计</h2>{data.votes.length===0?<p className="muted">暂无投票。</p>:<ul>{Object.entries(data.votes.reduce((acc:any,v:any)=>{const n=v.target?.name||'未知';acc[n]=(acc[n]||0)+1;return acc;},{})).sort((a:any,b:any)=>b[1]-a[1]).map(([n,c]:any)=><li key={n}>{n}: {c} 票</li>)}</ul>}</section>
 </main>
}
