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

  return (
    <div
      className={`border border-border rounded-lg bg-surface-alt p-3 ${
        canLoadGames ? 'ring-1 ring-transparent hover:ring-accent/30 transition-shadow' : ''
      }`}
    >
      <div className="text-[10px] text-text-faint font-semibold mb-2 flex justify-between items-start gap-2">
        <span className="truncate">{series.label}</span>
        <span className="shrink-0 font-mono">Bo{series.bestOf}</span>
      </div>

      <div className="text-[11px] font-medium space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {series.higherSeed ? `${series.higherSeed}. ` : ''}
            {series.higherTeamName}
          </span>
          <span className="font-mono text-text-faint shrink-0">{series.wins?.higher ?? 0}</span>
        </div>
        {recordText && recordText(series.higherTeamName) ? (
          <div className="text-[10px] text-text-faint truncate -mt-0.5 mb-1">
            {recordText(series.higherTeamName)}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <span className="truncate">
            {series.lowerSeed ? `${series.lowerSeed}. ` : ''}
            {series.lowerTeamName}
          </span>
          <span className="font-mono text-text-faint shrink-0">{series.wins?.lower ?? 0}</span>
        </div>
        {recordText && recordText(series.lowerTeamName) ? (
          <div className="text-[10px] text-text-faint truncate -mt-0.5">
            {recordText(series.lowerTeamName)}
          </div>
        ) : null}
      </div>

      {canLoadGames && (
        <>
          <button
            type="button"
            onClick={() => void toggleGames()}
            className="mt-3 w-full rounded-md border border-border bg-surface py-1.5 text-[11px] font-semibold text-accent hover:bg-surface-alt/80 transition-colors"
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
                      className="flex flex-col gap-0.5 rounded-md border border-border/80 bg-surface px-2 py-2 text-[11px] hover:border-accent/50 hover:bg-surface-alt/50 transition-colors"
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
