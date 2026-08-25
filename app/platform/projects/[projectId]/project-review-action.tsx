'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // A stable generic error is safer than exposing an unexpected response body.
  }
  return '平台暂时无法提交项目，请稍后重试';
}

export function ProjectReviewAction({
  projectId,
  status,
  missingItems,
  canSubmit,
}: {
  projectId: string;
  status: string;
  missingItems: string[];
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submitReview() {
    if (busy || status !== 'draft' || missingItems.length) return;
    setBusy(true);
    setMessage('正在锁定当前版本并提交内容审核…');
    try {
      const response = await fetch(`/api/platform/projects/${projectId}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('已经提交内容审核，当前方案版本已锁定。');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '项目提交失败');
    } finally {
      setBusy(false);
    }
  }

  if (status !== 'draft') {
    return <div className={styles.reviewSubmitted}><b>✓</b><div><strong>当前版本已经进入交付流程</strong><p>客户草稿已锁定。后续修改需要由平台在审核流程中创建新版本，避免现场内容被静默覆盖。</p></div></div>;
  }

  if (!canSubmit) {
    return <div className={styles.reviewMissing}><strong>只有项目所有者可以提交审核</strong><p>协作者可以查看项目；编辑者也可以保存草稿，但锁定审核基线仍需由所有者确认。</p></div>;
  }

  return (
    <div className={styles.reviewAction}>
      {missingItems.length ? (
        <div className={styles.reviewMissing}>
          <strong>提交前还需完成 {missingItems.length} 项</strong>
          <ul>{missingItems.map((item) => <li key={item}>{item}</li>)}</ul>
          <p>返回方案与内容问卷补齐后，这里会自动开放。</p>
        </div>
      ) : confirming ? (
        <div className={styles.reviewConfirmation}>
          <strong>确认提交当前版本？</strong>
          <p>提交后客户侧不能继续覆盖草稿，平台会把这一版作为内容审核基线并保留审计记录。</p>
          <div><button type="button" onClick={submitReview} disabled={busy}>{busy ? '正在提交…' : '确认提交内容审核'}</button><button type="button" onClick={() => setConfirming(false)} disabled={busy}>暂不提交</button></div>
        </div>
      ) : (
        <button type="button" className={styles.reviewPrimaryButton} onClick={() => setConfirming(true)}>提交内容审核</button>
      )}
      {message ? <p className={styles.reviewMessage} role="status">{message}</p> : null}
    </div>
  );
}
