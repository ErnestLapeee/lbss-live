'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { TeamMark } from '@/components/ui/team-mark';
import { playerProfilePath } from '@/lib/player-profile-nav';

type Season = { id: number; year: number; name: string; isActive?: boolean; seasonKind?: string };

type AllStarPosition = {
  slot: string;
  positionNum: number;
  playerId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  gamesAtPosition: number;
  selectionValue: string;
  battingAvg: string | null;
  homeRuns: number;
  rbi: number;
  fieldingPct: string | null;
};

type AllStarPitcher = {
  role: 'SP' | 'RP';
  playerId: number;
  playerSlug: string;
  firstName: string;
  lastName: string;
  teamName: string;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  inningsPitched: string;
  era: string | null;
  whip: string | null;
  strikeouts: number;
  wins: number;
  saves: number;
};

export type AllStarData = {
  seasonId: number;
  seasonYear: number;
  seasonName: string;
  positions: AllStarPosition[];
  pitchers: AllStarPitcher[];
  criteria: {
    positionPlayers: string;
    startingPitcher: string;
    reliefPitchers: string;
  };
};

interface AllStarClientProps {
  initialSeasons: Season[];
  initialSeasonId: number | null;
  initialData: AllStarData | null;
}

/** Visual diamond slots: row/col in a 5×3 grid */
const DIAMOND_LAYOUT: Array<{ slot: string; row: number; col: number }> = [
  { slot: 'LF', row: 1, col: 1 },
  { slot: 'CF', row: 1, col: 2 },
  { slot: 'RF', row: 1, col: 3 },
  { slot: 'SS', row: 2, col: 1 },
  { slot: '2B', row: 2, col: 3 },
  { slot: '3B', row: 3, col: 1 },
  { slot: '1B', row: 3, col: 3 },
  { slot: 'C', row: 4, col: 2 },
];

function PlayerCard({
  slot,
  player,
  returnTo,
  compact,
}: {
  slot: string;
  player: AllStarPosition | null;
  returnTo: string;
  compact?: boolean;
}) {
  if (!player) {
    return (
      <div className={`rounded-lg border border-dashed border-border bg-surface-alt/50 ${compact ? 'p-2' : 'p-3'} text-center`}>
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-faint">{slot}</div>
        <div className="text-xs text-text-faint mt-1">—</div>
      </div>
    );
  }

  return (
    <Link
      href={playerProfilePath(player.playerSlug, returnTo)}
      className={`group block rounded-lg border border-border bg-surface hover:border-gold/40 hover:shadow-sm transition-all ${compact ? 'p-2' : 'p-3'}`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gold">{slot}</span>
        <TeamMark
          variant="tableSm"
          name={player.teamName}
          shortName={player.teamShortName}
          logoUrl={player.teamLogoUrl}
        />
      </div>
      <div className={`font-semibold text-text group-hover:text-accent transition-colors truncate ${compact ? 'text-xs' : 'text-sm'}`}>
        {player.firstName} {player.lastName}
      </div>
      {!compact && (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono text-text-muted">
          <span>OPS {player.selectionValue}</span>
          {player.battingAvg && <span>AVG {player.battingAvg.replace(/^0/, '')}</span>}
          <span>{player.homeRuns} HR</span>
          {player.fieldingPct && <span>FLD {player.fieldingPct.replace(/^0/, '')}</span>}
        </div>
      )}
    </Link>
  );
}

function PitcherCard({ pitcher, returnTo }: { pitcher: AllStarPitcher; returnTo: string }) {
  return (
    <Link
      href={playerProfilePath(pitcher.playerSlug, returnTo)}
      className="group flex items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:border-gold/40 hover:shadow-sm transition-all"
    >
      <span className="shrink-0 w-7 text-center text-[10px] font-bold uppercase tracking-wider text-gold">
        {pitcher.role}
      </span>
      <TeamMark
        variant="tableSm"
        name={pitcher.teamName}
        shortName={pitcher.teamShortName}
        logoUrl={pitcher.teamLogoUrl}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text truncate group-hover:text-accent transition-colors">
          {pitcher.firstName} {pitcher.lastName}
        </div>
        <div className="text-[10px] font-mono text-text-muted">
          {pitcher.era} ERA · {pitcher.inningsPitched} IP · {pitcher.strikeouts} K
          {pitcher.saves > 0 ? ` · ${pitcher.saves} SV` : ''}
        </div>
      </div>
    </Link>
  );
}

export function AllStarClient({ initialSeasons, initialSeasonId, initialData }: AllStarClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [seasons] = useState(initialSeasons);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(initialSeasonId);
  const [data, setData] = useState<AllStarData | null>(initialData);
  const [loading, setLoading] = useState(false);
  const isInitialLoad = useRef(true);

  const returnTo = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  useEffect(() => {
    const raw = searchParams?.get('season');
    if (raw === 'all' || raw === '') {
      setSelectedSeasonId(null);
      setData(null);
      return;
    }
    if (raw) {
      const sid = parseInt(raw, 10);
      if (!isNaN(sid) && seasons.some((s) => s.id === sid)) {
        setSelectedSeasonId(sid);
      }
    }
  }, [searchParams, seasons]);

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (selectedSeasonId == null) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/proxy/public/stats/all-star?seasonId=${selectedSeasonId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedSeasonId]);

  const onSeasonChange = (value: string) => {
    const newId = value === 'all' ? null : Number(value);
    setSelectedSeasonId(newId);
    const sp = new URLSearchParams();
    if (newId == null) sp.set('season', 'all');
    else sp.set('season', String(newId));
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const bySlot = new Map(data?.positions.map((p) => [p.slot, p]) ?? []);

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-text-muted">Season:</label>
          <select
            value={selectedSeasonId ?? 'all'}
            onChange={(e) => onSeasonChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="all">All time</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.seasonKind === 'playoff' ? ' (Playoffs)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-text-muted">Loading…</div>
      ) : selectedSeasonId == null ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt p-10 text-center">
          <p className="text-sm text-text-muted">Select a season to view the all-star team.</p>
        </div>
      ) : !data || data.positions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt p-10 text-center">
          <p className="text-sm text-text-muted">Not enough data to build an all-star team for this season yet.</p>
        </div>
      ) : (
        <>
          <div
            className="grid grid-cols-3 gap-2 sm:gap-3 mb-8"
            style={{ gridTemplateRows: 'repeat(4, minmax(0, auto))' }}
          >
            {DIAMOND_LAYOUT.map(({ slot, row, col }) => (
              <div key={slot} style={{ gridRow: row, gridColumn: col }}>
                <PlayerCard slot={slot} player={bySlot.get(slot) ?? null} returnTo={returnTo} />
              </div>
            ))}
          </div>

          {data.pitchers.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-text mb-3">Pitching Staff</h2>
              <div className="space-y-2">
                {data.pitchers.map((p) => (
                  <PitcherCard key={`${p.role}-${p.playerId}`} pitcher={p} returnTo={returnTo} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p className="mt-8 text-center">
        <Link href="/stats" className="text-xs font-semibold text-accent hover:underline">
          ← Back to Statistics
        </Link>
      </p>
    </div>
  );
}
