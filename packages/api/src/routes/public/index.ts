import type { FastifyInstance } from 'fastify';
import { cacheControlForPublicPath } from '../../lib/public-rate-limit.js';
import { seasonsRoutes } from './seasons.js';
import { leaguesRoutes } from './leagues.js';
import { teamsRoutes } from './teams.js';
import { playersRoutes } from './players.js';
import { gamesRoutes } from './games.js';
import { standingsRoutes } from './standings.js';
import { leaderboardsRoutes } from './leaderboards.js';
import { articlesRoutes } from './articles.js';
import { statsRoutes } from './stats.js';
import { playoffsRoutes } from './playoffs.js';

export async function publicRoutes(app: FastifyInstance) {
  app.addHook('onSend', async (request, reply) => {
    if (request.method !== 'GET' || reply.statusCode >= 400) return;
    const cacheControl = cacheControlForPublicPath(request.url);
    if (cacheControl) reply.header('Cache-Control', cacheControl);
  });

  await app.register(seasonsRoutes, { prefix: '/seasons' });
  await app.register(leaguesRoutes, { prefix: '/leagues' });
  await app.register(teamsRoutes, { prefix: '/teams' });
  await app.register(playersRoutes, { prefix: '/players' });
  await app.register(gamesRoutes, { prefix: '/games' });
  await app.register(standingsRoutes, { prefix: '/standings' });
  await app.register(leaderboardsRoutes, { prefix: '/leaderboards' });
  await app.register(articlesRoutes, { prefix: '/articles' });
  await app.register(statsRoutes, { prefix: '/stats' });
  await app.register(playoffsRoutes, { prefix: '/playoffs' });
}
