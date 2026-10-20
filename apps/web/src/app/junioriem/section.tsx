import { PageHeader } from '@/components/ui/page-header';
import { JunioriemGroupSelect } from './group-select';
import { groupLabel, type JunioriemSectionName } from './groups';
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
  children,
}: {
  groups: PublicSeason[];
  seasonId: number;
  section: JunioriemSectionName;
  ageGroups?: { id: number }[];
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
        children
      )}
    </div>
  );
}
