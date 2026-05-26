'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { TeamMark } from '@/components/ui/team-mark';
import { formatLineScoreCell } from '@lbss/shared';
import {
  formatGameDateShort,
  formatGameDayOfMonth,
  formatGameMonthShort,
  formatGameTime,
  formatGameWeekdayShort,
} from '@/lib/game-datetime';
import { buildRecordByTeamIdFromStandings } from '@/lib/standings-records';


interface Game {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeTeamShort: string | null;
  awayTeamShort: string | null;
  homeTeamLogoUrl?: string | null;
  awayTeamLogoUrl?: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
  venue: string | null;
  scheduledAt: string;
  isFinalized: boolean;
  currentInning: number | null;
  currentHalf: string | null;
  currentOuts: number | null;
  bases: { first: boolean; second: boolean; third: boolean } | null;
  currentBatter: { name: string; battingOrder: number } | null;
  homeLineScore: number[] | null;
  awayLineScore: number[] | null;
  homeTeamHits?: number | null;
  awayTeamHits?: number | null;
  homeTeamErrors?: number | null;
  awayTeamErrors?: number | null;
  winPitcher: { name: string; ip: string; h: number; er: number; bb: number; k: number } | null;
  lossPitcher: { name: string; ip: string; h: number; er: number; bb: number; k: number } | null;
  savePitcher: { name: string; ip: string; h: number; er: number; bb: number; k: number } | null;
  seasonId?: number | null;
  seasonYear?: number | null;
  seasonName?: string | null;
}

interface Season {
  id: number;
  name: string;
  year: number;
  seasonKind?: string;
}

interface ScheduleClientProps {
  initialGames: Game[];
  seasons: Season[];
  defaultSeasonId: number | null;
  initialRecordByTeamId?: Record<number, string>;
}

