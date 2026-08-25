'use client';

import { useState } from 'react';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../../platform.module.css';

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Use stable fallback text.
  }
  return '平台暂时无法处理这个邀请';
}

export function InvitationAcceptance({ token, email }: { token: string; email: string | null }) {
  const [loginEmail, setLoginEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function requestLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('正在发送安全登录邮件…');
    try {
      const response = await fetch('/api/platform/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, next: `/platform/invitations/${token}` }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage('登录邮件已发送。验证后会自动回到这个邀请。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '登录邮件发送失败');
    } finally {
      setBusy(false);
    }
  }

  async function acceptInvitation() {
    if (busy) return;
    setBusy(true);
    setMessage('正在验证邀请并建立项目权限…');
    try {
      const response = await fetch('/api/platform/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId(), invitationToken: token }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { membership?: { projectId?: string } };
      if (!body.membership?.projectId) throw new Error('邀请领取成功，但项目入口返回异常');
      window.location.assign(`/platform/projects/${body.membership.projectId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邀请领取失败');
      setBusy(false);
    }
  }

  return (
    <section className={styles.invitationCard}>
      <p className={styles.eyebrow}>PRIVATE PROJECT INVITATION</p>
      <h1>加入一场婚礼项目</h1>
      <p>领取后只能访问邀请对应的客户项目。链接不会授予婚礼现场后台、宾客资料、照片、隐藏身份或积分权限。</p>
      {email ? <div className={styles.invitationSignedIn}><small>当前平台账号</small><strong>{email}</strong><button type="button" onClick={acceptInvitation} disabled={busy}>{busy ? '正在验证…' : '确认领取协作权限'}</button></div> : <form onSubmit={requestLogin}><label htmlFor="invitation-email">先使用邮箱安全登录</label><input id="invitation-email" type="email" required maxLength={254} autoComplete="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="name@example.com" disabled={busy} /><button type="submit" disabled={busy}>{busy ? '正在发送…' : '发送安全登录邮件'}</button></form>}
      {message ? <p className={styles.invitationMessage} role="status">{message}</p> : null}
      <small className={styles.invitationSafety}>邀请只能领取一次，并在生成七天后失效；失效或来源不明时，请联系项目所有者重新生成。</small>
    </section>
  );
}
