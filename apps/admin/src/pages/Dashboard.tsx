import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

interface DashboardStats {
  seasons: number;
  teams: number;
  players: number;
  games: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({ seasons: 0, teams: 0, players: 0, games: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [seasonsRes, teamsRes, playersRes, gamesRes] = await Promise.all([
          apiGet<any[]>('/admin/seasons').catch(() => []),
          apiGet<any[]>('/admin/teams').catch(() => []),
          apiGet<any[]>('/admin/players').catch(() => []),
          apiGet<any[]>('/admin/games').catch(() => []),
        ]);
        setStats({
          seasons: Array.isArray(seasonsRes) ? seasonsRes.length : 0,
          teams: Array.isArray(teamsRes) ? teamsRes.length : 0,
          players: Array.isArray(playersRes) ? playersRes.length : 0,
          games: Array.isArray(gamesRes) ? gamesRes.length : 0,
        });
      } catch {
        // ignore errors, show 0
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const cards = [
    { label: 'Seasons', value: stats.seasons },
    { label: 'Teams', value: stats.teams },
    { label: 'Registered Players', value: stats.players },
    { label: 'Games', value: stats.games },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-surface rounded-xl border border-border p-5">
            <div className="text-sm text-text-muted">{card.label}</div>
            <div className="mt-1 font-heading text-3xl font-bold">
              {loading ? '...' : card.value}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-surface rounded-xl border border-border p-6">
        <h2 className="font-heading text-lg font-semibold mb-4">Quick Start</h2>
        <p className="text-text-muted text-sm">
          Use the sidebar to create seasons, leagues, teams, and players. Add games to the schedule and manage your federation data.
        </p>
      </div>
    </div>
  );
}
