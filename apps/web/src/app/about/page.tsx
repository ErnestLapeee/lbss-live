import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'About LBSS' };

export default function AboutPage() {
  return (
    <div>
      <PageHeader title="About LBSS" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-3xl">
          {/* Content to be added */}
        </div>
      </div>
    </div>
  );
}
