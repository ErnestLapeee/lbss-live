import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiGet } from '@/lib/api';
import { useAdminSeason } from '@/context/AdminSeasonContext';
import { useAuth } from '@/lib/auth';
import { formatShortDateTime } from '@/lib/localeDisplay';

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

interface DashGame {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  scheduledAt: string;
  status: string;
  homeScore: number;
  awayScore: number;
}

interface DashTeam {
  id: number;
  name: string;
}

export function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { selectedSeasonId, seasonsLoading } = useAdminSeason();
  const [stats, setStats] = useState<DashboardStats>({ seasons: 0, teams: 0, players: 0, games: 0 });
  const [seasonGames, setSeasonGames] = useState<DashGame[]>([]);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
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
            setSeasonGames([]);
            setTeamNames({});
          }
          return;
        }

        const [gamesRes, rostersRes, teamsRes] = await Promise.all([
          apiGet<DashGame[]>(`/admin/games?seasonId=${selectedSeasonId}`).catch(() => []),
          apiGet<any[]>(`/admin/teams/rosters?seasonId=${selectedSeasonId}`).catch(() => []),
          apiGet<DashTeam[]>(`/admin/teams?seasonId=${selectedSeasonId}`).catch(() => []),
        ]);

        const games = Array.isArray(gamesRes) ? gamesRes : [];
        const rosters = Array.isArray(rostersRes) ? rostersRes : [];

        const rosteredIds = new Set<number>();
        for (const t of rosters) {
          for (const p of t.players ?? []) {
            rosteredIds.add(p.playerId);
          }
        }

        const names: Record<number, string> = {};
        for (const team of Array.isArray(teamsRes) ? teamsRes : []) {
          names[team.id] = team.name;
        }

        if (!cancelled) {
          setStats({
            seasons: totalSeasons,
            teams: rosters.length,
            players: rosteredIds.size,
            games: games.length,
          });
          setSeasonGames(games as DashGame[]);
          setTeamNames(names);
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

  const cards = [
    { label: 'Seasons (total)', value: stats.seasons },
    { label: 'Teams (workspace)', value: stats.teams },
    { label: 'Players rostered (workspace)', value: stats.players },
    { label: 'Games (workspace)', value: stats.games },
  ];

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-6">Dashboard</h1>
      <SeasonGames games={seasonGames} teamNames={teamNames} loading={loading || seasonsLoading} />
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
            <p className="mt-4 text-sm text-text-muted">
              Replacing the database from a file is on the{' '}
              <Link to="/users" className="font-medium text-text-muted underline hover:text-text">
                Users
              </Link>{' '}
              page.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Full backup is available to admin accounts only.</p>
      )}
    </div>
  );
}

function SeasonGames({ games, teamNames, loading }: { games: DashGame[]; teamNames: Record<number, string>; loading: boolean }) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const live = games.filter((game) => game.status === 'live' || game.status === 'warmup');
  const upcoming = games
    .filter((game) => {
      if (game.status !== 'scheduled' && game.status !== 'suspended' && game.status !== 'postponed') return false;
      return new Date(game.scheduledAt).getTime() >= startOfToday.getTime();
    })
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const active = [...live, ...upcoming.filter((game) => !live.some((item) => item.id === game.id))];
  const recent = [...games].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()).slice(0, 6);
  const rows = active.length > 0 ? active.slice(0, 8) : recent;
  const showingRecent = active.length === 0 && rows.length > 0;
  const team = (id: number) => teamNames[id] || `Team #${id}`;

  return (
    <div className="mb-8 bg-surface rounded-xl border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="font-heading text-lg font-semibold">{showingRecent ? 'Recent games' : 'Games'}</h2>
        <Link to="/games" className="text-sm font-semibold text-accent hover:text-accent-light">All games</Link>
      </div>
      {loading ? (
        <p className="px-5 py-6 text-sm text-text-muted">Loading games…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-text-muted">No live or upcoming games in this season.</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((game) => (
            <li key={game.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {team(game.awayTeamId)} <span className="text-text-muted">at</span> {team(game.homeTeamId)}
                </div>
                <div className="mt-0.5 text-sm text-text-muted">
                  {formatShortDateTime(game.scheduledAt)}
                  <span className="mx-2">·</span>
                  <span className="capitalize">{game.status}</span>
                  {(showingRecent || game.status === 'live' || game.status === 'final' || game.status === 'warmup') && (
                    <span className="ml-2 tabular-nums">{game.awayScore}–{game.homeScore}</span>
                  )}
                </div>
              </div>
              <Link
                to={`/scoring/${game.id}`}
                className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500"
              >
                {game.status === 'final' ? 'Edit score' : 'Score'}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
