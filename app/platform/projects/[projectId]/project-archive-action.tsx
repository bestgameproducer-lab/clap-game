'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlatformProjectDto } from '@/lib/data/platform-projects';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to a stable customer-safe message.
  }
  return '平台暂时无法更新项目状态';
}

export function ProjectArchiveAction({
  projectId,
  status,
  accessRole,
}: {
  projectId: string;
  status: PlatformProjectDto['status'];
  accessRole: PlatformProjectDto['accessRole'];
}) {
  const router = useRouter();
  const [eventKey] = useState(() => createPlatformDraftId());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const action = status === 'archived' ? 'restore' : 'archive';

  if (!['draft', 'archived'].includes(status)) return null;
  if (accessRole !== 'owner') {
    return status === 'archived' ? <section className={`${styles.projectArchivePanel} ${styles.projectArchivePanelArchived}`}><div><small>ARCHIVED PROJECT</small><strong>这个项目已由所有者归档</strong><p>项目资料仍然保留；只有所有者可以把它恢复为可编辑草稿。</p></div></section> : null;
  }

  async function mutateArchiveState() {
    if (busy) return;
    setBusy(true);
    setMessage(action === 'archive' ? '正在安全归档草稿…' : '正在恢复为可编辑草稿…');
    try {
      const response = await fetch(`/api/platform/projects/${projectId}/archive-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey, action, confirmed: true }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(action === 'archive' ? '项目已经归档，资料仍然保留。' : '项目已经恢复为可编辑草稿。');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '项目状态更新失败');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'archived') {
    return <section className={`${styles.projectArchivePanel} ${styles.projectArchivePanelArchived}`}><div><small>ARCHIVED PROJECT</small><strong>项目资料已安全归档</strong><p>这不是删除。恢复后会回到可编辑草稿；已经失效的邀请、询价和报价不会自动恢复。</p></div>{confirming ? <div className={styles.projectArchiveConfirm}><b>恢复这个项目？</b><p>恢复只会重新开放草稿编辑，不会重新发送邀请、恢复报价或创建运行实例。</p><div><button type="button" onClick={mutateArchiveState} disabled={busy}>{busy ? '正在恢复…' : '确认恢复为草稿'}</button><button type="button" onClick={() => setConfirming(false)} disabled={busy}>保持归档</button></div></div> : <button type="button" onClick={() => { setConfirming(true); setMessage(''); }}>恢复为可编辑草稿</button>}{message ? <p className={styles.projectArchiveMessage} role="status">{message}</p> : null}</section>;
  }

  return <section className={styles.projectArchivePanel}><div><small>PROJECT HOUSEKEEPING</small><strong>暂时不再处理这个草稿？</strong><p>可以归档整理项目列表。所有内容和版本都会保留，但未领取邀请及当前询价、报价、沟通申请会失效。</p></div>{confirming ? <div className={styles.projectArchiveConfirm}><b>确认归档这个草稿？</b><p>归档不会删除项目，也不会影响任何独立婚礼运行实例；之后可以由所有者恢复。</p><div><button type="button" onClick={mutateArchiveState} disabled={busy}>{busy ? '正在归档…' : '确认安全归档'}</button><button type="button" onClick={() => setConfirming(false)} disabled={busy}>暂不归档</button></div></div> : <button type="button" onClick={() => { setConfirming(true); setMessage(''); }}>归档这个草稿</button>}{message ? <p className={styles.projectArchiveMessage} role="status">{message}</p> : null}</section>;
}
