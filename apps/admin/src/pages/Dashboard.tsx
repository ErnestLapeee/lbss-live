import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';
import { useAuth } from '@/lib/auth';

const RESTORE_CONFIRM = 'LBSS_REPLACE_ALL_DATA';

function getApiBase(): string {
  const raw = typeof window !== 'undefined' ? (window as any).__LBSS_API_URL__ : undefined;
  return (raw && raw.replace(/\/$/, '')) || '/api';
}

interface DashboardStats {
  seasons: number;
  teams: number;
  players: number;
  games: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [stats, setStats] = useState<DashboardStats>({ seasons: 0, teams: 0, players: 0, games: 0 });
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePhrase, setRestorePhrase] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);

  useEffect(() => {
    if (seasonsLoading) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const seasonsRes = await apiGet<any[]>('/admin/seasons').catch(() => []);
        const totalSeasons = Array.isArray(seasonsRes) ? seasonsRes.length : 0;

        if (!selectedSeasonId) {
          if (!cancelled) {
            setStats({ seasons: totalSeasons, teams: 0, players: 0, games: 0 });
          }
          return;
        }

        const [gamesRes, rostersRes] = await Promise.all([
          apiGet<any[]>(`/admin/games?seasonId=${selectedSeasonId}`).catch(() => []),
          apiGet<any[]>(`/admin/teams/rosters?seasonId=${selectedSeasonId}`).catch(() => []),
        ]);

        const games = Array.isArray(gamesRes) ? gamesRes : [];
        const rosters = Array.isArray(rostersRes) ? rostersRes : [];

        const rosteredIds = new Set<number>();
        for (const t of rosters) {
          for (const p of t.players ?? []) {
            rosteredIds.add(p.playerId);
          }
        }

        if (!cancelled) {
          setStats({
            seasons: totalSeasons,
            teams: rosters.length,
            players: rosteredIds.size,
            games: games.length,
          });
        }
      } catch {
        if (!cancelled) setStats({ seasons: 0, teams: 0, players: 0, games: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSeasonId, seasonsLoading]);

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/admin/backup/export`, { credentials: 'include' });
      const buf = await res.arrayBuffer();
      if (!res.ok) {
        let msg = `Export failed (${res.status})`;
        try {
          const j = JSON.parse(new TextDecoder().decode(buf)) as { message?: string };
          if (j?.message) msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = new Blob([buf], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lbss-backup-${new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Backup failed');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      alert('Choose a backup .json file first.');
      return;
    }
    if (restorePhrase.trim() !== RESTORE_CONFIRM) {
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
    setRestoreBusy(true);
    try {
      const text = await restoreFile.text();
      const backup = JSON.parse(text) as unknown;
      await apiPost<{ ok?: boolean; message?: string }>('/admin/backup/import', {
        confirm: RESTORE_CONFIRM,
        backup,
      });
      alert('Restore finished. You need to sign in again.');
      window.location.assign('/login');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setRestoreBusy(false);
    }
  };

  const cards = [
    { label: 'Seasons (total)', value: stats.seasons },
    { label: 'Teams (workspace)', value: stats.teams },
    { label: 'Players rostered (workspace)', value: stats.players },
    { label: 'Games (workspace)', value: stats.games },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-surface rounded-xl border border-border p-5">
            <div className="text-sm text-text-muted">{card.label}</div>
            <div className="mt-1 font-heading text-3xl font-bold">
              {loading || seasonsLoading ? '...' : card.value}
            </div>
          </div>
        ))}
      </div>
      {isAdmin ? (
        <div className="space-y-6">
          <div className="bg-surface rounded-xl border border-border p-6">
            <h2 className="font-heading text-lg font-semibold mb-2">Data backup</h2>
            <p className="text-sm text-text-muted mb-4 max-w-2xl">
              Download a full JSON snapshot (seasons, teams, games, events, users with password hashes). Keep this file
              private. Large databases may take a minute to export.
            </p>
            <button
              type="button"
              onClick={() => void handleBackup()}
              disabled={backupLoading}
              className="rounded px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50"
            >
              {backupLoading ? 'Exporting…' : 'Download backup'}
            </button>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-heading text-lg font-semibold mb-2 text-red-900">Restore from backup</h2>
            <p className="text-sm text-red-900/90 mb-4 max-w-2xl">
              Replaces the entire database with a previously exported file. Use only after accidental deletes or
              disasters. All sessions are cleared.
            </p>
            <div className="flex flex-col gap-3 max-w-xl">
              <label className="block text-sm font-medium text-text">
                Backup file (.json)
                <input
                  type="file"
                  accept="application/json,.json"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="block text-sm font-medium text-text">
                Confirmation (type exactly)
                <input
                  type="text"
                  value={restorePhrase}
                  onChange={(e) => setRestorePhrase(e.target.value)}
                  placeholder={RESTORE_CONFIRM}
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-mono"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleRestore()}
                disabled={restoreBusy}
                className="w-fit rounded px-4 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-600 disabled:opacity-50"
              >
                {restoreBusy ? 'Restoring…' : 'Restore database from file'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Full backup and restore are available to admin accounts only.</p>
      )}
    </div>
  );
}
