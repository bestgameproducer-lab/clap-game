'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  PLATFORM_DRAFT_STORAGE_KEY,
  createPlatformDraftId,
  ensureWeddingDraftId,
  getWeddingCoupleName,
  isWeddingDraft,
  type WeddingDraft,
} from '../../../lib/platform/draft';
import styles from '../platform.module.css';

type CloudProject = {
  id: string;
  sourceDraftId: string;
  status: string;
  partnerOne: string;
  partnerTwo: string;
  weddingDate: string;
  location: string;
  guestCount: number;
  themeId: WeddingDraft['theme'];
  toneId: WeddingDraft['tone'];
  planId: WeddingDraft['plan'];
  modules: WeddingDraft['modules'];
  storyNote: string;
  contentBrief: NonNullable<WeddingDraft['contentBrief']>;
  templateContent: NonNullable<WeddingDraft['templateContent']>;
  version: number;
  updatedAt: string;
  accessRole: 'owner' | 'editor' | 'viewer';
};

const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: '方案草稿',
  content_review: '内容审核中',
  provisioning: '实例准备中',
  rehearsal: '完整彩排',
  ready: '待正式发布',
  live: '正式运行',
  archived: '已经归档',
};

const AUTH_ERRORS: Record<string, string> = {
  invalid_link: '登录链接格式不正确，请重新发送。',
  expired_link: '登录链接已失效或已经使用，请重新发送。',
  unavailable: '平台账号服务暂时不可用，请稍后再试。',
};

async function readApiError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use the generic message below when the server did not return JSON.
  }
  return '平台暂时无法处理请求';
}

