import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { JunioriemGroupSelect } from './group-select';
import { ageGroupHref, groupLabel, type AgeGroup, type JunioriemSectionName } from './groups';
import type { PublicSeason } from '../stats/load-stats-page';

const TITLES: Record<JunioriemSectionName, string> = {
  statistika: 'Statistika Junioriem',
  schedule: 'Schedule',
  standings: 'Standings',
};

export function JunioriemSection({
  groups,
  seasonId,
  section,
  ageGroups = [],
  activeSlug = null,
  children,
}: {
  groups: PublicSeason[];
  seasonId: number;
  section: JunioriemSectionName;
  ageGroups?: AgeGroup[];
  activeSlug?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <PageHeader title={TITLES[section]} />
      <JunioriemGroupSelect
        seasonId={seasonId}
        section={section}
        groups={groups.map((group) => ({ id: group.id, label: groupLabel(group) }))}
      />
      {ageGroups.length === 0 ? (
        <p className="mx-auto max-w-none px-4 pt-6 text-sm text-text-muted sm:px-6 lg:px-10">
          No age groups yet. Add them in admin under Age groups, then assign each game to one.
        </p>
      ) : (
        <div className="mx-auto flex max-w-none flex-wrap items-center gap-2 px-4 pt-6 sm:px-6 lg:px-10">
          <span className="text-sm font-medium text-text-muted">Age group</span>
          {ageGroups.map((group) => {
            const selected = group.slug === activeSlug;
            return (
              <Link
                key={group.id}
                href={ageGroupHref(seasonId, section, group.slug)}
                className={
                  selected
                    ? 'bg-[#111] px-4 py-2 text-sm font-medium text-white'
                    : 'border border-[#ccc] px-4 py-2 text-sm font-medium text-[#111] hover:bg-[#f0f0f0]'
                }
              >
                {group.name}
              </Link>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}
