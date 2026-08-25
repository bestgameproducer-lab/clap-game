'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { PlatformProvisioningQueueItem } from '@/lib/data/platform-operations';
import { createPlatformDraftId } from '@/lib/platform/draft';
import {
  createEmptyPlatformRuntimeReleaseChecklist,
  getPlatformRuntimeReleaseChecklist,
  isPlatformRuntimeReleaseChecklistComplete,
  type PlatformRuntimeReleaseAction,
} from '@/lib/platform/runtime-release';
import styles from '../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the stable operator-safe fallback below.
  }
  return '平台暂时无法记录正式发布状态';
}

export function RuntimeReleaseControl({ project }: { project: PlatformProvisioningQueueItem }) {
  const router = useRouter();
  const action: PlatformRuntimeReleaseAction | null = project.projectStatus === 'ready'
    ? 'release'
    : project.projectStatus === 'live' ? 'hold' : null;
  const [checklist, setChecklist] = useState(() => createEmptyPlatformRuntimeReleaseChecklist(action ?? 'release'));
  const [note, setNote] = useState('');
  const [customerMessage, setCustomerMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const checklistItems = useMemo(() => action ? getPlatformRuntimeReleaseChecklist(action) : [], [action]);
  const complete = action
    ? isPlatformRuntimeReleaseChecklistComplete(action, checklist)
      && note.trim().length >= 4
      && customerMessage.trim().length >= 4
    : false;

  useEffect(() => {
    if (!action) return;
    setChecklist(createEmptyPlatformRuntimeReleaseChecklist(action));
    setNote('');
    setCustomerMessage('');
    setConfirming(false);
    setMessage('');
  }, [action]);

  async function submit() {
    if (!action || !complete || busy) return;
    setBusy(true);
    setMessage(action === 'release' ? '正在记录人工发布确认…' : '正在记录人工暂停确认…');
    try {
      const response = await fetch(`/api/platform/operations/projects/${project.id}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, checklist, customerMessage, eventKey: createPlatformDraftId(), note }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(action === 'release' ? '正式运行状态已经记录。' : '正式运行标记已经暂停。');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '正式发布状态保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (!action) return null;

  const releasing = action === 'release';
  return (
    <section className={releasing ? styles.runtimeReleasePanel : styles.runtimeLivePanel}>
      <header>
        <div>
          <small>{releasing ? 'GATE 03 · RELEASE DECISION' : 'LIVE · SAFETY HOLD'}</small>
          <strong>{releasing ? '把已彩排实例标记为正式运行' : '正式运行中 · 可人工暂停平台标记'}</strong>
        </div>
        <span>{releasing ? '等待发布确认' : '正式运行'}</span>
      </header>
      <p className={styles.runtimeReleaseNotice}>
        {releasing
          ? '请先在外部部署平台完成公开与入口核对，再在这里留下发布记录。平台不会替你部署、改域名或开放网站。'
          : '如需暂停，请先在外部部署平台限制入口或切回安全版本。这里仅记录状态，不会替你关闭网站。'}
      </p>
      <div className={styles.runtimeReleaseChecklist}>
        {checklistItems.map((item) => (
          <label key={item.id} className={checklist[item.id] ? styles.runtimeReleaseCheckDone : styles.runtimeReleaseCheckPending}>
            <input type="checkbox" checked={Boolean(checklist[item.id])} onChange={(event) => { setChecklist((current) => ({ ...current, [item.id]: event.target.checked })); setConfirming(false); }} />
            <b aria-hidden="true">{checklist[item.id] ? '✓' : '·'}</b>
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <label className={styles.runtimeReleaseNote}>
        {releasing ? '内部发布记录' : '内部暂停记录'}
        <textarea value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); setConfirming(false); }} placeholder={releasing ? '记录确认人、正式入口核对、支持安排和回退版本；不要填写任何密钥。' : '记录暂停原因、影响范围、外部入口处置和恢复条件；不要填写宾客密码。'} />
        <small>{note.length}/1000 · 至少 4 个字</small>
      </label>
      <label className={styles.runtimeCustomerMessage}>
        客户可见交付说明
        <textarea value={customerMessage} maxLength={500} onChange={(event) => { setCustomerMessage(event.target.value); setConfirming(false); }} placeholder={releasing ? '例如：你们的婚礼游戏已经通过彩排并正式开放，二维码和现场支持均已确认。' : '例如：正式入口已按约定暂停，恢复时间与后续安排将由工作人员另行确认。'} />
        <small>{customerMessage.length}/500 · 会显示给项目所有者和协作者</small>
      </label>
      {message ? <p className={styles.runtimeReleaseMessage} role="status">{message}</p> : null}
      {confirming ? (
        <div className={styles.runtimeReleaseConfirm}>
          <strong>{releasing ? '确认记录为“正式运行”？' : '确认暂停“正式运行”标记？'}</strong>
          <p>{releasing ? '这会把客户项目状态改为正式运行并留下不可变发布记录；不会执行任何外部发布操作。' : '这会把客户项目退回待正式发布并保留全部历史；不会自动关闭、删除或回滚外部实例。'}</p>
          <div><button type="button" onClick={submit} disabled={busy}>{busy ? '正在保存…' : releasing ? '确认已人工发布' : '确认已人工暂停'}</button><button type="button" onClick={() => setConfirming(false)} disabled={busy}>返回检查</button></div>
        </div>
      ) : (
        <button type="button" className={releasing ? styles.runtimeReleaseContinue : styles.runtimeHoldContinue} onClick={() => setConfirming(true)} disabled={!complete || busy}>{complete ? (releasing ? '核对完成 · 记录正式运行' : '核对完成 · 记录暂停') : '完成全部检查并填写记录'}</button>
      )}
      {project.releaseEvents.length ? (
        <div className={styles.runtimeReleaseHistory}>
          <strong>发布状态历史</strong>
          {[...project.releaseEvents].reverse().map((event) => (
            <article key={event.id}>
              <div><small>{event.action === 'release' ? '正式运行' : '人工暂停'} · V{event.projectVersion}</small><time dateTime={event.createdAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(event.createdAt))}</time></div>
              <p>{event.note}</p>
              <blockquote>客户可见：{event.customerMessage}</blockquote>
              <code>{event.deploymentRef} · {event.manifestHash.slice(0, 12)}…</code>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
