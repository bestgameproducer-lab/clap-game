import './styles.css';

export const metadata = {
  title: 'Wedding Mission',
  description: 'Private wedding guest mission game'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
