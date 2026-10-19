import { redirect } from 'next/navigation';
import { loadJunioriemGroups } from '../../junioriem/groups';

export const revalidate = 60;

type Props = { searchParams: Promise<{ season?: string }> };

/** Old address. Children's statistics now live under Junioriem. */
export default async function JunioriStatsRedirect({ searchParams }: Props) {
  const params = await searchParams;
  const groups = await loadJunioriemGroups();
  const requested = params.season ? parseInt(params.season, 10) : NaN;
  const season = groups.find((group) => group.id === requested) ?? groups[0];
  if (!season) redirect('/junioriem');
  redirect(`/junioriem/${season.id}/statistika`);
}
