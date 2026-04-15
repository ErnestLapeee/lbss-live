'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface SeasonSelectProps {
  seasons: { id: number; name?: string; year?: number; seasonKind?: string }[];
  currentSeasonId: number | null;
}

export function SeasonSelect({ seasons, currentSeasonId }: SeasonSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (value === 'all') {
      params.delete('season');
    } else {
      params.set('season', value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const value = currentSeasonId != null ? String(currentSeasonId) : 'all';

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-medium text-text-muted">Season:</label>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
      >
        <option value="all">Latest active</option>
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || s.year || s.id}
            {s.seasonKind === 'playoff' ? ' (Playoffs)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

