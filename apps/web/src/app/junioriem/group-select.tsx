'use client';

import { useRouter } from 'next/navigation';
import type { JunioriemSectionName } from './groups';

export function JunioriemGroupSelect({
  groups,
  seasonId,
  section,
}: {
  groups: { id: number; label: string }[];
  seasonId: number;
  section: JunioriemSectionName;
}) {
  const router = useRouter();
  if (groups.length < 1) return null;

  return (
    <div className="mx-auto flex max-w-none items-center gap-3 px-4 pt-6 sm:px-6 lg:px-10">
      <label className="text-sm font-medium text-text-muted" htmlFor="junioriem-group">League:</label>
      <select
        id="junioriem-group"
        value={seasonId}
        onChange={(event) => router.push(`/junioriem/${event.target.value}/${section}`)}
        className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.label}</option>
        ))}
      </select>
    </div>
  );
}
