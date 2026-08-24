import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Мастерская уроков',
  description: 'Единый центр подготовки уроков',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
