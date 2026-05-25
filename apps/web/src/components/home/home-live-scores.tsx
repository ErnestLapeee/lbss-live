'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TeamMark } from '@/components/ui/team-mark';

type LiveGame = {
  id: number;
  awayTeamName: string | null;
  homeTeamName: string | null;
  awayTeamShort?: string | null;
  homeTeamShort?: string | null;
  awayTeamLogoUrl?: string | null;
  homeTeamLogoUrl?: string | null;
  awayScore: number;
  homeScore: number;
};

export function HomeLiveScores({
  initialGames,
  seasonId,
}: {
  initialGames: LiveGame[];
  seasonId: number | null;
}) {
  const [games, setGames] = useState(initialGames);

  useEffect(() => {
    setGames(initialGames);
  }, [initialGames]);

  useEffect(() => {
    if (games.length === 0) return;
    const url = seasonId
      ? `/api/proxy/public/games?seasonId=${seasonId}&status=live`
      : '/api/proxy/public/games?status=live';
    const refresh = () => {
      fetch(url, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setGames(data);
        })
        .catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 12000);
    return () => clearInterval(id);
  }, [seasonId, games.length]);

  if (games.length === 0) return null;

  return (
    <section className="bg-[#0a7d0a]/5 border-b border-[#0a7d0a]/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#0a7d0a] live-badge">
            Live now
          </span>
          <Link href="/schedule" className="text-[11px] font-semibold text-accent hover:underline ml-auto">
            Full schedule →
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto scoreboard-scroll pb-1">
          {games.map((g) => (
            <Link
              key={g.id}
              href={`/games/${g.id}/live`}
              className="shrink-0 min-w-[140px] rounded-lg border border-[#0a7d0a]/30 bg-white px-3 py-2 hover:shadow-sm transition-shadow"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1 min-w-0">
                    <TeamMark
                      variant="tableSm"
                      name={g.awayTeamName || 'TBD'}
                      shortName={g.awayTeamShort}
                      logoUrl={g.awayTeamLogoUrl}
                    />
                    <span className="text-[11px] font-semibold truncate">{g.awayTeamName || 'TBD'}</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{g.awayScore ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1 min-w-0">
                    <TeamMark
                      variant="tableSm"
                      name={g.homeTeamName || 'TBD'}
                      shortName={g.homeTeamShort}
                      logoUrl={g.homeTeamLogoUrl}
                    />
                    <span className="text-[11px] font-semibold truncate">{g.homeTeamName || 'TBD'}</span>
                  </div>
                  <span className="text-sm font-bold tabular-nums">{g.homeScore ?? 0}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
