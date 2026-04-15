import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  games,
  leagueTeams,
  leagues,
  licenses,
  payments,
  playerGameBatting,
  playerGameFielding,
  playerGamePitching,
  playerSeasonBatting,
  playerSeasonFielding,
  playerSeasonPitching,
  playerSeasons,
  seasons,
  standings,
} from '../../db/schema/index.js';
import { desc, eq, inArray, ne } from 'drizzle-orm';
import { seasonWithPlayoffDefaults } from '../../lib/season-playoff-response.js';
import { getSeasonsColumnFlagsCached } from '../../lib/seasons-playoff-columns-cache.js';
import { seasonsRowSelectShape } from '../../lib/seasons-drizzle-select.js';
import { playoffColumnsForSeasonKind, type SeasonKind } from '../../lib/season-kind-playoffs.js';

function normalizeYear(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === 'number' && Number.isFinite(v)
      ? Math.trunc(v)
      : parseInt(String(v).trim(), 10);
  return Number.isFinite(n) && n >= 1800 && n <= 2300 ? n : null;
}

/** Returns null for empty/omitted; rejects invalid non-empty strings via parseDateOrNull. */
function parseDateOrNull(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v == null) return { ok: true, value: null };
  const s = String(v).trim();
  if (!s) return { ok: true, value: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: true, value: s };
  const t = Date.parse(s);
  if (Number.isNaN(t)) return { ok: false };
  return { ok: true, value: new Date(t).toISOString().slice(0, 10) };
}

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code ?? e?.cause?.code;
}

