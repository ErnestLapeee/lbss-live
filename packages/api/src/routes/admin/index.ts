import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { authRoutes } from './auth.js';
import { adminSeasonsRoutes } from './seasons.js';
import { adminLeaguesRoutes } from './leagues.js';
import { adminTeamsRoutes } from './teams.js';
import { adminPlayersRoutes } from './players.js';
import { adminGamesRoutes } from './games.js';
import { adminArticlesRoutes } from './articles.js';
import { adminUsersRoutes } from './users.js';
import { adminScoringRoutes } from './scoring.js';
import { adminBackupRoutes } from './backup.js';
import { adminPlayoffsRoutes } from './playoffs.js';

export async function adminRoutes(app: FastifyInstance) {
  // Login/logout/me live under /auth without the global hook (registered before addHook).
  await app.register(authRoutes, { prefix: '/auth' });

  app.addHook('onRequest', requireAuth);

  /** Scorers (statistician): read-only on most of admin; may only mutate via /games and /scoring. */
  app.addHook('preHandler', async (request, reply) => {
    const method = request.method;
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;

    const user = request.user;
    if (!user || user.role !== 'statistician') return;

    const path = (request.raw.url ?? '').split('?')[0];
    if (path.includes('/api/admin/auth/')) return;
    if (path.includes('/api/admin/games')) return;
    if (path.includes('/api/admin/scoring')) return;

    return reply.status(403).send({
      message: 'Scorer accounts may only create or update games and use live scoring.',
    });
  });

  await app.register(adminSeasonsRoutes, { prefix: '/seasons' });
  await app.register(adminLeaguesRoutes, { prefix: '/leagues' });
  await app.register(adminTeamsRoutes, { prefix: '/teams' });
  await app.register(adminPlayersRoutes, { prefix: '/players' });
  await app.register(adminGamesRoutes, { prefix: '/games' });
  await app.register(adminPlayoffsRoutes, { prefix: '/playoffs' });
  await app.register(adminArticlesRoutes, { prefix: '/articles' });
  await app.register(adminUsersRoutes, { prefix: '/users' });
  await app.register(adminScoringRoutes, { prefix: '/scoring' });
  await app.register(adminBackupRoutes, { prefix: '/backup' });
}
