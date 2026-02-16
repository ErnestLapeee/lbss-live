import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

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

interface League {
  id: number;
  name: string;
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
  const [games, setGames] = useState<Game[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Game | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    leagueId: '',
    homeTeamId: '',
    awayTeamId: '',
    scheduledAt: '',
    venue: '',
    status: 'scheduled',
  });

  const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

  const loadData = async () => {
    setLoading(true);
    try {
      const [gamesRes, teamsRes, leaguesRes] = await Promise.all([
        apiGet<Game[]>('/admin/games'),
        apiGet<Team[]>('/admin/teams'),
        apiGet<League[]>('/admin/leagues'),
      ]);
      setGames(Array.isArray(gamesRes) ? gamesRes : []);
      setTeams(Array.isArray(teamsRes) ? teamsRes : []);
      setLeagues(Array.isArray(leaguesRes) ? leaguesRes : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      leagueId: leagues[0]?.id ? String(leagues[0].id) : '',
      homeTeamId: '',
      awayTeamId: '',
      scheduledAt: '',
      venue: '',
      status: 'scheduled',
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
        });
      } else {
        await apiPost('/admin/games', {
          leagueId: parseInt(form.leagueId, 10),
          homeTeamId: parseInt(form.homeTeamId, 10),
          awayTeamId: parseInt(form.awayTeamId, 10),
          scheduledAt: new Date(form.scheduledAt).toISOString(),
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">Games</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Create New
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
          {error}
        </div>
      )}

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
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                  Loading...
                </td>
              </tr>
            ) : games.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={6}>
                  No data yet. Create your first entry.
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
                      {!g.isFinalized && (
                        <button
                          onClick={() => navigate(`/scoring/${g.id}`)}
                          className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded"
                        >
                          Score Game
                        </button>
                      )}
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
                  {leagues.map((l) => (
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
