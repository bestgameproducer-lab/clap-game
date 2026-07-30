import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getPrintableMissionCards } from '@/lib/data/admin';
import { PrintButton } from './print-button';

export const dynamic = 'force-dynamic';

export default async function PrintableMissionCardsPage() {
  try { await requireAdmin(); } catch { redirect('/admin'); }
  const cards = await getPrintableMissionCards();
  return <main className="print-cards-shell">
    <header className="print-cards-toolbar"><div><small>ORGANIZER PRINT VIEW</small><h1>宾客任务卡</h1><p>不会打印基础阵营或隐藏身份。尚未抽卡的宾客会显示手机抽卡提示。</p></div><PrintButton/></header>
    <section className="print-card-grid">{cards.map((card) => <article className="print-mission-card" key={card.id}>
      <div className="print-card-brand"><span>♡</span><small>ZIMIN &amp; ANRONG</small></div>
      <h2>{card.name}</h2><p className="print-player-code">玩家编号 <strong>{card.player_code}</strong></p>
      {card.participation_mode === 'HONOR_GUEST' ? <div className="print-card-task"><small>FAMILY HONOR</small><h3>{card.special_card_title || '家庭守护者'}</h3><p>{card.special_card_body}</p></div>
        : card.task ? <div className="print-card-task"><small>YOUR MISSION</small><h3>{card.task.title}</h3><p>{card.task.description}</p><b>验证：{card.task.verification_method}</b></div>
        : <div className="print-card-task pending"><small>YOUR SECRET AWAITS</small><h3>请用手机打开婚礼任务页</h3><p>输入邀请码与四位个人密码后，抽取组别、身份和第一项任务。</p></div>}
      <footer>请不要向其他宾客展示任务内容 · clap-game-hlj6.vercel.app/guest</footer>
    </article>)}</section>
  </main>;
}
