import { redirect } from 'next/navigation';
import { loadJunioriemGroups } from '../groups';

export default async function JunioriemStandingsIndex() {
  const groups = await loadJunioriemGroups();
  const first = groups[0];
  if (!first) redirect('/junioriem');
  redirect(`/junioriem/${first.id}/standings`);
}
