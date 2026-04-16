'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TeamMark } from '@/components/ui/team-mark';

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
  higherTeamShortName?: string | null;
  lowerTeamShortName?: string | null;
  higherTeamLogoUrl?: string | null;
  lowerTeamLogoUrl?: string | null;
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
  if (n === 1) return 'border-amber-200 bg-amber-50 text-amber-950';
  if (n === 2) return 'border-sky-200 bg-sky-50 text-sky-950';
  if (n === 3) return 'border-orange-200 bg-orange-50 text-orange-950';
  return 'border-border bg-surface-alt text-text-muted';
}

function TeamRowLight({
  seedNum,
  name,
  shortName,
  logoUrl,
  wins,
  recordLine,
}: {
  seedNum: string;
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  wins: number;
  recordLine?: string;
}) {
  const tbd = isTbdName(name);
  const display = tbd ? 'TBD' : String(name).trim();

  return (
    <div
      className={cn(
        'group/row flex items-center gap-3 rounded-lg border border-transparent px-1 py-2 transition-colors',
        'hover:border-border hover:bg-surface-alt/80',
      )}
    >
      {tbd ? (
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-surface-alt text-lg font-bold text-text-faint"
          aria-hidden
        >
          ?
        </div>
      ) : (
        <TeamMark
          variant="bracket"
          name={display}
          shortName={shortName}
          logoUrl={logoUrl}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {seedNum ? (
            <span
              className={cn(
                'inline-flex shrink-0 rounded-md border px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums',
                seedBadgeClass(seedNum),
              )}
            >
              #{seedNum}
            </span>
          ) : null}
          {tbd ? (
            <div className="min-w-0">
              <span className="block font-heading text-[15px] font-bold italic tracking-tight text-text-muted">TBD</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">To be determined</span>
            </div>
          ) : (
            <span className="truncate font-heading text-[15px] font-bold tracking-tight text-text">{display}</span>
          )}
        </div>
        {recordLine ? <div className="mt-0.5 truncate text-[10px] text-text-faint">{recordLine}</div> : null}
      </div>
      <div
        className={cn(
          'flex min-w-[3rem] shrink-0 items-center justify-center rounded-lg border border-border bg-surface-alt px-3 py-2 text-center font-mono text-2xl font-bold tabular-nums text-text shadow-inner',
          tbd && 'opacity-50',
        )}
      >
        {wins ?? 0}
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

  if (embedded) {
    return (
      <div className="group/matchup rounded-xl border border-border bg-surface p-4 shadow-sm transition-[box-shadow,transform] duration-200 hover:shadow-md">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wide text-text-faint">
          <span className="inline-flex items-center gap-1 text-text-muted">
            <svg className="h-3.5 w-3.5 shrink-0 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M7 4c1.5 4 3 8 5 8s3.5-4 5-8" />
            </svg>
            {titleShort}
          </span>
          <span className="text-border">•</span>
          <span className="inline-flex items-center gap-1 font-mono text-text-muted">
            <svg className="h-3 w-3 text-accent/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            Bo{bo}
          </span>
        </div>

        <div className="space-y-1 border-t border-border/60 pt-3">
          <TeamRowLight
            seedNum={higherSeed}
            name={series.higherTeamName}
            shortName={series.higherTeamShortName}
            logoUrl={series.higherTeamLogoUrl}
            wins={wH}
            recordLine={
              recordText && !isTbdName(series.higherTeamName) ? recordText(series.higherTeamName) || undefined : undefined
            }
          />
          <div className="relative py-1" aria-hidden>
            <div className="absolute inset-x-12 top-1/2 h-px bg-border" />
            <span className="relative mx-auto block w-max bg-surface px-2 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-text-faint">
              vs
            </span>
          </div>
          <TeamRowLight
            seedNum={lowerSeed}
            name={series.lowerTeamName}
            shortName={series.lowerTeamShortName}
            logoUrl={series.lowerTeamLogoUrl}
            wins={wL}
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
              className="group/btn mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:bg-accent-light active:scale-[0.99]"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {open ? 'Hide games' : 'Games & box scores'}
              <svg className="h-4 w-4 opacity-80 transition group-hover/btn:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {open && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {loading && <p className="text-center text-[11px] text-text-faint">Loading…</p>}
                {error && <p className="text-center text-[11px] text-red-600">{error}</p>}
                {!loading && games && games.length === 0 && (
                  <p className="text-center text-[11px] text-text-faint">No games linked to this series yet.</p>
                )}
                {!loading &&
                  games &&
                  games.map((g) => {
                    const { away, home, a, h, st } = formatGameLine(g);
                    return (
                      <Link
                        key={g.id}
                        href={`/games/${g.id}/live`}
                        className="flex flex-col gap-1 rounded-lg border border-border bg-surface-alt px-3 py-2.5 text-[11px] transition hover:border-accent/30 hover:bg-surface"
                      >
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-text-faint">{st}</div>
                        <div className="flex justify-between gap-2 font-medium text-text">
                          <span className="min-w-0 truncate">
                            {away} {a}
                          </span>
                          <span className="text-text-faint">@</span>
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
          <p className="mt-3 text-center text-[10px] text-text-faint">
            Link games to a playoff series in admin to open the schedule here.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn(shell, !embedded && canLoadGames ? 'hover:border-accent/25 transition-colors' : '')}>
      <div className="flex items-start justify-between gap-3 border-b border-border bg-surface-alt px-3 pb-2.5 pt-2.5">
        <h3 className="min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug tracking-tight text-text">{series.label}</h3>
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
        <>
          <button
            type="button"
            onClick={() => void toggleGames()}
            className="mt-0 w-full border-t border-border bg-accent py-2.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-colors hover:bg-accent-light"
          >
            {open ? 'Hide games' : 'Games & box scores'}
          </button>
          {open && (
            <div className="space-y-2 border-t border-border px-2 py-3">
              {loading && <p className="text-[11px] text-text-faint">Loading…</p>}
              {error && <p className="text-[11px] text-red-600">{error}</p>}
              {!loading &&
                games &&
                games.map((g) => {
                  const { away, home, a, h, st } = formatGameLine(g);
                  return (
                    <Link
                      key={g.id}
                      href={`/games/${g.id}/live`}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-surface-alt px-3 py-2 text-[11px] hover:border-accent/30"
                    >
                      <div className="text-[10px] text-text-faint">{st}</div>
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{away} {a}</span>
                        <span className="text-text-faint">@</span>
                        <span className="truncate text-right">{home} {h}</span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

