import type { FastifyInstance } from 'fastify';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../../db/index.js';
import { games, leagues, playoffs, playoffSeries, seasons, standings, teams } from '../../db/schema/index.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { seasonWithPlayoffDefaults } from '../../lib/season-playoff-response.js';
import { getSeasonsColumnFlagsCached } from '../../lib/seasons-playoff-columns-cache.js';
import { seasonsRowSelectShape } from '../../lib/seasons-drizzle-select.js';

const seriesGamesHome = alias(teams, 'series_games_home');
const seriesGamesAway = alias(teams, 'series_games_away');

type SeedRow = {
  seed: number;
  teamId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  winPct: number;
  gamesBehind: number;
  runsScored: number;
  runsAllowed: number;
};

/** Row shape from standings + teams join (numeric columns may arrive as string from driver). */
type StandingSeedSource = {
  teamId: number;
  teamName: string;
  wins: unknown;
  losses: unknown;
  ties: unknown;
  gamesPlayed: unknown;
  winPct: unknown;
  gamesBehind: unknown;
  runsScored: unknown;
  runsAllowed: unknown;
};

type BracketSeriesOut = {
  id: number | null;
  label: string;
  bestOf: number;
  higherSeed: number | null;
  lowerSeed: number | null;
  higherTeamId: number | null;
  lowerTeamId: number | null;
  higherTeamName: string;
  lowerTeamName: string;
  wins: { higher: number; lower: number };
  winnerTeamId: number | null;
};

type BracketRoundOut = {
  roundNumber: number;
  name: string;
  series: BracketSeriesOut[];
};

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function playoffConfigOptionalNumber(cfg: unknown, key: string): number {
  if (cfg == null || typeof cfg !== 'object') return 0;
  return toNum((cfg as Record<string, unknown>)[key]);
}

function sortSeeds(rows: StandingSeedSource[]): SeedRow[] {
  const sorted = [...rows].sort((a, b) => {
    const aPct = toNum(a.winPct);
    const bPct = toNum(b.winPct);
    if (bPct !== aPct) return bPct - aPct;

    const aGb = toNum(a.gamesBehind);
    const bGb = toNum(b.gamesBehind);
    if (aGb !== bGb) return aGb - bGb;

    const aDiff = toNum(a.runsScored) - toNum(a.runsAllowed);
    const bDiff = toNum(b.runsScored) - toNum(b.runsAllowed);
    if (bDiff !== aDiff) return bDiff - aDiff;

    return String(a.teamName).localeCompare(String(b.teamName));
  });

  return sorted.map((r, i) => ({
    seed: i + 1,
    teamId: r.teamId,
    teamName: r.teamName,
    wins: toNum(r.wins),
    losses: toNum(r.losses),
    ties: toNum(r.ties),
    gamesPlayed: toNum(r.gamesPlayed),
    winPct: toNum(r.winPct),
    gamesBehind: toNum(r.gamesBehind),
    runsScored: toNum(r.runsScored),
    runsAllowed: toNum(r.runsAllowed),
  }));
}

function buildDefaultBracket(seeds: SeedRow[], bestOfDefault = 1): { rounds: BracketRoundOut[] } {
  const n = seeds.length;
  if (n < 2) return { rounds: [] };

  // Round 1 pairings: 1 vs N, 2 vs N-1, ...
  const round1Pairs: Array<{ higher: SeedRow; lower: SeedRow; idx: number }> = [];
  for (let i = 0; i < Math.floor(n / 2); i++) {
    round1Pairs.push({ higher: seeds[i], lower: seeds[n - 1 - i], idx: i + 1 });
  }

  return {
    rounds: [
      {
        roundNumber: 1,
        name: 'Round 1',
        series: round1Pairs.map(p => ({
          id: null,
          label: `Series ${p.idx}`,
          bestOf: bestOfDefault,
          higherSeed: p.higher.seed,
          lowerSeed: p.lower.seed,
          higherTeamId: p.higher.teamId,
          lowerTeamId: p.lower.teamId,
          higherTeamName: p.higher.teamName,
          lowerTeamName: p.lower.teamName,
          wins: { higher: 0, lower: 0 },
          winnerTeamId: null,
        })),
      },
    ],
  };
}

