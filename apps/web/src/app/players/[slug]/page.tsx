import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { notFound } from 'next/navigation';
import { PlayerProfileClient } from './player-profile-client';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const player: any = await apiFetch(`/api/public/players/${slug}`);
    return { title: `${player.firstName} ${player.lastName}` };
  } catch {
    return { title: 'Player' };
  }
}

export default async function PlayerProfilePage({ params }: Props) {
  const { slug } = await params;
  let player: any;
  let battingStats: any[] = [];

  try {
    player = await apiFetch(`/api/public/players/${slug}`);
  } catch {
    notFound();
  }
  let seasons: { id: number; name: string; year: number }[] = [];
  try {
    seasons = await apiFetch('/api/public/stats/seasons');
    seasons = Array.isArray(seasons) ? seasons : [];
  } catch {}
  try {
    battingStats = await apiFetch(`/api/public/players/${slug}/stats`); // all-time (one row)
  } catch {}
  battingStats = Array.isArray(battingStats) ? battingStats : [];

  const infoPills = [
    player.nationality,
    player.bats && `B: ${player.bats}`,
    player.throws && `T: ${player.throws}`,
    player.heightCm && `${player.heightCm} cm`,
    player.weightKg && `${player.weightKg} kg`,
  ].filter(Boolean);

  return (
    <div>
      {/* Player header */}
      <div className="bg-white border-b border-[#ccc]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/players" className="text-xs text-[#666] hover:text-[#111] mb-4 inline-block">
            &larr; All Players
          </Link>
          <h1 className="font-heading text-2xl font-bold text-[#111] tracking-tight">
            {player.firstName} {player.lastName}
          </h1>
          {infoPills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {infoPills.map((pill: string, i: number) => (
                <span key={i} className="inline-flex px-2.5 py-0.5 rounded border border-[#ccc] bg-[#f5f5f5] text-xs text-[#444]">
                  {pill}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PlayerProfileClient slug={slug} initialBattingStats={battingStats} seasons={seasons} />

        {player.bio && (
          <div className="mt-8">
            <h2 className="font-heading text-lg font-bold mb-3 flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-gold" />
              Bio
            </h2>
            <p className="text-sm text-text-muted leading-relaxed max-w-3xl">{player.bio}</p>
          </div>
        )}
      </div>
    </div>
  );
}
