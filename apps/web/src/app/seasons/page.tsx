import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Seasons' };

export default function SeasonsPage() {
  return (
    <div>
      <PageHeader title="Season Archive" description="Browse historical seasons and statistics" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link
            href="/seasons/2024"
            className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 hover:border-accent/30 hover:shadow-md transition-all"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white font-heading text-lg font-bold shrink-0">
              24
            </div>
            <div>
              <h3 className="font-heading text-base font-bold group-hover:text-accent transition-colors">2024 Season</h3>
              <p className="text-xs text-text-faint">Season data from API</p>
            </div>
          </Link>
          <Link
            href="/seasons/2023"
            className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-5 hover:border-accent/30 hover:shadow-md transition-all"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white font-heading text-lg font-bold shrink-0">
              23
            </div>
            <div>
              <h3 className="font-heading text-base font-bold group-hover:text-accent transition-colors">2023 Season</h3>
              <p className="text-xs text-text-faint">Season data from API</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
