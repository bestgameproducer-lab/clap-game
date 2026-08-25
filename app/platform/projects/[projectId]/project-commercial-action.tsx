'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlatformCommercialQuoteRequestDto, PlatformEntitlementDto, PlatformProjectDto } from '@/lib/data/platform-projects';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to a stable customer-safe message.
  }
  return '平台暂时无法提交询价，请稍后重试';
}

export function ProjectCommercialAction({
  project,
  entitlementStatus,
  quoteRequests,
}: {
  project: Pick<PlatformProjectDto, 'id' | 'version' | 'status' | 'accessRole'>;
  entitlementStatus: PlatformEntitlementDto['status'] | null;
  quoteRequests: PlatformCommercialQuoteRequestDto[];
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const activeRequest = quoteRequests.find((request) => request.status === 'requested') ?? null;
  const previousRequest = quoteRequests.find((request) => request.status === 'superseded') ?? null;
  const canRequest = project.accessRole === 'owner'
    && entitlementStatus === 'pending'
    && ['draft', 'content_review', 'provisioning'].includes(project.status)
    && !activeRequest;

  async function requestQuote() {
    if (!canRequest || busy) return;
    setBusy(true);
    setMessage('正在锁定当前商业范围并提交询价…');
    try {
      const response = await fetch(`/api/platform/projects/${project.id}/quote-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId(), projectVersion: project.version }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('询价已提交，平台会基于这一版交付范围人工确认价格与条款。');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '询价提交失败');
    } finally {
      setBusy(false);
    }
  }

  if (entitlementStatus && entitlementStatus !== 'pending') {
    return <div className={styles.commercialQuoteResolved}><b>✓</b><div><strong>商业权益已经进入后续处理</strong><p>这里不会再创建新的询价记录；续费、变更或退款需要走独立的商业流程。</p></div></div>;
  }

  if (activeRequest) {
    return (
      <div className={styles.commercialQuotePending}>
        <b>报价待确认</b>
        <div><strong>已按 V{activeRequest.projectVersion} 提交人工询价</strong><p>这不是订单、合同或付款承诺，也不会自动激活婚礼实例。</p></div>
        <time dateTime={activeRequest.requestedAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(activeRequest.requestedAt))}</time>
      </div>
    );
  }

  if (project.accessRole !== 'owner') {
    return <div className={styles.commercialQuoteUnavailable}><strong>询价由项目所有者确认</strong><p>协作者可以核对商业范围，但不能代表所有者提交报价申请。</p></div>;
  }

  if (!['draft', 'content_review', 'provisioning'].includes(project.status)) {
    return <div className={styles.commercialQuoteUnavailable}><strong>当前阶段不能重新询价</strong><p>正式运行、彩排或归档中的商业变更需要由平台工作人员另行处理。</p></div>;
  }

  return (
    <div className={styles.commercialQuoteAction}>
      {previousRequest ? <p className={styles.commercialQuoteChanged}>此前 V{previousRequest.projectVersion} 的询价已因商业范围变化自动失效，请核对当前版本后重新提交。</p> : null}
      {confirming ? (
        <div className={styles.commercialQuoteConfirmation}>
          <strong>确认申请 V{project.version} 的正式报价？</strong>
          <p>平台只会保存当前套餐、日期地点、规模、模块与服务范围，不会带入故事原文、禁忌备注、宾客资料或任何密钥。</p>
          <p>此操作不会显示或接受未经确认的价格，不会收费、创建订单、签订合同或激活商业权益。</p>
          <div><button type="button" onClick={requestQuote} disabled={busy}>{busy ? '正在提交…' : '确认提交询价'}</button><button type="button" onClick={() => setConfirming(false)} disabled={busy}>返回核对</button></div>
        </div>
      ) : <button type="button" className={styles.commercialQuoteButton} onClick={() => { setConfirming(true); setMessage(''); }}>申请人工报价</button>}
      {message ? <p className={styles.commercialQuoteMessage} role="status">{message}</p> : null}
    </div>
  );
}