export function ScheduleClient({
  initialGames,
  seasons,
  defaultSeasonId,
  initialRecordByTeamId = {},
}: ScheduleClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [games, setGames] = useState<Game[]>(initialGames);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(defaultSeasonId);
  const [recordByTeamId, setRecordByTeamId] = useState<Record<number, string>>(initialRecordByTeamId);
  const isFirstRun = useRef(true);

  useEffect(() => {
    const raw = searchParams?.get('season');
    if (raw === 'all') {
      setSelectedSeasonId(null);
      return;
    }
    if (raw) {
      const sid = parseInt(raw, 10);
      if (!isNaN(sid) && seasons.some((s) => s.id === sid)) {
        setSelectedSeasonId(sid);
      }
    }
  }, [searchParams, seasons]);

  const fetchData = useCallback(async () => {
    try {
      const url = selectedSeasonId
        ? `/api/proxy/public/games?seasonId=${selectedSeasonId}`
        : '/api/proxy/public/games';
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setGames(data);
    } catch {
      // keep existing games on transient errors
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    fetchData();
  }, [selectedSeasonId, fetchData]);

  useEffect(() => {
    if (selectedSeasonId == null) {
      setRecordByTeamId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/proxy/public/standings/by-season/${selectedSeasonId}?includeZeroGames=1`,
          { cache: 'no-store' },
        );
        const data = await res.json();
        if (!cancelled && res.ok) {
          setRecordByTeamId(buildRecordByTeamIdFromStandings(data));
        }
      } catch {
        if (!cancelled) setRecordByTeamId({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId]);

  // Auto-refresh every 12s when live games exist
  useEffect(() => {
    if (!games.some(g => g.status === 'live')) return;
    const interval = setInterval(() => fetchData(), 12000);
    return () => clearInterval(interval);
  }, [games, fetchData]);

  const liveGames = games.filter(g => g.status === 'live');
  const finishedGames = games.filter(g => g.status === 'final').reverse();
  const upcomingGames = games.filter(
    g => g.status !== 'live' && g.status !== 'final'
  );

  // When "All seasons" is selected, group games by season (newest first)
  const showGroupedBySeason = selectedSeasonId == null && games.some(g => g.seasonYear != null);
  const gamesBySeason = showGroupedBySeason
    ? (() => {
        const byYear = new Map<number, Game[]>();
        for (const g of games) {
          const y = g.seasonYear ?? 0;
          if (!byYear.has(y)) byYear.set(y, []);
          byYear.get(y)!.push(g);
        }
        return Array.from(byYear.entries())
          .sort(([a], [b]) => b - a)
          .map(([year, list]) => ({ seasonYear: year, seasonName: list[0]?.seasonName ?? String(year), games: list }));
      })()
    : null;

  return (
    <div>
      <PageHeader title="Schedule & Scores" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-8">
        {seasons.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-alt border border-border mb-4">
            <label className="text-sm font-medium text-text-muted whitespace-nowrap">Season:</label>
            <select
              value={selectedSeasonId ?? 'all'}
              onChange={(e) => {
                const v = e.target.value;
                const next = v === 'all' ? null : Number(v);
                setSelectedSeasonId(next);
                const sp = new URLSearchParams(searchParams?.toString() ?? '');
                if (next == null) sp.set('season', 'all');
                else sp.set('season', String(next));
                router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
              }}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50 min-w-[160px]"
            >
              <option value="all">All seasons</option>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.seasonKind === 'playoff' ? ' (Playoffs)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
        {games.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-alt p-16 text-center">
            <p className="text-text-muted text-lg font-medium">No games scheduled yet</p>
            <p className="text-text-faint text-sm mt-2">Check back when the season begins.</p>
          </div>
        ) : showGroupedBySeason && gamesBySeason && gamesBySeason.length > 0 ? (
          <>
            {gamesBySeason.map(({ seasonYear, seasonName, games: seasonGames }) => {
              const live = seasonGames.filter(g => g.status === 'live');
              const upcoming = seasonGames.filter(g => g.status !== 'live' && g.status !== 'final');
              const final = seasonGames.filter(g => g.status === 'final').reverse();
              return (
                <section key={seasonYear} className="space-y-6">
                  <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-text-muted border-b border-border pb-2">
                    {seasonName}
                  </h2>
                  {live.length > 0 && (
                    <>
                      <SectionLabel color="live" pulse>Live Now</SectionLabel>
                      <div className="space-y-4">
                        {live.map(g => <LiveCard key={g.id} game={g} />)}
                      </div>
                    </>
                  )}
                  {upcoming.length > 0 && (
                    <>
                      <SectionLabel color="muted">Upcoming</SectionLabel>
                      <div className="space-y-3">
                        {upcoming.map(g => (
                          <UpcomingCard key={g.id} game={g} recordByTeamId={recordForGame(g, recordByTeamId)} />
                        ))}
                      </div>
                    </>
                  )}
                  {final.length > 0 && (
                    <>
                      <SectionLabel color="faint">Final</SectionLabel>
                      <div className="space-y-3">
                        {final.map(g => <FinalCard key={g.id} game={g} />)}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
          </>
        ) : (
          <>
            {liveGames.length > 0 && (
              <section>
                <SectionLabel color="live" pulse>Live Now</SectionLabel>
                <div className="space-y-4">
                  {liveGames.map(g => <LiveCard key={g.id} game={g} />)}
                </div>
              </section>
            )}
            {upcomingGames.length > 0 && (
              <section>
                <SectionLabel color="muted">Upcoming</SectionLabel>
                <div className="space-y-3">
                  {upcomingGames.map(g => (
                    <UpcomingCard key={g.id} game={g} recordByTeamId={recordForGame(g, recordByTeamId)} />
                  ))}
                </div>
              </section>
            )}
            {finishedGames.length > 0 && (
              <section>
                <SectionLabel color="faint">Final</SectionLabel>
                <div className="space-y-3">
                  {finishedGames.map(g => <FinalCard key={g.id} game={g} />)}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Section Label
   ═══════════════════════════════════════════ */
function SectionLabel({ children, color, pulse }: { children: React.ReactNode; color: 'live' | 'muted' | 'faint'; pulse?: boolean }) {
  const colors = {
    live: 'text-live',
    muted: 'text-text-muted',
    faint: 'text-text-faint',
  };
  return (
    <div className="flex items-center gap-3 mb-4">
      {pulse && <span className="relative flex h-2.5 w-2.5"><span className="absolute inset-0 rounded-full bg-live animate-ping opacity-40" /><span className="relative rounded-full h-2.5 w-2.5 bg-live" /></span>}
      <h2 className={`font-heading text-xs font-bold uppercase tracking-[0.15em] ${colors[color]}`}>{children}</h2>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ═══════════════════════════════════════════
   LIVE CARD — broadcast scoreboard overlay
   3 zones: State Bar → Confrontation → Context
   ═══════════════════════════════════════════ */
function LiveCard({ game }: { game: Game }) {
  const inn = game.currentInning ?? 1;
  const half = game.currentHalf ?? 'top';
  const outs = game.currentOuts ?? 0;
  const awayScore = game.awayScore ?? 0;
  const homeScore = game.homeScore ?? 0;
  const awayLeading = awayScore > homeScore;
  const homeLeading = homeScore > awayScore;
  const halfLabel = half === 'top' ? 'TOP' : 'BOT';
  const bases = game.bases ?? { first: false, second: false, third: false };
  const batter = game.currentBatter;

  return (
    <Link href={`/games/${game.id}/live`} className="block group">
      <div className="rounded-2xl overflow-hidden bg-surface-raised border border-border/60 transition-shadow group-hover:shadow-xl group-hover:shadow-black/20">

        {/* ────────────────────────────────────────
            ZONE 1 — GAME STATE BAR
            Single horizontal strip: live dot + inning + outs + bases
           ──────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-surface-inset border-b border-border/50">
          {/* Left: live indicator + inning */}
          <div className="flex items-center gap-3">
            {/* Live pulse — soft opacity breathing */}
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inset-0 rounded-full bg-live live-badge" />
              <span className="relative rounded-full h-2 w-2 bg-live" />
            </span>
            <span className="text-[11px] font-heading font-black uppercase tracking-[0.12em] text-text">
              {halfLabel} {inn}
            </span>
          </div>

          {/* Center: outs */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-wider text-text-faint mr-1">Out</span>
            {[0, 1, 2].map(i => (
              <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i < outs ? 'bg-red-500 scale-100' : 'bg-border scale-90'
              }`} />
            ))}
          </div>

          {/* Right: base diamond */}
          <svg viewBox="0 0 40 32" className="w-10 h-8 shrink-0">
            {/* 2nd */}
            <rect x="15" y="1" width="10" height="10" rx="1.5" transform="rotate(45 20 6)"
              className={bases.second ? 'fill-amber-400 stroke-amber-400' : 'fill-border stroke-border'} strokeWidth="0.5" />
            {/* 3rd */}
            <rect x="4" y="12" width="10" height="10" rx="1.5" transform="rotate(45 9 17)"
              className={bases.third ? 'fill-amber-400 stroke-amber-400' : 'fill-border stroke-border'} strokeWidth="0.5" />
            {/* 1st */}
            <rect x="26" y="12" width="10" height="10" rx="1.5" transform="rotate(45 31 17)"
              className={bases.first ? 'fill-amber-400 stroke-amber-400' : 'fill-border stroke-border'} strokeWidth="0.5" />
          </svg>
        </div>

        {/* ────────────────────────────────────────
            ZONE 2 — CONFRONTATION
            Two team rows, score is king
           ──────────────────────────────────────── */}
        <div className="px-5 py-4 space-y-1">
          {/* Away row */}
          <div className="flex items-center h-12">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <TeamMark
                variant="live"
                name={game.awayTeamName || 'Away'}
                shortName={game.awayTeamShort}
                logoUrl={game.awayTeamLogoUrl}
                emphasized={awayLeading}
              />
              <div className="min-w-0">
                <div className={`text-sm font-bold truncate leading-tight ${awayLeading ? 'text-text' : 'text-text-muted'}`}>
                  {game.awayTeamName || 'Away'}
                </div>
                {half === 'top' && (
                  <span className="inline-flex items-center gap-1 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-live" />
                    <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-live">
                      {batter ? `#${batter.battingOrder} ${batter.name} up to bat` : 'At Bat'}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className={`font-heading text-4xl font-black tracking-tight tabular-nums leading-none ${
              awayLeading ? 'text-text' : 'text-text-faint'
            }`}>
              {awayScore}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border/50 mx-1" />

          {/* Home row */}
          <div className="flex items-center h-12">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <TeamMark
                variant="live"
                name={game.homeTeamName || 'Home'}
                shortName={game.homeTeamShort}
                logoUrl={game.homeTeamLogoUrl}
                emphasized={homeLeading}
              />
              <div className="min-w-0">
                <div className={`text-sm font-bold truncate leading-tight ${homeLeading ? 'text-text' : 'text-text-muted'}`}>
                  {game.homeTeamName || 'Home'}
                </div>
                {half === 'bot' && (
                  <span className="inline-flex items-center gap-1 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-live" />
                    <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-live">
                      {batter ? `#${batter.battingOrder} ${batter.name} up to bat` : 'At Bat'}
                    </span>
                  </span>
                )}
              </div>
            </div>
            <div className={`font-heading text-4xl font-black tracking-tight tabular-nums leading-none ${
              homeLeading ? 'text-text' : 'text-text-faint'
            }`}>
              {homeScore}
            </div>
          </div>
        </div>

        {/* ────────────────────────────────────────
            ZONE 3 — CONTEXT
            Minimal bottom strip
           ──────────────────────────────────────── */}
        <div className="px-5 py-2 border-t border-border/40 flex items-center justify-between">
          <span className="text-[10px] text-text-faint">
            {game.venue || 'Latvijas Beisbola liga'}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] font-medium text-text-faint group-hover:text-text-muted transition-colors">
            Follow live
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════
   FINAL CARD — archival, calm, grayscale
   ═══════════════════════════════════════════ */
function FinalCard({ game }: { game: Game }) {
  const awayWon = (game.awayScore ?? 0) > (game.homeScore ?? 0);
  const homeWon = (game.homeScore ?? 0) > (game.awayScore ?? 0);
  const awayLS = game.awayLineScore ?? [];
  const homeLS = game.homeLineScore ?? [];
  const maxInn = Math.max(awayLS.length, homeLS.length, 1);

  return (
    <Link href={`/games/${game.id}/live`} className="block group">
      <div className="rounded-xl overflow-hidden bg-surface border border-border transition-all group-hover:border-text-faint/30 group-hover:bg-surface-alt">
        <div className="p-4">
          {/* Date + Final badge */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] text-text-faint">
              {formatGameDateShort(game.scheduledAt)}
              {game.venue && <span className="ml-1 opacity-50">— {game.venue}</span>}
            </span>
            <span className="text-[9px] font-bold uppercase tracking-widest text-text-faint/60">Final</span>
          </div>

          {/* Score rows */}
          <div className="space-y-1.5">
            <FinalTeamRow
              name={game.awayTeamName}
              short={game.awayTeamShort}
              logoUrl={game.awayTeamLogoUrl}
              score={game.awayScore ?? 0}
              won={awayWon}
            />
            <FinalTeamRow
              name={game.homeTeamName}
              short={game.homeTeamShort}
              logoUrl={game.homeTeamLogoUrl}
              score={game.homeScore ?? 0}
              won={homeWon}
            />
          </div>

          {/* Linescore + pitchers */}
          <div className="mt-3 flex items-end justify-between gap-4">
            {/* Mini linescore */}
            <div className="overflow-x-auto flex-1">
              <table className="text-[9px] font-mono text-text-faint">
                <thead>
                  <tr>
                    <th className="w-10"></th>
                    {Array.from({ length: maxInn }, (_, i) => (
                      <th key={i} className="text-center w-4 pb-0.5">{i + 1}</th>
                    ))}
                    <th className="text-center w-5 pb-0.5 border-l border-border/50 font-bold">R</th>
                    <th className="text-center w-5 pb-0.5 font-bold">H</th>
                    <th className="text-center w-5 pb-0.5 font-bold">E</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-1 font-bold text-text-faint/80">{game.awayTeamShort || game.awayTeamName?.slice(0, 3)?.toUpperCase()}</td>
                    {Array.from({ length: maxInn }, (_, i) => (
                      <td key={i} className="text-center tabular-nums">{formatLineScoreCell(awayLS[i] ?? 0)}</td>
                    ))}
                    <td className={`text-center border-l border-border/50 ${awayWon ? 'font-bold text-text' : ''}`}>{game.awayScore ?? 0}</td>
                    <td className="text-center tabular-nums">{game.awayTeamHits ?? '—'}</td>
                    <td className="text-center tabular-nums">{game.awayTeamErrors ?? '—'}</td>
                  </tr>
                  <tr>
                    <td className="pr-1 font-bold text-text-faint/80">{game.homeTeamShort || game.homeTeamName?.slice(0, 3)?.toUpperCase()}</td>
                    {Array.from({ length: maxInn }, (_, i) => (
                      <td key={i} className="text-center tabular-nums">{formatLineScoreCell(homeLS[i] ?? 0)}</td>
                    ))}
                    <td className={`text-center border-l border-border/50 ${homeWon ? 'font-bold text-text' : ''}`}>{game.homeScore ?? 0}</td>
                    <td className="text-center tabular-nums">{game.homeTeamHits ?? '—'}</td>
                    <td className="text-center tabular-nums">{game.homeTeamErrors ?? '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* W/L/S pitchers with stat lines */}
            {(game.winPitcher || game.lossPitcher) && (
              <div className="text-[9px] text-text-faint shrink-0 space-y-1 min-w-[140px]">
                {game.winPitcher && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-green-400/80 w-2.5">W</span>
                    <span className="text-text-muted font-medium">{game.winPitcher.name}</span>
                    <span className="text-text-faint/60 ml-auto whitespace-nowrap">{game.winPitcher.ip} IP, {game.winPitcher.k}K, {game.winPitcher.er} ER</span>
                  </div>
                )}
                {game.lossPitcher && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-red-400/80 w-2.5">L</span>
                    <span className="text-text-muted font-medium">{game.lossPitcher.name}</span>
                    <span className="text-text-faint/60 ml-auto whitespace-nowrap">{game.lossPitcher.ip} IP, {game.lossPitcher.k}K, {game.lossPitcher.er} ER</span>
                  </div>
                )}
                {game.savePitcher && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bold text-blue-400/80 w-2.5">S</span>
                    <span className="text-text-muted font-medium">{game.savePitcher.name}</span>
                    <span className="text-text-faint/60 ml-auto whitespace-nowrap">{game.savePitcher.ip} IP, {game.savePitcher.k}K, {game.savePitcher.er} ER</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ═══════════════════════════════════════════
   UPCOMING CARD — matchup rows, date rail, linkable
   ═══════════════════════════════════════════ */
function recordForGame(
  game: Game,
  records: Record<number, string>,
): { away?: string; home?: string } | undefined {
  const away = records[game.awayTeamId];
  const home = records[game.homeTeamId];
  if (!away && !home) return undefined;
  return { away, home };
}

function UpcomingCard({
  game,
  recordByTeamId,
}: {
  game: Game;
  recordByTeamId?: { away?: string; home?: string };
}) {
  return (
    <Link href={`/games/${game.id}/live`} className="block group">
      <article className="flex overflow-hidden rounded-xl border border-border bg-surface transition-all group-hover:border-accent/35 group-hover:shadow-md group-hover:shadow-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {/* Date rail */}
        <div className="flex w-[4.25rem] shrink-0 flex-col items-center justify-center border-r border-border/60 bg-surface-alt/90 py-4">
          <span className="text-[9px] font-bold uppercase tracking-wider text-accent">
            {formatGameMonthShort(game.scheduledAt)}
          </span>
          <span className="font-heading text-[1.65rem] font-black leading-none text-text tabular-nums">
            {formatGameDayOfMonth(game.scheduledAt)}
          </span>
          <span className="mt-1 text-[9px] font-medium text-text-faint">
            {formatGameWeekdayShort(game.scheduledAt)}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <UpcomingTeamRow
                name={game.awayTeamName}
                short={game.awayTeamShort}
                logoUrl={game.awayTeamLogoUrl}
                record={recordByTeamId?.away}
              />
              <UpcomingTeamRow
                name={game.homeTeamName}
                short={game.homeTeamShort}
                logoUrl={game.homeTeamLogoUrl}
                record={recordByTeamId?.home}
                isHome
              />
            </div>
            <div className="shrink-0 pt-0.5 text-right">
              <div className="font-heading text-lg font-black tabular-nums leading-none text-text">
                {formatGameTime(game.scheduledAt)}
              </div>
              <span className="mt-1 inline-block rounded-full bg-surface-alt px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-text-faint">
                Upcoming
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-2">
            <span className="min-w-0 truncate text-[10px] text-text-faint">
              {game.venue || formatGameDateShort(game.scheduledAt)}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-text-faint transition-colors group-hover:text-accent">
              Preview
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function UpcomingTeamRow({
  name,
  short,
  logoUrl,
  record,
  isHome,
}: {
  name: string | null;
  short: string | null;
  logoUrl?: string | null;
  record?: string;
  isHome?: boolean;
}) {
  const label = name || 'TBD';
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <TeamMark variant="final" name={label} shortName={short} logoUrl={logoUrl} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-sm font-semibold text-text transition-colors group-hover:text-accent">
            {label}
          </span>
          {record && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-faint">{record}</span>
          )}
        </div>
        {isHome && (
          <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-text-faint/80">Home</span>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   Shared sub-components
   ═══════════════════════════════════════════ */

function FinalTeamRow({ name, short, logoUrl, score, won }: {
  name: string | null; short: string | null; logoUrl?: string | null; score: number; won: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 min-w-0">
        <TeamMark
          variant="final"
          name={name || 'TBD'}
          shortName={short}
          logoUrl={logoUrl}
          won={won}
        />
        <span className={`text-sm font-semibold truncate ${won ? 'text-text' : 'text-text-muted'}`}>
          {name || 'TBD'}
        </span>
        {won && <span className="text-[8px] font-bold text-text-faint uppercase tracking-wider">W</span>}
      </div>
      <span className={`font-heading text-xl font-black tabular-nums ${won ? 'text-text' : 'text-text-faint'}`}>
        {score}
      </span>
    </div>
  );
}
