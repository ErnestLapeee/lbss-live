import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

interface User {
  id: number;
  email: string;
  displayName: string;
  role: string;
  isActive: boolean;
}

const ROLE_OPTIONS = ['public', 'admin', 'league_official', 'statistician'];

const PASSWORD_HINT =
  'At least 12 characters with uppercase, lowercase, a number, and a symbol (e.g. ! @ #).';

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: '',
    displayName: '',
    role: 'public',
    password: '',
    passwordConfirm: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiGet<User[]>('/admin/users');
      setUsers(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const resetForm = () => {
    setForm({
      email: '',
      displayName: '',
      role: 'public',
      password: '',
      passwordConfirm: '',
    });
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setShowForm(true);
    setError(null);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      email: u.email,
      displayName: u.displayName,
      role: u.role ?? 'public',
      password: '',
      passwordConfirm: '',
    });
    setShowForm(true);
    setError(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    resetForm();
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiPut(`/admin/users/${editing.id}`, {
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          role: form.role,
        });
      } else {
        const pw = form.password.trim();
        if (pw !== form.passwordConfirm.trim()) {
          setError('Passwords do not match.');
          return;
        }
        if (!pw) {
          setError('Password is required for new users.');
          return;
        }
        await apiPost('/admin/users', {
          email: form.email.trim(),
          displayName: form.displayName.trim(),
          role: form.role,
          password: pw,
        });
      }
      closeForm();
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Deactivate ${u.displayName}?`)) return;
    try {
      await apiDelete(`/admin/users/${u.id}`);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-500/20 text-purple-600';
      case 'league_official':
        return 'bg-blue-500/20 text-blue-600';
      case 'statistician':
        return 'bg-amber-500/20 text-amber-600';
      default:
        return 'bg-surface-alt text-text-muted';
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Users</h1>
          <p className="mt-2 text-sm text-text-muted max-w-2xl">
            Administrators can create accounts here and set roles (including scorers). To reset a password later, run
            the API{' '}
            <code className="text-xs bg-surface-alt px-1 rounded">db:set-password</code> script against the database.
            Automation may still use{' '}
            <code className="text-xs bg-surface-alt px-1 rounded">ALLOW_ADMIN_USER_CREATE=true</code> without an admin
            session.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Create user
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
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Display Name</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Email</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Role</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Active</th>
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
            ) : users.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
                  No users loaded.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-border hover:bg-surface-alt/50">
                  <td className="px-4 py-3 font-medium">{u.displayName}</td>
                  <td className="px-4 py-3 text-text-muted">{u.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${roleBadgeClass(u.role)}`}
                    >
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.isActive ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-accent hover:text-accent-light text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
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
              {editing ? 'Edit user' : 'Create user'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  required
                  disabled={!!editing}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Display Name *
                </label>
                <input
                  type="text"
                  value={form.displayName}
                  onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className={inputClass}
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              {!editing && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">
                      Password *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className={inputClass}
                      required
                    />
                    <p className="mt-1 text-xs text-text-muted">{PASSWORD_HINT}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">
                      Confirm password *
                    </label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.passwordConfirm}
                      onChange={(e) => setForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                      className={inputClass}
                      required
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm font-medium text-text-muted hover:text-text transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-accent hover:bg-accent-light text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
