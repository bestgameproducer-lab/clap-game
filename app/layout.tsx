import './styles.css';
import type { Metadata, Viewport } from 'next';
import { ViewportHeightSync } from './viewport-height-sync';

export const metadata: Metadata = {
  title: 'Wedding Mission',
  description: 'Private wedding guest mission game',
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
