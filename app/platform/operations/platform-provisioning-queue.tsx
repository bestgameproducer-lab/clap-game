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
  return '平台暂时无法完成实例准备操作';
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
  const [manifestConfirmingId, setManifestConfirmingId] = useState('');
  const [instanceEditingId, setInstanceEditingId] = useState('');
  const [instanceConfirmingId, setInstanceConfirmingId] = useState('');
  const [instanceDrafts, setInstanceDrafts] = useState<Record<string, { targetOrigin: string; deploymentRef: string }>>({});
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
      setManifestConfirmingId('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '配置清单锁定失败');
    } finally {
      setBusyId('');
    }
  }

  function reviewInstanceRegistration(projectId: string) {
    const draft = instanceDrafts[projectId];
    if (!draft?.targetOrigin.trim() || !draft.deploymentRef.trim()) {
      setMessage('请先填写公开 HTTPS 实例网址和非敏感部署标识。');
      return;
    }
    setMessage('');
    setInstanceConfirmingId(projectId);
  }

  async function registerInstance(projectId: string) {
    if (busyId) return;
    const draft = instanceDrafts[projectId];
    if (!draft) return;
    setBusyId(projectId);
    setMessage('正在校验权益、清单版本和实例登记边界…');
    try {
      const response = await fetch(`/api/platform/operations/projects/${projectId}/instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId(), ...draft }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('独立实例已登记；平台尚未对它发起网络访问或健康检查。');
      setInstanceEditingId('');
      setInstanceConfirmingId('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '运行实例登记失败');
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
        const instanceDraft = instanceDrafts[project.id] ?? { targetOrigin: '', deploymentRef: '' };
        return (
          <article key={project.id} className={styles.provisioningCard}>
            <header><div><small>APPROVED V{project.version} · {project.planId === 'buyout' ? '单场买断' : '持续订阅'}</small><h3>{[project.partnerOne, project.partnerTwo].filter(Boolean).join(' & ')}</h3><p>{formatWeddingDate(project.weddingDate)} · {project.location}</p></div><span className={entitlementReady ? styles.preflightReady : styles.preflightWaiting}>{ENTITLEMENT_LABELS[project.entitlementStatus]}</span></header>
            <div className={styles.provisioningChecks}><span>✓ 内容审核通过</span><span className={project.manifest ? styles.checkReady : styles.checkWaiting}>{project.manifest ? '✓ 配置清单已锁定' : '· 配置清单待锁定'}</span><span className={entitlementReady ? styles.checkReady : styles.checkWaiting}>{entitlementReady ? '✓ 商业权益有效' : '· 开通前确认权益'}</span><span className={project.instance ? styles.checkReady : styles.checkWaiting}>{project.instance ? '✓ 独立实例已登记' : '· 独立实例未登记'}</span></div>
            {project.manifest ? (
              <>
                <div className={styles.manifestLocked}><div><small>SHA-256 · V{project.manifest.projectVersion}</small><code>{project.manifest.hash}</code></div><a href={`/api/platform/operations/projects/${project.id}/manifest`}>下载配置 JSON</a></div>
                {project.instance ? (
                  <div className={styles.instanceRegistered}>
                    <div><small>REGISTERED · {project.instance.deploymentRef}</small><strong>独立实例已登记，尚待健康验证</strong><code>{project.instance.targetOrigin}</code></div>
                    <a href={project.instance.targetOrigin} target="_blank" rel="noreferrer">只读打开实例</a>
                  </div>
                ) : !entitlementReady ? (
                  <p className={styles.instanceGateNotice}>配置已经锁定，但商业权益尚未激活。平台不会登记或连接运行实例。</p>
                ) : instanceConfirmingId === project.id ? (
                  <div className={styles.manifestConfirmation}>
                    <strong>确认登记这个独立实例？</strong>
                    <p>网址：{instanceDraft.targetOrigin}<br />部署标识：{instanceDraft.deploymentRef}</p>
                    <p>此操作只保存非敏感标识，不会保存密钥、创建资源或主动访问该网址。</p>
                    <div><button type="button" onClick={() => registerInstance(project.id)} disabled={busyId === project.id}>{busyId === project.id ? '正在登记…' : '确认登记实例'}</button><button type="button" onClick={() => setInstanceConfirmingId('')} disabled={busyId === project.id}>返回修改</button></div>
                  </div>
                ) : instanceEditingId === project.id ? (
                  <div className={styles.instanceRegistrationForm}>
                    <label>公开 HTTPS 实例网址<input type="url" inputMode="url" autoComplete="url" placeholder="https://wedding.example.com" maxLength={300} value={instanceDraft.targetOrigin} onChange={(event) => setInstanceDrafts((current) => ({ ...current, [project.id]: { ...instanceDraft, targetOrigin: event.target.value } }))} /></label>
                    <label>非敏感部署标识<input type="text" autoComplete="off" placeholder="vercel-project:deployment-id" maxLength={120} value={instanceDraft.deploymentRef} onChange={(event) => setInstanceDrafts((current) => ({ ...current, [project.id]: { ...instanceDraft, deploymentRef: event.target.value } }))} /></label>
                    <p>不要粘贴 Token、API Key、数据库连接串或带登录参数的网址。</p>
                    <div><button type="button" onClick={() => reviewInstanceRegistration(project.id)}>核对登记信息</button><button type="button" onClick={() => setInstanceEditingId('')}>取消</button></div>
                  </div>
                ) : (
                  <button type="button" className={styles.instanceRegisterButton} onClick={() => setInstanceEditingId(project.id)}>登记已有独立实例</button>
                )}
              </>
            ) : manifestConfirmingId === project.id ? (
              <div className={styles.manifestConfirmation}><strong>确认锁定这一版配置？</strong><p>清单只含实例运行所需的非敏感配置；不会带入故事原文、禁忌备注、主持备注、宾客数据或密钥。</p><div><button type="button" onClick={() => lockManifest(project.id)} disabled={busyId === project.id}>{busyId === project.id ? '正在锁定…' : '确认锁定 V' + project.version}</button><button type="button" onClick={() => setManifestConfirmingId('')} disabled={busyId === project.id}>取消</button></div></div>
            ) : (
              <button type="button" className={styles.manifestLockButton} onClick={() => setManifestConfirmingId(project.id)}>生成并锁定配置清单</button>
            )}
          </article>
        );
      })}</div>}
    </section>
  );
}
