import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { listPlatformReviewQueue } from '@/lib/data/platform-operations';
import { ApiError } from '@/lib/errors';
import { getPlatformSupabaseEnv } from '@/lib/platform/env';
import { requirePlatformStaff } from '@/lib/platform/staff';
import styles from '../platform.module.css';
import { PlatformReviewQueue } from './platform-review-queue';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '平台运营审核 · 婚礼游戏工坊',
  description: '审核客户提交的婚礼内容版本，并决定进入实例准备或退回修改。',
};

function OperationsShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.operationsShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform"><span>W</span><div><strong>婚礼游戏工坊</strong><small>OPERATIONS DESK</small></div></Link>
        <Link className={styles.builderBack} href="/platform/account">客户项目 →</Link>
      </header>
      {children}
    </main>
  );
}

export default async function PlatformOperationsPage() {
  if (!getPlatformSupabaseEnv()) {
    return <OperationsShell><section className={styles.operationsUnavailable}><p className={styles.eyebrow}>PREVIEW MODE</p><h1>运营审核服务尚未连接。</h1><p>独立平台数据库完成 Preview 配置后，授权工作人员才能从这里处理客户提交。</p></section></OperationsShell>;
  }

  let staff;
  try {
    staff = await requirePlatformStaff();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect('/platform/account');
    if (error instanceof ApiError && error.status === 403) {
      return <OperationsShell><section className={styles.operationsUnavailable}><p className={styles.eyebrow}>STAFF ACCESS REQUIRED</p><h1>这个账号没有运营权限。</h1><p>客户账号与平台工作人员权限完全分开。只有在独立平台数据库中被明确授权的工作人员才能打开审核队列。</p><Link className={styles.primaryAction} href="/platform/account">返回客户账号 <span>→</span></Link></section></OperationsShell>;
    }
    throw error;
  }

  const queue = await listPlatformReviewQueue(staff.user.id);
  return (
    <OperationsShell>
      <div className={styles.operationsLayout}>
        <section className={styles.operationsHero}>
          <div><p className={styles.eyebrow}>PRIVATE DELIVERY OPERATIONS</p><h1>每一场婚礼，<br />先通过内容审核。</h1><p>这里只处理客户项目控制层，不连接宾客、隐藏身份、照片、积分或现有正式婚礼数据库。</p></div>
          <div className={styles.operationsIdentity}><small>当前工作人员</small><strong>{staff.user.email}</strong><span>{staff.role === 'admin' ? '平台管理员' : '内容运营'}</span></div>
        </section>
        <PlatformReviewQueue initialQueue={queue} />
      </div>
    </OperationsShell>
  );
}
