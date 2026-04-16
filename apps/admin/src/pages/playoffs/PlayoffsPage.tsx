import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

interface PlayoffRow {
  id: number;
  seasonId: number;
  name: string;
  isActive: boolean;
  config?: unknown;
}

interface SeriesRow {
  id: number;
  playoffsId: number;
  roundNumber: number;
  seriesIndex: number;
  label: string | null;
  higherSeed: number | null;
  lowerSeed: number | null;
  higherTeamId: number | null;
  lowerTeamId: number | null;
  bestOf: number;
  winnerTeamId: number | null;
}

interface TeamRow {
  id: number;
  name: string;
}

interface LeagueTeamRow {
  teamId: number;
  name: string;
}

const emptySeriesForm = {
  roundNumber: '1',
  seriesIndex: '1',
  label: '',
  bestOf: '1',
  higherSeed: '',
  lowerSeed: '',
  higherTeamId: '',
  lowerTeamId: '',
  winnerTeamId: '',
};

export function PlayoffsPage() {
  const { selectedSeasonId, selectedSeason, seasonsLoading } = useAdminSeason();
  const isPlayoffSeason = selectedSeason?.seasonKind === 'playoff';

  const [playoffs, setPlayoffs] = useState<PlayoffRow[]>([]);
  const [selectedPlayoffId, setSelectedPlayoffId] = useState<number | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newBracketName, setNewBracketName] = useState('');
  const [creating, setCreating] = useState(false);

  const [showSeriesForm, setShowSeriesForm] = useState(false);
  const [editingSeries, setEditingSeries] = useState<SeriesRow | null>(null);
  const [seriesForm, setSeriesForm] = useState(emptySeriesForm);
  const [seriesSaving, setSeriesSaving] = useState(false);

  const [seedingTemplate, setSeedingTemplate] = useState(false);

  const [leagueTeams, setLeagueTeams] = useState<LeagueTeamRow[]>([]);
  const [leagueTeamsLoading, setLeagueTeamsLoading] = useState(false);
  const [bracketOrder, setBracketOrder] = useState<number[]>([]);
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [replaceBracket, setReplaceBracket] = useState(false);

  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);
  const leagueTeamName = useMemo(() => {
    const m: Record<number, string> = { ...teamMap };
    for (const lt of leagueTeams) m[lt.teamId] = lt.name;
    return m;
  }, [teamMap, leagueTeams]);

  const loadPlayoffs = useCallback(async () => {
    if (!selectedSeasonId) {
      setPlayoffs([]);
      setSelectedPlayoffId(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await apiGet<PlayoffRow[]>(`/admin/playoffs?seasonId=${selectedSeasonId}`);
      const list = Array.isArray(rows) ? rows : [];
      setPlayoffs(list);
      setSelectedPlayoffId((prev) => {
        if (prev != null && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load playoffs');
      setPlayoffs([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId]);

  const loadTeams = useCallback(async () => {
    try {
      const rows = await apiGet<TeamRow[]>('/admin/teams');
      setTeams(Array.isArray(rows) ? rows : []);
    } catch {
      setTeams([]);
    }
  }, []);

  const loadLeagueTeams = useCallback(async () => {
    if (!selectedSeasonId) {
      setLeagueTeams([]);
      return;
    }
    setLeagueTeamsLoading(true);
    try {
      const allLeagues = await apiGet<Array<{ id: number; seasonId: number }>>('/admin/leagues');
      const mine = Array.isArray(allLeagues) ? allLeagues.filter((l) => l.seasonId === selectedSeasonId) : [];
      const lg = mine[0];
      if (!lg) {
        setLeagueTeams([]);
        return;
      }
      const rows = await apiGet<LeagueTeamRow[]>(`/admin/leagues/${lg.id}/teams`);
      setLeagueTeams(Array.isArray(rows) ? rows : []);
    } catch {
      setLeagueTeams([]);
    } finally {
      setLeagueTeamsLoading(false);
    }
  }, [selectedSeasonId]);

  const loadSeries = useCallback(async (playoffId: number) => {
    setSeriesLoading(true);
    try {
      const rows = await apiGet<SeriesRow[]>(`/admin/playoffs/${playoffId}/series`);
      setSeries(Array.isArray(rows) ? rows : []);
    } catch {
      setSeries([]);
      setError('Failed to load series');
    } finally {
      setSeriesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    setBracketOrder([]);
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!selectedSeasonId || !isPlayoffSeason) {
      setLeagueTeams([]);
      return;
    }
    void loadLeagueTeams();
  }, [selectedSeasonId, isPlayoffSeason, loadLeagueTeams]);

  useEffect(() => {
    loadPlayoffs();
  }, [loadPlayoffs]);

  useEffect(() => {
    if (selectedPlayoffId != null) {
      void loadSeries(selectedPlayoffId);
    } else {
      setSeries([]);
    }
  }, [selectedPlayoffId, loadSeries]);

  const handleCreateBracket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeasonId || !newBracketName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const row = await apiPost<PlayoffRow>('/admin/playoffs', {
        seasonId: selectedSeasonId,
        name: newBracketName.trim(),
        isActive: true,
      });
      setNewBracketName('');
      await loadPlayoffs();
      setSelectedPlayoffId(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bracket');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBracket = async (id: number) => {
    if (!confirm('Delete this bracket and all its series? Games will be unlinked from series.')) return;
    try {
      await apiDelete(`/admin/playoffs/${id}`);
      if (selectedPlayoffId === id) setSelectedPlayoffId(null);
      await loadPlayoffs();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const openAddSeries = () => {
    setEditingSeries(null);
    const nextIndex =
      series.length === 0
        ? 1
        : Math.max(...series.map((s) => s.seriesIndex)) + 1;
    const roundGuess = series.length === 0 ? 1 : series[series.length - 1]!.roundNumber;
    setSeriesForm({
      ...emptySeriesForm,
      roundNumber: String(roundGuess),
      seriesIndex: String(nextIndex),
    });
    setShowSeriesForm(true);
    setError(null);
  };

  const openEditSeries = (s: SeriesRow) => {
    setEditingSeries(s);
    setSeriesForm({
      roundNumber: String(s.roundNumber),
      seriesIndex: String(s.seriesIndex),
      label: s.label ?? '',
      bestOf: String(s.bestOf ?? 1),
      higherSeed: s.higherSeed != null ? String(s.higherSeed) : '',
      lowerSeed: s.lowerSeed != null ? String(s.lowerSeed) : '',
      higherTeamId: s.higherTeamId != null ? String(s.higherTeamId) : '',
      lowerTeamId: s.lowerTeamId != null ? String(s.lowerTeamId) : '',
      winnerTeamId: s.winnerTeamId != null ? String(s.winnerTeamId) : '',
    });
    setShowSeriesForm(true);
  };

  const parseOptInt = (v: string): number | null | undefined => {
    const t = v.trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? n : undefined;
  };

  const handleSeriesSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlayoffId) return;
    const roundNumber = parseInt(seriesForm.roundNumber, 10);
    const seriesIndex = parseInt(seriesForm.seriesIndex, 10);
    const bestOf = parseInt(seriesForm.bestOf, 10) || 1;
    if (!Number.isFinite(roundNumber) || roundNumber < 1) {
      setError('Round must be a positive integer.');
      return;
    }
    if (!Number.isFinite(seriesIndex) || seriesIndex < 0) {
      setError('Series index must be a non-negative integer.');
      return;
    }

    const payload = {
      roundNumber,
      seriesIndex,
      label: seriesForm.label.trim() || undefined,
      bestOf,
      higherSeed: parseOptInt(seriesForm.higherSeed),
      lowerSeed: parseOptInt(seriesForm.lowerSeed),
      higherTeamId: parseOptInt(seriesForm.higherTeamId),
      lowerTeamId: parseOptInt(seriesForm.lowerTeamId),
    };

    setSeriesSaving(true);
    setError(null);
    try {
      if (editingSeries) {
        await apiPut(`/admin/playoffs/series/${editingSeries.id}`, {
          ...payload,
          winnerTeamId: parseOptInt(seriesForm.winnerTeamId),
        });
      } else {
        await apiPost(`/admin/playoffs/${selectedPlayoffId}/series`, payload);
      }
      setShowSeriesForm(false);
      await loadSeries(selectedPlayoffId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save series');
    } finally {
      setSeriesSaving(false);
    }
  };

  const handleDeleteSeries = async (s: SeriesRow) => {
    if (!confirm(`Delete series ${s.label || `#${s.id}`}?`)) return;
    try {
      await apiDelete(`/admin/playoffs/series/${s.id}`);
      if (selectedPlayoffId) await loadSeries(selectedPlayoffId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const addTeamToBracketOrder = (teamId: number) => {
    setBracketOrder((prev) => (prev.includes(teamId) ? prev : [...prev, teamId]));
  };

  const moveBracketOrder = (index: number, dir: -1 | 1) => {
    setBracketOrder((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[index], next[j]] = [next[j]!, next[index]!];
      return next;
    });
  };

  const removeFromBracketOrder = (index: number) => {
    setBracketOrder((prev) => prev.filter((_, i) => i !== index));
  };

  const handleGenerateFromOrder = async () => {
    if (!selectedPlayoffId) return;
    if (bracketOrder.length < 2) {
      setError('Add at least two teams in seed order.');
      return;
    }
    const n = bracketOrder.length;
    if (n !== 3 && n % 2 !== 0) {
      setError('Use exactly 3 teams (KBO ladder: #2 vs #3, then vs #1) or an even count for standard pairings.');
      return;
    }
    setGeneratingBracket(true);
    setError(null);
    try {
      await apiPost(`/admin/playoffs/${selectedPlayoffId}/generate-bracket-from-order`, {
        teamIdsOrdered: bracketOrder,
        replaceExisting: replaceBracket,
      });
      await loadSeries(selectedPlayoffId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate bracket');
    } finally {
      setGeneratingBracket(false);
    }
  };

  const handleFourTeamTemplate = async () => {
    if (!selectedPlayoffId || series.length > 0) {
      setError('Pick an empty bracket or clear series first.');
      return;
    }
    if (!confirm('Create 4-team single elimination: 2 semifinals (round 1) + 1 final (round 2)?')) return;
    setSeedingTemplate(true);
    setError(null);
    try {
      const pid = selectedPlayoffId;
      await apiPost(`/admin/playoffs/${pid}/series`, {
        roundNumber: 1,
        seriesIndex: 1,
        label: 'Semifinal 1',
        bestOf: 1,
      });
      await apiPost(`/admin/playoffs/${pid}/series`, {
        roundNumber: 1,
        seriesIndex: 2,
        label: 'Semifinal 2',
        bestOf: 1,
      });
      await apiPost(`/admin/playoffs/${pid}/series`, {
        roundNumber: 2,
        seriesIndex: 1,
        label: 'Final',
        bestOf: 1,
      });
      await loadSeries(pid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template failed');
    } finally {
      setSeedingTemplate(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Playoff brackets</h1>
          <p className="text-sm text-text-muted mt-1 max-w-2xl">
            Brackets belong to a <strong>Playoff</strong> season. New playoff seasons get a default league and active
            bracket automatically. Add series (or generate round 1 from a team order), then on{' '}
            <Link to="/games" className="text-accent hover:text-accent-light font-medium">
              Games
            </Link>{' '}
            schedule games and link each game to a series ID.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">{error}</div>
      )}

      {seasonsLoading ? (
        <p className="text-text-muted text-sm">Loading seasons…</p>
      ) : !selectedSeasonId ? (
        <p className="text-text-muted text-sm">Choose a season in the header.</p>
      ) : !isPlayoffSeason ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          The selected season is not a <strong>Playoff</strong> season. Create one under{' '}
          <Link to="/seasons" className="underline font-medium">
            Seasons
          </Link>{' '}
          (type &quot;Playoff&quot;) — a league and default bracket are created for you — then return here.
        </div>
      ) : (
        <>
          <form onSubmit={handleCreateBracket} className="mb-6 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="block text-xs font-medium text-text-muted mb-1">New bracket name</label>
              <input
                className={inputClass}
                value={newBracketName}
                onChange={(e) => setNewBracketName(e.target.value)}
                placeholder="e.g. LBL 2026 Playoffs"
                disabled={creating}
              />
            </div>
            <button
              type="submit"
              disabled={creating || !newBracketName.trim()}
              className="px-4 py-2 bg-accent hover:bg-accent-light disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {creating ? 'Creating…' : 'Create bracket'}
            </button>
          </form>

          {loading ? (
            <p className="text-text-muted text-sm">Loading brackets…</p>
          ) : playoffs.length === 0 ? (
            <p className="text-text-muted text-sm">No brackets yet. Create one above.</p>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-text-muted">Active bracket</label>
                <select
                  className={`${inputClass} max-w-md`}
                  value={selectedPlayoffId ?? ''}
                  onChange={(e) => setSelectedPlayoffId(e.target.value ? parseInt(e.target.value, 10) : null)}
                >
                  {playoffs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (#{p.id})
                    </option>
                  ))}
                </select>
                {selectedPlayoffId != null && (
                  <button
                    type="button"
                    onClick={() => handleDeleteBracket(selectedPlayoffId)}
                    className="text-sm text-red-500 hover:text-red-400 font-medium"
                  >
                    Delete bracket
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={openAddSeries}
                  disabled={!selectedPlayoffId}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-semibold hover:bg-surface-alt disabled:opacity-50"
                >
                  + Add series
                </button>
                <button
                  type="button"
                  onClick={handleFourTeamTemplate}
                  disabled={!selectedPlayoffId || seriesLoading || seedingTemplate || series.length > 0}
                  className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-semibold hover:bg-surface-alt disabled:opacity-50"
                  title="Only when this bracket has no series yet"
                >
                  {seedingTemplate ? 'Adding…' : 'Quick: 4-team single elim'}
                </button>
              </div>

              {selectedPlayoffId != null && (
                <div className="rounded-xl border border-border bg-surface-alt/40 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-text">Bracket from seed order</h3>
                    <p className="text-xs text-text-muted mt-1 max-w-2xl">
                      Top = #1 seed. <strong>3 teams:</strong> semifinal #2 vs #3, then final #1 vs winner (KBO-style).
                      <strong> Even count:</strong> round 1 pairings 1 vs N, 2 vs N−1, … Uses teams in this season&apos;s
                      league (
                      <Link to="/leagues" className="text-accent hover:text-accent-light font-medium">
                        Leagues
                      </Link>
                      ).
                    </p>
                  </div>
                  {leagueTeamsLoading ? (
                    <p className="text-xs text-text-muted">Loading league teams…</p>
                  ) : leagueTeams.length === 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      No league or no teams in the league for this season. Add teams to the league first.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="min-w-[12rem]">
                          <label className="block text-xs font-medium text-text-muted mb-1">Add to order</label>
                          <select
                            className={inputClass}
                            defaultValue=""
                            onChange={(e) => {
                              const v = e.target.value ? parseInt(e.target.value, 10) : NaN;
                              e.target.value = '';
                              if (Number.isFinite(v)) addTeamToBracketOrder(v);
                            }}
                          >
                            <option value="">Choose team…</option>
                            {leagueTeams
                              .filter((t) => !bracketOrder.includes(t.teamId))
                              .map((t) => (
                                <option key={t.teamId} value={t.teamId}>
                                  {t.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={replaceBracket}
                            onChange={(e) => setReplaceBracket(e.target.checked)}
                          />
                          Replace existing series (unlinks games from those series)
                        </label>
                      </div>
                      {bracketOrder.length > 0 && (
                        <ol className="list-decimal pl-5 space-y-1 text-sm">
                          {bracketOrder.map((tid, i) => (
                            <li key={`${tid}-${i}`} className="flex flex-wrap items-center gap-2">
                              <span className="flex-1 min-w-[8rem]">{leagueTeamName[tid] ?? `#${tid}`}</span>
                              <button
                                type="button"
                                disabled={i === 0}
                                onClick={() => moveBracketOrder(i, -1)}
                                className="px-2 py-0.5 text-xs border border-border rounded disabled:opacity-40"
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                disabled={i === bracketOrder.length - 1}
                                onClick={() => moveBracketOrder(i, 1)}
                                className="px-2 py-0.5 text-xs border border-border rounded disabled:opacity-40"
                              >
                                Down
                              </button>
                              <button
                                type="button"
                                onClick={() => removeFromBracketOrder(i)}
                                className="text-xs text-red-500 hover:text-red-400 font-medium"
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleGenerateFromOrder()}
                        disabled={
                          generatingBracket ||
                          bracketOrder.length < 2 ||
                          (bracketOrder.length !== 3 && bracketOrder.length % 2 !== 0)
                        }
                        className="px-4 py-2 bg-accent hover:bg-accent-light disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
                      >
                        {generatingBracket ? 'Generating…' : 'Generate bracket'}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="bg-surface rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Round</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Label</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Bo</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Home / High</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Away / Low</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Winner</th>
                      <th className="px-3 py-2 text-left font-semibold text-text-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seriesLoading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-text-muted">
                          Loading series…
                        </td>
                      </tr>
                    ) : series.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-text-muted">
                          No series yet. Add manually or use the quick template.
                        </td>
                      </tr>
                    ) : (
                      series.map((s) => (
                        <tr key={s.id} className="border-b border-border hover:bg-surface-alt/50">
                          <td className="px-3 py-2 font-mono text-xs text-text-muted">{s.id}</td>
                          <td className="px-3 py-2">{s.roundNumber}</td>
                          <td className="px-3 py-2">{s.seriesIndex}</td>
                          <td className="px-3 py-2">{s.label ?? '—'}</td>
                          <td className="px-3 py-2">{s.bestOf}</td>
                          <td className="px-3 py-2">
                            {s.higherTeamId != null ? teamMap[s.higherTeamId] ?? `#${s.higherTeamId}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {s.lowerTeamId != null ? teamMap[s.lowerTeamId] ?? `#${s.lowerTeamId}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            {s.winnerTeamId != null ? teamMap[s.winnerTeamId] ?? `#${s.winnerTeamId}` : '—'}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => openEditSeries(s)}
                                className="text-accent hover:text-accent-light text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteSeries(s)}
                                className="text-red-500 hover:text-red-400 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {showSeriesForm && selectedPlayoffId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="font-heading text-xl font-bold mb-4">{editingSeries ? 'Edit series' : 'Add series'}</h2>
            <form onSubmit={handleSeriesSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Round *</label>
                  <input
                    type="number"
                    min={1}
                    className={inputClass}
                    value={seriesForm.roundNumber}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, roundNumber: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Series index *</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={seriesForm.seriesIndex}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, seriesIndex: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Label</label>
                <input
                  className={inputClass}
                  value={seriesForm.label}
                  onChange={(e) => setSeriesForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Semifinal 1"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1">Best of</label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={seriesForm.bestOf}
                  onChange={(e) => setSeriesForm((f) => ({ ...f, bestOf: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Higher seed #</label>
                  <input
                    className={inputClass}
                    value={seriesForm.higherSeed}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, higherSeed: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Lower seed #</label>
                  <input
                    className={inputClass}
                    value={seriesForm.lowerSeed}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, lowerSeed: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Higher team</label>
                  <select
                    className={inputClass}
                    value={seriesForm.higherTeamId}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, higherTeamId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Lower team</label>
                  <select
                    className={inputClass}
                    value={seriesForm.lowerTeamId}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, lowerTeamId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editingSeries && (
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Winner (optional)</label>
                  <select
                    className={inputClass}
                    value={seriesForm.winnerTeamId}
                    onChange={(e) => setSeriesForm((f) => ({ ...f, winnerTeamId: e.target.value }))}
                  >
                    <option value="">—</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSeriesForm(false)}
                  className="px-4 py-2 text-sm text-text-muted hover:text-text"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={seriesSaving}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {seriesSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
