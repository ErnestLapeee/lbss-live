import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { games, leagues, playoffs, playoffSeries, seasons, standings, teams } from '../../db/schema/index.js';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';

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

function toNum(v: any): number {
  const n = typeof v === 'number' ? v : v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sortSeeds(rows: any[]): SeedRow[] {
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
    wins: r.wins ?? 0,
    losses: r.losses ?? 0,
    ties: r.ties ?? 0,
    gamesPlayed: r.gamesPlayed ?? 0,
    winPct: toNum(r.winPct),
    gamesBehind: toNum(r.gamesBehind),
    runsScored: r.runsScored ?? 0,
    runsAllowed: r.runsAllowed ?? 0,
  }));
}

function buildDefaultBracket(seeds: SeedRow[], bestOfDefault = 1) {
  const n = seeds.length;
  if (n < 2) return { rounds: [] as any[] };

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
  // GET /season/:seasonId - playoff picture + bracket for a season (all leagues)
  app.get<{ Params: { seasonId: string } }>('/season/:seasonId', async (request, reply) => {
    try {
      const seasonId = parseInt(request.params.seasonId, 10);
      if (isNaN(seasonId)) return reply.status(400).send({ message: 'Invalid season id' });

      const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
      if (!season) return reply.status(404).send({ message: 'Season not found' });

      const [poRow] = await db.select().from(playoffs)
        .where(and(eq(playoffs.seasonId, seasonId), eq(playoffs.isActive, true)))
        .orderBy(desc(playoffs.id))
        .limit(1);

      // If no playoffs row exists yet, but the season is marked as having playoffs,
      // synthesize a default "playoff picture" (current seeding + default bracket) from standings.
      const po = poRow ?? (
        (season as any).hasPlayoffs
          ? ({
            id: null,
            name: `${(season as any).name ?? (season as any).year ?? 'Season'} Playoffs`,
            isActive: true,
            config: (season as any).playoffSettings ?? {},
          } as any)
          : null
      );

      if (!po) return reply.send({ seasonId, playoffs: null, leagues: [] });

      const leagueRows = await db.select({ id: leagues.id, name: leagues.name })
        .from(leagues)
        .where(eq(leagues.seasonId, seasonId))
        .orderBy(asc(leagues.id));

      const leaguesOut: any[] = [];
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
        const desiredSeeds = Math.max(2, toNum((po.config as any)?.seeds) || 4);
        const seeds = seedsAll.slice(0, desiredSeeds);

        // Load any manually configured series (rounds)
        const seriesRows = await db.select().from(playoffSeries)
          .where(po.id ? eq(playoffSeries.playoffsId, po.id) : sql`false`)
          .orderBy(playoffSeries.roundNumber, playoffSeries.seriesIndex);

        // If manual series exist, resolve teams from seeds when missing.
        const teamNameById = new Map<number, string>();
        for (const s of seedsAll) teamNameById.set(s.teamId, s.teamName);

        const bracket = seriesRows.length === 0
          ? buildDefaultBracket(seeds, toNum((po.config as any)?.bestOf) || 1)
          : (() => {
            const byRound = new Map<number, any[]>();
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

