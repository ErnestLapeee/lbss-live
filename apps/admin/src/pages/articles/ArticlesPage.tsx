import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';

interface Article {
  id: number;
  title: string;
  content: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Article | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    content: '',
    excerpt: '',
    coverImageUrl: '',
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await apiGet<Article[]>('/admin/articles');
      setArticles(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load articles');
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
      title: '',
      content: '',
      excerpt: '',
      coverImageUrl: '',
    });
    setShowForm(true);
    setError(null);
  };

  const openEdit = (a: Article) => {
    setEditing(a);
    setForm({
      title: a.title,
      content: a.content,
      excerpt: a.excerpt ?? '',
      coverImageUrl: a.coverImageUrl ?? '',
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
        title: form.title.trim(),
        content: form.content.trim(),
        excerpt: form.excerpt.trim() || undefined,
        coverImageUrl: form.coverImageUrl.trim() || undefined,
      };
      if (editing) {
        await apiPut(`/admin/articles/${editing.id}`, payload);
      } else {
        await apiPost('/admin/articles', payload);
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (a: Article) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try {
      await apiDelete(`/admin/articles/${a.id}`);
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handlePublish = async (a: Article) => {
    if (a.isPublished) return;
    try {
      await apiPost(`/admin/articles/${a.id}/publish`, {});
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to publish');
    }
  };

  const inputClass =
    'w-full px-3 py-2 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">Articles</h1>
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
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Title</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Published</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Date</th>
              <th className="px-4 py-3 text-left font-semibold text-text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={4}>
                  Loading...
                </td>
              </tr>
            ) : articles.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={4}>
                  No data yet. Create your first entry.
                </td>
              </tr>
            ) : (
              articles.map((a) => (
                <tr key={a.id} className="border-b border-border hover:bg-surface-alt/50">
                  <td className="px-4 py-3 font-medium max-w-xs truncate">{a.title}</td>
                  <td className="px-4 py-3">
                    {a.isPublished ? (
                      <span className="text-green-600 text-lg" title="Published">
                        ✓
                      </span>
                    ) : (
                      <span className="text-text-muted" title="Not published">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {formatDate(a.publishedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {!a.isPublished && (
                        <button
                          onClick={() => handlePublish(a)}
                          className="text-green-600 hover:text-green-500 text-sm font-medium"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(a)}
                        className="text-accent hover:text-accent-light text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
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
          <div className="bg-surface rounded-xl border border-border shadow-2xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading text-xl font-bold mb-4">
              {editing ? 'Edit Article' : 'Create Article'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Content *</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className={inputClass}
                  rows={12}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">Excerpt</label>
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                  className={inputClass}
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">
                  Cover Image URL
                </label>
                <input
                  type="text"
                  value={form.coverImageUrl}
                  onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                  className={inputClass}
                  placeholder="https://..."
                />
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
