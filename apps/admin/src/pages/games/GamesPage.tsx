import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

interface Game {
  id: number;
  leagueId: number;
  homeTeamId: number;
  awayTeamId: number;
  scheduledAt: string;
  venue: string | null;
  status: string;
  homeScore: number;
  awayScore: number;
  isFinalized: boolean;
  playoffSeriesId?: number | null;
}

interface Team {
  id: number;
  name: string;
}

interface League {
  id: number;
  name: string;
  seasonId: number;
}

const STATUS_OPTIONS = [
  'scheduled',
  'warmup',
  'live',
  'final',
  'postponed',
  'cancelled',
  'suspended',
];

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function formatDatetimeLocal(iso: string) {
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export function GamesPage() {
  const navigate = useNavigate();
  const { selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkGameIds, setBulkGameIds] = useState('');
  const [bulkSeriesIdInput, setBulkSeriesIdInput] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);

  const [form, setForm] = useState({
    leagueId: '',
    homeTeamId: '',
    awayTeamId: '',
    scheduledAt: '',
    venue: '',
    status: 'scheduled',
    playoffSeriesId: '',
  });

  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  const leaguesForSeason = useMemo(
    () =>
      selectedSeasonId == null
        ? []
        : leagues.filter((l) => l.seasonId === selectedSeasonId),
    [leagues, selectedSeasonId],
  );

  /** Include current game’s league when editing (e.g. league moved to another season). */
  const leaguesForForm = useMemo(() => {
    if (!editing) return leaguesForSeason;
    const extra = leagues.find((l) => l.id === editing.leagueId);
    if (extra && !leaguesForSeason.some((l) => l.id === extra.id)) {
      return [...leaguesForSeason, extra];
    }
    return leaguesForSeason;
  }, [editing, leagues, leaguesForSeason]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [teamsRes, leaguesRes] = await Promise.all([
        apiGet<Team[]>('/admin/teams'),
        apiGet<League[]>('/admin/leagues'),
      ]);
      setTeams(Array.isArray(teamsRes) ? teamsRes : []);
      setLeagues(Array.isArray(leaguesRes) ? leaguesRes : []);

      if (!selectedSeasonId) {
        setGames([]);
        return;
      }

      const gamesRes = await apiGet<Game[]>(`/admin/games?seasonId=${selectedSeasonId}`);
      setGames(Array.isArray(gamesRes) ? gamesRes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    const firstLeague = leaguesForSeason[0];
    setForm({
      leagueId: firstLeague?.id ? String(firstLeague.id) : '',
      homeTeamId: '',
      awayTeamId: '',
      scheduledAt: '',
      venue: '',
      status: 'scheduled',
      playoffSeriesId: '',
    });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (g: Game) => {
    setEditing(g);
    setForm({
      leagueId: String(g.leagueId),
      homeTeamId: String(g.homeTeamId),
      awayTeamId: String(g.awayTeamId),
      scheduledAt: formatDatetimeLocal(g.scheduledAt),
      venue: g.venue ?? '',
      status: g.status ?? 'scheduled',
      playoffSeriesId: g.playoffSeriesId != null ? String(g.playoffSeriesId) : '',
    });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiPut(`/admin/games/${editing.id}`, {
          leagueId: parseInt(form.leagueId, 10),
          homeTeamId: parseInt(form.homeTeamId, 10),
          awayTeamId: parseInt(form.awayTeamId, 10),
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          venue: form.venue.trim() || undefined,
          status: form.status,
          playoffSeriesId: form.playoffSeriesId.trim() ? parseInt(form.playoffSeriesId, 10) : null,
        });
      } else {
        await apiPost('/admin/games', {
          leagueId: parseInt(form.leagueId, 10),
          homeTeamId: parseInt(form.homeTeamId, 10),
          awayTeamId: parseInt(form.awayTeamId, 10),
          scheduledAt: new Date(form.scheduledAt).toISOString(),
          venue: form.venue.trim() || undefined,
          playoffSeriesId: form.playoffSeriesId.trim() ? parseInt(form.playoffSeriesId, 10) : null,
        });
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: Game) => {
    const msg = g.isFinalized
      ? 'This game is finalized. Deleting it will remove all stats and events. Are you sure?'
      : 'Delete this game and all its data?';
    if (!confirm(msg)) return;
    try {
      await apiDelete(`/admin/games/${g.id}`);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleBulkPlayoffSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = bulkGameIds
      .split(/[\s,]+/)
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n));
    if (ids.length === 0) {
      setError('Enter at least one game ID (comma or space separated).');
      return;
    }
    const raw = bulkSeriesIdInput.trim();
    let playoffSeriesId: number | null;
    if (raw === '') {
      playoffSeriesId = null;
    } else {
      const n = parseInt(raw, 10);
      if (isNaN(n)) {
        setError('Invalid playoff series ID.');
        return;
      }
      playoffSeriesId = n;
    }
    setBulkSaving(true);
    setError(null);
    try {
      await apiPost<{ updated: number }>('/admin/games/bulk/playoff-series', {
        gameIds: ids,
        playoffSeriesId,
      });
      setBulkGameIds('');
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleFinalize = async (g: Game) => {
    if (g.isFinalized) return;
    if (!confirm('Finalize this game? This cannot be undone.')) return;
    try {
      await apiPost(`/admin/games/${g.id}/finalize`, {});
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to finalize');
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'final':
        return 'bg-green-500/20 text-green-600';
      case 'live':
        return 'bg-blue-500/20 text-blue-600';
      case 'scheduled':
      case 'warmup':
        return 'bg-amber-500/20 text-amber-600';
      case 'postponed':
      case 'suspended':
        return 'bg-orange-500/20 text-orange-600';
      case 'cancelled':
        return 'bg-red-500/20 text-red-600';
      default:
        return 'bg-surface-alt text-text-muted';
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold">Games</h1>
          <p className="text-sm text-text-muted mt-1">
            Schedule is filtered by the workspace season (top bar). Create leagues for that season first.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!selectedSeasonId || leaguesForSeason.length === 0}
          className="px-4 py-2 bg-accent hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Create New
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
          {error}
        </div>
      )}

      <details className="mb-4 rounded-xl border border-border bg-surface-alt/50 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-text-muted select-none">
          Bulk attach games to a playoff series
        </summary>
        <form onSubmit={handleBulkPlayoffSeries} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Game IDs</label>
            <input
              type="text"
              value={bulkGameIds}
              onChange={(e) => setBulkGameIds(e.target.value)}
              className={inputClass}
              placeholder="e.g. 101, 102, 103"
              disabled={bulkSaving}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Playoff series ID</label>
            <input
              type="number"
              value={bulkSeriesIdInput}
              onChange={(e) => setBulkSeriesIdInput(e.target.value)}
              className={inputClass}
              placeholder="Clear to detach"
              disabled={bulkSaving}
            />
          </div>
          <button
            type="submit"
            disabled={bulkSaving}
            className="px-4 py-2 bg-surface border border-border rounded-lg text-sm font-semibold hover:bg-surface-alt disabled:opacity-50"
          >
            {bulkSaving ? 'Applying…' : 'Apply'}
          </button>
        </form>
        <p className="mt-2 text-xs text-text-faint">
          Sets <code className="text-text-muted">playoff_series_id</code> for all listed games. Leave series empty to clear.
        </p>
      </details>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Home Team</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Away Team</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Score</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {seasonsLoading ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                  Loading seasons…
                </td>
              </tr>
            ) : !selectedSeasonId ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                  Add a season, then pick it in the workspace menu above.
                </td>
              </tr>
            ) : loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                  Loading...
                </td>
              </tr>
            ) : games.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                  {leaguesForSeason.length === 0
                    ? 'No leagues for this season yet. Create a league first.'
                    : 'No games scheduled yet. Create your first game.'}
                </td>
              </tr>
            ) : (
              games.map((g) => (
                <tr key={g.id} className="border-b border-border hover:bg-surface-alt/50">
                  <td className="px-4 py-3">{formatDate(g.scheduledAt)}</td>
                  <td className="px-4 py-3 font-medium">
                    {teamMap[g.homeTeamId] ?? `Team #${g.homeTeamId}`}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {teamMap[g.awayTeamId] ?? `Team #${g.awayTeamId}`}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {g.homeScore}-{g.awayScore}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadgeClass(g.status)}`}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => navigate(`/scoring/${g.id}`)}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded"
                      >
                        {g.isFinalized ? 'Edit Score' : 'Score Game'}
                      </button>
                      {!g.isFinalized && (
                        <button
                          onClick={() => handleFinalize(g)}
                          className="text-green-600 hover:text-green-500 text-sm font-medium"
                        >
                          Finalize
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(g)}
                        className="text-accent hover:text-accent-light text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(g)}
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

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading text-xl font-bold mb-4">
              {editing ? 'Edit Game' : 'Create Game'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">League *</label>
                <select
                  value={form.leagueId}
                  onChange={(e) => setForm((f) => ({ ...f, leagueId: e.target.value }))}
                  className={inputClass}
                  required
                >
                  <option value="">Select league</option>
                  {leaguesForForm.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Home Team *
                </label>
                <select
                  value={form.homeTeamId}
                  onChange={(e) => setForm((f) => ({ ...f, homeTeamId: e.target.value }))}
                  className={inputClass}
                  required
                >
                  <option value="">Select team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Away Team *
                </label>
                <select
                  value={form.awayTeamId}
                  onChange={(e) => setForm((f) => ({ ...f, awayTeamId: e.target.value }))}
                  className={inputClass}
                  required
                >
                  <option value="">Select team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Scheduled At *
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Venue</label>
                <input
                  type="text"
                  value={form.venue}
                  onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Playoff Series ID (optional)
                </label>
                <input
                  type="number"
                  value={form.playoffSeriesId}
                  onChange={(e) => setForm((f) => ({ ...f, playoffSeriesId: e.target.value }))}
                  className={inputClass}
                  placeholder="e.g. 12"
                />
                <p className="mt-1 text-xs text-text-faint">
                  Leave blank for regular season games. If set, this game counts as playoffs.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
