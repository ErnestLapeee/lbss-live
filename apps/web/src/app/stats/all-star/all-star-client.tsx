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

function fmtAvg(v: string | null) {
  if (!v) return null;
  return v.replace(/^0(?=\.)/, '');
}

function FieldDiamond() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.14]"
      viewBox="0 0 400 360"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <path
        d="M200 40 L340 180 L200 320 L60 180 Z"
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
      />
      <path
        d="M200 180 L260 240 L200 300 L140 240 Z"
        fill="rgba(255,255,255,0.06)"
        stroke="#fff"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PlayerCard({
  slot,
  player,
  returnTo,
}: {
  slot: string;
  player: AllStarPosition | null;
  returnTo: string;
}) {
  if (!player) {
    return (
      <div className="h-full min-h-[88px] rounded-xl border border-dashed border-white/25 bg-white/5 backdrop-blur-sm flex flex-col items-center justify-center px-2 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">{slot}</span>
        <span className="text-xs text-white/30 mt-1">—</span>
      </div>
    );
  }

  return (
    <Link
      href={playerProfilePath(player.playerSlug, returnTo)}
      className="group h-full min-h-[88px] flex flex-col rounded-xl border border-white/20 bg-white/95 shadow-md hover:shadow-lg hover:border-gold/60 hover:-translate-y-0.5 transition-all px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="inline-flex items-center justify-center min-w-[28px] px-1.5 py-0.5 rounded-md bg-[#1e4d28] text-[10px] font-bold uppercase tracking-wider text-gold-light">
          {slot}
        </span>
        <TeamMark
          variant="tableSm"
          name={player.teamName}
          shortName={player.teamShortName}
          logoUrl={player.teamLogoUrl}
        />
      </div>
      <div className="text-sm font-bold text-text leading-tight truncate group-hover:text-accent transition-colors">
        {player.firstName} {player.lastName}
      </div>
      <div className="mt-auto pt-1.5 flex flex-wrap gap-x-2 text-[10px] font-mono text-text-muted">
        <span className="font-semibold text-gold">{player.selectionValue}</span>
        <span>OPS</span>
        {player.battingAvg && <span>AVG {fmtAvg(player.battingAvg)}</span>}
        <span>{player.homeRuns} HR</span>
      </div>
    </Link>
  );
}

function PitcherCard({ pitcher, returnTo }: { pitcher: AllStarPitcher; returnTo: string }) {
  const isSp = pitcher.role === 'SP';
  return (
    <Link
      href={playerProfilePath(pitcher.playerSlug, returnTo)}
      className={`group flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-md ${
        isSp
          ? 'border-gold/40 bg-gradient-to-r from-gold/10 to-surface hover:border-gold/60'
          : 'border-border bg-surface hover:border-accent/30'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className={`shrink-0 flex h-9 w-9 items-center justify-center rounded-lg text-[10px] font-bold uppercase tracking-wider ${
            isSp ? 'bg-gold/20 text-gold' : 'bg-surface-alt text-text-muted'
          }`}
        >
          {pitcher.role}
        </span>
        <TeamMark
          variant="tableMd"
          name={pitcher.teamName}
          shortName={pitcher.teamShortName}
          logoUrl={pitcher.teamLogoUrl}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-text truncate group-hover:text-accent transition-colors">
            {pitcher.firstName} {pitcher.lastName}
          </div>
          <div className="text-xs text-text-muted truncate">{pitcher.teamName}</div>
        </div>
      </div>
      <div className="flex gap-4 sm:gap-5 pl-12 sm:pl-0 text-center sm:text-right">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-faint">ERA</div>
          <div className="text-sm font-bold font-mono tabular-nums">{pitcher.era ?? '—'}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-faint">IP</div>
          <div className="text-sm font-bold font-mono tabular-nums">{pitcher.inningsPitched}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-faint">K</div>
          <div className="text-sm font-bold font-mono tabular-nums">{pitcher.strikeouts}</div>
        </div>
        {pitcher.saves > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-faint">SV</div>
            <div className="text-sm font-bold font-mono tabular-nums">{pitcher.saves}</div>
          </div>
        )}
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
  const seasonLabel = seasons.find((s) => s.id === selectedSeasonId)?.name;

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
  const starter = data?.pitchers.find((p) => p.role === 'SP');
  const relievers = data?.pitchers.filter((p) => p.role === 'RP') ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <label htmlFor="all-star-season" className="text-sm font-medium text-text-muted shrink-0">
            Season:
          </label>
          <select
            id="all-star-season"
            value={selectedSeasonId ?? 'all'}
            onChange={(e) => onSeasonChange(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50 min-w-[160px]"
          >
            <option value="all">All time</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}{s.seasonKind === 'playoff' ? ' (Playoffs)' : ''}
              </option>
            ))}
          </select>
        </div>
        {seasonLabel && selectedSeasonId != null && !loading && data && (
          <p className="text-xs uppercase tracking-[0.12em] text-text-faint font-semibold">{seasonLabel}</p>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-sm text-text-muted">Loading…</div>
      ) : selectedSeasonId == null ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
          <p className="text-sm text-text-muted">Select a season to view the all-star team.</p>
        </div>
      ) : !data || data.positions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-alt p-12 text-center">
          <p className="text-sm text-text-muted">Not enough data to build an all-star team for this season yet.</p>
        </div>
      ) : (
        <>
          {/* Field */}
          <div className="relative rounded-2xl overflow-hidden border border-[#1a3d20] shadow-lg mb-8">
            <div className="absolute inset-0 bg-gradient-to-b from-[#3d8f4a] via-[#2d7340] to-[#1e4d28]" />
            <FieldDiamond />
            <div className="relative px-3 py-6 sm:px-6 sm:py-8">
              <div
                className="grid grid-cols-3 gap-2 sm:gap-3 max-w-lg mx-auto"
                style={{ gridTemplateRows: 'repeat(4, minmax(0, auto))' }}
              >
                {DIAMOND_LAYOUT.map(({ slot, row, col }) => (
                  <div key={slot} style={{ gridRow: row, gridColumn: col }}>
                    <PlayerCard slot={slot} player={bySlot.get(slot) ?? null} returnTo={returnTo} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pitching */}
          {data.pitchers.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-text">Pitching Staff</h2>
                <div className="flex-1 h-px bg-border" />
              </div>
              {starter && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1.5 pl-1">
                    Starter
                  </p>
                  <PitcherCard pitcher={starter} returnTo={returnTo} />
                </div>
              )}
              {relievers.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-1.5 pl-1">
                    Bullpen
                  </p>
                  <div className="space-y-2">
                    {relievers.map((p) => (
                      <PitcherCard key={p.playerId} pitcher={p} returnTo={returnTo} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <p className="mt-10 text-center">
        <Link href="/stats" className="text-xs font-semibold text-accent hover:underline">
          ← Back to Statistics
        </Link>
      </p>
    </div>
  );
}
