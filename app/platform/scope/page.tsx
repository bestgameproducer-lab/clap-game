import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../platform.module.css';
import { DeliveryScopeBuilder } from './delivery-scope-builder';

export const metadata: Metadata = {
  title: '确认服务范围 · 婚礼游戏工坊',
  description: '选择单场买断或订阅意向、定制深度、运营支持、彩排方式和附加服务。',
};

export default function PlatformScopePage() {
  return (
    <main className={styles.scopeShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊">
          <span>W</span>
          <div><strong>婚礼游戏工坊</strong><small>DELIVERY SCOPE</small></div>
        </Link>
        <Link className={styles.builderBack} href="/platform/create">← 返回方案定制</Link>
      </header>
      <DeliveryScopeBuilder />
    </main>
  );
}
