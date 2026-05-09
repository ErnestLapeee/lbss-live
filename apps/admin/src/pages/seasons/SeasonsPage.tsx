import { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

type SeasonKind = 'regular' | 'playoff';

export function SeasonsPage() {
  const { reloadSeasons } = useAdminSeason();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    year: '',
    name: '',
    startDate: '',
    endDate: '',
    isActive: false,
    seasonKind: 'regular' as SeasonKind,
    parentSeasonId: '',
    hasPlayoffs: true,
    regularSeasonGamesPerTeam: '',
    playoffSeeds: '4',
    playoffBestOf: '1',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<any[]>('/admin/seasons');
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load seasons');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      year: '',
      name: '',
      startDate: '',
      endDate: '',
      isActive: false,
      seasonKind: 'regular',
      parentSeasonId: '',
      hasPlayoffs: true,
      regularSeasonGamesPerTeam: '',
      playoffSeeds: '4',
      playoffBestOf: '1',
    });
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    const sk: SeasonKind = item.seasonKind === 'playoff' ? 'playoff' : 'regular';
    setForm({
      year: String(item.year ?? ''),
      name: item.name ?? '',
      startDate: item.startDate ?? '',
      endDate: item.endDate ?? '',
      isActive: item.isActive ?? false,
      seasonKind: sk,
      parentSeasonId: item.parentSeasonId != null ? String(item.parentSeasonId) : '',
      hasPlayoffs: item.hasPlayoffs ?? true,
      regularSeasonGamesPerTeam: item.regularSeasonGamesPerTeam != null ? String(item.regularSeasonGamesPerTeam) : '',
      playoffSeeds: String(item.playoffSettings?.seeds ?? 4),
      playoffBestOf: String(item.playoffSettings?.bestOf ?? 1),
    });
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const yearNum = parseInt(form.year, 10);
    if (!Number.isFinite(yearNum) || yearNum < 1800 || yearNum > 2300) {
      alert('Enter a valid year (1800–2300).');
      return;
    }
    setSaving(true);
    try {
      const base = {
        year: yearNum,
        name: form.name,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        isActive: form.isActive,
        seasonKind: form.seasonKind,
      };
      const payload =
        form.seasonKind === 'playoff'
          ? {
              ...base,
              parentSeasonId: form.parentSeasonId.trim() ? parseInt(form.parentSeasonId, 10) : null,
              hasPlayoffs: form.hasPlayoffs,
              regularSeasonGamesPerTeam: form.regularSeasonGamesPerTeam.trim()
                ? parseInt(form.regularSeasonGamesPerTeam, 10)
                : null,
              playoffSettings: {
                seeds: form.playoffSeeds.trim() ? parseInt(form.playoffSeeds, 10) : 4,
                bestOf: form.playoffBestOf.trim() ? parseInt(form.playoffBestOf, 10) : 1,
              },
            }
          : base;

      if (editing) {
        await apiPut(`/admin/seasons/${editing.id}`, payload);
      } else {
        await apiPost('/admin/seasons', payload);
      }
      setShowForm(false);
      await load();
      await reloadSeasons();
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this season?')) return;
    try {
      await apiDelete(`/admin/seasons/${id}`);
      await load();
      await reloadSeasons();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  const regularSeasonOptions = items.filter((s) => {
    if (editing && s.id === editing.id) return false;
    return (s.seasonKind ?? 'regular') === 'regular';
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">Seasons</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Create New
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Year</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Type</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Start Date</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">End Date</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Active</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={7}>
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={7}>
                  No data yet. Create your first entry.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50">
                  <td className="px-4 py-3">{item.year}</td>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {item.seasonKind === 'playoff' ? 'Playoff' : 'Regular'}
                  </td>
                  <td className="px-4 py-3">{item.startDate ?? '—'}</td>
                  <td className="px-4 py-3">{item.endDate ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.isActive ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'
                      }`}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 rounded-lg transition-colors"
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
              {editing ? 'Edit Season' : 'Create Season'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Season type</label>
                <select
                  value={form.seasonKind}
                  onChange={(e) => setForm({ ...form, seasonKind: e.target.value as SeasonKind })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="regular">Regular season (full league)</option>
                  <option value="playoff">Playoff — separate campaign (add manually)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Year</label>
                <input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                />
              </div>
              {form.seasonKind === 'playoff' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Continues (optional)</label>
                  <select
                    value={form.parentSeasonId}
                    onChange={(e) => setForm({ ...form, parentSeasonId: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  >
                    <option value="">— None —</option>
                    {regularSeasonOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.year} ({s.name})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1.5">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                />
                <label htmlFor="isActive" className="text-sm font-medium">
                  Active (workspace default)
                </label>
              </div>

              {form.seasonKind === 'playoff' && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="hasPlayoffs"
                      checked={form.hasPlayoffs}
                      onChange={(e) => setForm({ ...form, hasPlayoffs: e.target.checked })}
                      className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
                    />
                    <label htmlFor="hasPlayoffs" className="text-sm font-medium">
                      Show bracket / playoff picture on site
                    </label>
                  </div>
                  <div className="rounded-lg border border-border bg-surface-alt p-4 space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5">Regular season games per team (optional)</label>
                      <input
                        type="number"
                        value={form.regularSeasonGamesPerTeam}
                        onChange={(e) => setForm({ ...form, regularSeasonGamesPerTeam: e.target.value })}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        placeholder="e.g. 18"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Default seeds</label>
                        <input
                          type="number"
                          value={form.playoffSeeds}
                          onChange={(e) => setForm({ ...form, playoffSeeds: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1.5">Default best-of</label>
                        <input
                          type="number"
                          value={form.playoffBestOf}
                          onChange={(e) => setForm({ ...form, playoffBestOf: e.target.value })}
                          className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

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
