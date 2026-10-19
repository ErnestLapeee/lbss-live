import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { apiFetch, API_REVALIDATE_GAMES, API_REVALIDATE_STANDINGS } from '@/lib/api';
import { buildRecordByTeamIdFromStandings } from '@/lib/standings-records';
import { ScheduleClient } from '../../../schedule/schedule-client';
import { JunioriemSection } from '../../section';
import { groupLabel, loadJunioriemGroups } from '../../groups';

export const metadata: Metadata = { title: 'Junioriem Schedule - LBSS' };

export const revalidate = 20;

type Props = { params: Promise<{ seasonId: string }> };

export default async function JunioriemSchedulePage({ params }: Props) {
  const { seasonId: raw } = await params;
  const seasonId = parseInt(raw, 10);
  const groups = await loadJunioriemGroups();
  if (!groups.some((group) => group.id === seasonId)) redirect('/junioriem');

  let initialGames: any[] = [];
  let initialRecordByTeamId: Record<number, string> = {};
  try {
    const data = await apiFetch(`/api/public/games?seasonId=${seasonId}`, { revalidate: API_REVALIDATE_GAMES });
    if (Array.isArray(data)) initialGames = data;
  } catch {}
  try {
    const standings = await apiFetch<{ leagues?: Array<{ rows?: Array<{ teamId: number; wins?: number; losses?: number }> }> }>(
      `/api/public/standings/by-season/${seasonId}?includeZeroGames=1`,
      { revalidate: API_REVALIDATE_STANDINGS },
    );
    initialRecordByTeamId = buildRecordByTeamIdFromStandings(standings);
  } catch {}

  return (
    <JunioriemSection groups={groups} seasonId={seasonId} section="schedule">
      <ScheduleClient
        embedded
        initialGames={initialGames}
        seasons={groups.map((group) => ({
          id: group.id,
          name: group.name ?? groupLabel(group),
          year: group.year ?? 0,
          seasonKind: group.seasonKind,
          leagueLevel: group.leagueLevel,
        }))}
        defaultSeasonId={seasonId}
        initialRecordByTeamId={initialRecordByTeamId}
      />
    </JunioriemSection>
  );
}
