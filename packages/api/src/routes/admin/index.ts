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

export async function adminRoutes(app: FastifyInstance) {
  // Auth routes don't need the auth hook
  await app.register(authRoutes, { prefix: '/auth' });

  // All other admin routes require auth
  app.addHook('onRequest', requireAuth);

  await app.register(adminSeasonsRoutes, { prefix: '/seasons' });
  await app.register(adminLeaguesRoutes, { prefix: '/leagues' });
  await app.register(adminTeamsRoutes, { prefix: '/teams' });
  await app.register(adminPlayersRoutes, { prefix: '/players' });
  await app.register(adminGamesRoutes, { prefix: '/games' });
  await app.register(adminArticlesRoutes, { prefix: '/articles' });
  await app.register(adminUsersRoutes, { prefix: '/users' });
  await app.register(adminScoringRoutes, { prefix: '/scoring' });
}
