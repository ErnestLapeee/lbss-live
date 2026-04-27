import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPut, apiPost } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

interface LeagueRow {
  id: number;
  seasonId: number;
  name: string;
  slug: string;
}

interface TeamRow {
  id: number;
  name: string;
  shortName: string | null;
  isActive: boolean;
}

interface LeagueTeamRow {
  teamId: number;
  name: string;
  shortName: string | null;
}

export function SeasonSetupPage() {
  const { seasons, selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [inLeague, setInLeague] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sourceSeasonId, setSourceSeasonId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leaguesInSeason = useMemo(
    () => (selectedSeasonId == null ? [] : leagues.filter((l) => l.seasonId === selectedSeasonId)),
    [leagues, selectedSeasonId],
  );

  const activeTeams = useMemo(() => teams.filter((t) => t.isActive).sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  const loadMeta = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [lg, tm] = await Promise.all([apiGet<LeagueRow[]>('/admin/leagues'), apiGet<TeamRow[]>('/admin/teams')]);
      setLeagues(Array.isArray(lg) ? lg : []);
      setTeams(Array.isArray(tm) ? tm : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (leaguesInSeason.length === 0) {
      setLeagueId(null);
      setInLeague(new Set());
      return;
    }
    setLeagueId((prev) => {
      if (prev != null && leaguesInSeason.some((l) => l.id === prev)) return prev;
      return leaguesInSeason[0]!.id;
    });
  }, [leaguesInSeason]);

  useEffect(() => {
    if (leagueId == null) {
      setInLeague(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiGet<LeagueTeamRow[]>(`/admin/leagues/${leagueId}/teams`);
        if (cancelled) return;
        setInLeague(new Set(Array.isArray(rows) ? rows.map((r) => r.teamId) : []));
      } catch {
        if (!cancelled) setInLeague(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!selectedSeasonId || seasons.length === 0) {
      setSourceSeasonId(null);
      return;
    }
    const others = seasons.filter((s) => s.id !== selectedSeasonId);
    setSourceSeasonId((prev) => {
      if (prev != null && others.some((s) => s.id === prev)) return prev;
      return others[0]?.id ?? null;
    });
  }, [selectedSeasonId, seasons]);

  const toggleTeam = (teamId: number) => {
    setInLeague((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const selectAll = () => setInLeague(new Set(activeTeams.map((t) => t.id)));
  const clearAll = () => setInLeague(new Set());

  const handleSaveTeams = async () => {
    if (leagueId == null) return;
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      await apiPut(`/admin/leagues/${leagueId}/teams`, { teamIds: [...inLeague] });
      setStatus('Team list saved for this league.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (leagueId == null || sourceSeasonId == null) return;
    if (!confirm('Copy players from the source season onto the same teams for the current workspace season? Exact player/team roster slots that already exist this season are skipped.')) {
      return;
    }
    setImporting(true);
    setStatus(null);
    setError(null);
    try {
      const res = await apiPost<{ imported: number; skipped: number; message?: string }>(
        `/admin/leagues/${leagueId}/import-rosters`,
        { sourceSeasonId },
      );
      setStatus(res.message ?? `Imported ${res.imported}, skipped ${res.skipped}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const inputBar =
    'px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Season setup</h1>
        <p className="text-sm text-text-muted mt-1 max-w-3xl">
          Pick a <strong>league</strong> in the workspace season, tick which <strong>teams</strong> compete in it, then
          save. Use <strong>Import rosters</strong> to copy last season&apos;s player–team assignments for those teams
          into the current season (jersey # and position are copied).
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">{error}</div>
      )}
      {status && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-300 text-sm">
          {status}
        </div>
      )}

      {seasonsLoading || loading ? (
        <p className="text-text-muted text-sm">Loading…</p>
      ) : !selectedSeasonId ? (
        <p className="text-text-muted text-sm">Choose a workspace season in the header.</p>
      ) : leaguesInSeason.length === 0 ? (
        <p className="text-text-muted text-sm">
          No league for this season yet. Create one under <strong>Leagues</strong> first.
        </p>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">League</label>
              <select
                className={`${inputBar} min-w-[14rem]`}
                value={leagueId ?? ''}
                onChange={(e) => setLeagueId(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                {leaguesInSeason.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleSaveTeams}
              disabled={saving || leagueId == null}
              className="px-4 py-2 bg-accent hover:bg-accent-light disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {saving ? 'Saving…' : 'Save team membership'}
            </button>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span className="text-sm font-medium text-text-muted">Teams in this league</span>
              <button type="button" onClick={selectAll} className="text-sm text-accent hover:text-accent-light font-medium">
                Select all
              </button>
              <button type="button" onClick={clearAll} className="text-sm text-text-muted hover:text-text font-medium">
                Clear
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activeTeams.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-alt cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={inLeague.has(t.id)}
                    onChange={() => toggleTeam(t.id)}
                    className="rounded border-border"
                  />
                  <span className="font-medium">{t.name}</span>
                  {t.shortName && <span className="text-text-muted text-xs">({t.shortName})</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-alt/40 p-4 max-w-xl">
            <h2 className="font-heading font-semibold text-lg mb-2">Import rosters</h2>
            <p className="text-sm text-text-muted mb-3">
              For each team checked above, copies <code className="text-xs bg-surface px-1 rounded">player_seasons</code>{' '}
              from the source season (same team id). Does not remove existing rows; skips players who already have a
              roster line in the current season.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Copy from season</label>
                <select
                  className={inputBar}
                  value={sourceSeasonId ?? ''}
                  onChange={(e) => setSourceSeasonId(e.target.value ? parseInt(e.target.value, 10) : null)}
                  disabled={seasons.filter((s) => s.id !== selectedSeasonId).length === 0}
                >
                  {seasons.filter((s) => s.id !== selectedSeasonId).length === 0 ? (
                    <option value="">No other season</option>
                  ) : (
                    seasons
                      .filter((s) => s.id !== selectedSeasonId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.year} – {s.name}
                        </option>
                      ))
                  )}
                </select>
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={importing || sourceSeasonId == null || leagueId == null}
                className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-semibold hover:bg-surface-alt disabled:opacity-50"
              >
                {importing ? 'Importing…' : 'Import rosters'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
