'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
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

function StatPill({
  label,
  value,
  highlight,
  invert,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
  invert?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-lg px-2.5 py-1.5 min-w-[48px] ${
        highlight
          ? invert
            ? 'bg-white/15 ring-1 ring-white/25'
            : 'bg-gold/12 ring-1 ring-gold/30'
          : invert
            ? 'bg-white/8'
            : 'bg-surface-alt'
      }`}
    >
      <span
        className={`text-[9px] font-bold uppercase tracking-wider leading-none ${
          invert ? 'text-white/55' : 'text-text-faint'
        }`}
      >
        {label}
      </span>
      <span
        className={`text-xs font-bold font-mono tabular-nums mt-0.5 ${
          highlight ? (invert ? 'text-gold-light' : 'text-gold') : invert ? 'text-white' : 'text-text'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function FieldDiamond({ patternId }: { patternId: string }) {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 480 440"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <pattern id={patternId} width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
          <rect width="20" height="20" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="20" stroke="rgba(255,255,255,0.035)" strokeWidth="10" />
        </pattern>
      </defs>
      <rect width="480" height="440" fill={`url(#${patternId})`} />
      <path
        d="M240 28 L404 192 L240 356 L76 192 Z"
        fill="rgba(255,255,255,0.03)"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth="2"
      />
      <path
        d="M240 192 L308 260 L240 328 L172 260 Z"
        fill="rgba(255,255,255,0.06)"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.5"
      />
      <circle cx="240" cy="260" r="22" fill="rgba(194,154,90,0.4)" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      <line x1="240" y1="28" x2="240" y2="356" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1="76" y1="192" x2="404" y2="192" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
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
      <div className="h-full min-h-[118px] rounded-2xl border border-dashed border-white/18 bg-white/[0.04] flex flex-col items-center justify-center backdrop-blur-[1px]">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/30">{slot}</span>
      </div>
    );
  }

  const teamLabel = player.teamShortName || player.teamName;

  return (
    <Link
      href={playerProfilePath(player.playerSlug, returnTo)}
      className="group relative h-full min-h-[118px] flex flex-col rounded-2xl bg-white overflow-hidden shadow-[0_6px_24px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06] hover:ring-gold/45 hover:shadow-[0_10px_32px_rgba(0,0,0,0.18)] hover:-translate-y-1 transition-all duration-200"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-1">
        <span className="inline-flex h-7 min-w-[34px] items-center justify-center rounded-full bg-[#163318] px-2.5 text-[10px] font-bold uppercase tracking-wider text-gold-light shadow-sm">
          {slot}
        </span>
        <TeamMark
          variant="tableMd"
          name={player.teamName}
          shortName={player.teamShortName}
          logoUrl={player.teamLogoUrl}
        />
      </div>
      <div className="px-3.5 pb-2">
        <div className="text-[15px] font-bold text-text leading-snug truncate group-hover:text-accent transition-colors">
          {player.firstName} {player.lastName}
        </div>
        <div className="text-[11px] text-text-faint truncate mt-0.5">{teamLabel}</div>
      </div>
      <div className="mt-auto px-2.5 pb-3 flex justify-center gap-1.5">
        <StatPill label="OPS" value={player.selectionValue} highlight />
        <StatPill label="AVG" value={fmtAvg(player.battingAvg)} />
        <StatPill label="HR" value={player.homeRuns} />
      </div>
    </Link>
  );
}

function PitcherCard({
  pitcher,
  returnTo,
  featured,
}: {
  pitcher: AllStarPitcher;
  returnTo: string;
  featured?: boolean;
}) {
  return (
    <Link
      href={playerProfilePath(pitcher.playerSlug, returnTo)}
      className={`group relative block rounded-2xl border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        featured
          ? 'border-gold/40 bg-[#2a2a2a] text-white hover:border-gold/60'
          : 'border-border bg-surface hover:border-accent/30'
      }`}
    >
      {featured && (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-gold/30 via-gold to-gold/30" />
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span
            className={`shrink-0 flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-bold uppercase tracking-wider ${
              featured ? 'bg-gold/20 text-gold-light' : 'bg-surface-alt text-text-muted'
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
            <div
              className={`text-base font-bold truncate transition-colors ${
                featured ? 'text-white group-hover:text-gold-light' : 'text-text group-hover:text-accent'
              }`}
            >
              {pitcher.firstName} {pitcher.lastName}
            </div>
            <div className={`text-xs truncate ${featured ? 'text-white/50' : 'text-text-muted'}`}>
              {pitcher.teamName}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          <StatPill label="ERA" value={pitcher.era ?? '—'} highlight={featured} invert={featured} />
          <StatPill label="IP" value={pitcher.inningsPitched} invert={featured} />
          <StatPill label="K" value={pitcher.strikeouts} invert={featured} />
          <StatPill label="WHIP" value={pitcher.whip ?? '—'} invert={featured} />
        </div>
      </div>
    </Link>
  );
}

export function AllStarClient({ initialSeasons, initialSeasonId, initialData }: AllStarClientProps) {
  const grassPatternId = useId().replace(/:/g, '');
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
      <div className="rounded-2xl border border-border bg-surface px-4 py-3.5 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
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
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-text">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
            {seasonLabel}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="rounded-2xl bg-[#327a42] h-[420px]" />
          <div className="rounded-2xl bg-surface-alt h-32" />
        </div>
      ) : selectedSeasonId == null ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-14 text-center">
          <p className="text-sm text-text-muted">Select a season to view the all-star team.</p>
        </div>
      ) : !data || data.positions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-14 text-center">
          <p className="text-sm text-text-muted">Not enough data to build an all-star team for this season yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <div className="flex items-center gap-3 mb-4 px-1">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-text">Starting Nine</h2>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div className="relative rounded-2xl overflow-hidden border border-[#143016] shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-b from-[#52a860] via-[#358647] to-[#1a4528]" />
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent opacity-80" />
              <FieldDiamond patternId={grassPatternId} />
              <div className="relative px-4 py-8 sm:px-10 sm:py-12">
                <div
                  className="grid grid-cols-3 gap-3 sm:gap-5 max-w-2xl mx-auto"
                  style={{ gridTemplateRows: 'repeat(4, minmax(0, auto))' }}
                >
                  {DIAMOND_LAYOUT.map(({ slot, row, col }) => (
                    <div key={slot} style={{ gridRow: row, gridColumn: col }}>
                      <PlayerCard slot={slot} player={bySlot.get(slot) ?? null} returnTo={returnTo} />
                    </div>
                  ))}
                  <div
                    className="flex items-center justify-center pointer-events-none"
                    style={{ gridRow: 2, gridColumn: 2 }}
                    aria-hidden
                  >
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full border border-white/10 bg-amber-900/25" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {data.pitchers.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4 px-1">
                <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-text">Pitching Staff</h2>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="space-y-4">
                {starter && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2 pl-1">
                      Starter
                    </p>
                    <PitcherCard pitcher={starter} returnTo={returnTo} featured />
                  </div>
                )}
                {relievers.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-faint mb-2 pl-1">
                      Bullpen
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {relievers.map((p) => (
                        <PitcherCard key={p.playerId} pitcher={p} returnTo={returnTo} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="mt-12 text-center">
        <Link href="/stats" className="text-xs font-semibold text-accent hover:underline">
          ← Back to Statistics
        </Link>
      </p>
    </div>
  );
}
