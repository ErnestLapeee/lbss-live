import { useState } from 'react';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const RESTORE_CONFIRM = 'LBSS_REPLACE_ALL_DATA';

export function RestoreBackup() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [phrase, setPhrase] = useState('');
  const [busy, setBusy] = useState(false);

  if (user?.role !== 'admin') return null;

  const handleRestore = async () => {
    if (!file) {
      alert('Choose a backup .json file first.');
      return;
    }
    if (phrase.trim() !== RESTORE_CONFIRM) {
      alert(`Type exactly: ${RESTORE_CONFIRM}`);
      return;
    }
    if (
      !window.confirm(
        'This will erase ALL current data in this database and replace it with the backup file. Everyone will be logged out. Continue?',
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      await apiPost<{ ok?: boolean; message?: string }>('/admin/backup/import', {
        confirm: RESTORE_CONFIRM,
        backup,
      });
      alert('Restore finished. You need to sign in again.');
      window.location.assign('/login');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 border-t border-border pt-6">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-text-muted hover:text-text"
      >
        {open ? 'Hide database restore' : 'Restore database from a backup file'}
      </button>
      {open && (
        <div className="mt-4 max-w-xl rounded-xl border border-border bg-surface p-4">
          <p className="mb-4 text-sm text-text-muted">
            Replaces the entire database with a file from Download backup. Every session is signed out.
          </p>
          <div className="flex flex-col gap-3">
            <label className="block text-sm font-medium text-text">
              Backup file (.json)
              <input
                type="file"
                accept="application/json,.json"
                className="mt-1 block w-full text-sm"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block text-sm font-medium text-text">
              Confirmation (type exactly)
              <input
                type="text"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                placeholder={RESTORE_CONFIRM}
                autoComplete="off"
                className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 font-mono text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={busy}
              className="w-fit rounded px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-600 disabled:opacity-50"
            >
              {busy ? 'Restoring…' : 'Restore database from file'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
