'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PLATFORM_CUSTOMIZATION_LEVELS, PLATFORM_MODULES, PLATFORM_REHEARSAL_MODES, PLATFORM_SERVICES, PLATFORM_SUPPORT_MODES } from '@/lib/platform/catalog';
import { createPlatformDraftId, formatWeddingDate } from '@/lib/platform/draft';
import { getPlatformRetentionDays, isPlatformDataPolicyReady } from '@/lib/platform/data-policy';
import type { PlatformReviewQueueItem } from '@/lib/data/platform-operations';
import type { PlatformReviewDecision } from '@/lib/validation/platform-operations';
import styles from '../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to a stable operator-safe message.
  }
  return '平台暂时无法保存审核决定';
}

export function PlatformReviewQueue({ initialQueue }: { initialQueue: PlatformReviewQueueItem[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ projectId: string; decision: PlatformReviewDecision } | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  function beginDecision(projectId: string, decision: PlatformReviewDecision, dataPolicyReady = true) {
    if (decision === 'approved' && !dataPolicyReady) {
      setMessage('资料生命周期责任尚未完整确认，不能批准进入实例准备。');
      return;
    }
    if (decision === 'changes_requested' && !(notes[projectId] ?? '').trim()) {
      setMessage('退回修改前，请先填写客户能够理解的具体审核意见。');
      return;
    }
    setPending({ projectId, decision });
    setMessage('');
  }

  async function confirmDecision() {
    if (!pending || busyProjectId) return;
    setBusyProjectId(pending.projectId);
    setMessage('正在保存审核版本与审计记录…');
    try {
      const response = await fetch(`/api/platform/operations/projects/${pending.projectId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventKey: createPlatformDraftId(),
          decision: pending.decision,
          note: notes[pending.projectId] ?? '',
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(pending.decision === 'approved' ? '内容审核已通过，项目进入实例准备。' : '项目已退回客户修改，审核意见已经记录。');
      setPending(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '审核决定保存失败');
    } finally {
      setBusyProjectId(null);
    }
  }

  if (!initialQueue.length) {
    return <section className={styles.operationsEmpty}><span>✓</span><div><p className={styles.eyebrow}>QUEUE CLEAR</p><h2>当前没有待审核项目。</h2><p>客户提交完整内容后会自动进入这里；平台不会从本机草稿或现有婚礼数据库抓取资料。</p></div></section>;
  }

  return (
    <section className={styles.reviewQueueSection}>
      <div className={styles.reviewQueueHeading}><div><p className={styles.eyebrow}>CONTENT REVIEW QUEUE</p><h2>待审核项目</h2></div><span>{initialQueue.length} 个</span></div>
      {message ? <p className={styles.operationsMessage} role="status">{message}</p> : null}
      <div className={styles.reviewQueueList}>{initialQueue.map((project) => {
        const moduleNames = PLATFORM_MODULES.filter((module) => project.modules.includes(module.id)).map((module) => module.shortName);
        const scopeNames = [
          PLATFORM_CUSTOMIZATION_LEVELS.find((item) => item.id === project.deliveryScope.customizationLevel)?.name,
          PLATFORM_SUPPORT_MODES.find((item) => item.id === project.deliveryScope.supportMode)?.name,
          PLATFORM_REHEARSAL_MODES.find((item) => item.id === project.deliveryScope.rehearsalMode)?.name,
        ].filter(Boolean);
        const serviceNames = PLATFORM_SERVICES.filter((service) => project.deliveryScope.services.includes(service.id)).map((service) => service.name);
        const dataPolicyReady = isPlatformDataPolicyReady(project.dataPolicy);
        const isPending = pending?.projectId === project.id;
        return (
          <article key={project.id} className={styles.reviewQueueCard}>
            <header><div><small>VERSION {project.version} · {project.planId === 'buyout' ? '单场买断' : '持续订阅'}</small><h3>{[project.partnerOne, project.partnerTwo].filter(Boolean).join(' & ') || '未命名婚礼项目'}</h3><p>{formatWeddingDate(project.weddingDate)} · {project.location} · 约 {project.guestCount} 人</p></div><time dateTime={project.submittedAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(project.submittedAt))}</time></header>
            <div className={styles.reviewQueueFacts}><div><small>语言</small><strong>{project.contentBrief.language === 'bilingual' ? '中英双语' : '中文'}</strong></div><div><small>互动强度</small><strong>{{ gentle: '轻松温和', balanced: '自然平衡', immersive: '高沉浸互动' }[project.contentBrief.interaction]}</strong></div><div><small>模块</small><strong>{moduleNames.join('、')}</strong></div></div>
            <div className={styles.reviewContentBlocks}><section><small>故事素材</small><p>{project.contentBrief.storyMoments}</p></section><section><small>内容边界</small><p>{project.contentBrief.avoidTopics || '客户已确认：没有额外禁忌内容。'}</p></section><section><small>主持备注</small><p>{project.contentBrief.hostNotes || '暂无额外主持备注。'}</p></section><section><small>模板内容包</small><p>{project.templateContent.teamOneName} / {project.templateContent.teamTwoName}<br />{project.templateContent.openingScript}<br />新人问答 {project.templateContent.quizQuestions.length} 题 · 快问快答 {project.templateContent.quickQuizQuestions.length} 题 · 比划词 {project.templateContent.charadesWords.length} 个</p></section><section><small>任务文案覆盖</small><p>{project.templateContent.missionCopyOverrides.length ? project.templateContent.missionCopyOverrides.map((override) => `${override.missionCode} · ${override.title}\n${override.description}`).join('\n\n') : '沿用旗舰模板任务文案；积分、核验与分配规则保持锁定。'}</p></section><section><small>商业与交付范围</small><p>{scopeNames.join(' · ')}<br />{serviceNames.join('、') || '尚未选择服务项目'}{project.deliveryScope.serviceNotes ? <><br />备注：{project.deliveryScope.serviceNotes}</> : null}</p></section><section><small>宾客资料生命周期</small><p>婚礼后 {getPlatformRetentionDays(project.dataPolicy)} 天删除宾客运行资料<br />{project.dataPolicy.projectArchiveBeforeDeletion ? '删除前导出非宾客项目配置归档' : '删除前不生成项目配置归档'}<br />{isPlatformDataPolicyReady(project.dataPolicy) ? '名单权限与宾客告知责任均已确认 · 强制独立实例' : '资料责任尚未完整确认，不应批准'}</p></section></div>
            <label className={styles.reviewNoteLabel}>审核意见<textarea maxLength={2000} value={notes[project.id] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [project.id]: event.target.value }))} placeholder="通过时可记录交付提醒；退回时必须说明需要修改什么。" disabled={busyProjectId === project.id} /><small>{(notes[project.id] ?? '').length}/2000</small></label>
            {isPending ? <div className={styles.operatorConfirmation}><strong>{pending.decision === 'approved' ? '确认内容审核通过？' : '确认退回客户修改？'}</strong><p>{pending.decision === 'approved' ? '项目会进入实例准备，但不会自动收费或创建云资源。' : '项目会重新开放客户编辑，并在项目页展示本次审核意见。'}</p><div><button type="button" onClick={confirmDecision} disabled={busyProjectId === project.id}>{busyProjectId === project.id ? '正在保存…' : '确认并记录版本'}</button><button type="button" onClick={() => setPending(null)} disabled={busyProjectId === project.id}>取消</button></div></div> : <div className={styles.operatorActions}><button type="button" onClick={() => beginDecision(project.id, 'approved', dataPolicyReady)} disabled={!dataPolicyReady}>通过 · 进入实例准备</button><button type="button" onClick={() => beginDecision(project.id, 'changes_requested')}>退回修改</button></div>}
          </article>
        );
      })}</div>
    </section>
  );
}
