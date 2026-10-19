import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { groupLabel, type JunioriemSectionName } from './groups';
import type { PublicSeason } from '../stats/load-stats-page';

const SECTIONS: { id: JunioriemSectionName; label: string }[] = [
  { id: 'statistika', label: 'Statistika' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'standings', label: 'Standings' },
];

export function JunioriemSection({
  groups,
  seasonId,
  section,
  children,
}: {
  groups: PublicSeason[];
  seasonId: number;
  section: JunioriemSectionName;
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader title="Statistika Junioriem" />
      <div className="mx-auto max-w-none px-4 pt-6 sm:px-6 lg:px-10">
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => {
            const active = group.id === seasonId;
            return (
              <Link
                key={group.id}
                href={`/junioriem/${group.id}/${section}`}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  active ? 'bg-[#2f2f2f] text-white' : 'border border-border bg-surface text-text hover:bg-surface-alt'
                }`}
              >
                {groupLabel(group)}
              </Link>
            );
          })}
        </div>
        <div className="mt-4 flex w-fit overflow-hidden rounded-lg border border-border bg-surface-alt">
          {SECTIONS.map((item) => {
            const active = item.id === section;
            return (
              <Link
                key={item.id}
                href={`/junioriem/${seasonId}/${item.id}`}
                className={`px-4 py-2 text-sm font-semibold ${
                  active ? 'bg-[#136cb2] text-white' : 'text-text-muted hover:bg-surface hover:text-text'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
      {children}
    </div>
  );
}