export async function playoffsRoutes(app: FastifyInstance) {
  // GET /series/:seriesId/games — all games linked to a playoff series (bracket cell → schedule → box score)
  app.get<{ Params: { seriesId: string } }>('/series/:seriesId/games', async (request, reply) => {
    try {
      const seriesId = parseInt(request.params.seriesId, 10);
      if (isNaN(seriesId)) return reply.status(400).send({ message: 'Invalid series id' });
      const rows = await db
        .select({
          id: games.id,
          scheduledAt: games.scheduledAt,
          homeTeamId: games.homeTeamId,
          awayTeamId: games.awayTeamId,
          homeTeamName: seriesGamesHome.name,
          awayTeamName: seriesGamesAway.name,
          homeScore: games.homeScore,
          awayScore: games.awayScore,
          status: games.status,
          playoffSeriesId: games.playoffSeriesId,
        })
        .from(games)
        .leftJoin(seriesGamesHome, eq(games.homeTeamId, seriesGamesHome.id))
        .leftJoin(seriesGamesAway, eq(games.awayTeamId, seriesGamesAway.id))
        .where(eq(games.playoffSeriesId, seriesId))
        .orderBy(asc(games.scheduledAt));
      return reply.send(rows);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch series games' });
    }
  });

  // GET /season/:seasonId - playoff picture + bracket for a season (all leagues)
  app.get<{ Params: { seasonId: string } }>('/season/:seasonId', async (request, reply) => {
    try {
      const seasonId = parseInt(request.params.seasonId, 10);
      if (isNaN(seasonId)) return reply.status(400).send({ message: 'Invalid season id' });

      const flags = await getSeasonsColumnFlagsCached();
      const [seasonRow] = await db
        .select(seasonsRowSelectShape(flags))
        .from(seasons)
        .where(eq(seasons.id, seasonId))
        .limit(1);
      if (!seasonRow) return reply.status(404).send({ message: 'Season not found' });

      const normalized = seasonWithPlayoffDefaults(flags.hasPlayoffOptionals, seasonRow as Record<string, unknown>);
      const seasonYear = (normalized.year as number | undefined) ?? seasonId;
      const seasonName = String((normalized.name as string | undefined) ?? '');
      const hasPlayoffsFlag = Boolean(normalized.hasPlayoffs);
      const playoffSettingsVal =
        normalized.playoffSettings != null && typeof normalized.playoffSettings === 'object'
          ? normalized.playoffSettings
          : {};

      const seasonKindStr = flags.hasSeasonKindOptionals
        ? String((seasonRow as Record<string, unknown>).seasonKind ?? 'regular')
        : 'regular';
      const isDedicatedPlayoffSeason = seasonKindStr === 'playoff';

      const [poRow] = await db.select().from(playoffs)
        .where(and(eq(playoffs.seasonId, seasonId), eq(playoffs.isActive, true)))
        .orderBy(desc(playoffs.id))
        .limit(1);

      // If no playoffs row exists yet, but the season is marked as having playoffs,
      // synthesize a default "playoff picture" (current seeding + default bracket) from standings.
      type PlayoffsContext = {
        id: number | null;
        name: string;
        isActive: boolean;
        config: unknown;
      };

      const po: PlayoffsContext | null = poRow
        ? {
          id: poRow.id,
          name: poRow.name,
          isActive: poRow.isActive ?? true,
          config: poRow.config,
        }
        : hasPlayoffsFlag || isDedicatedPlayoffSeason
          ? {
            id: null,
            name: `${seasonName || String(seasonYear)} Playoffs`,
            isActive: true,
            config: playoffSettingsVal,
          }
          : null;

      if (!po) return reply.send({ seasonId, playoffs: null, leagues: [] });

      const leagueRows = await db.select({ id: leagues.id, name: leagues.name })
        .from(leagues)
        .where(eq(leagues.seasonId, seasonId))
        .orderBy(asc(leagues.id));

      const leaguesOut: Array<{
        leagueId: number;
        leagueName: string;
        seeds: SeedRow[];
        bracket: { rounds: BracketRoundOut[] };
      }> = [];
      for (const lg of leagueRows) {
        // standings rows for seeding
        const st = await db.select({
          teamId: standings.teamId,
          teamName: teams.name,
          wins: standings.wins,
          losses: standings.losses,
          ties: standings.ties,
          gamesPlayed: standings.gamesPlayed,
          winPct: standings.winPct,
          gamesBehind: standings.gamesBehind,
          runsScored: standings.runsScored,
          runsAllowed: standings.runsAllowed,
        }).from(standings)
          .innerJoin(teams, eq(standings.teamId, teams.id))
          .where(eq(standings.leagueId, lg.id))
          .orderBy(desc(standings.winPct));

        const seedsAll = sortSeeds(st);
        const desiredSeeds = Math.max(2, playoffConfigOptionalNumber(po.config, 'seeds') || 4);
        const seeds = seedsAll.slice(0, desiredSeeds);

        // Load any manually configured series (rounds)
        const seriesRows = await db
          .select()
          .from(playoffSeries)
          .where(po.id ? eq(playoffSeries.playoffsId, po.id) : sql`false`)
          .orderBy(asc(playoffSeries.roundNumber), asc(playoffSeries.seriesIndex));

        // If manual series exist, resolve teams from seeds when missing.
        const teamNameById = new Map<number, string>();
        for (const s of seedsAll) teamNameById.set(s.teamId, s.teamName);

        const bracket = seriesRows.length === 0
          ? buildDefaultBracket(seeds, playoffConfigOptionalNumber(po.config, 'bestOf') || 1)
          : (() => {
            const byRound = new Map<number, BracketSeriesOut[]>();
            for (const s of seriesRows) {
              if (!byRound.has(s.roundNumber)) byRound.set(s.roundNumber, []);
              const hiTeamId = s.higherTeamId ?? (s.higherSeed ? seedsAll.find(x => x.seed === s.higherSeed)?.teamId : null) ?? null;
              const loTeamId = s.lowerTeamId ?? (s.lowerSeed ? seedsAll.find(x => x.seed === s.lowerSeed)?.teamId : null) ?? null;
              byRound.get(s.roundNumber)!.push({
                id: s.id,
                label: s.label ?? `Series ${s.seriesIndex}`,
                bestOf: s.bestOf,
                higherSeed: s.higherSeed ?? null,
                lowerSeed: s.lowerSeed ?? null,
                higherTeamId: hiTeamId,
                lowerTeamId: loTeamId,
                higherTeamName: hiTeamId ? (teamNameById.get(hiTeamId) ?? '—') : 'TBD',
                lowerTeamName: loTeamId ? (teamNameById.get(loTeamId) ?? '—') : 'TBD',
                wins: { higher: 0, lower: 0 },
                winnerTeamId: s.winnerTeamId ?? null,
              });
            }
            const rounds = [...byRound.entries()].sort((a, b) => a[0] - b[0]).map(([roundNumber, series]) => ({
              roundNumber,
              name: `Round ${roundNumber}`,
              series,
            }));
            return { rounds };
          })();

        // Compute series win totals from linked games
        const seriesIds = new Set<number>();
        for (const r of bracket.rounds) for (const s of r.series) if (s.id) seriesIds.add(s.id);
        if (seriesIds.size > 0) {
          const gRows = await db.select({
            id: games.id,
            playoffSeriesId: games.playoffSeriesId,
            homeTeamId: games.homeTeamId,
            awayTeamId: games.awayTeamId,
            homeScore: games.homeScore,
            awayScore: games.awayScore,
            status: games.status,
          }).from(games)
            .where(inArray(games.playoffSeriesId, [...seriesIds]))
            .orderBy(desc(games.scheduledAt));

          const winsBySeries = new Map<number, Map<number, number>>();
          for (const g of gRows) {
            if (!g.playoffSeriesId) continue;
            if (g.status !== 'final') continue;
            const winner =
              (g.homeScore ?? 0) > (g.awayScore ?? 0) ? g.homeTeamId :
              (g.awayScore ?? 0) > (g.homeScore ?? 0) ? g.awayTeamId :
              null;
            if (!winner) continue;
            if (!winsBySeries.has(g.playoffSeriesId)) winsBySeries.set(g.playoffSeriesId, new Map());
            const m = winsBySeries.get(g.playoffSeriesId)!;
            m.set(winner, (m.get(winner) ?? 0) + 1);
          }

          for (const r of bracket.rounds) {
            for (const s of r.series) {
              if (!s.id) continue;
              const m = winsBySeries.get(s.id);
              if (!m) continue;
              const hi = s.higherTeamId;
              const lo = s.lowerTeamId;
              s.wins = {
                higher: hi ? (m.get(hi) ?? 0) : 0,
                lower: lo ? (m.get(lo) ?? 0) : 0,
              };
            }
          }
        }

        leaguesOut.push({
          leagueId: lg.id,
          leagueName: lg.name,
          seeds,
          bracket,
        });
      }

      return reply.send({
        seasonId,
        playoffs: { id: po.id ?? null, name: po.name, config: po.config, isActive: po.isActive },
        leagues: leaguesOut,
      });
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch playoffs' });
    }
  });
}

