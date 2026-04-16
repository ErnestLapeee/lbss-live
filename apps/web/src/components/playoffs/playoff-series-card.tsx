'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

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

/** Pretty label for empty / placeholder team cells in the bracket. */
function teamLine(seedNum: string, name: string) {
  const raw = String(name ?? '').trim();
  const showTbd = !raw || raw === '—' || raw === 'TBD';
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="w-5 shrink-0 text-center font-mono text-[10px] font-bold tabular-nums text-accent">
        {seedNum || '\u00a0'}
      </span>
      {showTbd ? (
        <span className="italic text-text-faint">TBD</span>
      ) : (
        <span className="truncate font-semibold text-text">{raw}</span>
      )}
    </span>
  );
}

export function PlayoffSeriesCard({
  series,
  recordText,
}: {
  series: PlayoffSeriesForCard;
  /** Extra line under each team (e.g. regular-season record from standings). */
  recordText?: (teamName: string) => string;
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

  return (
    <div
      className={`rounded-xl bg-[color:var(--color-surface-alt)] p-0 ${
        canLoadGames ? 'ring-1 ring-transparent hover:ring-accent/25 transition-shadow' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/70 px-3 pb-2.5 pt-1">
        <h3 className="min-w-0 flex-1 text-left text-[13px] font-semibold leading-snug text-text">
          {series.label}
        </h3>
        <span
          className="shrink-0 rounded-md border border-accent/35 bg-accent/10 px-2 py-1 text-center font-mono text-[11px] font-bold tabular-nums text-accent"
          title={`Best-of-${series.bestOf} series`}
        >
          Bo{series.bestOf}
        </span>
      </div>

      <div className="divide-y divide-border/60">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1 text-[12px] leading-tight">
            {teamLine(higherSeed, series.higherTeamName)}
            {recordText && recordText(series.higherTeamName) ? (
              <div className="mt-1 truncate pl-7 text-[10px] text-text-faint">
                {recordText(series.higherTeamName)}
              </div>
            ) : null}
          </div>
          <span className="rounded-md bg-[color:var(--color-surface-inset)] px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
            {series.wins?.higher ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0 flex-1 text-[12px] leading-tight">
            {teamLine(lowerSeed, series.lowerTeamName)}
            {recordText && recordText(series.lowerTeamName) ? (
              <div className="mt-1 truncate pl-7 text-[10px] text-text-faint">
                {recordText(series.lowerTeamName)}
              </div>
            ) : null}
          </div>
          <span className="rounded-md bg-[color:var(--color-surface-inset)] px-2.5 py-1 font-mono text-sm font-bold tabular-nums text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
            {series.wins?.lower ?? 0}
          </span>
        </div>
      </div>

      {canLoadGames && (
        <>
          <button
            type="button"
            onClick={() => void toggleGames()}
            className="mt-0 w-full rounded-b-xl border-t border-border/70 bg-surface py-2.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/[0.06]"
          >
            {open ? 'Hide games' : 'Games & box scores'}
          </button>
          {open && (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              {loading && <p className="text-[11px] text-text-faint">Loading…</p>}
              {error && <p className="text-[11px] text-red-400">{error}</p>}
              {!loading && games && games.length === 0 && (
                <p className="text-[11px] text-text-faint">No games linked to this series yet.</p>
              )}
              {!loading &&
                games &&
                games.map((g) => {
                  const { away, home, a, h, st } = formatGameLine(g);
                  return (
                    <Link
                      key={g.id}
                      href={`/games/${g.id}/live`}
                      className="flex flex-col gap-1 rounded-lg border border-border/70 bg-[color:var(--color-surface)] px-3 py-2.5 text-[11px] shadow-sm transition-colors hover:border-accent/45 hover:bg-[color:var(--color-surface-alt)]/80"
                    >
                      <div className="text-text-faint text-[10px] uppercase tracking-wide">
                        <span>{st}</span>
                      </div>
                      <div className="flex justify-between gap-2 font-medium">
                        <span className="truncate min-w-0">
                          {away} {a}
                        </span>
                        <span className="text-text-faint">@</span>
                        <span className="truncate min-w-0 text-right">
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
        <p className="mt-2 text-[10px] text-text-faint">
          Link games to a playoff series in admin to open the schedule here.
        </p>
      )}
    </div>
  );
}
