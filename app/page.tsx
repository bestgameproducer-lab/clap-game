import { WeddingSignature } from './wedding-signature';
import { BaliInvitationScene } from './bali-invitation-scene';

export default function Home() {
  const title = process.env.NEXT_PUBLIC_WEDDING_TITLE || 'Our Wedding Mission';
  return <main className="home-shell">
    <section className="home-hero bali-home-hero">
      <div className="home-invitation-heading">
        <strong className="home-couple-name">ZIMIN <span>&amp;</span> ANRONG</strong>
        <div className="eyebrow">A SECRET WEDDING ADVENTURE</div>
        <WeddingSignature compact/>
      </div>
      <BaliInvitationScene/>
      <div className="home-story-mark"><span>♧</span><i/><b>THE CATS HAVE A SECRET</b><i/><span>♧</span></div>
      <p className="home-kicker">两位白猫丘比特，邀请你进入庄园</p>
      <h1>{title}</h1>
      <p className="home-copy">沿着稻田与花园领取身份、完成秘密任务，在婚礼故事结束前找出藏在宾客中的恶作剧者。</p>
      <a className="home-cta" href="/guest"><span>进入婚礼任务</span><b>→</b></a>
      <p className="privacy-note">仅限受邀宾客 · 秘密只在你的屏幕上停留</p>
    </section>
    <div className="organizer-links"><a href="/admin">主办方控制台</a><a href="/host">主持人流程台</a><a href="/station">丘比特任务站</a></div>
  </main>;
}
