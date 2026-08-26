import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPlatformProjectDetails } from '@/lib/data/platform-projects';
import { ApiError } from '@/lib/errors';
import { getPlatformUser } from '@/lib/platform/auth';
import { PLATFORM_CUSTOMIZATION_LEVELS, PLATFORM_MODULES, PLATFORM_PLANS, PLATFORM_REHEARSAL_MODES, PLATFORM_SERVICES, PLATFORM_SUPPORT_MODES, PLATFORM_THEMES, PLATFORM_TONES } from '@/lib/platform/catalog';
import { getPlatformSupabaseEnv } from '@/lib/platform/env';
import { formatWeddingDate } from '@/lib/platform/draft';
import { getPlatformRetentionDays, isPlatformDataPolicyReady } from '@/lib/platform/data-policy';
import { PLATFORM_QUOTE_BILLING_LABELS, formatPlatformQuoteAmount } from '@/lib/platform/commercial';
import { assessPlatformFulfillment } from '@/lib/platform/fulfillment';
import styles from '../../platform.module.css';
import { ProjectCollaboration } from './project-collaboration';
import { ProjectArchiveAction } from './project-archive-action';
import { ProjectCommercialAction } from './project-commercial-action';
import { ProjectQuoteProceedAction } from './project-quote-proceed-action';
import { ProjectReviewAction } from './project-review-action';

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

  const { project, versions, entitlement, reviews, members, invitations, deliveryEvents, quoteRequests, commercialQuotes, proceedRequests, fulfillmentPlan } = details;
  const latestReview = reviews[0] ?? null;
  const latestDeliveryEvent = deliveryEvents[0] ?? null;
  const currentCommercialQuote = commercialQuotes.find((quote) => quote.status === 'offered') ?? null;
  const commercialQuoteExpired = currentCommercialQuote ? currentCommercialQuote.validUntil < new Date().toISOString().slice(0, 10) : false;
  const currentProceedRequest = currentCommercialQuote ? proceedRequests.find((request) => request.quoteId === currentCommercialQuote.id) ?? null : null;
  const plan = PLATFORM_PLANS.find((item) => item.id === project.planId) ?? PLATFORM_PLANS[0];
  const theme = PLATFORM_THEMES.find((item) => item.id === project.themeId) ?? PLATFORM_THEMES[0];
  const tone = PLATFORM_TONES.find((item) => item.id === project.toneId) ?? PLATFORM_TONES[0];
  const modules = PLATFORM_MODULES.filter((module) => project.modules.includes(module.id));
  const customization = PLATFORM_CUSTOMIZATION_LEVELS.find((item) => item.id === project.deliveryScope.customizationLevel)!;
  const support = PLATFORM_SUPPORT_MODES.find((item) => item.id === project.deliveryScope.supportMode)!;
  const rehearsal = PLATFORM_REHEARSAL_MODES.find((item) => item.id === project.deliveryScope.rehearsalMode)!;
  const services = PLATFORM_SERVICES.filter((service) => project.deliveryScope.services.includes(service.id));
  const fulfillment = assessPlatformFulfillment(project.deliveryScope);
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
    { label: '至少选择一个服务项目', ready: services.length > 0 },
    { label: '提供至少一条真实故事素材', ready: Boolean(project.contentBrief.storyMoments.trim()) },
    { label: '确认内容禁忌与互动边界', ready: project.contentBrief.boundariesConfirmed },
    { label: '确认有权提供宾客基础名单', ready: project.dataPolicy.rosterAuthorityConfirmed },
    { label: '确认将在导入前告知宾客', ready: project.dataPolicy.guestNoticeConfirmed },
  ];
  const missingReviewItems = reviewRequirements.filter((item) => !item.ready).map((item) => item.label);
  const nextCheckpoint = project.status === 'draft' ? {
    eyebrow: 'CONTINUE SAFELY',
    title: latestReview?.decision === 'changes_requested' ? '根据审核意见继续修改，再次提交新版本。' : '继续编辑时，先把云端版本载回本机。',
    copy: '账号页会在覆盖另一份本机草稿前要求再次确认；编辑完成后仍需手动保存，平台不会静默上传。',
  } : ({
    content_review: {
      eyebrow: 'REVIEW IN PROGRESS',
      title: '当前版本已经进入内容审核。',
      copy: '审核期间客户草稿保持锁定，避免交付基线被覆盖。审核结果会记录为不可变版本并显示在本页。',
    },
    provisioning: {
      eyebrow: 'INSTANCE PREPARATION',
      title: fulfillmentPlan?.lane === 'standard_auto' ? '标准版自动交付路径已经锁定。' : fulfillmentPlan?.lane === 'custom_service' ? '深度定制交付路径已经锁定。' : '平台正在判定安全的交付路径。',
      copy: fulfillmentPlan?.lane === 'standard_auto' ? '真实付款尚未接入；未来只有付款服务端验证成功后才会进入自动开通队列。' : fulfillmentPlan?.lane === 'custom_service' ? '系统会保留标准配置基线，特殊任务、视觉与现场服务由工作人员继续处理。' : '当前不会自动收费，也不会自动创建或修改云资源。',
    },
    rehearsal: {
      eyebrow: 'FULL REHEARSAL',
      title: '独立实例正在进行完整流程彩排。',
      copy: '工作人员会使用测试数据覆盖宾客和各运营角色；彩排通过前不会标记为待正式发布。',
    },
    ready: {
      eyebrow: 'READY FOR RELEASE',
      title: '独立实例已经通过核验与完整彩排。',
      copy: '工作人员仍需取得你的确认，并在外部部署平台完成入口核对，才会单独记录为正式运行。',
    },
    live: {
      eyebrow: 'LIVE DELIVERY',
      title: '项目已经记录为正式运行。',
      copy: '如需暂停或处理现场问题，请联系平台工作人员；任何暂停都必须先处理外部入口并保留审计记录。',
    },
    archived: {
      eyebrow: 'PROJECT ARCHIVED',
      title: '这场婚礼项目已经归档。',
      copy: '宾客运行资料仍按约定期限单独删除；项目配置归档不包含宾客照片、身份、积分或密钥。',
    },
  } as const)[project.status];

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

        {latestDeliveryEvent ? (
          <section className={latestDeliveryEvent.action === 'release' ? styles.customerDeliveryLive : styles.customerDeliveryHold}>
            <div>
              <p className={styles.eyebrow}>{latestDeliveryEvent.action === 'release' ? 'DELIVERY LIVE' : 'DELIVERY ON HOLD'}</p>
              <h2>{latestDeliveryEvent.action === 'release' ? '平台已记录这场婚礼进入正式运行。' : '平台已记录这场婚礼暂停正式运行。'}</h2>
              <p>{latestDeliveryEvent.customerMessage}</p>
              <small>这是客户可见的交付状态记录；不包含内部部署标识、配置指纹、工作人员备注或任何密钥。</small>
            </div>
            <ol>
              {deliveryEvents.map((event) => (
                <li key={event.id}><b>{event.action === 'release' ? '正式运行' : '人工暂停'}</b><span>V{event.projectVersion} · {event.customerMessage}</span><time dateTime={event.createdAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(event.createdAt))}</time></li>
              ))}
            </ol>
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
            <div className={styles.cloudTemplateSummary}><small>TEMPLATE CONTENT</small><strong>{project.templateContent.teamOneName} / {project.templateContent.teamTwoName}</strong><p>{project.templateContent.openingScript}</p><span>新人问答 {project.templateContent.quizQuestions.length} 题 · 快问快答 {project.templateContent.quickQuizQuestions.length} 题 · 比划词 {project.templateContent.charadesWords.length} 个 · 任务文案 {project.templateContent.missionCopyOverrides.length} 项</span></div>
            <div className={styles.cloudReadinessList}>{contentItems.map((item) => <div key={item.label} className={item.ready ? styles.cloudReady : styles.cloudTodo}><b>{item.ready ? '✓' : '·'}</b><span>{item.label}</span><small>{item.ready ? '已准备' : '待补充'}</small></div>)}</div>
          </section>

          <section className={styles.cloudDetailPanel}>
            <div className={styles.projectPanelHeading}><div><small>PLAN ENTITLEMENT</small><h2>套餐权益</h2></div><span>{entitlement ? ENTITLEMENT_LABELS[entitlement.status] : '未建立'}</span></div>
            <div className={styles.cloudEntitlement}><strong>{plan.name}</strong><p>{entitlement?.status === 'active' ? '套餐权益已经激活，可进入后续交付流程。' : '当前只记录方案选择，尚未收费，也不会自动开通婚礼实例；任何自动开通都必须等待服务端付款验证。'}</p><small>付款接入前仍需确认价格、退款、税务、服务范围和数据保留条款。</small></div>
            <div className={(fulfillmentPlan?.lane ?? fulfillment.lane) === 'standard_auto' ? styles.fulfillmentPlanStandard : styles.fulfillmentPlanCustom}>
              <div><small>{fulfillment.eyebrow}{fulfillmentPlan ? ` · LOCKED V${fulfillmentPlan.projectVersion}` : ' · ESTIMATE'}</small><strong>{fulfillment.label}</strong><p>{fulfillmentPlan ? (fulfillmentPlan.status === 'awaiting_payment' ? '交付路径已锁定，等待未来的付款验证能力。' : '交付路径已锁定，等待工作人员继续制作。') : `${fulfillment.summary} 最终路径会在内容批准并锁定配置后由服务端判定。`}</p></div><span>{fulfillmentPlan ? '已写入审计记录' : '尚未锁定'}</span>
            </div>
            <div className={styles.cloudTemplateSummary}><small>DELIVERY SCOPE</small><strong>{customization.name} · {support.name} · {rehearsal.name}</strong><p>{services.map((service) => service.name).join('、') || '尚未选择服务项目'}</p>{project.deliveryScope.serviceNotes ? <span>{project.deliveryScope.serviceNotes}</span> : null}</div>
            {currentCommercialQuote ? <div className={styles.customerCommercialQuote}><small>NON-BINDING QUOTE DRAFT · V{currentCommercialQuote.projectVersion}</small><div><strong>{formatPlatformQuoteAmount(currentCommercialQuote.amountMinor, currentCommercialQuote.currency)}</strong><span>{PLATFORM_QUOTE_BILLING_LABELS[currentCommercialQuote.billingInterval]}</span></div><p>{currentCommercialQuote.serviceSummary}</p><blockquote>{currentCommercialQuote.termsSummary}</blockquote><footer><time dateTime={currentCommercialQuote.validUntil}>{commercialQuoteExpired ? `已于 ${currentCommercialQuote.validUntil} 过期` : `有效至 ${currentCommercialQuote.validUntil}`}</time><span>{commercialQuoteExpired ? '请等待工作人员更新草案' : '仅供确认 · 不是订单或付款请求'}</span></footer><ProjectQuoteProceedAction projectId={project.id} accessRole={project.accessRole} quote={currentCommercialQuote} expired={commercialQuoteExpired} proceedRequest={currentProceedRequest} /></div> : null}
            <ProjectCommercialAction project={project} entitlementStatus={entitlement?.status ?? null} quoteRequests={quoteRequests} />
            <div className={styles.cloudTemplateSummary}><small>GUEST DATA LIFECYCLE</small><strong>婚礼后 {getPlatformRetentionDays(project.dataPolicy)} 天删除宾客运行资料</strong><p>{project.dataPolicy.projectArchiveBeforeDeletion ? '删除前导出不含宾客运行资料的项目配置归档。' : '删除前不生成项目配置归档。'}</p><span>{isPlatformDataPolicyReady(project.dataPolicy) ? '名单权限与宾客告知责任已确认 · 独立实例强制开启' : '名单权限或宾客告知责任尚未确认 · 暂不能提交审核'}</span></div>
          </section>

          <section className={styles.cloudDetailPanel}>
            <div className={styles.projectPanelHeading}><div><small>VERSION HISTORY</small><h2>保存记录</h2></div><span>{versions.length} 版</span></div>
            <ol className={styles.cloudVersionList}>{versions.map((version) => <li key={version.version}><b>V{version.version}</b><div><strong>{VERSION_REASON_LABELS[version.reason]}</strong><time dateTime={version.createdAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(version.createdAt))}</time></div></li>)}</ol>
          </section>
        </div>

        {project.status !== 'archived' ? <section className={styles.cloudReviewPanel}>
          <div><p className={styles.eyebrow}>DELIVERY CHECKPOINT</p><h2>提交内容审核</h2><p>资料完整后，把当前版本锁定为审核基线。这个动作不会收费、不会创建婚礼运行实例，也不会改动现有正式婚礼。</p></div>
          <ProjectReviewAction projectId={project.id} status={project.status} missingItems={missingReviewItems} canSubmit={project.accessRole === 'owner'} />
        </section> : null}

        {project.status !== 'archived' ? <ProjectCollaboration projectId={project.id} currentUserId={user.id} accessRole={project.accessRole} members={members} invitations={invitations} /> : null}

        <ProjectArchiveAction projectId={project.id} status={project.status} accessRole={project.accessRole} />

        <section className={styles.cloudDetailNext}><div><p className={styles.eyebrow}>{nextCheckpoint.eyebrow}</p><h2>{nextCheckpoint.title}</h2><p>{nextCheckpoint.copy}</p><small>方案备份包含客户填写的故事与备注，请下载到受信任设备妥善保管；它不含宾客、成员账号、照片、积分、密钥或运行实例数据，也不是婚礼结束后的正式归档包。</small></div><div className={styles.cloudDetailNextActions}>{project.accessRole === 'owner' ? <a className={styles.secondaryAction} href={`/api/platform/projects/${project.id}/export`}>下载当前方案备份</a> : null}<Link className={styles.primaryAction} href="/platform/account">返回账号与项目 <span>→</span></Link></div></section>
      </div>
    </main>
  );
}
