import type { Metadata } from 'next';
import Link from 'next/link';
import { getPlatformUser } from '@/lib/platform/auth';
import { getPlatformSupabaseEnv } from '@/lib/platform/env';
import styles from '../platform.module.css';
import { PlatformAccountGateway } from './platform-account-gateway';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '平台账号与云端项目 · 婚礼游戏工坊',
  description: '使用邮箱安全登录，把本机婚礼方案保存到独立的客户项目控制层。',
};

type PlatformAccountPageProps = {
  searchParams: Promise<{ connected?: string | string[]; auth_error?: string | string[] }>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function PlatformAccountPage({ searchParams }: PlatformAccountPageProps) {
  const query = await searchParams;
  const configured = Boolean(getPlatformSupabaseEnv());
  const user = configured ? await getPlatformUser() : null;

  return (
    <main className={styles.accountShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊">
          <span>W</span>
          <div><strong>婚礼游戏工坊</strong><small>CUSTOMER ACCOUNT</small></div>
        </Link>
        <Link className={styles.builderBack} href="/platform/project">← 返回项目工作台</Link>
      </header>
      <PlatformAccountGateway
        configured={configured}
        email={user?.email ?? null}
        connected={firstValue(query.connected) === '1'}
        authError={firstValue(query.auth_error) ?? null}
      />
    </main>
  );
}
