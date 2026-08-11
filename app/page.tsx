import { WeddingSignature } from './wedding-signature';
import { BaliInvitationScene } from './bali-invitation-scene';

export default function Home() {
  return <main className="home-shell">
    <section className="home-hero bali-home-hero">
      <div className="home-invitation-heading">
        <div className="home-couple-signature">Zimin <em>&amp;</em> Anrong</div>
        <WeddingSignature compact/>
      </div>
      <BaliInvitationScene/>
      <div className="home-story-mark"><span>♧</span><i/><b>A SECRET INVITATION</b><i/><span>♧</span></div>
      <h1 className="home-invitation-title">白猫丘比特发来一份秘密邀约</h1>
      <p className="home-copy">领取你的身份，完成藏在婚礼里的秘密任务。<br/>在故事揭晓前，找出混入宾客中的恶作剧者。</p>
      <a className="home-cta" href="/guest"><span>领取我的秘密身份</span><b>→</b></a>
      <p className="privacy-note">受邀宾客专属 · 请独自查看你的身份与任务</p>
    </section>
    <div className="organizer-links"><a href="/admin">主办方控制台</a><a href="/host">主持人流程台</a><a href="/station">丘比特任务站</a></div>
  </main>;
}
