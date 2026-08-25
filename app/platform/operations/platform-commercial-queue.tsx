import type { PlatformCommercialQuoteQueueItem } from '@/lib/data/platform-operations';
import { PLATFORM_CUSTOMIZATION_LEVELS, PLATFORM_REHEARSAL_MODES, PLATFORM_SERVICES, PLATFORM_SUPPORT_MODES } from '@/lib/platform/catalog';
import { formatWeddingDate } from '@/lib/platform/draft';
import styles from '../platform.module.css';

export function PlatformCommercialQueue({ requests }: { requests: PlatformCommercialQuoteQueueItem[] }) {
  return (
    <section className={styles.commercialQueueSection}>
      <div className={styles.reviewQueueHeading}><div><p className={styles.eyebrow}>COMMERCIAL REQUESTS</p><h2>人工询价队列</h2></div><span>{requests.length} 个</span></div>
      <p className={styles.provisioningIntro}>这里只显示客户明确提交的商业范围快照。当前没有价格、订单、付款或自动权益激活；正式报价前仍需人工确认币种、税务、退款和服务条款。</p>
      {!requests.length ? <div className={styles.provisioningEmpty}>当前没有待处理询价。</div> : (
        <div className={styles.commercialQueueList}>{requests.map((request) => {
          const customization = PLATFORM_CUSTOMIZATION_LEVELS.find((item) => item.id === request.deliveryScope.customizationLevel)?.name ?? request.deliveryScope.customizationLevel;
          const support = PLATFORM_SUPPORT_MODES.find((item) => item.id === request.deliveryScope.supportMode)?.name ?? request.deliveryScope.supportMode;
          const rehearsal = PLATFORM_REHEARSAL_MODES.find((item) => item.id === request.deliveryScope.rehearsalMode)?.name ?? request.deliveryScope.rehearsalMode;
          const services = PLATFORM_SERVICES.filter((item) => request.deliveryScope.services.includes(item.id)).map((item) => item.name);
          return (
            <article key={request.id} className={styles.commercialQueueCard}>
              <header><div><small>REQUESTED V{request.projectVersion} · {request.planId === 'buyout' ? '单场买断' : '持续订阅'}</small><h3>{[request.partnerOne, request.partnerTwo].filter(Boolean).join(' & ') || '未命名婚礼项目'}</h3><p>{formatWeddingDate(request.weddingDate)} · {request.location || '地点待确认'} · 约 {request.guestCount || '—'} 人</p></div><time dateTime={request.requestedAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(request.requestedAt))}</time></header>
              <div className={styles.commercialQueueFacts}><span>{customization}</span><span>{support}</span><span>{rehearsal}</span></div>
              <p>{services.join('、') || '服务范围待确认'}{request.deliveryScope.serviceNotes ? ` · ${request.deliveryScope.serviceNotes}` : ''}</p>
              <footer><b>待人工报价</b><span>尚未收费 · 尚未创建订单 · 权益仍为待确认</span></footer>
            </article>
          );
        })}</div>
      )}
    </section>
  );
}
