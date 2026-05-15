import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/layout/site-header';
import { ApiBaseProvider } from '@/lib/api-context';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'LBSS - Latvijas Beisbola Softbola Savienība',
    template: '%s | LBSS',
  },
  description: 'Statistika.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

  return (
    <html lang="lv" className={ibmPlexSans.variable}>
      <body
        className={`min-h-screen flex flex-col bg-[#f5f5f5] text-[#111] ${ibmPlexSans.className}`}
      >
        <ApiBaseProvider apiBase={apiBase}>
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </ApiBaseProvider>
      </body>
    </html>
  );
}
