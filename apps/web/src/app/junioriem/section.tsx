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
  children,
}: {
  groups: PublicSeason[];
  seasonId: number;
  section: JunioriemSectionName;
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
      {children}
    </div>
  );
}
