import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

interface Player {
  id: number;
  firstName: string;
  lastName: string;
  nationality: string | null;
  bats: string | null;
  throws: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bio: string | null;
  isActive: boolean;
}

interface Season {
  id: number;
  name: string;
  year: number;
  isActive: boolean;
}

interface LicenseInfo {
  playerId: number;
  paymentStatus: string;
}

const BATS_OPTIONS = ['R', 'L', 'S'];
const THROWS_OPTIONS = ['R', 'L', 'S'];

export function PlayersPage() {
  const { selectedSeasonId } = useAdminSeason();
  const [players, setPlayers] = useState<Player[]>([]);
  const [licenseMap, setLicenseMap] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Player | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '', nationality: 'LV', dateOfBirth: '',
    bats: '', throws: '', heightCm: '', weightKg: '', bio: '',
  });

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const playersData = await apiGet<Player[]>('/admin/players');
      setPlayers(Array.isArray(playersData) ? playersData : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const loadLicenses = useCallback(async () => {
    if (!selectedSeasonId) { setLicenseMap(new Map()); return; }
    try {
      const data = await apiGet<LicenseInfo[]>(`/admin/licenses?seasonId=${selectedSeasonId}`);
      const map = new Map<number, string>();
      if (Array.isArray(data)) {
        for (const lic of data) {
          map.set(lic.playerId, lic.paymentStatus);
        }
      }
      setLicenseMap(map);
    } catch { /* ignore - licenses endpoint may not have data yet */ }
  }, [selectedSeasonId]);

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    loadLicenses();
  }, [loadLicenses]);

  const openCreate = () => {
    setEditing(null);
    setForm({ firstName: '', lastName: '', nationality: 'LV', dateOfBirth: '', bats: '', throws: '', heightCm: '', weightKg: '', bio: '' });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (p: Player) => {
    setEditing(p);
    setForm({
      firstName: p.firstName, lastName: p.lastName,
      nationality: p.nationality ?? 'LV', dateOfBirth: p.dateOfBirth ?? '',
      bats: p.bats ?? '', throws: p.throws ?? '',
      heightCm: p.heightCm != null ? String(p.heightCm) : '',
      weightKg: p.weightKg != null ? String(p.weightKg) : '',
      bio: p.bio ?? '',
    });
    setShowForm(true);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        firstName: form.firstName.trim(), lastName: form.lastName.trim(),
        nationality: form.nationality.trim() || 'LV',
        dateOfBirth: form.dateOfBirth || undefined,
        bats: form.bats || undefined, throws: form.throws || undefined,
        heightCm: form.heightCm ? parseInt(form.heightCm, 10) : undefined,
        weightKg: form.weightKg ? parseInt(form.weightKg, 10) : undefined,
        bio: form.bio.trim() || undefined,
      };
      if (editing) {
        await apiPut(`/admin/players/${editing.id}`, payload);
      } else {
        await apiPost('/admin/players', payload);
      }
      setShowForm(false);
      loadPlayers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Player) => {
    if (!confirm(`Deactivate ${p.firstName} ${p.lastName}?`)) return;
    try {
      await apiDelete(`/admin/players/${p.id}`);
      loadPlayers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    }
  };

  const filtered = players.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return `${p.firstName} ${p.lastName}`.toLowerCase().includes(q);
  });

  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="font-heading text-2xl font-bold">Player Directory</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors">
          + Create Player
        </button>
      </div>

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
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
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Name</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Nationality</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">B/T</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">DOB</th>
              <th className="px-4 py-3 text-center font-semibold text-text-muted">License</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Active</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-center text-text-muted" colSpan={7}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-8 text-center text-text-muted" colSpan={7}>
                {search ? 'No players match your search.' : 'No players yet. Create your first player.'}
              </td></tr>
            ) : (
              filtered.map(p => {
                const licStatus = licenseMap.get(p.id);
                return (
                  <tr key={p.id} className="border-b border-border hover:bg-surface-alt/50">
                    <td className="px-4 py-3 font-medium">{p.firstName} {p.lastName}</td>
                    <td className="px-4 py-3 text-text-muted">{p.nationality ?? '—'}</td>
                    <td className="px-4 py-3 text-text-muted">{[p.bats, p.throws].filter(Boolean).join('/') || '—'}</td>
                    <td className="px-4 py-3 text-text-muted">{p.dateOfBirth ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {!selectedSeasonId ? (
                        <span className="text-xs text-text-muted">—</span>
                      ) : licStatus === 'paid' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-600">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Paid
                        </span>
                      ) : licStatus ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          Unpaid
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">No license</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${p.isActive ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'}`}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(p)} className="text-accent hover:text-accent-light text-sm font-medium">Edit</button>
                        <button onClick={() => handleDelete(p)} className="text-red-500 hover:text-red-400 text-sm font-medium">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── player form modal ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowForm(false)}>
          <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-heading text-xl font-bold mb-4">{editing ? 'Edit Player' : 'Create Player'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">First Name *</label>
                  <input type="text" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} className={inputClass} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">Last Name *</label>
                  <input type="text" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} className={inputClass} required />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">Nationality</label>
                  <input type="text" value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">Bats</label>
                  <select value={form.bats} onChange={e => setForm(f => ({ ...f, bats: e.target.value }))} className={inputClass}>
                    <option value="">—</option>
                    {BATS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">Throws</label>
                  <select value={form.throws} onChange={e => setForm(f => ({ ...f, throws: e.target.value }))} className={inputClass}>
                    <option value="">—</option>
                    {THROWS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Date of Birth</label>
                <input type="date" value={form.dateOfBirth} onChange={e => setForm(f => ({ ...f, dateOfBirth: e.target.value }))} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">Height (cm)</label>
                  <input type="number" value={form.heightCm} onChange={e => setForm(f => ({ ...f, heightCm: e.target.value }))} className={inputClass} min={1} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">Weight (kg)</label>
                  <input type="number" value={form.weightKg} onChange={e => setForm(f => ({ ...f, weightKg: e.target.value }))} className={inputClass} min={1} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Bio</label>
                <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} className={inputClass} rows={3} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50">
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
