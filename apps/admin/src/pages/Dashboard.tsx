import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';

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
  const { selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [stats, setStats] = useState<DashboardStats>({ seasons: 0, teams: 0, players: 0, games: 0 });
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);

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
      if (!res.ok) throw new Error('Failed to export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lbss-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Backup failed');
    } finally {
      setBackupLoading(false);
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
      <h1 className="font-heading text-2xl font-bold mb-2">Dashboard</h1>
      <p className="text-sm text-text-muted mb-6">
        Teams, rostered players, and games reflect the workspace season in the top bar. Seasons counts all seasons.
      </p>
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
      <div className="bg-surface rounded-xl border border-border p-6 mb-4">
        <h2 className="font-heading text-lg font-semibold mb-4">Quick Start</h2>
        <p className="text-text-muted text-sm">
          Use the sidebar to create seasons, leagues, teams, and players. Pick the active year in the workspace menu, then add games to the schedule and manage your federation data.
        </p>
      </div>
      <div className="bg-surface rounded-xl border border-border p-6">
        <h2 className="font-heading text-lg font-semibold mb-2">Data Backup</h2>
        <p className="text-text-muted text-sm mb-3">
          Download a full JSON backup of all database tables. Railway also provides automatic point-in-time database recovery.
        </p>
        <button
          type="button"
          onClick={handleBackup}
          disabled={backupLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded"
        >
          {backupLoading ? 'Exporting...' : 'Download Backup'}
        </button>
      </div>
    </div>
  );
}
