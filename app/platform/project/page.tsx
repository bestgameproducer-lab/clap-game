import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../platform.module.css';
import { ProjectWorkspace } from './project-workspace';

export const metadata: Metadata = {
  title: '婚礼项目工作台 · 婚礼游戏工坊',
  description: '查看婚礼游戏方案完成度、交付阶段、已选模块与正式开通前仍需准备的资料。',
};

export default function PlatformProjectPage() {
  return (
    <main className={styles.projectShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊">
          <span>W</span>
          <div><strong>婚礼游戏工坊</strong><small>PROJECT WORKSPACE</small></div>
        </Link>
        <Link className={styles.builderBack} href="/platform/create">← 返回编辑方案</Link>
      </header>
      <ProjectWorkspace />
    </main>
  );
}
