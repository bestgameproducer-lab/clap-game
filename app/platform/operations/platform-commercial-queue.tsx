'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlatformCommercialQuoteQueueItem } from '@/lib/data/platform-operations';
import { PLATFORM_CUSTOMIZATION_LEVELS, PLATFORM_REHEARSAL_MODES, PLATFORM_SERVICES, PLATFORM_SUPPORT_MODES } from '@/lib/platform/catalog';
import { PLATFORM_QUOTE_BILLING_LABELS, PLATFORM_QUOTE_CURRENCIES, formatPlatformQuoteAmount, parsePlatformQuoteAmountInput, type PlatformQuoteBillingInterval, type PlatformQuoteCurrency } from '@/lib/platform/commercial';
import { createPlatformDraftId, formatWeddingDate } from '@/lib/platform/draft';
import styles from '../platform.module.css';

type QuoteDraft = {
  amount: string;
  currency: PlatformQuoteCurrency;
  billingInterval: PlatformQuoteBillingInterval;
  validUntil: string;
  serviceSummary: string;
  termsSummary: string;
};

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to a stable operator-safe message.
  }
  return '平台暂时无法保存报价草案';
}

function createQuoteDraft(request: PlatformCommercialQuoteQueueItem): QuoteDraft {
  const quote = request.quote;
  return {
    amount: quote ? (quote.amountMinor / 100).toFixed(2) : '',
    currency: quote?.currency ?? 'USD',
    billingInterval: quote?.billingInterval ?? (request.planId === 'buyout' ? 'one_time' : 'annual'),
    validUntil: quote?.validUntil ?? '',
    serviceSummary: quote?.serviceSummary ?? '',
    termsSummary: quote?.termsSummary ?? '',
  };
}

