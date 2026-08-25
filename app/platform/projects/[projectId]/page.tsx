import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPlatformProjectDetails } from '@/lib/data/platform-projects';
import { ApiError } from '@/lib/errors';
import { getPlatformUser } from '@/lib/platform/auth';
import { PLATFORM_MODULES, PLATFORM_PLANS, PLATFORM_THEMES, PLATFORM_TONES } from '@/lib/platform/catalog';
import { getPlatformSupabaseEnv } from '@/lib/platform/env';
import { formatWeddingDate } from '@/lib/platform/draft';
import styles from '../../platform.module.css';
import { ProjectReviewAction } from './project-review-action';
import { ProjectCollaboration } from './project-collaboration';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '云端婚礼项目 · 婚礼游戏工坊',
  description: '查看婚礼方案、内容准备、交付状态、套餐权益与保存版本。',
};

const STATUS_LABELS = {
  draft: '方案草稿',
  content_review: '内容确认',
  provisioning: '实例开通',
  rehearsal: '完整彩排',
  ready: '待正式发布',
  live: '正式运行',
  archived: '已经归档',
} as const;

const VERSION_REASON_LABELS = {
  customer_save: '客户保存',
  content_review: '内容确认',
  provisioning: '实例开通',
  operator_restore: '版本恢复',
} as const;

const ENTITLEMENT_LABELS = {
  pending: '待确认',
  active: '已激活',
  past_due: '待续费',
  cancelled: '已取消',
  expired: '已到期',
} as const;

