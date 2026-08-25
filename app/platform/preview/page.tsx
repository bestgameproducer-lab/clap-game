import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../platform.module.css';
import { TemplateExperiencePreview } from './template-experience-preview';

export const metadata: Metadata = {
  title: '定制效果预览 · 婚礼游戏工坊',
  description: '在开通婚礼实例前，使用本机草稿预览宾客入口、主持人题库和积分大屏。',
};

export default function PlatformPreviewPage() {
  return (
    <main className={styles.previewShell}>
      <header className={styles.builderHeader}>
        <Link className={styles.brand} href="/platform" aria-label="返回婚礼游戏工坊"><span>W</span><div><strong>婚礼游戏工坊</strong><small>EXPERIENCE PREVIEW</small></div></Link>
        <Link className={styles.builderBack} href="/platform/content">← 返回内容定制</Link>
      </header>
      <TemplateExperiencePreview />
    </main>
  );
}
