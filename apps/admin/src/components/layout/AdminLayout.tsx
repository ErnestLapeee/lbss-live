import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useAdminSeason, type AdminSeasonRow } from '@/context/AdminSeasonContext';

const sidebarItems = [
  { label: 'Dashboard', href: '/', icon: '□' },
  { label: 'Seasons', href: '/seasons', icon: '◷' },
  { label: 'Leagues', href: '/leagues', icon: '⊞' },
  { label: 'Season setup', href: '/season-setup', icon: '⊕' },
  { label: 'Teams', href: '/teams', icon: '⚑' },
  { label: 'Players', href: '/players', icon: '⚇' },
  { label: 'Games', href: '/games', icon: '⚾' },
  { label: 'Playoffs', href: '/playoffs', icon: '◇' },
  { label: 'Articles', href: '/articles', icon: '✎' },
  { label: 'Users', href: '/users', icon: '⚙' },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { seasons, selectedSeasonId, setSelectedSeasonId, seasonsLoading } = useAdminSeason();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-text flex flex-col shrink-0">
        <div className="p-4 border-b border-white/10">
          <Link to="/" className="flex items-center gap-3">
            <img src="/lbss-logo.png" alt="LBSS" className="h-9 w-9 object-contain" />
            <div>
              <div className="font-heading font-bold text-white text-sm">LBSS Admin</div>
              <div className="text-xs text-sidebar-text/60">Management Panel</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-text hover:bg-sidebar-active/50 hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-border bg-surface flex items-center justify-between px-6 shrink-0 gap-4">
          <h2 className="font-heading font-semibold text-lg shrink-0">LBSS Administration</h2>
          <div className="flex items-center gap-4 min-w-0 flex-1 justify-end">
            <label className="flex items-center gap-2 text-sm min-w-0 max-w-[min(100%,20rem)]">
              <span className="text-text-muted shrink-0 hidden sm:inline">Workspace season</span>
              <select
                value={selectedSeasonId ?? ''}
                disabled={seasonsLoading || seasons.length === 0}
                onChange={(e) => {
                  const v = e.target.value;
                  setSelectedSeasonId(v ? parseInt(v, 10) : null);
                }}
                className="min-w-0 max-w-full px-2 py-1.5 border border-border rounded-lg bg-surface-alt text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                title="Schedules, rosters, licenses, and game lists use this season"
              >
                {seasons.length === 0 ? (
                  <option value="">No seasons</option>
                ) : (
                  seasons.map((s: AdminSeasonRow) => (
                    <option key={s.id} value={s.id}>
                      {s.year} – {s.name}
                      {s.seasonKind === 'playoff' ? ' (Playoffs)' : ''}
                      {s.isActive ? ' ★' : ''}
                    </option>
                  ))
                )}
              </select>
            </label>
            <span className="text-sm text-text-muted truncate">{user?.displayName || user?.email || 'Admin'}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-accent hover:text-accent-light transition-colors"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
