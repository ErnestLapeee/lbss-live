import type { Metadata } from 'next';
import { StandingsClient } from './standings-client';

export const metadata: Metadata = { title: 'Standings' };

export default function StandingsPage() {
  return <StandingsClient />;
}
