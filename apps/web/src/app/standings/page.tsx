import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StandingsClient } from './standings-client';

export const metadata: Metadata = { title: 'Standings' };

export default function StandingsPage() {
  return (
    <Suspense fallback={null}>
      <StandingsClient />
    </Suspense>
  );
}
