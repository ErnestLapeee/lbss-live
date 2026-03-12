import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import { RosterTable } from './roster-table';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: { season?: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const team: any = await apiFetch(`/api/public/teams/${slug}`);
    return { title: team.name };
  } catch {
    return { title: 'Team' };
  }
}

export default async function TeamDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  let team: any;
  let roster: any[] = [];

  try {
    team = await apiFetch(`/api/public/teams/${slug}`);
  } catch {
    notFound();
  }
  try {
    // Use the same seasons source as the stats and players pages
    const seasons: any[] = await apiFetch('/api/public/stats/seasons');
    const seasonFromUrl = searchParams?.season;
    const explicit = seasons.find((s: any) => String(s.id) === seasonFromUrl);
    const activeSeason = explicit || seasons.find((s: any) => s.isActive) || seasons[0];
    if (activeSeason?.id) {
      const res = await apiFetch(`/api/public/teams/${slug}/roster?seasonId=${activeSeason.id}`);
      roster = Array.isArray(res) ? res : [];
    }
  } catch {}

  const abbr = team.shortName || team.name.split(' ').map((w: string) => w[0]).join('').slice(0, 3);

  return (
    <div>
      {/* Team header banner */}
      <div className="bg-primary">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <Link href="/teams" className="text-xs text-white/40 hover:text-white/70 transition-colors mb-4 inline-block">
            &larr; All Teams
          </Link>
          <div className="flex items-center gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 text-white font-heading text-2xl font-bold border border-white/[0.08]">
              {abbr}
            </div>
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-white tracking-tight">{team.name}</h1>
              <p className="text-sm text-white/50 mt-0.5">
                {[team.city, team.foundedYear && `Est. ${team.foundedYear}`].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="font-heading text-lg font-bold mb-4 flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-accent" />
          Roster
        </h2>
        {roster.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center">
            <p className="text-sm text-text-muted">No players on the roster yet.</p>
          </div>
        ) : (
          <RosterTable roster={roster} />
        )}
      </div>
    </div>
  );
}