export function PlatformCommercialQueue({ requests, today }: { requests: PlatformCommercialQuoteQueueItem[]; today: string }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState('');
  const [confirmingId, setConfirmingId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [drafts, setDrafts] = useState<Record<string, QuoteDraft>>({});
  const [message, setMessage] = useState('');

  function beginQuote(request: PlatformCommercialQuoteQueueItem) {
    setDrafts((current) => ({ ...current, [request.id]: current[request.id] ?? createQuoteDraft(request) }));
    setEditingId(request.id);
    setConfirmingId('');
    setMessage('');
  }

  function updateDraft(requestId: string, update: Partial<QuoteDraft>) {
    setDrafts((current) => ({ ...current, [requestId]: { ...current[requestId], ...update } }));
    setConfirmingId('');
  }

  function reviewQuote(request: PlatformCommercialQuoteQueueItem) {
    const draft = drafts[request.id];
    if (!draft || !parsePlatformQuoteAmountInput(draft.amount)) return setMessage('请输入大于 0、最多两位小数的报价金额。');
    if (!draft.validUntil) return setMessage('请选择报价有效期。');
    if (draft.serviceSummary.trim().length < 4) return setMessage('服务摘要至少需要 4 个字。');
    if (draft.termsSummary.trim().length < 20) return setMessage('商业条款摘要至少需要 20 个字，并明确税务、退款和服务边界。');
    if (request.planId === 'buyout' && draft.billingInterval !== 'one_time') return setMessage('单场买断只能使用一次性费用。');
    if (request.planId === 'subscription' && draft.billingInterval === 'one_time') return setMessage('持续订阅必须选择每月或每年计费。');
    setMessage('');
    setConfirmingId(request.id);
  }

  async function submitQuote(request: PlatformCommercialQuoteQueueItem) {
    const draft = drafts[request.id];
    const amountMinor = draft ? parsePlatformQuoteAmountInput(draft.amount) : null;
    if (!draft || !amountMinor || busyId) return;
    setBusyId(request.id);
    setMessage('正在保存客户可见的非约束性报价草案…');
    try {
      const response = await fetch('/api/platform/operations/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventKey: createPlatformDraftId(),
          quoteRequestId: request.id,
          amountMinor,
          currency: draft.currency,
          billingInterval: draft.billingInterval,
          validUntil: draft.validUntil,
          serviceSummary: draft.serviceSummary,
          termsSummary: draft.termsSummary,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('报价草案已经保存并显示给客户；没有创建订单、付款或商业权益。');
      setEditingId('');
      setConfirmingId('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '报价草案保存失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className={styles.commercialQueueSection}>
      <div className={styles.reviewQueueHeading}><div><p className={styles.eyebrow}>COMMERCIAL REQUESTS</p><h2>人工询价队列</h2></div><span>{requests.length} 个</span></div>
      <p className={styles.provisioningIntro}>这里只显示客户明确提交的商业范围快照。报价草案由工作人员人工填写，但当前仍不会创建订单、收款、合同或自动权益；不得在文字中填写付款链接、收款账号或任何密钥。</p>
      {message ? <p className={styles.operationsMessage} role="status">{message}</p> : null}
      {!requests.length ? <div className={styles.provisioningEmpty}>当前没有待处理询价。</div> : (
        <div className={styles.commercialQueueList}>{requests.map((request) => {
          const customization = PLATFORM_CUSTOMIZATION_LEVELS.find((item) => item.id === request.deliveryScope.customizationLevel)?.name ?? request.deliveryScope.customizationLevel;
          const support = PLATFORM_SUPPORT_MODES.find((item) => item.id === request.deliveryScope.supportMode)?.name ?? request.deliveryScope.supportMode;
          const rehearsal = PLATFORM_REHEARSAL_MODES.find((item) => item.id === request.deliveryScope.rehearsalMode)?.name ?? request.deliveryScope.rehearsalMode;
          const services = PLATFORM_SERVICES.filter((item) => request.deliveryScope.services.includes(item.id)).map((item) => item.name);
          const draft = drafts[request.id] ?? createQuoteDraft(request);
          return (
            <article key={request.id} className={styles.commercialQueueCard}>
              <header><div><small>REQUESTED V{request.projectVersion} · {request.planId === 'buyout' ? '单场买断' : '持续订阅'}</small><h3>{[request.partnerOne, request.partnerTwo].filter(Boolean).join(' & ') || '未命名婚礼项目'}</h3><p>{formatWeddingDate(request.weddingDate)} · {request.location || '地点待确认'} · 约 {request.guestCount || '—'} 人</p></div><time dateTime={request.requestedAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(request.requestedAt))}</time></header>
              <div className={styles.commercialQueueFacts}><span>{customization}</span><span>{support}</span><span>{rehearsal}</span></div>
              <p>{services.join('、') || '服务范围待确认'}{request.deliveryScope.serviceNotes ? ` · ${request.deliveryScope.serviceNotes}` : ''}</p>
              {request.quote ? <div className={styles.operatorQuoteCurrent}><small>{request.quote.validUntil < today ? '客户草案已过期' : '当前客户可见草案'}</small><strong>{formatPlatformQuoteAmount(request.quote.amountMinor, request.quote.currency)} · {PLATFORM_QUOTE_BILLING_LABELS[request.quote.billingInterval]}</strong><p>{request.quote.validUntil < today ? `已于 ${request.quote.validUntil} 过期，请更新草案` : `有效至 ${request.quote.validUntil}`} · {request.quote.serviceSummary}</p></div> : null}
              {editingId === request.id ? (
                <div className={styles.operatorQuoteForm}>
                  <label>报价金额<input value={draft.amount} inputMode="decimal" autoComplete="off" placeholder="例如 2999.00" onChange={(event) => updateDraft(request.id, { amount: event.target.value })} /></label>
                  <label>币种<select value={draft.currency} onChange={(event) => updateDraft(request.id, { currency: event.target.value as PlatformQuoteCurrency })}>{PLATFORM_QUOTE_CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
                  <label>计费周期<select value={draft.billingInterval} onChange={(event) => updateDraft(request.id, { billingInterval: event.target.value as PlatformQuoteBillingInterval })}>{request.planId === 'buyout' ? <option value="one_time">一次性费用</option> : <><option value="monthly">每月</option><option value="annual">每年</option></>}</select></label>
                  <label>有效至<input type="date" value={draft.validUntil} onChange={(event) => updateDraft(request.id, { validUntil: event.target.value })} /></label>
                  <label className={styles.operatorQuoteWide}>客户可见服务摘要<textarea maxLength={1000} value={draft.serviceSummary} onChange={(event) => updateDraft(request.id, { serviceSummary: event.target.value })} placeholder="概括本次价格覆盖的定制、彩排、托管和现场支持。" /></label>
                  <label className={styles.operatorQuoteWide}>客户可见商业条款摘要<textarea maxLength={4000} value={draft.termsSummary} onChange={(event) => updateDraft(request.id, { termsSummary: event.target.value })} placeholder="明确币种、税务口径、有效期、退款边界、交付范围和不包含事项；不要填写付款链接或收款账号。" /></label>
                  {confirmingId === request.id ? <div className={styles.operatorQuoteConfirmation}><strong>确认发布这份非约束性报价草案？</strong><p>{formatPlatformQuoteAmount(parsePlatformQuoteAmountInput(draft.amount) ?? 0, draft.currency)} · {PLATFORM_QUOTE_BILLING_LABELS[draft.billingInterval]} · 有效至 {draft.validUntil}</p><p>客户会立即看到金额和文字，但不能在平台接受或付款；旧草案会保留为历史记录。</p><div><button type="button" onClick={() => submitQuote(request)} disabled={busyId === request.id}>{busyId === request.id ? '正在保存…' : '确认发布草案'}</button><button type="button" onClick={() => setConfirmingId('')} disabled={busyId === request.id}>继续修改</button></div></div> : <div className={styles.operatorQuoteActions}><button type="button" onClick={() => reviewQuote(request)}>核对报价草案</button><button type="button" onClick={() => setEditingId('')}>取消</button></div>}
                </div>
              ) : <footer><b>{request.quote ? '报价草案已发布' : '待人工报价'}</b><span>尚未收费 · 尚未创建订单 · 权益仍为待确认</span><button type="button" onClick={() => beginQuote(request)}>{request.quote ? '更新报价草案' : '填写报价草案'}</button></footer>}
            </article>
          );
        })}</div>
      )}
    </section>
  );
}
