import type { Metadata } from 'next';
import Link from 'next/link';
import type { PlatformPlanId } from '../../../lib/platform/catalog';
import styles from '../platform.module.css';
import { WeddingBuilder } from './wedding-builder';

export const metadata: Metadata = {
  title: '定制婚礼游戏方案 · 婚礼游戏工坊',
  description: '选择故事风格、游戏模块、宾客规模与交付方式，实时生成第一版婚礼游戏方案。',
};

type BuilderPageProps = {
  searchParams: Promise<{ plan?: string | string[] }>;
};

export default async function BuilderPage({ searchParams }: BuilderPageProps) {
  const query = await searchParams;
  const requestedPlan = Array.isArray(query.plan) ? query.plan[0] : query.plan;
  const initialPlan: PlatformPlanId | undefined =
    requestedPlan === 'buyout' || requestedPlan === 'subscription' ? requestedPlan : undefined;

  return (
    <main className={styles.builderShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊">
          <span>W</span>
          <div>
            <strong>婚礼游戏工坊</strong>
            <small>PROJECT BUILDER</small>
          </div>
        </Link>
        <Link className={styles.builderBack} href="/platform">← 返回平台介绍</Link>
      </header>
      <WeddingBuilder initialPlan={initialPlan} />
    </main>
  );
}
