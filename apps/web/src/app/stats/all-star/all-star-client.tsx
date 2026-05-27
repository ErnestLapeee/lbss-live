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
  if (!v) return '—';
  return v.replace(/^0(?=\.)/, '');
}

function StatPill({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center rounded-md px-2 py-1 min-w-[44px] ${
        highlight ? 'bg-gold/15 ring-1 ring-gold/25' : 'bg-surface-alt/80'
      }`}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-text-faint leading-none">{label}</span>
      <span className={`text-xs font-bold font-mono tabular-nums mt-0.5 ${highlight ? 'text-gold' : 'text-text'}`}>
        {value}
      </span>
    </div>
  );
}

function FieldDiamond() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 480 420"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <pattern id="grass" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="24" height="24" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="24" stroke="rgba(255,255,255,0.04)" strokeWidth="12" />
        </pattern>
      </defs>
      <rect width="480" height="420" fill="url(#grass)" />
      <path
        d="M240 36 L396 192 L240 348 L84 192 Z"
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="2"
      />
      <path
        d="M240 192 L300 252 L240 312 L180 252 Z"
        fill="rgba(255,255,255,0.07)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="1.5"
      />
      <circle cx="240" cy="252" r="18" fill="rgba(180,140,80,0.35)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
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
      <div className="h-full min-h-[112px] rounded-2xl border border-dashed border-white/20 bg-white/5 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">{slot}</span>
      </div>
    );
  }

  const teamLabel = player.teamShortName || player.teamName;

  return (
    <Link
      href={playerProfilePath(player.playerSlug, returnTo)}
      className="group h-full min-h-[112px] flex flex-col rounded-2xl bg-white shadow-[0_4px_20px_rgba(0,0,0,0.12)] ring-1 ring-black/5 hover:ring-gold/50 hover:shadow-[0_8px_28px_rgba(0,0,0,0.16)] hover:-translate-y-1 transition-all duration-200 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
        <span className="inline-flex h-6 min-w-[32px] items-center justify-center rounded-full bg-[#1a3d22] px-2 text-[10px] font-bold uppercase tracking-wider text-gold-light">
          {slot}
        </span>
        <TeamMark
          variant="tableSm"
          name={player.teamName}
          shortName={player.teamShortName}
          logoUrl={player.teamLogoUrl}
        />
      </div>
      <div className="px-3 pb-1">
        <div className="text-[15px] font-bold text-text leading-snug truncate group-hover:text-accent transition-colors">
          {player.firstName} {player.lastName}
        </div>
        <div className="text-[11px] text-text-faint truncate mt-0.5">{teamLabel}</div>
      </div>
      <div className="mt-auto px-2 pb-2.5 flex justify-center gap-1">
        <StatPill label="OPS" value={player.selectionValue} highlight />
        <StatPill label="AVG" value={fmtAvg(player.battingAvg)} />
        <StatPill label="HR" value={player.homeRuns} />
        <StatPill label="RBI" value={player.rbi} />
      </div>
    </Link>
  );
}

function PitcherCard({ pitcher, returnTo, featured }: { pitcher: AllStarPitcher; returnTo: string; featured?: boolean }) {
  return (
    <Link
      href={playerProfilePath(pitcher.playerSlug, returnTo)}
      className={`group block rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
        featured
          ? 'border-gold/35 bg-gradient-to-br from-gold/[0.12] via-surface to-surface hover:border-gold/55'
          : 'border-border bg-surface hover:border-accent/25'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-bold uppercase tracking-wider ${
              featured ? 'bg-gold/25 text-gold' : 'bg-surface-alt text-text-muted'
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
            <div className="text-base font-bold text-text truncate group-hover:text-accent transition-colors">
              {pitcher.firstName} {pitcher.lastName}
            </div>
            <div className="text-xs text-text-muted truncate">{pitcher.teamName}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatPill label="ERA" value={pitcher.era ?? '—'} highlight={featured} />
          <StatPill label="IP" value={pitcher.inningsPitched} />
          <StatPill label="K" value={pitcher.strikeouts} />
          <StatPill label="WHIP" value={pitcher.whip ?? '—'} />
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
  const seasonLabel = data?.seasonName ?? seasons.find((s) => s.id === selectedSeasonId)?.name;

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
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="rounded-xl border border-border bg-surface px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <label htmlFor="all-star-season" className="text-sm font-medium text-text-muted shrink-0">
            Season:
          </label>
          <select
            id="all-star-season"
            value={selectedSeasonId ?? 'all'}
            onChange={(e) => onSeasonChange(e.target.value)}
            className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50 min-w-[180px]"
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
          <span className="text-sm font-semibold text-text-muted">{seasonLabel}</span>
        )}
      </div>

      {loading ? (
        <div className="py-24 text-center text-sm text-text-muted">Loading…</div>
      ) : selectedSeasonId == null ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-14 text-center">
          <p className="text-sm text-text-muted">Select a season to view the all-star team.</p>
        </div>
      ) : !data || data.positions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-14 text-center">
          <p className="text-sm text-text-muted">Not enough data to build an all-star team for this season yet.</p>
        </div>
      ) : (
        <>
          <div className="relative rounded-2xl overflow-hidden border border-[#163318] shadow-xl mb-10">
            <div className="absolute inset-0 bg-gradient-to-b from-[#4a9f58] via-[#327a42] to-[#1a4528]" />
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-gold/60 via-gold to-gold/60" />
            <FieldDiamond />
            <div className="relative px-4 py-8 sm:px-8 sm:py-10">
              <div
                className="grid grid-cols-3 gap-3 sm:gap-4 max-w-2xl mx-auto"
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

          {data.pitchers.length > 0 && (
            <section className="space-y-5">
              <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-text">Pitching Staff</h2>
              {starter && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2">Starter</p>
                  <PitcherCard pitcher={starter} returnTo={returnTo} featured />
                </div>
              )}
              {relievers.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2">Bullpen</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

      <p className="mt-12 text-center">
        <Link href="/stats" className="text-xs font-semibold text-accent hover:underline">
          ← Back to Statistics
        </Link>
      </p>
    </div>
  );
}
