'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlatformProvisioningQueueItem } from '@/lib/data/platform-operations';
import { createPlatformDraftId, formatWeddingDate } from '@/lib/platform/draft';
import styles from '../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the stable operator-safe fallback below.
  }
  return '平台暂时无法锁定实例配置清单';
}

const ENTITLEMENT_LABELS = {
  pending: '权益待确认',
  active: '权益已激活',
  past_due: '权益逾期',
  cancelled: '权益已取消',
  expired: '权益已到期',
} as const;

export function PlatformProvisioningQueue({ initialQueue }: { initialQueue: PlatformProvisioningQueueItem[] }) {
  const router = useRouter();
  const [confirmingId, setConfirmingId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  async function lockManifest(projectId: string) {
    if (busyId) return;
    setBusyId(projectId);
    setMessage('正在从已批准版本生成并锁定配置清单…');
    try {
      const response = await fetch(`/api/platform/operations/projects/${projectId}/manifest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('配置清单已锁定并写入审计记录。');
      setConfirmingId('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '配置清单锁定失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className={styles.provisioningSection}>
      <div className={styles.reviewQueueHeading}><div><p className={styles.eyebrow}>INSTANCE PREPARATION</p><h2>实例准备</h2></div><span>{initialQueue.length} 个</span></div>
      <p className={styles.provisioningIntro}>这里只生成审核版本的最小运行配置，不创建 Vercel、Supabase、域名或付费资源。真正开通前仍需权益确认和独立实例预检。</p>
      {message ? <p className={styles.operationsMessage} role="status">{message}</p> : null}
      {!initialQueue.length ? <div className={styles.provisioningEmpty}>内容通过审核后，项目会进入这里。</div> : <div className={styles.provisioningList}>{initialQueue.map((project) => {
        const entitlementReady = project.entitlementStatus === 'active';
        return <article key={project.id} className={styles.provisioningCard}>
          <header><div><small>APPROVED V{project.version} · {project.planId === 'buyout' ? '单场买断' : '持续订阅'}</small><h3>{[project.partnerOne, project.partnerTwo].filter(Boolean).join(' & ')}</h3><p>{formatWeddingDate(project.weddingDate)} · {project.location}</p></div><span className={entitlementReady ? styles.preflightReady : styles.preflightWaiting}>{ENTITLEMENT_LABELS[project.entitlementStatus]}</span></header>
          <div className={styles.provisioningChecks}><span>✓ 内容审核通过</span><span className={project.manifest ? styles.checkReady : styles.checkWaiting}>{project.manifest ? '✓ 配置清单已锁定' : '· 配置清单待锁定'}</span><span className={entitlementReady ? styles.checkReady : styles.checkWaiting}>{entitlementReady ? '✓ 商业权益有效' : '· 开通前确认权益'}</span><span>✓ 尚未创建云资源</span></div>
          {project.manifest ? <div className={styles.manifestLocked}><div><small>SHA-256 · V{project.manifest.projectVersion}</small><code>{project.manifest.hash}</code></div><a href={`/api/platform/operations/projects/${project.id}/manifest`}>下载配置 JSON</a></div> : confirmingId === project.id ? <div className={styles.manifestConfirmation}><strong>确认锁定这一版配置？</strong><p>清单只含实例运行所需的非敏感配置；不会带入故事原文、禁忌备注、主持备注、宾客数据或密钥。</p><div><button type="button" onClick={() => lockManifest(project.id)} disabled={busyId === project.id}>{busyId === project.id ? '正在锁定…' : '确认锁定 V' + project.version}</button><button type="button" onClick={() => setConfirmingId('')} disabled={busyId === project.id}>取消</button></div></div> : <button type="button" className={styles.manifestLockButton} onClick={() => setConfirmingId(project.id)}>生成并锁定配置清单</button>}
        </article>;
      })}</div>}
    </section>
  );
}
