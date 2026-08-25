'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlatformProjectDto, PlatformQuoteProceedRequestDto } from '@/lib/data/platform-projects';
import type { PlatformCommercialQuote } from '@/lib/platform/commercial';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to a stable customer-safe message.
  }
  return '平台暂时无法提交下一步申请';
}

export function ProjectQuoteProceedAction({
  projectId,
  accessRole,
  quote,
  expired,
  proceedRequest,
}: {
  projectId: string;
  accessRole: PlatformProjectDto['accessRole'];
  quote: PlatformCommercialQuote;
  expired: boolean;
  proceedRequest: PlatformQuoteProceedRequestDto | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function requestProceed() {
    if (!acknowledged || busy || expired || accessRole !== 'owner') return;
    setBusy(true);
    setMessage('正在提交人工跟进申请…');
    try {
      const response = await fetch(`/api/platform/projects/${projectId}/quote-proceed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventKey: createPlatformDraftId(),
          quoteId: quote.id,
          acknowledgedNoPayment: true,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('申请已经记录，工作人员将另行联系合同与付款安排。');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '下一步申请失败');
    } finally {
      setBusy(false);
    }
  }

  if (proceedRequest?.status === 'requested') {
    return <div className={styles.quoteProceedPending}><b>✓</b><div><strong>已申请进入下一步沟通</strong><p>工作人员会另行联系合同与付款安排；当前页面没有产生订单、扣款或权益激活。</p><time dateTime={proceedRequest.requestedAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(proceedRequest.requestedAt))}</time></div></div>;
  }
  if (expired) return <div className={styles.quoteProceedUnavailable}><strong>这份报价已经过期</strong><p>请等待工作人员发布更新后的报价草案，再申请进入下一步。</p></div>;
  if (accessRole !== 'owner') return <div className={styles.quoteProceedUnavailable}><strong>由项目所有者确认下一步</strong><p>协作者可以查看报价，但不能代表所有者发起合同或付款沟通。</p></div>;

  return <div className={styles.quoteProceedAction}>{confirming ? <div className={styles.quoteProceedConfirmation}><strong>申请工作人员联系下一步？</strong><p>这只是沟通申请，不是接受合同、创建订单或授权付款。正式条款和支付方式会在独立流程中确认。</p><label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><b>{acknowledged ? '✓' : ''}</b>我确认此操作不会付款，也不代表接受合同。</span></label><div><button type="button" onClick={requestProceed} disabled={!acknowledged || busy}>{busy ? '正在提交…' : '确认申请人工跟进'}</button><button type="button" onClick={() => { setConfirming(false); setAcknowledged(false); }} disabled={busy}>返回核对</button></div></div> : <button type="button" className={styles.quoteProceedButton} onClick={() => { setConfirming(true); setMessage(''); }}>确认报价内容 · 申请下一步沟通</button>}{message ? <p className={styles.quoteProceedMessage} role="status">{message}</p> : null}</div>;
}
