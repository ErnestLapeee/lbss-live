import type { Metadata } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/layout/site-header';
import { ApiBaseProvider } from '@/lib/api-context';

export const metadata: Metadata = {
  title: {
    default: 'LBSS - Latvijas Beisbola Softbola Savienība',
    template: '%s | LBSS',
  },
  description: 'Latvijas Beisbola Softbola Savienība - Official website and statistics platform for Latvian baseball.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  return (
    <html lang="lv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col bg-[#f5f5f5] text-[#111]">
        <ApiBaseProvider apiBase={apiBase}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </ApiBaseProvider>
      </body>
    </html>
  );
}
