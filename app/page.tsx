export default function Home() {
  const title = process.env.NEXT_PUBLIC_WEDDING_TITLE || 'Our Wedding Mission';
  return <main>
    <section className="hero">
      <div className="pill">Private Wedding Game</div>
      <h1>{title}</h1>
      <p>扫描进入，领取你的秘密任务。请不要向其他宾客展示你的页面。</p>
    </section>
    <div className="card">
      <a className="button" href="/guest">宾客进入</a>
      <a className="button secondary" href="/admin">主办方后台</a>
    </div>
  </main>;
}
