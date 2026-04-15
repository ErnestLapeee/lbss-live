import { useState, useEffect, useMemo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function LeaguesPage() {
  const { seasons, selectedSeasonId } = useAdminSeason();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    slug: '',
    seasonId: '',
    sport: 'baseball',
    level: 'senior',
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const leaguesData = await apiGet<any[]>('/admin/leagues');
      setItems(Array.isArray(leaguesData) ? leaguesData : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const seasonMap = useMemo(() => Object.fromEntries(seasons.map((s) => [s.id, s])), [seasons]);

  const filteredItems = useMemo(() => {
    if (!selectedSeasonId) return items;
    return items.filter((i) => i.seasonId === selectedSeasonId);
  }, [items, selectedSeasonId]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: '',
      slug: '',
      seasonId: seasons.length > 0 ? String(seasons[0].id) : '',
      sport: 'baseball',
      level: 'senior',
    });
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setEditing(item);
    setForm({
      name: item.name ?? '',
      slug: item.slug ?? '',
      seasonId: String(item.seasonId ?? ''),
      sport: item.sport ?? 'baseball',
      level: item.level ?? 'senior',
    });
    setShowForm(true);
  };

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      name,
      slug: editing ? prev.slug : slugify(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        seasonId: parseInt(form.seasonId, 10),
        sport: form.sport,
        level: form.level,
      };
      if (editing) {
        await apiPut(`/admin/leagues/${editing.id}`, payload);
      } else {
        await apiPost('/admin/leagues', payload);
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this league?')) return;
    try {
      await apiDelete(`/admin/leagues/${id}`);
      await load();
    } catch (err: any) {
      alert(err.message || 'Failed to delete');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold">Leagues</h1>
          <p className="text-sm text-text-muted mt-1">
            {selectedSeasonId
              ? `Showing leagues for the workspace season (${seasonMap[selectedSeasonId]?.year ?? '?'}). Switch season in the top bar to see others.`
              : 'Choose a workspace season in the top bar to filter this list.'}
          </p>
        </div>
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
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Season Year</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Sport</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Level</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
                  Loading...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
                  {items.length === 0
                    ? 'No data yet. Create your first entry.'
                    : 'No leagues for the selected workspace season. Switch season in the top bar or create a league.'}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-alt/50">
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3">{seasonMap[item.seasonId]?.year ?? '—'}</td>
                  <td className="px-4 py-3 capitalize">{item.sport ?? '—'}</td>
                  <td className="px-4 py-3 capitalize">{item.level ?? '—'}</td>
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
          <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-lg mx-4 p-6">
            <h2 className="font-heading text-xl font-bold mb-4">
              {editing ? 'Edit League' : 'Create League'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Season</label>
                <select
                  value={form.seasonId}
                  onChange={(e) => setForm({ ...form, seasonId: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                >
                  <option value="">Select season</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.year} – {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="Auto-generated from name"
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Sport</label>
                <select
                  value={form.sport}
                  onChange={(e) => setForm({ ...form, sport: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="baseball">Baseball</option>
                  <option value="softball">Softball</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Level</label>
                <select
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                >
                  <option value="senior">Senior</option>
                  <option value="youth">Youth</option>
                  <option value="amateur">Amateur</option>
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
