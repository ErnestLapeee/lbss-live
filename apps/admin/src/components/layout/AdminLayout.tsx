import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useAdminSeason, type AdminSeasonRow } from '@/context/AdminSeasonContext';

const sidebarItems = [
  { label: 'Dashboard', href: '/' },
  { label: 'Seasons', href: '/seasons' },
  { label: 'Leagues', href: '/leagues' },
  { label: 'Season setup', href: '/season-setup' },
  { label: 'Teams', href: '/teams' },
  { label: 'Players', href: '/players' },
  { label: 'Games', href: '/games' },
  { label: 'Users', href: '/users' },
];

export function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { seasons, selectedSeasonId, setSelectedSeasonId, seasonsLoading, seasonsError, reloadSeasons } =
    useAdminSeason();
  const [navOpen, setNavOpen] = useState(false);

  const isScorer = user?.role === 'statistician';
  const navItems = isScorer ? sidebarItems.filter((item) => item.href === '/games') : sidebarItems;

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isScorer) return;
    if (location.pathname !== '/games') {
      navigate('/games', { replace: true });
    }
  }, [isScorer, location.pathname, navigate]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[#f5f5f5]">
      {navOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      {/* Sidebar: drawer on small screens, fixed column on lg+ */}
      <aside
        className={`fixed z-40 inset-y-0 left-0 flex w-[min(100vw-2.5rem,18rem)] shrink-0 flex-col border-r border-black/25 bg-sidebar text-sidebar-text transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 ${
          navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 p-3 sm:p-4">
          <Link
            to={isScorer ? '/games' : '/'}
            className="flex min-w-0 flex-1 items-center gap-3"
            onClick={() => setNavOpen(false)}
          >
            <img src="/lbss-logo.png" alt="LBSS" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <div className="font-heading text-sm font-bold text-white">LBSS Admin</div>
            </div>
          </Link>
          <button
            type="button"
            className="rounded-lg p-2 text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setNavOpen(false)}
                className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-text hover:bg-sidebar-active hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 flex-col gap-2 border-b border-border bg-surface px-4 py-2 shadow-sm sm:px-6 lg:h-14 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-0">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="shrink-0 rounded-lg p-2.5 text-text hover:bg-surface-alt lg:hidden"
              aria-label="Open menu"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(true)}
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="min-w-0 truncate font-heading text-base font-semibold sm:text-lg">
              {isScorer ? 'Games' : 'LBSS Administration'}
            </h2>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 lg:flex-nowrap lg:justify-end">
            <label className="flex min-w-0 w-full flex-col gap-1 sm:w-auto sm:max-w-md sm:flex-row sm:items-start sm:gap-2">
              <span className="shrink-0 text-xs font-medium text-text-muted sm:text-sm">Season</span>
              <div className="flex min-w-0 w-full flex-col gap-1.5 sm:max-w-[20rem]">
                <div className="flex min-w-0 flex-wrap items-stretch gap-2">
                  <select
                    value={selectedSeasonId ?? ''}
                    disabled={seasonsLoading}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedSeasonId(v ? parseInt(v, 10) : null);
                    }}
                    className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent sm:min-w-[12rem]"
                  >
                    {seasons.length === 0 ? (
                      <option value="">{seasonsError ? 'Seasons could not be loaded' : 'No seasons yet'}</option>
                    ) : (
                      seasons.map((s: AdminSeasonRow) => (
                        <option key={s.id} value={s.id}>
                          {s.year} – {s.name}
                          {s.seasonKind === 'playoff' ? ' (Playoffs)' : ''}
                          {s.isActive ? ' (active)' : ''}
                        </option>
                      ))
                    )}
                  </select>
                  {seasonsError && (
                    <button
                      type="button"
                      disabled={seasonsLoading}
                      onClick={() => void reloadSeasons()}
                      className="min-h-[44px] shrink-0 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-surface-alt disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                </div>
                {seasonsError && (
                  <p className="text-xs leading-snug text-red-600">{seasonsError}</p>
                )}
              </div>
            </label>
            <span className="hidden max-w-[10rem] truncate text-sm text-text-muted sm:inline md:max-w-[14rem]">
              {user?.displayName || user?.email || 'Admin'}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] shrink-0 rounded-lg px-3 text-sm font-semibold text-accent hover:bg-accent/5 hover:text-accent-light"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
