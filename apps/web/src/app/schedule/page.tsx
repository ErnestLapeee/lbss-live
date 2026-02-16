import type { Metadata } from 'next';
import { ScheduleClient } from './schedule-client';

export const metadata: Metadata = { title: 'Schedule & Scores' };

export default function SchedulePage() {
  return <ScheduleClient />;
}
