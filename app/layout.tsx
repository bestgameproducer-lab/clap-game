import './styles.css';
import type { Metadata, Viewport } from 'next';
import { ViewportHeightSync } from './viewport-height-sync';

export const metadata: Metadata = {
  title: 'Zimin & Anrong · 丘比特的婚礼考验',
  description: '仅限受邀宾客参与的婚礼秘密任务游戏',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: '婚礼任务' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: '#f7f2ec',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body><ViewportHeightSync/>{children}</body></html>;
}
