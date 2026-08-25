'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { PlatformProvisioningQueueItem } from '@/lib/data/platform-operations';
import {
  createEmptyPlatformRuntimeChecklist,
  getPlatformRuntimeChecklist,
  isPlatformRuntimeChecklistComplete,
  type PlatformRuntimeAttestationStage,
} from '@/lib/platform/runtime-readiness';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the stable fallback below.
  }
  return '平台暂时无法记录实例核验';
}

export function RuntimeReadinessAttestation({
  projectId,
  instance,
}: {
  projectId: string;
  instance: NonNullable<PlatformProvisioningQueueItem['instance']>;
}) {
  const router = useRouter();
  const stage: PlatformRuntimeAttestationStage | null = instance.status === 'registered'
    ? 'verification'
    : instance.status === 'verified' ? 'readiness' : null;
  const [checklist, setChecklist] = useState(() => createEmptyPlatformRuntimeChecklist(stage ?? 'verification'));
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const checklistItems = useMemo(() => stage ? getPlatformRuntimeChecklist(stage) : [], [stage]);
  const complete = stage ? isPlatformRuntimeChecklistComplete(stage, checklist) && note.trim().length >= 4 : false;

  useEffect(() => {
    if (!stage) return;
    setChecklist(createEmptyPlatformRuntimeChecklist(stage));
    setNote('');
    setConfirming(false);
  }, [stage]);

  async function submitAttestation() {
    if (!stage || !complete || busy) return;
    setBusy(true);
    setMessage(stage === 'verification' ? '正在记录实例验证与审计信息…' : '正在锁定正式就绪状态…');
    try {
      const response = await fetch(`/api/platform/operations/projects/${projectId}/instance/attestation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId(), stage, checklist, note }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(stage === 'verification' ? '实例人工验证已记录；下一步完成全流程彩排。' : '全流程彩排已确认，项目进入待正式发布。');
      setConfirming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '实例核验保存失败');
    } finally {
      setBusy(false);
    }
  }

  if (instance.status === 'ready') {
    return (
      <section className={styles.runtimeReadyCard}>
        <div><small>READY FOR RELEASE</small><strong>实例已经通过人工验证与完整彩排</strong><p>项目现处于“待正式发布”，还没有自动公开、切换域名或触发任何婚礼流程。</p></div>
        <span>✓</span>
        <div className={styles.runtimeAttestationHistory}>{instance.attestations.map((attestation) => <article key={attestation.id}><small>{attestation.stage === 'verification' ? '实例验证' : '全流程彩排'} · {new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(attestation.createdAt))}</small><p>{attestation.note}</p></article>)}</div>
      </section>
    );
  }

  if (!stage) {
    return <p className={styles.runtimeAttestationUnavailable}>实例当前为 {instance.status}，不能继续执行上线核验。</p>;
  }

  return (
    <section className={styles.runtimeAttestationPanel}>
      <header><div><small>{stage === 'verification' ? 'GATE 01 · MANUAL VERIFICATION' : 'GATE 02 · FULL REHEARSAL'}</small><strong>{stage === 'verification' ? '先确认实例真的独立、匹配且可操作' : '再用真实设备完成一次完整彩排'}</strong></div><span>{stage === 'verification' ? '登记后验证' : '验证后彩排'}</span></header>
      <p className={styles.runtimeAttestationNotice}>{stage === 'verification' ? '平台不会自动访问实例。请工作人员亲自打开网址、核对下载清单与部署环境，再逐项确认。' : '请使用测试账号和测试数据覆盖宾客、主办方、主持人及任务站联动；不要把未经彩排的实例标记为就绪。'}</p>
      <div className={styles.runtimeChecklist}>{checklistItems.map((item) => <label key={item.id} className={checklist[item.id] ? styles.runtimeCheckDone : styles.runtimeCheckPending}><input type="checkbox" checked={Boolean(checklist[item.id])} onChange={(event) => { setChecklist((current) => ({ ...current, [item.id]: event.target.checked })); setConfirming(false); }} /><b aria-hidden="true">{checklist[item.id] ? '✓' : '·'}</b><span>{item.label}</span></label>)}</div>
      <label className={styles.runtimeAttestationNote}>核验记录<textarea value={note} maxLength={1000} onChange={(event) => { setNote(event.target.value); setConfirming(false); }} placeholder={stage === 'verification' ? '记录核验设备、浏览器、实例版本和发现的问题；不要填写任何密钥。' : '记录彩排日期、参与人员、手机型号、异常路径和修复结论；不要填写宾客密码。'} /><small>{note.length}/1000 · 至少 4 个字</small></label>
      {message ? <p className={styles.runtimeAttestationMessage} role="status">{message}</p> : null}
      {confirming ? <div className={styles.runtimeAttestationConfirm}><strong>{stage === 'verification' ? '确认把实例标记为“已验证”？' : '确认把项目标记为“待正式发布”？'}</strong><p>该操作会保存工作人员、时间、完整清单和备注，并写入审计记录。它不会联网探测、发布网站、修改域名或启动婚礼流程。</p><div><button type="button" onClick={submitAttestation} disabled={busy}>{busy ? '正在保存…' : '确认并记录'}</button><button type="button" onClick={() => setConfirming(false)} disabled={busy}>返回检查</button></div></div> : <button type="button" className={styles.runtimeAttestationContinue} onClick={() => setConfirming(true)} disabled={!complete || busy}>{complete ? '核对完成 · 继续确认' : '完成全部检查并填写记录'}</button>}
      {instance.attestations.length ? <div className={styles.runtimeAttestationHistory}>{instance.attestations.map((attestation) => <article key={attestation.id}><small>{attestation.stage === 'verification' ? '实例验证' : '全流程彩排'} · {new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(attestation.createdAt))}</small><p>{attestation.note}</p></article>)}</div> : null}
    </section>
  );
}
