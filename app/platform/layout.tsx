import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '婚礼游戏工坊 · 把你们的故事变成一场游戏',
  description: '从真实婚礼验证过的游戏模板出发，定制属于你们的宾客任务、团队互动、主持流程与最终揭晓。',
  robots: {
    index: false,
    follow: false,
  },
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
