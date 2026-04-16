'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PlayoffTeamAvatar } from './playoff-team-avatar';

function apiProxy(path: string) {
  return path.startsWith('/api/') ? path.replace(/^\/api\//, '/api/proxy/') : `/api/proxy${path}`;
}

export type PlayoffSeriesForCard = {
  id: number | null;
  label: string;
  bestOf: number;
  higherSeed: number | null;
  lowerSeed: number | null;
  higherTeamId?: number | null;
  lowerTeamId?: number | null;
  higherTeamName: string;
  lowerTeamName: string;
  wins: { higher: number; lower: number };
  winnerTeamId?: number | null;
};

type SeriesGameRow = {
  id: number;
  scheduledAt: string | null;
  homeTeamId: number;
  awayTeamId: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string | null;
};

function formatGameLine(g: SeriesGameRow) {
  const away = g.awayTeamName ?? `Team ${g.awayTeamId}`;
  const home = g.homeTeamName ?? `Team ${g.homeTeamId}`;
  const a = g.awayScore ?? '—';
  const h = g.homeScore ?? '—';
  const st = g.status === 'final' ? 'Final' : g.status === 'live' ? 'Live' : 'Scheduled';
  return { away, home, a, h, st };
}

function isTbdName(name: string): boolean {
  const t = String(name ?? '').trim();
  return !t || t === '—' || t === 'TBD';
}

function shortSeriesTitle(label: string): string {
  const m = label.match(/^(.+?)\s*\(/);
  return (m ? m[1] : label).trim() || label;
}

function seedBadgeClass(seed: string): string {
  const n = parseInt(seed, 10);
  if (n === 1) return 'border-amber-400/45 bg-amber-500/15 text-amber-100';
  if (n === 2) return 'border-sky-400/45 bg-sky-500/15 text-sky-100';
  if (n === 3) return 'border-orange-400/45 bg-orange-500/15 text-orange-100';
  return 'border-white/15 bg-white/5 text-slate-200';
}

function TeamRowPremium({
  seedNum,
  name,
  recordLine,
}: {
  seedNum: string;
  name: string;
  recordLine?: string;
}) {
  const tbd = isTbdName(name);
  const display = tbd ? 'TBD' : String(name).trim();

  return (
    <div
      className={cn(
        'group/row flex items-center gap-3 rounded-xl border border-transparent px-2 py-2.5 transition-colors',
        'hover:border-sky-500/25 hover:bg-white/[0.04]',
      )}
    >
      <PlayoffTeamAvatar teamName={tbd ? 'TBD' : name} variant={tbd ? 'tbd' : 'filled'} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {seedNum ? (
            <span
              className={cn(
                'inline-flex shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-black tabular-nums',
                seedBadgeClass(seedNum),
              )}
            >
              #{seedNum}
            </span>
          ) : null}
          {tbd ? (
            <div className="min-w-0">
              <span className="block font-heading text-[15px] font-bold italic tracking-tight text-slate-500">
                TBD
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500/90">
                To be determined
              </span>
            </div>
          ) : (
            <span className="truncate font-heading text-[15px] font-bold tracking-tight text-white">{display}</span>
          )}
        </div>
        {recordLine ? (
          <div className="mt-1 truncate pl-0.5 text-[10px] text-slate-500">{recordLine}</div>
        ) : null}
      </div>
    </div>
  );
}

export function PlayoffSeriesCard({
  series,
  recordText,
  embedded = false,
}: {
  series: PlayoffSeriesForCard;
  recordText?: (teamName: string) => string;
  embedded?: boolean;
}) {
  const seriesId = series.id;
  const canLoadGames = seriesId != null && seriesId > 0;

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [games, setGames] = useState<SeriesGameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleGames = useCallback(async () => {
    if (!canLoadGames) return;
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (games !== null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(apiProxy(`/api/public/playoffs/series/${seriesId}/games`));
      if (!r.ok) {
        setError('Could not load games');
        setGames([]);
        return;
      }
      const d = await r.json();
      setGames(Array.isArray(d) ? d : []);
    } catch {
      setError('Could not load games');
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [canLoadGames, games, open, seriesId]);

  const higherSeed = series.higherSeed != null ? String(series.higherSeed) : '';
  const lowerSeed = series.lowerSeed != null ? String(series.lowerSeed) : '';
  const wH = series.wins?.higher ?? 0;
  const wL = series.wins?.lower ?? 0;

  const titleShort = shortSeriesTitle(series.label);
  const bo = series.bestOf;

  const shell = embedded
    ? 'rounded-none border-0 bg-transparent p-0 shadow-none ring-0'
    : 'rounded-xl border border-border bg-surface p-0 shadow-sm';

  /** Premium dark bracket card (embedded in PlayoffBracket) */
  if (embedded) {
    return (
      <div className="group/matchup relative overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-[#111c2e]/95 via-[#0f172a] to-[#0a0f18] p-1 shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_1px_rgba(56,189,248,0.35)] transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(14,165,233,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(56,189,248,0.14),transparent_55%)]" />
        <div className="relative rounded-[14px] bg-[#0b1220]/90 p-3 sm:p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-200/95">
                <svg className="h-3.5 w-3.5 shrink-0 text-amber-300/90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M7 4c1.5 4 3 8 5 8s3.5-4 5-8M4 7c4 1.5 8 3 8 5s-4 3.5-8 5M20 7c-4 1.5-8 3-8 5s4 3.5 8 5" />
                </svg>
                {titleShort}
              </span>
              <span className="text-slate-500">•</span>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums text-amber-100">
                <svg className="h-3 w-3 text-amber-300/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                Bo{bo}
              </span>
            </div>
          </div>

          <div className="relative mb-1 rounded-xl border border-white/[0.06] bg-[#070d16]/60 p-2">
            <TeamRowPremium
              seedNum={higherSeed}
              name={series.higherTeamName}
              recordLine={
                recordText && !isTbdName(series.higherTeamName) ? recordText(series.higherTeamName) || undefined : undefined
              }
            />
            <div className="relative my-2 flex items-center justify-center py-1">
              <div className="absolute inset-x-10 top-1/2 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" aria-hidden />
              <div
                role="group"
                aria-label={`Series wins ${wH} to ${wL}`}
                className="relative flex min-w-[7rem] items-center justify-center gap-3 rounded-full border-2 border-sky-400/35 bg-[#0c1829] px-5 py-2 text-center font-mono text-2xl font-black tabular-nums text-white shadow-[inset_0_2px_12px_rgba(0,0,0,0.4),0_0_28px_rgba(56,189,248,0.2)]"
              >
                <span>{wH}</span>
                <span className="text-lg text-sky-400/90" aria-hidden>
                  —
                </span>
                <span>{wL}</span>
              </div>
            </div>
            <TeamRowPremium
              seedNum={lowerSeed}
              name={series.lowerTeamName}
              recordLine={
                recordText && !isTbdName(series.lowerTeamName) ? recordText(series.lowerTeamName) || undefined : undefined
              }
            />
          </div>

          {canLoadGames && (
            <>
              <button
                type="button"
                onClick={() => void toggleGames()}
                className="group/btn mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/20 bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-900 py-3 text-[12px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_28px_rgba(14,165,233,0.25)] transition hover:brightness-110 active:scale-[0.99]"
              >
                <svg
                  className="h-4 w-4 opacity-90 transition group-hover/btn:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {open ? 'Hide games' : 'Games & box scores'}
                <svg
                  className="h-4 w-4 opacity-70 transition group-hover/btn:translate-x-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {open && (
                <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                  {loading && <p className="text-center text-[11px] text-slate-500">Loading…</p>}
                  {error && <p className="text-center text-[11px] text-red-400">{error}</p>}
                  {!loading && games && games.length === 0 && (
                    <p className="text-center text-[11px] text-slate-500">No games linked to this series yet.</p>
                  )}
                  {!loading &&
                    games &&
                    games.map((g) => {
                      const { away, home, a, h, st } = formatGameLine(g);
                      return (
                        <Link
                          key={g.id}
                          href={`/games/${g.id}/live`}
                          className="flex flex-col gap-1 rounded-xl border border-white/10 bg-[#0c1829]/80 px-3 py-2.5 text-[11px] text-slate-200 transition hover:border-sky-500/40 hover:bg-sky-950/40"
                        >
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            {st}
                          </div>
                          <div className="flex justify-between gap-2 font-medium">
                            <span className="min-w-0 truncate">
                              {away} {a}
                            </span>
                            <span className="text-slate-600">@</span>
                            <span className="min-w-0 truncate text-right">
                              {home} {h}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                </div>
              )}
            </>
          )}

          {!canLoadGames && (
            <p className="mt-3 text-center text-[10px] text-slate-500">
              Link games to a playoff series in admin to open the schedule here.
            </p>
          )}
        </div>
      </div>
    );
  }

  /* Non-embedded fallback (document-style) */
  return (
    <div className={cn(shell, !embedded && canLoadGames ? 'hover:border-accent/25 transition-colors' : '')}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-3 pb-2.5 pt-2.5 bg-surface-alt">
        <h3 className="min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug tracking-tight text-text">
          {series.label}
        </h3>
        <span
          className="shrink-0 rounded border border-border bg-surface px-2 py-0.5 text-center font-mono text-[11px] font-semibold tabular-nums text-text-muted"
          title={`Best-of-${series.bestOf} series`}
        >
          Bo{series.bestOf}
        </span>
      </div>
      <div className="relative">
        <div className="flex items-center justify-between gap-3 bg-surface px-3 py-3">
          <div className="min-w-0 flex-1 text-[13px] font-semibold text-text">{series.higherTeamName}</div>
          <span className="min-w-[2rem] rounded border border-border bg-surface-alt px-2 py-1 text-center font-mono text-sm font-semibold tabular-nums">
            {wH}
          </span>
        </div>
        <div className="border-t border-border bg-surface px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 text-[13px] font-semibold text-text">{series.lowerTeamName}</div>
            <span className="min-w-[2rem] rounded border border-border bg-surface-alt px-2 py-1 text-center font-mono text-sm font-semibold tabular-nums">
              {wL}
            </span>
          </div>
        </div>
      </div>
      {canLoadGames && (
        <button
          type="button"
          onClick={() => void toggleGames()}
          className="mt-0 w-full border-t border-border bg-accent py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-light"
        >
          {open ? 'Hide games' : 'Games & box scores'}
        </button>
      )}
    </div>
  );
}