export function PlatformAccountGateway({
  configured,
  email,
  connected,
  authError,
}: {
  configured: boolean;
  email: string | null;
  connected: boolean;
  authError: string | null;
}) {
  const [loginEmail, setLoginEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(connected ? '邮箱验证成功，平台账号已连接。' : (authError ? AUTH_ERRORS[authError] ?? '登录没有完成，请重试。' : ''));
  const [draft, setDraft] = useState<WeddingDraft | null>(null);
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [projectsState, setProjectsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PLATFORM_DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isWeddingDraft(parsed)) return;
      const normalized = ensureWeddingDraftId(parsed);
      if (!parsed.draftId) window.localStorage.setItem(PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(normalized));
      setDraft(normalized);
    } catch {
      // Device draft remains optional; account sign-in still works without it.
    }
  }, []);

  const loadProjects = useCallback(async () => {
    if (!email) return;
    setProjectsState('loading');
    try {
      const response = await fetch('/api/platform/projects', { cache: 'no-store' });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = await response.json() as { projects?: CloudProject[] };
      setProjects(Array.isArray(body.projects) ? body.projects : []);
      setProjectsState('ready');
    } catch (error) {
      setProjectsState('error');
      setMessage(error instanceof Error ? error.message : '云端项目读取失败');
    }
  }, [email]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  async function requestLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured || busy) return;
    setBusy(true);
    setMessage('正在发送安全登录邮件…');
    try {
      const response = await fetch('/api/platform/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = await response.json() as { message?: string };
      setMessage(body.message ?? '登录邮件已发送，请查看收件箱');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录邮件发送失败');
    } finally {
      setBusy(false);
    }
  }

  async function syncDraft() {
    if (!draft || busy) return;
    if (projectsState !== 'ready') {
      setMessage('请等待云端项目列表同步完成后再保存。');
      return;
    }
    setBusy(true);
    setMessage('正在安全保存婚礼方案…');
    try {
      const target = projects.find((project) => project.sourceDraftId === draft.draftId);
      if (target?.accessRole === 'viewer') throw new Error('你对这个项目只有查看权限，不能覆盖方案草稿');
      const response = await fetch('/api/platform/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft, projectId: target?.id ?? null, eventKey: createPlatformDraftId() }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      setMessage('婚礼方案已保存到你的云端项目。');
      await loadProjects();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '婚礼方案保存失败');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch('/api/platform/auth/sign-out', { method: 'POST' });
      if (!response.ok) throw new Error(await readApiError(response));
      window.location.assign('/platform/account');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '退出失败');
      setBusy(false);
    }
  }

  function restoreCloudProject(project: CloudProject) {
    const restored: WeddingDraft = {
      draftId: project.sourceDraftId,
      partnerOne: project.partnerOne,
      partnerTwo: project.partnerTwo,
      weddingDate: project.weddingDate,
      location: project.location,
      guestCount: String(project.guestCount) as WeddingDraft['guestCount'],
      theme: project.themeId,
      tone: project.toneId,
      plan: project.planId,
      modules: project.modules,
      storyNote: project.storyNote,
      contentBrief: project.contentBrief,
      templateContent: project.templateContent,
    };
    if (!isWeddingDraft(restored)) {
      setMessage('这个云端项目版本无法在当前定制器中打开，请联系平台支持。');
      return;
    }
    try {
      window.localStorage.setItem(PLATFORM_DRAFT_STORAGE_KEY, JSON.stringify(restored));
      window.location.assign('/platform/create');
    } catch {
      setMessage('浏览器不允许保存本机草稿，暂时无法进入编辑。');
    }
  }

  function requestCloudRestore(project: CloudProject) {
    if (project.status !== 'draft' || project.accessRole === 'viewer') {
      if (project.accessRole === 'viewer') {
        setMessage('你对这个项目只有查看权限，不能载入并覆盖草稿。');
        return;
      }
      setMessage('这个项目已经进入交付流程，当前客户版本不能再覆盖编辑。');
      return;
    }
    const replacesAnotherDraft = Boolean(draft?.draftId && draft.draftId !== project.sourceDraftId);
    if (replacesAnotherDraft && pendingRestoreId !== project.id) {
      setPendingRestoreId(project.id);
      setMessage('这会用所选云端版本替换当前本机草稿，请再次确认。');
      return;
    }
    restoreCloudProject(project);
  }

  return (
    <div className={styles.accountLayout}>
      <section className={styles.accountHero}>
        <p className={styles.eyebrow}>ONE ACCOUNT · ISOLATED PROJECTS</p>
        <h1>{email ? '你的婚礼项目，已经有了安全归属。' : '用邮箱连接你们的婚礼项目。'}</h1>
        <p>平台账号只管理客户方案与交付进度。它不使用婚礼宾客密码，也不会进入任何已经举办或正在运行的婚礼实例。</p>
      </section>

      {!configured ? (
        <section className={styles.accountUnavailable}>
          <span>PREVIEW MODE</span>
          <div><strong>独立账号服务尚未连接</strong><p>当前仍可使用本机定制器、需求单和项目工作台。配置独立平台 Supabase 后才会开放真实登录与云端保存。</p></div>
        </section>
      ) : null}

      {message ? <p className={styles.accountMessage} role="status">{message}</p> : null}

      <div className={styles.accountGrid}>
        <section className={styles.accountPanel}>
          <p className={styles.eyebrow}>{email ? 'SIGNED IN' : 'PASSWORDLESS SIGN IN'}</p>
          {email ? (
            <>
              <h2>账号已连接</h2>
              <p className={styles.accountEmail}>{email}</p>
              <p>登录会话保存在安全 Cookie 中，由独立平台 Supabase 验证。浏览器不能获得服务端密钥。</p>
              <button type="button" className={styles.accountSecondaryButton} onClick={signOut} disabled={busy}>安全退出</button>
            </>
          ) : (
            <form onSubmit={requestLink}>
              <h2>邮箱安全链接登录</h2>
              <p>无需创建密码。我们会发送一次性安全链接，新客户也会从这一步建立账号。</p>
              <label htmlFor="platform-account-email">常用邮箱</label>
              <input id="platform-account-email" type="email" autoComplete="email" required maxLength={254} value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="name@example.com" disabled={!configured || busy} />
              <button type="submit" disabled={!configured || busy}>{busy ? '正在发送…' : '发送安全登录邮件'}</button>
            </form>
          )}
        </section>

        <section className={styles.accountPanel}>
          <p className={styles.eyebrow}>LOCAL TO CLOUD HANDOFF</p>
          <h2>保存当前婚礼方案</h2>
          {draft ? (
            <>
              <div className={styles.accountDraftCard}><small>本机草稿</small><strong>{getWeddingCoupleName(draft)}</strong><span>{draft.modules.length} 个模块 · {draft.plan === 'buyout' ? '单场买断' : '持续订阅'}</span></div>
              <button type="button" onClick={syncDraft} disabled={!email || busy || projectsState !== 'ready'}>保存到独立客户项目</button>
              {!email ? <small className={styles.accountHint}>登录后才可以上传；点击前不会传输本机草稿。</small> : null}
            </>
          ) : (
            <div className={styles.accountEmptyState}><strong>没有找到本机方案</strong><p>先从定制器创建第一版方案，再回来保存。</p><Link href="/platform/create">前往定制器 →</Link></div>
          )}
        </section>
      </div>

      {email ? (
        <section className={styles.cloudProjectsPanel}>
          <div className={styles.projectPanelHeading}><div><small>CLOUD PROJECTS</small><h2>我的云端项目</h2></div><span>{projects.length} 个</span></div>
          {projectsState === 'loading' ? <p>正在同步项目列表…</p> : null}
          {projectsState === 'error' ? <p>项目列表暂时无法读取，请稍后重试。</p> : null}
          {projectsState === 'ready' && projects.length === 0 ? <p>还没有云端项目。保存右上方的本机方案后会出现在这里。</p> : null}
          {projects.length ? <div className={styles.cloudProjectRows}>{projects.map((project) => (
            <article key={project.id}>
              <div><strong>{[project.partnerOne, project.partnerTwo].filter(Boolean).join(' & ') || '未命名婚礼项目'}</strong><small>版本 {project.version} · {project.planId === 'buyout' ? '单场买断' : '持续订阅'} · {{ owner: '所有者', editor: '编辑者', viewer: '查看者' }[project.accessRole]}</small></div>
              <span>{PROJECT_STATUS_LABELS[project.status] ?? '交付处理中'}</span>
              <time dateTime={project.updatedAt}>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(project.updatedAt))}</time>
              <div className={styles.cloudProjectActions}>
                <Link href={`/platform/projects/${project.id}`}>查看项目</Link>
                <button type="button" onClick={() => requestCloudRestore(project)} disabled={busy || project.status !== 'draft' || project.accessRole === 'viewer'}>
                  {project.accessRole === 'viewer' ? '仅可查看' : project.status !== 'draft' ? '版本已锁定' : pendingRestoreId === project.id ? '确认覆盖并编辑' : '载入到本机编辑'}
                </button>
                {pendingRestoreId === project.id ? <button type="button" onClick={() => setPendingRestoreId(null)}>取消</button> : null}
              </div>
            </article>
          ))}</div> : null}
        </section>
      ) : null}
    </div>
  );
}