export async function adminSeasonsRoutes(app: FastifyInstance) {
  // GET / - list all seasons
  app.get('/', async (request, reply) => {
    try {
      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const result = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .orderBy(desc(seasons.year));

      return reply.send(
        result.map((s) => {
          const row = s as Record<string, unknown>;
          return {
            ...seasonWithPlayoffDefaults(hasPoCols, row),
            seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
            parentSeasonId: flags.hasSeasonKindOptionals
              ? ((row.parentSeasonId as number | null | undefined) ?? null)
              : null,
          };
        }),
      );
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch seasons' });
    }
  });

  // GET /:id - get season by id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const [season] = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .where(eq(seasons.id, id))
        .limit(1);

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      const row = season as Record<string, unknown>;
      return reply.send({
        ...seasonWithPlayoffDefaults(hasPoCols, row),
        seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
        parentSeasonId: flags.hasSeasonKindOptionals
          ? ((row.parentSeasonId as number | null | undefined) ?? null)
          : null,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch season' });
    }
  });

  // POST / - create season
  app.post<{
    Body: {
      year: number;
      name: string;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      hasPlayoffs?: boolean;
      regularSeasonGamesPerTeam?: number;
      playoffSettings?: unknown;
      /** `playoff` = separate playoff campaign season (e.g. "LBL Playoffs 2025"). */
      seasonKind?: 'regular' | 'playoff';
      /** Regular season this playoff season continues (optional). */
      parentSeasonId?: number | null;
    };
  }>('/', async (request, reply) => {
    try {
      const {
        year, name, startDate, endDate, isActive, hasPlayoffs, regularSeasonGamesPerTeam, playoffSettings,
        seasonKind, parentSeasonId,
      } = request.body ?? {};
      const yearNum = normalizeYear(year);
      const nameTrim = String(name ?? '').trim();
      if (yearNum == null || !nameTrim) {
        return reply
          .status(400)
          .send({ message: 'Valid year (1800–2300) and non-empty name are required' });
      }

      const startParsed = parseDateOrNull(startDate);
      const endParsed = parseDateOrNull(endDate);
      if (!startParsed.ok || !endParsed.ok) {
        return reply.status(400).send({ message: 'Invalid start or end date (use YYYY-MM-DD)' });
      }

      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;
      const kind: SeasonKind = seasonKind === 'playoff' ? 'playoff' : 'regular';

      let parentIdForInsert: number | null = null;
      if (kind === 'playoff') {
        const raw = parentSeasonId as unknown;
        const hasParent =
          raw != null && !(typeof raw === 'string' && !String(raw).trim());
        if (hasParent) {
          const pid =
            typeof raw === 'number' && Number.isFinite(raw)
              ? Math.trunc(raw)
              : parseInt(String(raw).trim(), 10);
          if (!Number.isFinite(pid)) {
            return reply.status(400).send({ message: 'Invalid parent season id' });
          }
          const [parent] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(eq(seasons.id, pid))
            .limit(1);
          if (!parent) {
            return reply.status(400).send({ message: 'Parent season not found' });
          }
          parentIdForInsert = pid;
        }
      }

      const [season] = await db.transaction(async (tx) => {
        if (isActive) {
          await tx.update(seasons).set({ isActive: false });
        }
        const [row] = await tx
          .insert(seasons)
          .values({
            year: yearNum,
            name: nameTrim,
            startDate: startParsed.value,
            endDate: endParsed.value,
            isActive: isActive ?? false,
            ...(flags.hasSeasonKindOptionals
              ? {
                  seasonKind: kind === 'playoff' ? 'playoff' : 'regular',
                  parentSeasonId: kind === 'playoff' ? parentIdForInsert : null,
                }
              : {}),
            ...(hasPoCols ? playoffColumnsForSeasonKind(kind, true, { hasPlayoffs, regularSeasonGamesPerTeam, playoffSettings }) : {}),
          })
          .returning();
        return [row];
      });

      const row = season as Record<string, unknown>;
      return reply.status(201).send({
        ...seasonWithPlayoffDefaults(hasPoCols, row),
        seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
        parentSeasonId: flags.hasSeasonKindOptionals
          ? ((row.parentSeasonId as number | null | undefined) ?? null)
          : null,
      });
    } catch (err) {
      request.log.error(err);
      const code = pgErrorCode(err);
      if (code === '23505') {
        return reply.status(409).send({
          message:
            'Duplicate key (often: a season with this year already exists). Run DB migration 0011 if you need multiple seasons per calendar year.',
        });
      }
      if (code === '23503') {
        return reply.status(400).send({ message: 'Invalid reference (e.g. parent season).' });
      }
      if (code === '23514') {
        return reply.status(400).send({ message: 'Season data violates a database constraint.' });
      }
      return reply.status(500).send({ message: 'Failed to create season' });
    }
  });

  // PUT /:id - update season
  app.put<{
    Params: { id: string };
    Body: {
      year?: number;
      name?: string;
      startDate?: string;
      endDate?: string;
      isActive?: boolean;
      hasPlayoffs?: boolean;
      regularSeasonGamesPerTeam?: number | null;
      playoffSettings?: unknown;
      seasonKind?: 'regular' | 'playoff';
      parentSeasonId?: number | null;
    };
  }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const {
        year, name, startDate, endDate, isActive, hasPlayoffs, regularSeasonGamesPerTeam, playoffSettings,
        seasonKind, parentSeasonId,
      } = request.body ?? {};

      const flags = await getSeasonsColumnFlagsCached();
      const hasPoCols = flags.hasPlayoffOptionals;

      const [existingRow] = await db
        .select({ seasonKind: seasons.seasonKind })
        .from(seasons)
        .where(eq(seasons.id, id))
        .limit(1);
      if (!existingRow) {
        return reply.status(404).send({ message: 'Season not found' });
      }
      const prevKind: SeasonKind =
        String((existingRow as { seasonKind?: string }).seasonKind ?? 'regular') === 'playoff'
          ? 'playoff'
          : 'regular';
      const nextKind: SeasonKind =
        seasonKind !== undefined ? (seasonKind === 'playoff' ? 'playoff' : 'regular') : prevKind;

      let parentIdPut: number | null | undefined = undefined;
      if (flags.hasSeasonKindOptionals && parentSeasonId !== undefined && nextKind === 'playoff') {
        const raw = parentSeasonId as unknown;
        if (raw == null || (typeof raw === 'string' && !String(raw).trim())) {
          parentIdPut = null;
        } else {
          const pid =
            typeof raw === 'number' && Number.isFinite(raw)
              ? Math.trunc(raw)
              : parseInt(String(raw).trim(), 10);
          if (!Number.isFinite(pid)) {
            return reply.status(400).send({ message: 'Invalid parent season id' });
          }
          const [parent] = await db
            .select({ id: seasons.id })
            .from(seasons)
            .where(eq(seasons.id, pid))
            .limit(1);
          if (!parent) {
            return reply.status(400).send({ message: 'Parent season not found' });
          }
          parentIdPut = pid;
        }
      }

      let yearPatch: number | undefined;
      if (year !== undefined) {
        const y = normalizeYear(year);
        if (y == null) {
          return reply.status(400).send({ message: 'Invalid year' });
        }
        yearPatch = y;
      }

      let namePatch: string | undefined;
      if (name !== undefined) {
        const t = String(name).trim();
        if (!t) {
          return reply.status(400).send({ message: 'Name cannot be empty' });
        }
        namePatch = t;
      }

      let startPatch: string | null | undefined;
      if (startDate !== undefined) {
        const p = parseDateOrNull(startDate);
        if (!p.ok) {
          return reply.status(400).send({ message: 'Invalid start date (use YYYY-MM-DD)' });
        }
        startPatch = p.value;
      }

      let endPatch: string | null | undefined;
      if (endDate !== undefined) {
        const p = parseDateOrNull(endDate);
        if (!p.ok) {
          return reply.status(400).send({ message: 'Invalid end date (use YYYY-MM-DD)' });
        }
        endPatch = p.value;
      }

      const [season] = await db.transaction(async (tx) => {
        if (isActive === true) {
          await tx.update(seasons).set({ isActive: false }).where(ne(seasons.id, id));
        }
        const [row] = await tx
          .update(seasons)
          .set({
            ...(yearPatch !== undefined && { year: yearPatch }),
            ...(namePatch !== undefined && { name: namePatch }),
            ...(startPatch !== undefined && { startDate: startPatch }),
            ...(endPatch !== undefined && { endDate: endPatch }),
            ...(isActive !== undefined && { isActive }),
            ...(flags.hasSeasonKindOptionals
              ? {
                  ...(seasonKind !== undefined && {
                    seasonKind: nextKind === 'playoff' ? 'playoff' : 'regular',
                    ...(nextKind === 'regular' ? { parentSeasonId: null } : {}),
                  }),
                  ...(nextKind === 'playoff' && parentSeasonId !== undefined && { parentSeasonId: parentIdPut }),
                }
              : {}),
            ...(hasPoCols
              ? playoffColumnsForSeasonKind(nextKind, true, {
                  hasPlayoffs,
                  regularSeasonGamesPerTeam,
                  playoffSettings,
                })
              : {}),
          })
          .where(eq(seasons.id, id))
          .returning();
        return [row];
      });

      if (!season) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      const row = season as Record<string, unknown>;
      return reply.send({
        ...seasonWithPlayoffDefaults(hasPoCols, row),
        seasonKind: flags.hasSeasonKindOptionals ? String(row.seasonKind ?? 'regular') : 'regular',
        parentSeasonId: flags.hasSeasonKindOptionals
          ? ((row.parentSeasonId as number | null | undefined) ?? null)
          : null,
      });
    } catch (err) {
      request.log.error(err);
      const code = pgErrorCode(err);
      if (code === '23505') {
        return reply.status(409).send({
          message:
            'Duplicate key (often: a season with this year already exists). Run DB migration 0011 if you need multiple seasons per calendar year.',
        });
      }
      if (code === '23503') {
        return reply.status(400).send({ message: 'Invalid reference (e.g. parent season).' });
      }
      if (code === '23514') {
        return reply.status(400).send({ message: 'Season data violates a database constraint.' });
      }
      return reply.status(500).send({ message: 'Failed to update season' });
    }
  });

  // DELETE /:id - delete season
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) {
        return reply.status(400).send({ message: 'Invalid season id' });
      }

      const deleted = await db.transaction(async (tx) => {
        // Find all leagues in this season
        const seasonLeagues = await tx
          .select({ id: leagues.id })
          .from(leagues)
          .where(eq(leagues.seasonId, id));

        for (const league of seasonLeagues) {
          // Delete all games (and their per-game data) for this league
          const leagueGames = await tx
            .select({ id: games.id })
            .from(games)
            .where(eq(games.leagueId, league.id));

          for (const g of leagueGames) {
            await tx.delete(playerGameFielding).where(eq(playerGameFielding.gameId, g.id));
            await tx.delete(playerGamePitching).where(eq(playerGamePitching.gameId, g.id));
            await tx.delete(playerGameBatting).where(eq(playerGameBatting.gameId, g.id));
            await tx.delete(games).where(eq(games.id, g.id));
          }

          // Delete league-team links and standings rows for this league
          await tx.delete(standings).where(eq(standings.leagueId, league.id));
          await tx.delete(leagueTeams).where(eq(leagueTeams.leagueId, league.id));

          // Finally delete the league itself
          await tx.delete(leagues).where(eq(leagues.id, league.id));
        }

        // Delete season-level player stats and roster records
        await tx.delete(playerSeasonBatting).where(eq(playerSeasonBatting.seasonId, id));
        await tx.delete(playerSeasonPitching).where(eq(playerSeasonPitching.seasonId, id));
        await tx.delete(playerSeasonFielding).where(eq(playerSeasonFielding.seasonId, id));
        await tx.delete(playerSeasons).where(eq(playerSeasons.seasonId, id));

        // Delete licenses and related payments for this season
        const seasonLicenses = await tx
          .select({ id: licenses.id })
          .from(licenses)
          .where(eq(licenses.seasonId, id));
        const licenseIds = seasonLicenses.map((l) => l.id);
        if (licenseIds.length > 0) {
          await tx.delete(payments).where(inArray(payments.licenseId, licenseIds));
          await tx.delete(licenses).where(inArray(licenses.id, licenseIds));
        }

        // Finally delete the season record itself
        return tx
          .delete(seasons)
          .where(eq(seasons.id, id))
          .returning({ id: seasons.id });
      });

      if (deleted.length === 0) {
        return reply.status(404).send({ message: 'Season not found' });
      }

      return reply.send({ message: 'Season deleted' });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to delete season' });
    }
  });
}
