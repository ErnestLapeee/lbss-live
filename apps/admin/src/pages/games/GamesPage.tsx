import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';
import { useAuth } from '@/lib/auth';
import { APP_LOCALE, formatShortDateTime } from '@/lib/localeDisplay';

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
}

interface Team {
  id: number;
  name: string;
}

interface LeagueTeamOption {
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

function splitLocalDateTimeFromIso(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: '', time: '18:00' };
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    };
  } catch {
    return { date: '', time: '18:00' };
  }
}

export function GamesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isScorer = user?.role === 'statistician';
  const isFinishedGame = (g: Game) => g.isFinalized || g.status === 'final';
  const { selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formLeagueTeams, setFormLeagueTeams] = useState<LeagueTeamOption[]>([]);

  const [form, setForm] = useState({
    leagueId: '',
    homeTeamId: '',
    awayTeamId: '',
    scheduledDate: '',
    scheduledTime: '18:00',
    venue: '',
    status: 'scheduled',
  });

  const teamMap = useMemo(() => Object.fromEntries(teams.map((t) => [t.id, t.name])), [teams]);

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
        selectedSeasonId
          ? apiGet<Team[]>(`/admin/teams?seasonId=${selectedSeasonId}`)
          : Promise.resolve([] as Team[]),
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
      const msg = err instanceof Error ? err.message : 'Failed to load data';
      if (!/authentication required/i.test(msg)) {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedSeasonId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const lid = form.leagueId.trim();
    if (!lid) {
      setFormLeagueTeams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiGet<{ teamId: number; name: string; shortName: string | null }[]>(
          `/admin/leagues/${lid}/teams`,
        );
        if (cancelled) return;
        let list: LeagueTeamOption[] = (Array.isArray(rows) ? rows : []).map((r) => ({
          id: r.teamId,
          name: r.shortName ? `${r.name} (${r.shortName})` : r.name,
        }));
        if (editing) {
          for (const tid of [editing.homeTeamId, editing.awayTeamId]) {
            if (tid && !list.some((x) => x.id === tid)) {
              list.push({
                id: tid,
                name: `${teamMap[tid] ?? `Team #${tid}`} — not in this league roster`,
              });
            }
          }
        }
        list.sort((a, b) => a.name.localeCompare(b.name));
        setFormLeagueTeams(list);
      } catch {
        if (!cancelled) setFormLeagueTeams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.leagueId, editing?.id, editing?.homeTeamId, editing?.awayTeamId, teamMap]);

  const openCreate = () => {
    setEditing(null);
    const firstLeague = leaguesForSeason[0];
    setForm({
      leagueId: firstLeague?.id ? String(firstLeague.id) : '',
      homeTeamId: '',
      awayTeamId: '',
      scheduledDate: '',
      scheduledTime: '18:00',
      venue: '',
      status: 'scheduled',
    });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (g: Game) => {
    setEditing(g);
    const { date, time } = splitLocalDateTimeFromIso(g.scheduledAt);
    setForm({
      leagueId: String(g.leagueId),
      homeTeamId: String(g.homeTeamId),
      awayTeamId: String(g.awayTeamId),
      scheduledDate: date,
      scheduledTime: time,
      venue: g.venue ?? '',
      status: g.status ?? 'scheduled',
    });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (!form.scheduledDate.trim()) {
        setError('Choose a game date in the date field.');
        return;
      }
      const tm = (form.scheduledTime || '00:00').trim();
      const timeHm = tm.length >= 5 ? tm.slice(0, 5) : '00:00';
      const scheduledAtIso = new Date(`${form.scheduledDate.trim()}T${timeHm}`).toISOString();
      if (editing) {
        await apiPut(`/admin/games/${editing.id}`, {
          leagueId: parseInt(form.leagueId, 10),
          homeTeamId: parseInt(form.homeTeamId, 10),
          awayTeamId: parseInt(form.awayTeamId, 10),
          scheduledAt: scheduledAtIso,
          venue: form.venue.trim() || undefined,
          status: form.status,
        });
      } else {
        await apiPost('/admin/games', {
          leagueId: parseInt(form.leagueId, 10),
          homeTeamId: parseInt(form.homeTeamId, 10),
          awayTeamId: parseInt(form.awayTeamId, 10),
          scheduledAt: scheduledAtIso,
          venue: form.venue.trim() || undefined,
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
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Games</h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={!selectedSeasonId || leaguesForSeason.length === 0}
          className="min-h-[44px] w-full shrink-0 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          + Create New
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Mobile: one card per game */}
      {selectedSeasonId && !loading && !seasonsLoading && games.length > 0 && (
        <div className="mb-4 space-y-3 md:hidden">
          {games.map((g) => (
            <div
              key={g.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="text-xs text-text-muted">{formatShortDateTime(g.scheduledAt)}</div>
              <div className="mt-1 text-base font-semibold leading-snug">
                <span className="text-text-muted">{teamMap[g.awayTeamId] ?? `Away #${g.awayTeamId}`}</span>
                <span className="mx-1 text-text-muted">@</span>
                <span>{teamMap[g.homeTeamId] ?? `Home #${g.homeTeamId}`}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="tabular-nums text-lg font-bold">
                  {g.awayScore}–{g.homeScore}
                </span>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(g.status)}`}
                >
                  {g.status}
                </span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {!(isScorer && isFinishedGame(g)) && (
                  <button
                    type="button"
                    onClick={() => navigate(`/scoring/${g.id}`)}
                    className="min-h-[48px] w-full rounded-lg bg-blue-600 py-3 text-center text-sm font-bold text-white hover:bg-blue-500 active:bg-blue-700"
                  >
                    {g.isFinalized ? 'Edit score' : 'Score game'}
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  {!g.isFinalized && !isScorer && (
                    <button
                      type="button"
                      onClick={() => handleFinalize(g)}
                      className="min-h-[44px] flex-1 rounded-lg border border-green-600/40 px-3 text-sm font-semibold text-green-700 hover:bg-green-500/10"
                    >
                      Finalize
                    </button>
                  )}
                  {!(isScorer && isFinishedGame(g)) && (
                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      className="min-h-[44px] flex-1 rounded-lg border border-border px-3 text-sm font-semibold text-accent hover:bg-surface-alt"
                    >
                      Edit
                    </button>
                  )}
                  {!isScorer && (
                    <button
                      type="button"
                      onClick={() => handleDelete(g)}
                      className="min-h-[44px] flex-1 rounded-lg border border-red-300/60 px-3 text-sm font-semibold text-red-600 hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface sm:overflow-visible">
        <table className={`w-full min-w-[36rem] text-sm ${games.length > 0 ? 'hidden md:table' : 'table'}`}>
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
                  Choose a season in the header, then games for that year will load here.
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
                  <td className="px-4 py-3">{formatShortDateTime(g.scheduledAt)}</td>
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
                      {!(isScorer && isFinishedGame(g)) && (
                        <button
                          onClick={() => navigate(`/scoring/${g.id}`)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded"
                        >
                          {g.isFinalized ? 'Edit Score' : 'Score Game'}
                        </button>
                      )}
                      {!g.isFinalized && !isScorer && (
                        <button
                          onClick={() => handleFinalize(g)}
                          className="text-green-600 hover:text-green-500 text-sm font-medium"
                        >
                          Finalize
                        </button>
                      )}
                      {!(isScorer && isFinishedGame(g)) && (
                        <button
                          onClick={() => openEdit(g)}
                          className="text-accent hover:text-accent-light text-sm font-medium"
                        >
                          Edit
                        </button>
                      )}
                      {!isScorer && (
                        <button
                          onClick={() => handleDelete(g)}
                          className="text-red-500 hover:text-red-400 text-sm font-medium"
                        >
                          Delete
                        </button>
                      )}
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
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      leagueId: e.target.value,
                      homeTeamId: '',
                      awayTeamId: '',
                    }))
                  }
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
              {form.leagueId && formLeagueTeams.length === 0 && (
                <p className="text-xs text-amber-800 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                  This league has no teams yet. Add clubs under <strong>Season setup</strong>, then pick home and away here.
                </p>
              )}
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
                  {formLeagueTeams.map((t) => (
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
                  {formLeagueTeams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Scheduled *</label>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[10.5rem] flex-1">
                    <input
                      type="date"
                      lang={APP_LOCALE}
                      value={form.scheduledDate}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, scheduledDate: e.target.value }))
                      }
                      className={inputClass}
                      required
                      aria-label="Game date"
                    />
                  </div>
                  <div className="w-[8.5rem] shrink-0">
                    <input
                      id="game-scheduled-time"
                      type="time"
                      lang={APP_LOCALE}
                      step={60}
                      value={form.scheduledTime}
                      onChange={(e) => setForm((f) => ({ ...f, scheduledTime: e.target.value }))}
                      className={inputClass}
                      required
                    />
                  </div>
                </div>
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