function validProjectId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function CloudProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!validProjectId(projectId)) notFound();

  if (!getPlatformSupabaseEnv()) {
    return (
      <main className={styles.cloudDetailShell}>
        <header className={styles.builderHeader}>
          <Link className={styles.brand} href="/platform"><span>W</span><div><strong>婚礼游戏工坊</strong><small>CLOUD PROJECT</small></div></Link>
          <Link className={styles.builderBack} href="/platform/account">← 返回账号</Link>
        </header>
        <section className={styles.cloudDetailUnavailable}><p className={styles.eyebrow}>PREVIEW MODE</p><h1>云端项目服务尚未连接。</h1><p>本机方案仍然安全可用。平台独立数据库完成 Preview 验收后，这里才会开放真实客户项目。</p><Link className={styles.primaryAction} href="/platform/project">查看本机项目 <span>→</span></Link></section>
      </main>
    );
  }

  const user = await getPlatformUser();
  if (!user) redirect('/platform/account');

  let details: Awaited<ReturnType<typeof getPlatformProjectDetails>>;
  try {
    details = await getPlatformProjectDetails(user.id, projectId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const { project, versions, entitlement, reviews, members, invitations } = details;
  const latestReview = reviews[0] ?? null;
  const plan = PLATFORM_PLANS.find((item) => item.id === project.planId) ?? PLATFORM_PLANS[0];
  const theme = PLATFORM_THEMES.find((item) => item.id === project.themeId) ?? PLATFORM_THEMES[0];
  const tone = PLATFORM_TONES.find((item) => item.id === project.toneId) ?? PLATFORM_TONES[0];
  const modules = PLATFORM_MODULES.filter((module) => project.modules.includes(module.id));
  const contentItems = [
    { label: '故事素材', ready: Boolean(project.contentBrief.storyMoments.trim()) },
    { label: '内容边界', ready: project.contentBrief.boundariesConfirmed },
    { label: '主持备注', ready: Boolean(project.contentBrief.hostNotes.trim()) },
    { label: '模板内容包', ready: Boolean(project.templateContent.teamOneName.trim() && project.templateContent.teamTwoName.trim() && project.templateContent.openingScript.trim()) },
  ];
  const contentReady = contentItems.filter((item) => item.ready).length;
  const reviewRequirements = [
    { label: '填写两位新人姓名', ready: Boolean(project.partnerOne.trim() && project.partnerTwo.trim()) },
    { label: '确认婚礼日期和地点', ready: Boolean(project.weddingDate && project.location.trim()) },
    { label: '至少选择一个游戏模块', ready: modules.length > 0 },
    { label: '提供至少一条真实故事素材', ready: Boolean(project.contentBrief.storyMoments.trim()) },
    { label: '确认内容禁忌与互动边界', ready: project.contentBrief.boundariesConfirmed },
  ];
  const missingReviewItems = reviewRequirements.filter((item) => !item.ready).map((item) => item.label);

  return (
    <main className={styles.cloudDetailShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform"><span>W</span><div><strong>婚礼游戏工坊</strong><small>CLOUD PROJECT</small></div></Link>
        <Link className={styles.builderBack} href="/platform/account">← 返回我的项目</Link>
      </header>

      <div className={styles.cloudDetailLayout}>
        <section className={styles.cloudDetailHero}>
          <div><p className={styles.eyebrow}>CUSTOMER-OWNED PROJECT · V{project.version}</p><h1>{[project.partnerOne, project.partnerTwo].filter(Boolean).join(' & ') || '未命名婚礼项目'}</h1><p>{formatWeddingDate(project.weddingDate)} · {project.location || '地点待定'} · 约 {project.guestCount} 人</p></div>
          <div className={styles.cloudStatusCard}><small>当前交付阶段</small><strong>{STATUS_LABELS[project.status]}</strong><span>最后保存 {new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(project.updatedAt))}</span></div>
        </section>

        <section className={styles.cloudOwnershipNotice}><strong>仅项目成员可见</strong><p>这个页面由登录会话、项目成员权限和数据库行级权限共同保护，不包含宾客身份、照片、积分或任何正式婚礼运行数据。</p><span>{user.email} · {{ owner: '所有者', editor: '编辑者', viewer: '查看者' }[project.accessRole]}</span></section>

        {latestReview ? (
          <section className={latestReview.decision === 'changes_requested' ? styles.customerReviewChanges : styles.customerReviewApproved}>
            <div><p className={styles.eyebrow}>{latestReview.decision === 'changes_requested' ? 'CHANGES REQUESTED' : 'CONTENT APPROVED'}</p><h2>{latestReview.decision === 'changes_requested' ? '平台已退回修改，项目重新开放编辑。' : '内容审核已经通过。'}</h2></div>
            <div><small>第 {latestReview.round} 轮审核 · 基于 V{latestReview.projectVersion - 1}</small><p>{latestReview.note || '内容已通过审核，下一步由平台工作人员准备独立婚礼实例。'}</p><time dateTime={latestReview.createdAt}>{new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(latestReview.createdAt))}</time></div>
          </section>
        ) : null}

        <div className={styles.cloudDetailGrid}>
          <section className={styles.cloudDetailPanel}>
            <div className={styles.projectPanelHeading}><div><small>SELECTED EXPERIENCE</small><h2>方案结构</h2></div><span>{modules.length} 个模块</span></div>
            <div className={styles.cloudFactGrid}><article><small>交付</small><strong>{plan.name}</strong></article><article><small>视觉</small><strong>{theme.name}</strong></article><article><small>叙事</small><strong>{tone.name}</strong></article></div>
            <div className={styles.cloudModuleList}>{modules.map((module) => <article key={module.id}><div><strong>{module.name}</strong><small>{module.description}</small></div><span>{module.stage}</span></article>)}</div>
          </section>

          <section className={styles.cloudDetailPanel}>
            <div className={styles.projectPanelHeading}><div><small>CONTENT READINESS</small><h2>内容准备</h2></div><span>{contentReady}/{contentItems.length}</span></div>
            <div className={styles.cloudContentMeta}><article><small>语言</small><strong>{project.contentBrief.language === 'bilingual' ? '中英双语' : '中文'}</strong></article><article><small>互动</small><strong>{{ gentle: '轻松温和', balanced: '自然平衡', immersive: '高沉浸互动' }[project.contentBrief.interaction]}</strong></article><article><small>宾客</small><strong>{{ family: '家人与长辈为主', balanced: '亲友较均衡', friends: '朋友为主' }[project.contentBrief.guestMix]}</strong></article></div>
            <div className={styles.cloudTemplateSummary}><small>TEMPLATE CONTENT</small><strong>{project.templateContent.teamOneName} / {project.templateContent.teamTwoName}</strong><p>{project.templateContent.openingScript}</p><span>新人问答 {project.templateContent.quizQuestions.length} 题</span></div>
            <div className={styles.cloudReadinessList}>{contentItems.map((item) => <div key={item.label} className={item.ready ? styles.cloudReady : styles.cloudTodo}><b>{item.ready ? '✓' : '·'}</b><span>{item.label}</span><small>{item.ready ? '已准备' : '待补充'}</small></div>)}</div>
          </section>

          <section className={styles.cloudDetailPanel}>
            <div className={styles.projectPanelHeading}><div><small>PLAN ENTITLEMENT</small><h2>套餐权益</h2></div><span>{entitlement ? ENTITLEMENT_LABELS[entitlement.status] : '未建立'}</span></div>
            <div className={styles.cloudEntitlement}><strong>{plan.name}</strong><p>{entitlement?.status === 'active' ? '套餐权益已经激活，可进入后续交付流程。' : '当前只记录方案选择，尚未收费，也不会自动开通婚礼实例。'}</p><small>付款接入前仍需确认价格、退款、税务、服务范围和数据保留条款。</small></div>
          </section>

          <section className={styles.cloudDetailPanel}>
            <div className={styles.projectPanelHeading}><div><small>VERSION HISTORY</small><h2>保存记录</h2></div><span>{versions.length} 版</span></div>
            <ol className={styles.cloudVersionList}>{versions.map((version) => <li key={version.version}><b>V{version.version}</b><div><strong>{VERSION_REASON_LABELS[version.reason]}</strong><time dateTime={version.createdAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(version.createdAt))}</time></div></li>)}</ol>
          </section>
        </div>

        <section className={styles.cloudReviewPanel}>
          <div><p className={styles.eyebrow}>DELIVERY CHECKPOINT</p><h2>提交内容审核</h2><p>资料完整后，把当前版本锁定为审核基线。这个动作不会收费、不会创建婚礼运行实例，也不会改动现有正式婚礼。</p></div>
          <ProjectReviewAction projectId={project.id} status={project.status} missingItems={missingReviewItems} canSubmit={project.accessRole === 'owner'} />
        </section>

        <ProjectCollaboration projectId={project.id} currentUserId={user.id} accessRole={project.accessRole} members={members} invitations={invitations} />

        <section className={styles.cloudDetailNext}><div><p className={styles.eyebrow}>{project.status === 'draft' ? 'CONTINUE SAFELY' : project.status === 'content_review' ? 'REVIEW IN PROGRESS' : 'INSTANCE PREPARATION'}</p><h2>{project.status === 'draft' ? (latestReview?.decision === 'changes_requested' ? '根据审核意见继续修改，再次提交新版本。' : '继续编辑时，先把云端版本载回本机。') : project.status === 'content_review' ? '当前版本已经进入内容审核。' : '平台正在准备独立婚礼实例。'}</h2><p>{project.status === 'draft' ? '账号页会在覆盖另一份本机草稿前要求再次确认；编辑完成后仍需手动保存，平台不会静默上传。' : project.status === 'content_review' ? '审核期间客户草稿保持锁定，避免交付基线被覆盖。审核结果会记录为不可变版本并显示在本页。' : '这只是人工交付阶段；当前不会自动收费，也不会自动创建或修改云资源。'}</p></div><Link className={styles.primaryAction} href="/platform/account">返回账号与项目 <span>→</span></Link></section>
      </div>
    </main>
  );
}
