import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { StatsClient } from './stats-client';

export const metadata: Metadata = {
  title: 'Statistics - LBSS',
  description: 'Comprehensive batting and pitching statistics for the Latvijas Beisbola Liga',
};

export default function StatsPage() {
  return (
    <div>
      <PageHeader title="Statistics" description="Comprehensive player statistics and league leaders" />
      <StatsClient />
    </div>
  );
}
