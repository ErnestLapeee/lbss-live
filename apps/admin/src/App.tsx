import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminSeasonProvider } from './context/AdminSeasonContext';
import { AdminLayout } from './components/layout/AdminLayout';
import { RequireAuth } from './components/RequireAuth';
import { Dashboard } from './pages/Dashboard';
import { SeasonsPage } from './pages/seasons/SeasonsPage';
import { LeaguesPage } from './pages/leagues/LeaguesPage';
import { SeasonSetupPage } from './pages/season-setup/SeasonSetupPage';
import { TeamsPage } from './pages/teams/TeamsPage';
import { PlayersPage } from './pages/players/PlayersPage';
import { GamesPage } from './pages/games/GamesPage';
import { PlayoffsPage } from './pages/playoffs/PlayoffsPage';
import { ArticlesPage } from './pages/articles/ArticlesPage';
import { UsersPage } from './pages/users/UsersPage';
import { LoginPage } from './pages/LoginPage';
import { LiveScoringPage } from './pages/scoring/LiveScoringPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {/* Full-screen scoring page (outside admin layout) */}
      <Route
        path="/scoring/:gameId"
        element={
          <RequireAuth>
            <LiveScoringPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AdminSeasonProvider>
              <AdminLayout />
            </AdminSeasonProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="seasons" element={<SeasonsPage />} />
        <Route path="leagues" element={<LeaguesPage />} />
        <Route path="season-setup" element={<SeasonSetupPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="players" element={<PlayersPage />} />
        <Route path="games" element={<GamesPage />} />
        <Route path="playoffs" element={<PlayoffsPage />} />
        <Route path="articles" element={<ArticlesPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
