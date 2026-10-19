import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { loadJunioriemGroups } from './groups';

export const metadata: Metadata = {
  title: 'Junioriem - LBSS',
  description: 'Children’s age groups and disciplines',
};

export const revalidate = 60;

export default async function JunioriemIndexPage() {
  const groups = await loadJunioriemGroups();
  const first = groups[0];
  if (first) redirect(`/junioriem/${first.id}/statistika`);

  return (
    <div>
      <PageHeader title="Junioriem" />
      <div className="mx-auto max-w-none px-4 py-16 sm:px-6 lg:px-10">
        <p className="text-text-muted">No children’s groups yet.</p>
      </div>
    </div>
  );
}
