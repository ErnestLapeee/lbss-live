import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hash, argon2id } from 'argon2';
import { z } from 'zod';
import { db } from '../../db/index.js';
import {
  seasons,
  leagues,
  teams,
  leagueTeams,
  players,
  playerSeasons,
  games,
  gameEvents,
  gameLineups,
  playerGameBatting,
  playerGamePitching,
  playerGameFielding,
  playerSeasonBatting,
  playerSeasonPitching,
  playerSeasonFielding,
  standings,
  licenses,
  payments,
  articles,
  users,
  playoffs,
  playoffSeries,
} from '../../db/schema/index.js';
import { restoreFullBackup, type BackupPayload } from '../../services/backup-restore.js';

const BACKUP_VERSION = 3;

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

/** Only full admins may export/import full-database JSON (contains password hashes). */
async function requireAdminForBackup(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({
      message: 'Full database backup and restore require an admin account.',
    });
  }
}

const importBodySchema = z.object({
  confirm: z.literal('LBSS_REPLACE_ALL_DATA'),
  backup: z
    .record(z.unknown())
    .refine(
      (v) =>
        v != null &&
        typeof v.version === 'number' &&
        v.data != null &&
        typeof v.data === 'object' &&
        !Array.isArray(v.data),
      { message: 'backup must include numeric version and a data object' },
    ),
});

export async function adminBackupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdminForBackup);

  app.get('/export', async (request, reply) => {
    try {
      const [
        seasonsData,
        leaguesData,
        teamsData,
        leagueTeamsData,
        playersData,
        playerSeasonsData,
        gamesData,
        gameEventsData,
        gameLineupsData,
        playerGameBattingData,
        playerGamePitchingData,
        playerGameFieldingData,
        playerSeasonBattingData,
        playerSeasonPitchingData,
        playerSeasonFieldingData,
        standingsData,
        licensesData,
        paymentsData,
        articlesData,
        usersData,
        playoffsData,
        playoffSeriesData,
      ] = await Promise.all([
        db.select().from(seasons),
        db.select().from(leagues),
        db.select().from(teams),
        db.select().from(leagueTeams),
        db.select().from(players),
        db.select().from(playerSeasons),
        db.select().from(games),
        db.select().from(gameEvents),
        db.select().from(gameLineups),
        db.select().from(playerGameBatting),
        db.select().from(playerGamePitching),
        db.select().from(playerGameFielding),
        db.select().from(playerSeasonBatting),
        db.select().from(playerSeasonPitching),
        db.select().from(playerSeasonFielding),
        db.select().from(standings),
        db.select().from(licenses),
        db.select().from(payments),
        db.select().from(articles),
        db.select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          displayName: users.displayName,
          role: users.role,
          playerId: users.playerId,
          isActive: users.isActive,
          createdAt: users.createdAt,
        }).from(users),
        db.select().from(playoffs),
        db.select().from(playoffSeries),
      ]);

      const backup = {
        exportedAt: new Date().toISOString(),
        version: BACKUP_VERSION,
        data: {
          seasons: seasonsData,
          leagues: leaguesData,
          teams: teamsData,
          leagueTeams: leagueTeamsData,
          players: playersData,
          playerSeasons: playerSeasonsData,
          games: gamesData,
          gameEvents: gameEventsData,
          gameLineups: gameLineupsData,
          playerGameBatting: playerGameBattingData,
          playerGamePitching: playerGamePitchingData,
          playerGameFielding: playerGameFieldingData,
          playerSeasonBatting: playerSeasonBattingData,
          playerSeasonPitching: playerSeasonPitchingData,
          playerSeasonFielding: playerSeasonFieldingData,
          standings: standingsData,
          licenses: licensesData,
          payments: paymentsData,
          articles: articlesData,
          users: usersData,
          playoffs: playoffsData,
          playoffSeries: playoffSeriesData,
        },
      };

      const dateStr = new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z');
      const body = JSON.stringify(backup, jsonReplacer);
      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename=lbss-backup-${dateStr}.json`);
      return reply.send(Buffer.from(body, 'utf8'));
    } catch (err) {
      request.log.error(err);
      const msg = err instanceof Error ? err.message : 'Failed to export backup';
      return reply.status(500).send({ message: msg });
    }
  });

  app.post<{ Body: unknown }>('/import', async (request, reply) => {
    try {
      const parsed = importBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          message: 'Invalid import body. Send JSON: { "confirm": "LBSS_REPLACE_ALL_DATA", "backup": { ... } }',
          details: parsed.error.flatten(),
        });
      }

      const { backup: rawBackup } = parsed.data;
      const payload = rawBackup as unknown as BackupPayload;

      const placeholderPasswordHash = await hash('__LBSS_IMPORT_PASSWORD_RESET_REQUIRED__', {
        type: argon2id,
      });

      const result = await db.transaction(async (tx) => {
        return restoreFullBackup(tx, payload, { placeholderPasswordHash });
      });

      return reply.send({
        ok: true,
        message: 'Database restored from backup. All sessions cleared; log in again.',
        rowCounts: result.rowCounts,
      });
    } catch (err) {
      request.log.error(err);
      const msg = err instanceof Error ? err.message : 'Import failed';
      return reply.status(500).send({ message: msg });
    }
  });
}
