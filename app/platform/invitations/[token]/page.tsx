import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlatformUser } from '@/lib/platform/auth';
import { getPlatformSupabaseEnv } from '@/lib/platform/env';
import styles from '../../platform.module.css';
import { InvitationAcceptance } from './invitation-acceptance';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '项目协作邀请 · 婚礼游戏工坊',
  description: '安全领取一场婚礼客户项目的协作权限。',
};

function validToken(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!validToken(token)) notFound();
  const configured = Boolean(getPlatformSupabaseEnv());
  const user = configured ? await getPlatformUser() : null;
  return (
    <main className={styles.invitationShell}>
      <header className={styles.builderHeader}><Link className={styles.brand} href="/platform"><span>W</span><div><strong>婚礼游戏工坊</strong><small>SECURE INVITATION</small></div></Link><Link className={styles.builderBack} href="/platform">返回平台 →</Link></header>
      {configured ? <InvitationAcceptance token={token} email={user?.email ?? null} /> : <section className={styles.invitationCard}><p className={styles.eyebrow}>PREVIEW MODE</p><h1>平台账号服务尚未连接。</h1><p>邀请不会在 Preview 配置完成前生效，请联系项目所有者。</p></section>}
    </main>
  );
}
