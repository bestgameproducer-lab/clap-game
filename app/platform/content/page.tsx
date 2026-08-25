import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../platform.module.css';
import { ContentIntake } from './content-intake';

export const metadata: Metadata = {
  title: '婚礼内容问卷 · 婚礼游戏工坊',
  description: '确认语言、互动强度、宾客构成、故事素材、内容边界，并定制团队名称、主持口播与新人问答。',
};

export default function PlatformContentPage() {
  return (
    <main className={styles.contentShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊">
          <span>W</span>
          <div><strong>婚礼游戏工坊</strong><small>CONTENT INTAKE</small></div>
        </Link>
        <Link className={styles.builderBack} href="/platform/project">← 返回项目工作台</Link>
      </header>
      <ContentIntake />
    </main>
  );
}
