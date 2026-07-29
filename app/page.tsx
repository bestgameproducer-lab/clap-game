export default function Home() {
  const title = process.env.NEXT_PUBLIC_WEDDING_TITLE || 'Our Wedding Mission';
  return <main className="home-shell">
    <section className="home-hero">
      <div className="eyebrow">YOU ARE INVITED TO PLAY</div>
      <div className="rings">♡</div>
      <p className="home-kicker">一场贯穿婚礼的秘密冒险</p>
      <h1>{title}</h1>
      <div className="ornament"><i/><span>✦</span><i/></div>
      <p className="home-copy">领取专属身份，完成秘密任务，收集线索，并在故事结束前找出藏在队伍里的丘比特恶作剧者。</p>
      <a className="home-cta" href="/guest"><span>进入婚礼任务</span><b>→</b></a>
      <p className="privacy-note">仅限受邀宾客 · 请不要向他人展示秘密任务</p>
    </section>
    <div className="organizer-links"><a href="/admin">主办方控制台</a><a href="/host">主持人流程台</a><a href="/station">丘比特任务站</a></div>
  </main>;
}
