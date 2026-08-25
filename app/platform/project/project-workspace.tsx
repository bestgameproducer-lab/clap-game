'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { PLATFORM_MODULES, PLATFORM_PLANS, PLATFORM_THEMES, PLATFORM_TONES } from '../../../lib/platform/catalog';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  formatWeddingDate,
  getWeddingContentBrief,
  getWeddingDeliveryScope,
  getWeddingCoupleName,
  isWeddingDraft,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import styles from '../platform.module.css';

const DELIVERY_STAGES = [
  { name: '方案草稿', copy: '新人完成第一版方向选择', state: 'current' },
  { name: '内容定制', copy: '确认故事、题库、角色与视觉', state: 'future' },
  { name: '实例开通', copy: '创建隔离运行环境与管理入口', state: 'future' },
  { name: '完整彩排', copy: '覆盖全角色、全阶段与异常路径', state: 'future' },
  { name: '正式发布', copy: '锁定版本并交付二维码与手册', state: 'future' },
] as const;

const PREPARATION_ITEMS = [
  { id: 'couple', name: '新人基本信息', copy: '双方姓名已填写', ready: (draft: WeddingDraft) => Boolean(draft.partnerOne.trim() && draft.partnerTwo.trim()) },
  { id: 'schedule', name: '婚礼时间地点', copy: '日期与场地已确认', ready: (draft: WeddingDraft) => Boolean(draft.weddingDate && draft.location.trim()) },
  { id: 'story', name: '故事素材', copy: '至少留下一条真实故事素材', ready: (draft: WeddingDraft) => Boolean(getWeddingContentBrief(draft).storyMoments.trim() || draft.storyNote.trim()) },
  { id: 'boundaries', name: '内容边界', copy: '已确认禁忌话题与互动尺度', ready: (draft: WeddingDraft) => getWeddingContentBrief(draft).boundariesConfirmed },
  { id: 'modules', name: '游戏模块', copy: '至少选择一个现场模块', ready: (draft: WeddingDraft) => draft.modules.length > 0 },
  { id: 'delivery', name: '交付方式', copy: '已选择买断或订阅方向', ready: (draft: WeddingDraft) => Boolean(draft.plan) },
  { id: 'scope', name: '服务范围', copy: '已选择定制、支持和彩排方式', ready: (draft: WeddingDraft) => getWeddingDeliveryScope(draft).services.length > 0 },
] as const;

