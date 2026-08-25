'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPlatformDraftId } from '@/lib/platform/draft';
import styles from '../../platform.module.css';

type Member = { userId: string; email: string; role: 'editor' | 'viewer'; createdAt: string };
type Invitation = { id: string; role: 'editor' | 'viewer'; acceptedByUserId: string | null; acceptedAt: string | null; expiresAt: string; revokedAt: string | null; createdAt: string };

async function readError(response: Response) {
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {
    // Fall through to the stable message.
  }
  return '平台暂时无法更新项目协作权限';
}

function roleLabel(role: 'owner' | 'editor' | 'viewer') {
  return { owner: '项目所有者', editor: '可编辑协作者', viewer: '只读协作者' }[role];
}

export function ProjectCollaboration({
  projectId,
  currentUserId,
  accessRole,
  members,
  invitations,
}: {
  projectId: string;
  currentUserId: string;
  accessRole: 'owner' | 'editor' | 'viewer';
  members: Member[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [busyKey, setBusyKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [message, setMessage] = useState('');
  const [shareUrl, setShareUrl] = useState('');

  async function createInvitation() {
    if (busyKey) return;
    const eventKey = createPlatformDraftId();
    const invitationToken = createPlatformDraftId();
    setBusyKey('create');
    setMessage('正在生成一次性协作邀请…');
    try {
      const response = await fetch(`/api/platform/projects/${projectId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey, invitationToken, role }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as { invitePath?: string };
      if (!body.invitePath) throw new Error('邀请链接生成失败');
      setShareUrl(new URL(body.invitePath, window.location.origin).toString());
      setMessage('邀请已生成。请私下发送；链接领取一次或七天后失效。');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邀请生成失败');
    } finally {
      setBusyKey('');
    }
  }

  async function copyInvitation() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage('邀请链接已复制。');
    } catch {
      setMessage('浏览器没有允许自动复制，请长按并手动复制链接。');
    }
  }

  async function mutate(url: string, key: string) {
    if (busyKey) return;
    setBusyKey(key);
    setMessage('正在更新协作权限…');
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventKey: createPlatformDraftId() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(key.startsWith('member:') ? '成员权限已撤销。' : '待领取邀请已撤销。');
      setConfirmKey('');
      setShareUrl('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '协作权限更新失败');
    } finally {
      setBusyKey('');
    }
  }

  const pendingInvitations = invitations.filter((item) => !item.acceptedAt && !item.revokedAt);
  const otherMembers = members.filter((member) => member.userId !== currentUserId);

  return (
    <section className={styles.collaborationPanel}>
      <div className={styles.collaborationHeading}>
        <div><p className={styles.eyebrow}>PROJECT COLLABORATION</p><h2>项目成员与协作权限</h2><p>当前身份：{roleLabel(accessRole)}。成员只会看到这一场客户项目，不会进入婚礼宾客运行数据库。</p></div>
        <span>{members.length + 1} 人</span>
      </div>

      <div className={styles.memberRows}>
        <article><div><strong>你</strong><small>{accessRole === 'owner' ? '项目所有者' : roleLabel(accessRole)}</small></div><span>{accessRole === 'owner' ? '拥有邀请与审核提交权限' : accessRole === 'editor' ? '可编辑草稿' : '只读查看'}</span></article>
        {accessRole !== 'owner' ? <article><div><strong>项目所有者</strong><small>账号信息受保护</small></div><span>管理邀请与审核提交</span></article> : null}
        {otherMembers.map((member) => (
          <article key={member.userId}><div><strong>{member.email}</strong><small>{roleLabel(member.role)}</small></div><span>{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(member.createdAt))} 加入</span>{accessRole === 'owner' ? <button type="button" onClick={() => confirmKey === `member:${member.userId}` ? void mutate(`/api/platform/projects/${projectId}/members/${member.userId}`, `member:${member.userId}`) : setConfirmKey(`member:${member.userId}`)} disabled={Boolean(busyKey)}>{confirmKey === `member:${member.userId}` ? '再次点击确认撤销' : '撤销权限'}</button> : null}</article>
        ))}
      </div>

      {accessRole === 'owner' ? (
        <div className={styles.invitationWorkspace}>
          <div><label htmlFor="collaboration-role">新成员权限</label><select id="collaboration-role" value={role} onChange={(event) => setRole(event.target.value as 'editor' | 'viewer')} disabled={Boolean(busyKey)}><option value="editor">可编辑方案</option><option value="viewer">仅查看方案</option></select></div>
          <button type="button" onClick={createInvitation} disabled={Boolean(busyKey)}>{busyKey === 'create' ? '正在生成…' : '生成七天邀请链接'}</button>
          {shareUrl ? <div className={styles.shareLinkResult}><label htmlFor="collaboration-link">本次邀请链接</label><input id="collaboration-link" readOnly value={shareUrl} /><button type="button" onClick={copyInvitation}>复制链接</button><small>数据库只保存链接令牌的 SHA-256 哈希；关闭页面后不能恢复原链接，需要时请重新生成。</small></div> : null}
          {pendingInvitations.length ? <div className={styles.pendingInviteRows}><strong>待领取邀请</strong>{pendingInvitations.map((invite) => <article key={invite.id}><span>{roleLabel(invite.role)} · {new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(invite.expiresAt))} 失效</span><button type="button" onClick={() => confirmKey === `invite:${invite.id}` ? void mutate(`/api/platform/projects/${projectId}/invitations/${invite.id}`, `invite:${invite.id}`) : setConfirmKey(`invite:${invite.id}`)} disabled={Boolean(busyKey)}>{confirmKey === `invite:${invite.id}` ? '再次点击确认撤销' : '撤销'}</button></article>)}</div> : null}
        </div>
      ) : <p className={styles.collaborationReadOnly}>只有项目所有者可以邀请或移除成员。编辑者可以修改草稿，但不能提交审核、管理成员或创建婚礼实例。</p>}
      {message ? <p className={styles.collaborationMessage} role="status">{message}</p> : null}
    </section>
  );
}
