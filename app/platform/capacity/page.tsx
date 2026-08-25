import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../platform.module.css';
import { CapacityPlanner } from './capacity-planner';

export const metadata: Metadata = {
  title: '宾客容量预检 · 婚礼游戏工坊',
  description: '在导入真实名单前，核对旗舰婚礼游戏的账号席位、团队配额、关系角色和现场操作席位。',
};

export default function PlatformCapacityPage() {
  return (
    <main className={styles.capacityShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊"><span>W</span><div><strong>婚礼游戏工坊</strong><small>CAPACITY PREFLIGHT</small></div></Link>
        <Link className={styles.builderBack} href="/platform/create">← 返回方案定制</Link>
      </header>
      <CapacityPlanner />
    </main>
  );
}