export function ProjectWorkspace() {
  const [draft, setDraft] = useState<WeddingDraft | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (!rawDraft) return;
      const parsed: unknown = JSON.parse(rawDraft);
      if (isWeddingDraft(parsed)) setDraft(parsed);
    } catch {
      // A malformed or blocked device draft fails closed to the empty state.
    } finally {
      setReady(true);
    }
  }, []);

  const preparedItems = useMemo(() => (
    draft ? PREPARATION_ITEMS.map((item) => ({ ...item, complete: item.ready(draft) })) : []
  ), [draft]);
  const completedCount = preparedItems.filter((item) => item.complete).length;
  const progress = preparedItems.length ? Math.round((completedCount / preparedItems.length) * 100) : 0;

  if (!ready) {
    return <section className={styles.projectLoading} aria-live="polite">正在读取这台设备上的项目草稿…</section>;
  }

  if (!draft) {
    return (
      <section className={styles.projectEmpty}>
        <p className={styles.eyebrow}>NO LOCAL PROJECT YET</p>
        <h1>这台设备上还没有婚礼方案。</h1>
        <p>先完成第一版定制，再回到这里查看项目进度。当前工作台不会读取正式婚礼或其他客户的数据。</p>
        <Link className={styles.primaryAction} href="/platform/create">创建婚礼方案 <span>→</span></Link>
      </section>
    );
  }

  const selectedPlan = PLATFORM_PLANS.find((plan) => plan.id === draft.plan) ?? PLATFORM_PLANS[0];
  const selectedTheme = PLATFORM_THEMES.find((theme) => theme.id === draft.theme) ?? PLATFORM_THEMES[0];
  const selectedTone = PLATFORM_TONES.find((tone) => tone.id === draft.tone) ?? PLATFORM_TONES[0];
  const selectedModules = PLATFORM_MODULES.filter((module) => draft.modules.includes(module.id));

  return (
    <div className={styles.projectLayout}>
      <section className={styles.projectHero}>
        <div>
          <p className={styles.eyebrow}>LOCAL PROJECT PREVIEW</p>
          <h1>{getWeddingCoupleName(draft)}</h1>
          <p>{formatWeddingDate(draft.weddingDate)} · {draft.location.trim() || '地点待定'} · 约 {draft.guestCount} 人</p>
        </div>
        <div className={styles.projectProgress}>
          <div><strong>{progress}%</strong><span>首期资料完成度</span></div>
          <i aria-hidden="true"><b style={{ width: `${progress}%` }} /></i>
          <small>{completedCount}/{preparedItems.length} 项已准备</small>
        </div>
      </section>

      <section className={styles.projectNotice}>
        <strong>这是设备本地项目预览</strong>
        <p>还没有创建账号、订单或云端实例，也不会影响现有正式婚礼。接入账户系统后，平台会在上传前再次征得同意。</p>
        <Link href="/platform/account">连接账号并保存 →</Link>
      </section>

      <div className={styles.projectGrid}>
        <section className={styles.projectPanel}>
          <div className={styles.projectPanelHeading}><div><small>DELIVERY JOURNEY</small><h2>项目交付阶段</h2></div><span>阶段 1 / 5</span></div>
          <ol className={styles.deliveryTimeline}>
            {DELIVERY_STAGES.map((stage, index) => (
              <li key={stage.name} className={stage.state === 'current' ? styles.deliveryCurrent : styles.deliveryFuture}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div><strong>{stage.name}</strong><small>{stage.copy}</small></div>
                <b>{stage.state === 'current' ? '进行中' : '待开通'}</b>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.projectPanel}>
          <div className={styles.projectPanelHeading}><div><small>PREPARATION</small><h2>首期资料清单</h2></div><span>{completedCount}/{preparedItems.length}</span></div>
          <div className={styles.preparationList}>
            {preparedItems.map((item) => (
              <article key={item.id} className={item.complete ? styles.preparationDone : styles.preparationTodo}>
                <b aria-hidden="true">{item.complete ? '✓' : '·'}</b>
                <div><strong>{item.name}</strong><small>{item.complete ? item.copy : '返回定制器继续填写'}</small></div>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.projectPanel} ${styles.projectModulesPanel}`}>
          <div className={styles.projectPanelHeading}><div><small>SELECTED WORLD</small><h2>已选方案结构</h2></div><span>{selectedModules.length} 个模块</span></div>
          <div className={styles.projectFacts}>
            <article><small>交付</small><strong>{selectedPlan.name}</strong><p>{selectedPlan.bestFor}</p></article>
            <article><small>视觉</small><strong>{selectedTheme.name}</strong><p>{selectedTheme.description}</p></article>
            <article><small>叙事</small><strong>{selectedTone.name}</strong><p>{selectedTone.description}</p></article>
          </div>
          <div className={styles.projectModuleRows}>
            {selectedModules.map((module, index) => (
              <article key={module.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{module.name}</strong><small>{module.description}</small></div><b>{module.stage}</b></article>
            ))}
          </div>
        </section>

        <section className={`${styles.projectPanel} ${styles.projectNextPanel}`}>
          <p className={styles.eyebrow}>NEXT CHECKPOINT</p>
          <h2>下一步：内容确认</h2>
          <p>正式制作前还需要新人故事素材、宾客名单字段、敏感内容边界、主持人口播、题库答案和视觉资产。这些资料未来会进入隔离的客户项目，不会写入模板本身。</p>
          <div><Link className={styles.primaryAction} href="/platform/content">填写内容问卷 <span>→</span></Link><Link className={styles.secondaryAction} href="/platform/scope">确认服务范围</Link><Link className={styles.secondaryAction} href="/platform/create">返回方案定制</Link></div>
        </section>
      </div>
    </div>
  );
}
