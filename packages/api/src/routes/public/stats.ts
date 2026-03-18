import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import {
  playerSeasonBatting,
  playerSeasonPitching,
  playerSeasonFielding,
  playerGameFielding,
  players,
  teams,
  seasons,
  gameEvents,
  games,
  leagues,
  gameLineups,
} from '../../db/schema/index.js';
import { eq, desc, asc, and, sql } from 'drizzle-orm';

const ALL_TIME = 'all';

function computeBattingRates(t: {
  atBats: number;
  hits: number; walks: number; hitByPitch: number; sacrificeFlies: number;
  totalBases: number; homeRuns: number; strikeouts: number;
}) {
  const ab = t.atBats ?? 0;
  const h = t.hits ?? 0;
  const bb = t.walks ?? 0;
  const hbp = t.hitByPitch ?? 0;
  const sf = t.sacrificeFlies ?? 0;
  const tb = t.totalBases ?? 0;
  const hr = t.homeRuns ?? 0;
  const so = t.strikeouts ?? 0;
  const obDenom = ab + bb + hbp + sf;
  const babipDenom = ab - so - hr + sf;
  const obp = obDenom > 0 ? (h + bb + hbp) / obDenom : 0;
  const slg = ab > 0 ? tb / ab : 0;
  const rc = ab + bb > 0 ? ((h + bb) * tb) / (ab + bb) : 0;
  const gpa = (1.8 * obp + slg) / 4;
  return {
    battingAvg: ab > 0 ? (h / ab).toFixed(3) : null,
    onBasePct: obDenom > 0 ? obp.toFixed(3) : null,
    sluggingPct: ab > 0 ? slg.toFixed(3) : null,
    babip: babipDenom > 0 ? ((h - hr) / babipDenom).toFixed(3) : null,
    runsCreated: rc > 0 ? rc.toFixed(1) : null,
    gpa: (obp > 0 || slg > 0) ? gpa.toFixed(3) : null,
  };
}

function computePitchingRates(t: {
  inningsPitched: number; earnedRuns: number; hitsAllowed: number; walksAllowed: number;
  strikeouts: number; battersFaced: number; atBats: number; homeRunsAllowed: number;
}) {
  const ip = typeof t.inningsPitched === 'string' ? parseFloat(t.inningsPitched) : (t.inningsPitched ?? 0);
  const er = t.earnedRuns ?? 0;
  const h = t.hitsAllowed ?? 0;
  const bb = t.walksAllowed ?? 0;
  const k = t.strikeouts ?? 0;
  const bf = t.battersFaced ?? 0;
  const ab = t.atBats ?? 0;
  const hr = t.homeRunsAllowed ?? 0;
  const gi = ip > 0 ? 9 : 0;
  return {
    era: ip > 0 ? ((er / ip) * 9).toFixed(2) : null,
    whip: ip > 0 ? ((bb + h) / ip).toFixed(2) : null,
    strikeoutRate: ip > 0 ? (k / ip).toFixed(1) : null,
    walkRate: ip > 0 ? (bb / ip).toFixed(1) : null,
    k9: ip > 0 ? ((k / ip) * 9).toFixed(1) : null,
    bb9: ip > 0 ? ((bb / ip) * 9).toFixed(1) : null,
    h9: ip > 0 ? ((h / ip) * 9).toFixed(1) : null,
    fip: ip > 0 ? (3.1 + (13 * hr + 3 * bb - 2 * k) / ip).toFixed(2) : null,
    babip: ab > 0 ? ((h - hr) / (ab - k - hr)).toFixed(3) : null,
  };
}

export async function statsRoutes(app: FastifyInstance) {
  // GET /batting?seasonId=X or omit for all-time
  app.get<{
    Querystring: { seasonId?: string };
  }>('/batting', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      if (!isAllTime && seasonIdNum) {
        const result = await db
          .select({
            playerId: players.id,
            playerSlug: players.slug,
            firstName: players.firstName,
            lastName: players.lastName,
            teamName: teams.name,
            teamShortName: teams.shortName,
            teamLogoUrl: teams.logoUrl,
            id: playerSeasonBatting.id,
            teamId: playerSeasonBatting.teamId,
            seasonId: playerSeasonBatting.seasonId,
            games: playerSeasonBatting.games,
            plateAppearances: playerSeasonBatting.plateAppearances,
            atBats: playerSeasonBatting.atBats,
            hits: playerSeasonBatting.hits,
            singles: playerSeasonBatting.singles,
            doubles: playerSeasonBatting.doubles,
            triples: playerSeasonBatting.triples,
            homeRuns: playerSeasonBatting.homeRuns,
            rbi: playerSeasonBatting.rbi,
            runs: playerSeasonBatting.runs,
            walks: playerSeasonBatting.walks,
            strikeouts: playerSeasonBatting.strikeouts,
            hitByPitch: playerSeasonBatting.hitByPitch,
            stolenBases: playerSeasonBatting.stolenBases,
            caughtStealing: playerSeasonBatting.caughtStealing,
            sacrificeFlies: playerSeasonBatting.sacrificeFlies,
            sacrificeBunts: playerSeasonBatting.sacrificeBunts,
            groundOuts: playerSeasonBatting.groundOuts,
            flyOuts: playerSeasonBatting.flyOuts,
            groundedIntoDoublePlays: playerSeasonBatting.groundedIntoDoublePlays,
            intentionalWalks: playerSeasonBatting.intentionalWalks,
            reachedOnError: playerSeasonBatting.reachedOnError,
            totalBases: playerSeasonBatting.totalBases,
            buntSingles: playerSeasonBatting.buntSingles,
            strikeoutsLooking: playerSeasonBatting.strikeoutsLooking,
            strikeoutsSwinging: playerSeasonBatting.strikeoutsSwinging,
            pickedOff: playerSeasonBatting.pickedOff,
            fieldersChoice: playerSeasonBatting.fieldersChoice,
            catcherInterference: playerSeasonBatting.catcherInterference,
            groundedIntoTriplePlay: playerSeasonBatting.groundedIntoTriplePlay,
            battingAvg: playerSeasonBatting.battingAvg,
            onBasePct: playerSeasonBatting.onBasePct,
            sluggingPct: playerSeasonBatting.sluggingPct,
            ops: playerSeasonBatting.ops,
            babip: playerSeasonBatting.babip,
          })
          .from(playerSeasonBatting)
          .innerJoin(players, eq(playerSeasonBatting.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
          .where(eq(playerSeasonBatting.seasonId, seasonIdNum))
          .orderBy(desc(playerSeasonBatting.battingAvg));
        const withRcGpa = result.map((row: Record<string, unknown>) => {
          const rates = computeBattingRates({
            atBats: Number(row.atBats ?? 0),
            hits: Number(row.hits ?? 0),
            walks: Number(row.walks ?? 0),
            hitByPitch: Number(row.hitByPitch ?? 0),
            sacrificeFlies: Number(row.sacrificeFlies ?? 0),
            totalBases: Number(row.totalBases ?? 0),
            homeRuns: Number(row.homeRuns ?? 0),
            strikeouts: Number(row.strikeouts ?? 0),
          });
          return { ...row, runsCreated: rates.runsCreated, gpa: rates.gpa };
        });
        return reply.send(withRcGpa);
      }

      const rows = await db.execute(sql`
        WITH totals AS (
          SELECT
            player_id,
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(plate_appearances, 0))::int AS plate_appearances,
            SUM(COALESCE(at_bats, 0))::int AS at_bats,
            SUM(COALESCE(hits, 0))::int AS hits,
            SUM(COALESCE(singles, 0))::int AS singles,
            SUM(COALESCE(doubles, 0))::int AS doubles,
            SUM(COALESCE(triples, 0))::int AS triples,
            SUM(COALESCE(home_runs, 0))::int AS home_runs,
            SUM(COALESCE(rbi, 0))::int AS rbi,
            SUM(COALESCE(runs, 0))::int AS runs,
            SUM(COALESCE(walks, 0))::int AS walks,
            SUM(COALESCE(strikeouts, 0))::int AS strikeouts,
            SUM(COALESCE(hit_by_pitch, 0))::int AS hit_by_pitch,
            SUM(COALESCE(stolen_bases, 0))::int AS stolen_bases,
            SUM(COALESCE(caught_stealing, 0))::int AS caught_stealing,
            SUM(COALESCE(sacrifice_flies, 0))::int AS sacrifice_flies,
            SUM(COALESCE(sacrifice_bunts, 0))::int AS sacrifice_bunts,
            SUM(COALESCE(ground_outs, 0))::int AS ground_outs,
            SUM(COALESCE(fly_outs, 0))::int AS fly_outs,
            SUM(COALESCE(grounded_into_double_plays, 0))::int AS grounded_into_double_plays,
            SUM(COALESCE(intentional_walks, 0))::int AS intentional_walks,
            SUM(COALESCE(reached_on_error, 0))::int AS reached_on_error,
            SUM(COALESCE(total_bases, 0))::int AS total_bases,
            SUM(COALESCE(bunt_singles, 0))::int AS bunt_singles,
            SUM(COALESCE(strikeouts_looking, 0))::int AS strikeouts_looking,
            SUM(COALESCE(strikeouts_swinging, 0))::int AS strikeouts_swinging,
            SUM(COALESCE(picked_off, 0))::int AS picked_off,
            SUM(COALESCE(fielders_choice, 0))::int AS fielders_choice,
            SUM(COALESCE(catcher_interference, 0))::int AS catcher_interference,
            SUM(COALESCE(grounded_into_triple_play, 0))::int AS grounded_into_triple_play
          FROM player_season_batting
          GROUP BY player_id
        ),
        latest AS (
          SELECT DISTINCT ON (player_id) player_id, team_id
          FROM player_season_batting
          ORDER BY player_id, season_id DESC
        )
        SELECT
          p.id AS player_id, p.slug AS player_slug, p.first_name, p.last_name,
          t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url,
          tot.games, tot.plate_appearances, tot.at_bats, tot.hits, tot.singles, tot.doubles,
          tot.triples, tot.home_runs, tot.rbi, tot.runs, tot.walks, tot.strikeouts,
          tot.hit_by_pitch, tot.stolen_bases, tot.caught_stealing, tot.sacrifice_flies,
          tot.sacrifice_bunts, tot.ground_outs, tot.fly_outs, tot.grounded_into_double_plays,
          tot.intentional_walks, tot.reached_on_error, tot.total_bases,
          tot.bunt_singles, tot.strikeouts_looking, tot.strikeouts_swinging,
          tot.picked_off, tot.fielders_choice, tot.catcher_interference, tot.grounded_into_triple_play,
          ls.team_id
        FROM totals tot
        JOIN latest ls ON tot.player_id = ls.player_id
        JOIN players p ON p.id = tot.player_id
        JOIN teams t ON t.id = ls.team_id
        ORDER BY CASE WHEN tot.at_bats > 0 THEN tot.hits::numeric / tot.at_bats ELSE 0 END DESC
      `);

      const raw = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
      const result = Array.isArray(raw) ? raw.map((row: unknown) => {
        const r = (row as Record<string, number | string | null>);
        const rates = computeBattingRates({
          atBats: Number(r.at_bats ?? 0),
          hits: Number(r.hits ?? 0),
          walks: Number(r.walks ?? 0),
          hitByPitch: Number(r.hit_by_pitch ?? 0),
          sacrificeFlies: Number(r.sacrifice_flies ?? 0),
          totalBases: Number(r.total_bases ?? 0),
          homeRuns: Number(r.home_runs ?? 0),
          strikeouts: Number(r.strikeouts ?? 0),
        });
        const obp = rates.onBasePct ? parseFloat(rates.onBasePct) : 0;
        const slg = rates.sluggingPct ? parseFloat(rates.sluggingPct) : 0;
        const ops = (obp + slg).toFixed(3);
        return {
          playerId: r.player_id,
          playerSlug: r.player_slug,
          firstName: r.first_name,
          lastName: r.last_name,
          teamName: r.team_name,
          teamShortName: r.team_short_name,
          teamLogoUrl: r.team_logo_url,
          id: null,
          teamId: r.team_id,
          seasonId: null,
          games: r.games ?? 0,
          plateAppearances: r.plate_appearances ?? 0,
          atBats: r.at_bats ?? 0,
          hits: r.hits ?? 0,
          singles: r.singles ?? 0,
          doubles: r.doubles ?? 0,
          triples: r.triples ?? 0,
          homeRuns: r.home_runs ?? 0,
          rbi: r.rbi ?? 0,
          runs: r.runs ?? 0,
          walks: r.walks ?? 0,
          strikeouts: r.strikeouts ?? 0,
          hitByPitch: r.hit_by_pitch ?? 0,
          stolenBases: r.stolen_bases ?? 0,
          caughtStealing: r.caught_stealing ?? 0,
          sacrificeFlies: r.sacrifice_flies ?? 0,
          sacrificeBunts: r.sacrifice_bunts ?? 0,
          groundOuts: r.ground_outs ?? 0,
          flyOuts: r.fly_outs ?? 0,
          groundedIntoDoublePlays: r.grounded_into_double_plays ?? 0,
          intentionalWalks: r.intentional_walks ?? 0,
          reachedOnError: r.reached_on_error ?? 0,
          totalBases: r.total_bases ?? 0,
          buntSingles: r.bunt_singles ?? 0,
          strikeoutsLooking: r.strikeouts_looking ?? 0,
          strikeoutsSwinging: r.strikeouts_swinging ?? 0,
          pickedOff: r.picked_off ?? 0,
          fieldersChoice: r.fielders_choice ?? 0,
          catcherInterference: r.catcher_interference ?? 0,
          groundedIntoTriplePlay: r.grounded_into_triple_play ?? 0,
          battingAvg: rates.battingAvg,
          onBasePct: rates.onBasePct,
          sluggingPct: rates.sluggingPct,
          ops,
          babip: rates.babip,
          runsCreated: rates.runsCreated,
          gpa: rates.gpa,
        };
      }) : [];
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch batting stats' });
    }
  });

  const INFER_HIT_TYPE_SQL = sql`COALESCE(${gameEvents.hitType}, CASE
    WHEN ${gameEvents.eventType} IN ('ground_out','fielders_choice','bunt_out','bunt_single','sacrifice_bunt','sac_bunt_error') THEN 'grounder'
    WHEN ${gameEvents.eventType} IN ('fly_out','sacrifice_fly','sac_fly_error') THEN 'fly_ball'
    WHEN ${gameEvents.eventType} IN ('line_out') THEN 'line_drive'
    WHEN ${gameEvents.eventType} IN ('pop_out','infield_fly') THEN 'pop_up'
    WHEN ${gameEvents.eventType} IN ('single','error') THEN 'grounder'
    WHEN ${gameEvents.eventType} IN ('double','triple','ground_rule_double') THEN 'line_drive'
    WHEN ${gameEvents.eventType} IN ('home_run','inside_park_hr') THEN 'fly_ball'
    ELSE NULL END)`;
  const INFER_HARDNESS_SQL = sql`COALESCE(${gameEvents.hitHardness}, 'medium')`;

  // GET /batting-contact?seasonId=X or omit for all-time — hit type × hardness from game_events
  app.get<{ Querystring: { seasonId?: string } }>('/batting-contact', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }
      const typeKey = (ht: string | null) => (ht && { grounder: 'gb', line_drive: 'ld', pop_up: 'pu', fly_ball: 'fb' }[ht]) || null;
      const hardKey = (hh: string | null) => (hh && ['soft', 'medium', 'hard'].includes(hh) ? hh : null);

      const battedBallFilter = sql`${gameEvents.eventType} IN (${sql.join(BATTED_BALL_TYPES.map(t => sql`${t}`), sql`, `)})`;

      const rows = await db
        .select({
          batterId: gameEvents.batterId,
          teamId: sql<number>`MIN(${gameLineups.teamId})`.as('teamId'),
          hitType: sql<string>`${INFER_HIT_TYPE_SQL}`.as('inferred_hit_type'),
          hitHardness: sql<string>`${INFER_HARDNESS_SQL}`.as('inferred_hardness'),
          cnt: sql<number>`count(DISTINCT ${gameEvents.id})::int`.as('cnt'),
        })
        .from(gameEvents)
        .innerJoin(games, eq(gameEvents.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(gameLineups, and(eq(gameLineups.gameId, gameEvents.gameId), eq(gameLineups.playerId, gameEvents.batterId)))
        .where(
          and(
            sql`${gameEvents.batterId} IS NOT NULL`,
            sql`${INFER_HIT_TYPE_SQL} IS NOT NULL`,
            eq(gameEvents.isDeleted, false),
            battedBallFilter,
            ...(isAllTime ? [] : [eq(leagues.seasonId, seasonIdNum!)]),
          ),
        )
        .groupBy(gameEvents.batterId, sql`${INFER_HIT_TYPE_SQL}`, sql`${INFER_HARDNESS_SQL}`);

      const byPlayer = new Map<number, { teamId: number; gbSoft: number; gbMedium: number; gbHard: number; ldSoft: number; ldMedium: number; ldHard: number; puSoft: number; puMedium: number; puHard: number; fbSoft: number; fbMedium: number; fbHard: number }>();
      for (const r of rows) {
        const pid = r.batterId!;
        const tk = typeKey(r.hitType);
        const hk = hardKey(r.hitHardness);
        if (!tk || !hk) continue;
        const key = `${tk}_${hk}`;
        const camel = (key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as string).replace('Gb', 'gb').replace('Ld', 'ld').replace('Pu', 'pu').replace('Fb', 'fb');
        let entry = byPlayer.get(pid);
        if (!entry) {
          entry = { teamId: r.teamId, gbSoft: 0, gbMedium: 0, gbHard: 0, ldSoft: 0, ldMedium: 0, ldHard: 0, puSoft: 0, puMedium: 0, puHard: 0, fbSoft: 0, fbMedium: 0, fbHard: 0 };
          byPlayer.set(pid, entry);
        }
        (entry as Record<string, number>)[camel] = ((entry as Record<string, number>)[camel] || 0) + Number(r.cnt);
      }

      if (byPlayer.size === 0) return reply.send([]);

      const playerIds = [...byPlayer.keys()];
      let teamForPlayer = new Map<number, number>();
      if (isAllTime) {
        const latest = await db.execute(sql`
          SELECT DISTINCT ON (player_id) player_id, team_id
          FROM game_lineups gl
          INNER JOIN games g ON g.id = gl.game_id
          ORDER BY player_id, g.id DESC
        `);
        const rows = (latest as { rows?: { player_id: number; team_id: number }[] }).rows ?? (Array.isArray(latest) ? latest : []);
        teamForPlayer = new Map((rows as { player_id: number; team_id: number }[]).map(r => [r.player_id, r.team_id]));
      } else {
        for (const [pid, entry] of byPlayer) teamForPlayer.set(pid, entry.teamId);
      }

      const playerList = await db.select({
        id: players.id,
        slug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
      }).from(players).where(sql`${players.id} IN (${sql.join(playerIds.map(id => sql`${id}`), sql`, `)})`);
      const teamIds = [...new Set(teamForPlayer.values())];
      const teamList = teamIds.length ? await db.select({ id: teams.id, name: teams.name, shortName: teams.shortName, logoUrl: teams.logoUrl }).from(teams).where(sql`${teams.id} IN (${sql.join(teamIds.map(id => sql`${id}`), sql`, `)})`) : [];
      const teamMap = new Map(teamList.map(t => [t.id, t]));

      const result = playerList.map(p => {
        const contact = byPlayer.get(p.id)!;
        const teamId = teamForPlayer.get(p.id) ?? contact.teamId;
        const team = teamMap.get(teamId);
        const bip = contact.gbSoft + contact.gbMedium + contact.gbHard + contact.ldSoft + contact.ldMedium + contact.ldHard + contact.puSoft + contact.puMedium + contact.puHard + contact.fbSoft + contact.fbMedium + contact.fbHard;
        return {
          playerId: p.id,
          playerSlug: p.slug,
          firstName: p.firstName,
          lastName: p.lastName,
          teamName: team?.name ?? '',
          teamShortName: team?.shortName ?? null,
          teamLogoUrl: team?.logoUrl ?? null,
          ...contact,
          bip,
        };
      });
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch batting contact' });
    }
  });

  // GET /pitching-contact?seasonId=X or omit for all-time — hit type × hardness allowed (from game_events)
  app.get<{ Querystring: { seasonId?: string } }>('/pitching-contact', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }
      const typeKey = (ht: string | null) => (ht && { grounder: 'gb', line_drive: 'ld', pop_up: 'pu', fly_ball: 'fb' }[ht]) || null;
      const hardKey = (hh: string | null) => (hh && ['soft', 'medium', 'hard'].includes(hh) ? hh : null);

      const battedBallFilter = sql`${gameEvents.eventType} IN (${sql.join(BATTED_BALL_TYPES.map(t => sql`${t}`), sql`, `)})`;

      const rows = await db
        .select({
          pitcherId: gameEvents.pitcherId,
          teamId: sql<number>`MIN(${gameLineups.teamId})`.as('teamId'),
          hitType: sql<string>`${INFER_HIT_TYPE_SQL}`.as('inferred_hit_type'),
          hitHardness: sql<string>`${INFER_HARDNESS_SQL}`.as('inferred_hardness'),
          cnt: sql<number>`count(DISTINCT ${gameEvents.id})::int`.as('cnt'),
        })
        .from(gameEvents)
        .innerJoin(games, eq(gameEvents.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(gameLineups, and(eq(gameLineups.gameId, gameEvents.gameId), eq(gameLineups.playerId, gameEvents.pitcherId)))
        .where(
          and(
            sql`${gameEvents.pitcherId} IS NOT NULL`,
            sql`${INFER_HIT_TYPE_SQL} IS NOT NULL`,
            eq(gameEvents.isDeleted, false),
            battedBallFilter,
            ...(isAllTime ? [] : [eq(leagues.seasonId, seasonIdNum!)]),
          ),
        )
        .groupBy(gameEvents.pitcherId, sql`${INFER_HIT_TYPE_SQL}`, sql`${INFER_HARDNESS_SQL}`);

      const byPlayer = new Map<number, { teamId: number; gbSoft: number; gbMedium: number; gbHard: number; ldSoft: number; ldMedium: number; ldHard: number; puSoft: number; puMedium: number; puHard: number; fbSoft: number; fbMedium: number; fbHard: number }>();
      for (const r of rows) {
        const pid = r.pitcherId!;
        const tk = typeKey(r.hitType);
        const hk = hardKey(r.hitHardness);
        if (!tk || !hk) continue;
        const key = `${tk}_${hk}`;
        const camel = (key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()) as string).replace('Gb', 'gb').replace('Ld', 'ld').replace('Pu', 'pu').replace('Fb', 'fb');
        let entry = byPlayer.get(pid);
        if (!entry) {
          entry = { teamId: r.teamId, gbSoft: 0, gbMedium: 0, gbHard: 0, ldSoft: 0, ldMedium: 0, ldHard: 0, puSoft: 0, puMedium: 0, puHard: 0, fbSoft: 0, fbMedium: 0, fbHard: 0 };
          byPlayer.set(pid, entry);
        }
        (entry as Record<string, number>)[camel] = ((entry as Record<string, number>)[camel] || 0) + Number(r.cnt);
      }

      if (byPlayer.size === 0) return reply.send([]);

      const playerIds = [...byPlayer.keys()];
      let teamForPlayer = new Map<number, number>();
      if (isAllTime) {
        const latest = await db.execute(sql`
          SELECT DISTINCT ON (player_id) player_id, team_id
          FROM game_lineups gl
          INNER JOIN games g ON g.id = gl.game_id
          ORDER BY player_id, g.id DESC
        `);
        const rowsLatest = (latest as { rows?: { player_id: number; team_id: number }[] }).rows ?? (Array.isArray(latest) ? latest : []);
        teamForPlayer = new Map((rowsLatest as { player_id: number; team_id: number }[]).map(r => [r.player_id, r.team_id]));
      } else {
        for (const [pid, entry] of byPlayer) teamForPlayer.set(pid, entry.teamId);
      }

      const playerList = await db.select({
        id: players.id,
        slug: players.slug,
        firstName: players.firstName,
        lastName: players.lastName,
      }).from(players).where(sql`${players.id} IN (${sql.join(playerIds.map(id => sql`${id}`), sql`, `)})`);
      const teamIds = [...new Set(teamForPlayer.values())];
      const teamList = teamIds.length ? await db.select({ id: teams.id, name: teams.name, shortName: teams.shortName, logoUrl: teams.logoUrl }).from(teams).where(sql`${teams.id} IN (${sql.join(teamIds.map(id => sql`${id}`), sql`, `)})`) : [];
      const teamMap = new Map(teamList.map(t => [t.id, t]));

      const result = playerList.map(p => {
        const contact = byPlayer.get(p.id)!;
        const teamId = teamForPlayer.get(p.id) ?? contact.teamId;
        const team = teamMap.get(teamId);
        const bip = contact.gbSoft + contact.gbMedium + contact.gbHard + contact.ldSoft + contact.ldMedium + contact.ldHard + contact.puSoft + contact.puMedium + contact.puHard + contact.fbSoft + contact.fbMedium + contact.fbHard;
        return {
          playerId: p.id,
          playerSlug: p.slug,
          firstName: p.firstName,
          lastName: p.lastName,
          teamName: team?.name ?? '',
          teamShortName: team?.shortName ?? null,
          teamLogoUrl: team?.logoUrl ?? null,
          ...contact,
          bip,
        };
      });
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching contact' });
    }
  });

  // GET /leaders?seasonId=X or omit for all-time
  app.get<{
    Querystring: { seasonId?: string };
  }>('/leaders', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const categories = [
        { key: 'battingAvg', label: 'Batting Average', desc: true, getVal: (r: Record<string, unknown>) => r.battingAvg != null ? parseFloat(String(r.battingAvg)) : 0 },
        { key: 'homeRuns', label: 'Home Runs', desc: true, getVal: (r: Record<string, unknown>) => Number(r.homeRuns ?? 0) },
        { key: 'rbi', label: 'RBI', desc: true, getVal: (r: Record<string, unknown>) => Number(r.rbi ?? 0) },
        { key: 'hits', label: 'Hits', desc: true, getVal: (r: Record<string, unknown>) => Number(r.hits ?? 0) },
        { key: 'stolenBases', label: 'Stolen Bases', desc: true, getVal: (r: Record<string, unknown>) => Number(r.stolenBases ?? 0) },
        { key: 'ops', label: 'OPS', desc: true, getVal: (r: Record<string, unknown>) => r.ops != null ? parseFloat(String(r.ops)) : 0 },
        { key: 'runs', label: 'Runs', desc: true, getVal: (r: Record<string, unknown>) => Number(r.runs ?? 0) },
      ];

      if (!isAllTime && seasonIdNum) {
        const baseFields = {
          playerId: players.id,
          playerSlug: players.slug,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
          teamShortName: teams.shortName,
          teamLogoUrl: teams.logoUrl,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const colMap: Record<string, any> = {
          battingAvg: playerSeasonBatting.battingAvg,
          homeRuns: playerSeasonBatting.homeRuns,
          rbi: playerSeasonBatting.rbi,
          hits: playerSeasonBatting.hits,
          stolenBases: playerSeasonBatting.stolenBases,
          ops: playerSeasonBatting.ops,
          runs: playerSeasonBatting.runs,
        };
        const leaders: Record<string, { label: string; players: any[] }> = {};
        for (const cat of categories) {
          const col = colMap[cat.key];
          const rows = await db
            .select({ ...baseFields, value: col })
            .from(playerSeasonBatting)
            .innerJoin(players, eq(playerSeasonBatting.playerId, players.id))
            .innerJoin(teams, eq(playerSeasonBatting.teamId, teams.id))
            .where(eq(playerSeasonBatting.seasonId, seasonIdNum))
            .orderBy(cat.desc ? desc(col) : asc(col))
            .limit(5);
          leaders[cat.key] = { label: cat.label, players: rows };
        }
        return reply.send(leaders);
      }

      const battingRes = await db.execute(sql`
        WITH totals AS (
          SELECT player_id,
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(plate_appearances, 0))::int AS plate_appearances,
            SUM(COALESCE(at_bats, 0))::int AS at_bats,
            SUM(COALESCE(hits, 0))::int AS hits,
            SUM(COALESCE(home_runs, 0))::int AS home_runs,
            SUM(COALESCE(rbi, 0))::int AS rbi,
            SUM(COALESCE(runs, 0))::int AS runs,
            SUM(COALESCE(walks, 0))::int AS walks,
            SUM(COALESCE(strikeouts, 0))::int AS strikeouts,
            SUM(COALESCE(hit_by_pitch, 0))::int AS hit_by_pitch,
            SUM(COALESCE(stolen_bases, 0))::int AS stolen_bases,
            SUM(COALESCE(sacrifice_flies, 0))::int AS sacrifice_flies,
            SUM(COALESCE(total_bases, 0))::int AS total_bases
          FROM player_season_batting GROUP BY player_id
        ),
        latest AS (
          SELECT DISTINCT ON (player_id) player_id, team_id FROM player_season_batting ORDER BY player_id, season_id DESC
        )
        SELECT p.id AS player_id, p.slug AS player_slug, p.first_name, p.last_name,
          t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url,
          tot.at_bats, tot.hits, tot.home_runs, tot.rbi, tot.runs, tot.stolen_bases,
          tot.walks, tot.hit_by_pitch, tot.sacrifice_flies, tot.total_bases, tot.strikeouts
        FROM totals tot
        JOIN latest ls ON tot.player_id = ls.player_id
        JOIN players p ON p.id = tot.player_id
        JOIN teams t ON t.id = ls.team_id
      `);
      const raw = (battingRes as { rows?: Record<string, unknown>[] }).rows ?? battingRes as Record<string, unknown>[];
      const rows = Array.isArray(raw) ? raw : [];
      const withRates = rows.map((r: Record<string, unknown>) => {
        const ab = Number(r.at_bats ?? 0);
        const h = Number(r.hits ?? 0);
        const obDenom = ab + Number(r.walks ?? 0) + Number(r.hit_by_pitch ?? 0) + Number(r.sacrifice_flies ?? 0);
        const obp = obDenom > 0 ? (h + Number(r.walks ?? 0) + Number(r.hit_by_pitch ?? 0)) / obDenom : 0;
        const slg = ab > 0 ? Number(r.total_bases ?? 0) / ab : 0;
        return {
          playerId: r.player_id,
          playerSlug: r.player_slug,
          firstName: r.first_name,
          lastName: r.last_name,
          teamName: r.team_name,
          teamShortName: r.team_short_name,
          teamLogoUrl: r.team_logo_url,
          battingAvg: ab > 0 ? (h / ab).toFixed(3) : null,
          homeRuns: r.home_runs,
          rbi: r.rbi,
          hits: r.hits,
          stolenBases: r.stolen_bases,
          ops: (obp + slg).toFixed(3),
          runs: r.runs,
        };
      });
      const leaders: Record<string, { label: string; players: any[] }> = {};
      for (const cat of categories) {
        const sorted = [...withRates].sort((a, b) => {
          const va = cat.getVal(a);
          const vb = cat.getVal(b);
          return cat.desc ? (vb > va ? 1 : vb < va ? -1 : 0) : (va > vb ? 1 : va < vb ? -1 : 0);
        });
        leaders[cat.key] = {
          label: cat.label,
          players: sorted.slice(0, 5).map(p => ({ ...p, value: cat.getVal(p) })),
        };
      }
      return reply.send(leaders);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch leaders' });
    }
  });

  // GET /pitching?seasonId=X or omit for all-time
  app.get<{
    Querystring: { seasonId?: string };
  }>('/pitching', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      if (!isAllTime && seasonIdNum) {
        const result = await db
          .select({
            playerId: players.id,
            playerSlug: players.slug,
            firstName: players.firstName,
            lastName: players.lastName,
            teamName: teams.name,
            teamShortName: teams.shortName,
            teamLogoUrl: teams.logoUrl,
            id: playerSeasonPitching.id,
            teamId: playerSeasonPitching.teamId,
            seasonId: playerSeasonPitching.seasonId,
            games: playerSeasonPitching.games,
            gamesStarted: playerSeasonPitching.gamesStarted,
            wins: playerSeasonPitching.wins,
            losses: playerSeasonPitching.losses,
            saves: playerSeasonPitching.saves,
            inningsPitched: playerSeasonPitching.inningsPitched,
            hitsAllowed: playerSeasonPitching.hitsAllowed,
            runsAllowed: playerSeasonPitching.runsAllowed,
            earnedRuns: playerSeasonPitching.earnedRuns,
            walksAllowed: playerSeasonPitching.walksAllowed,
            strikeouts: playerSeasonPitching.strikeouts,
            homeRunsAllowed: playerSeasonPitching.homeRunsAllowed,
            hitBatters: playerSeasonPitching.hitBatters,
            wildPitches: playerSeasonPitching.wildPitches,
            battersFaced: playerSeasonPitching.battersFaced,
            balks: playerSeasonPitching.balks,
            intentionalWalks: playerSeasonPitching.intentionalWalks,
            groundOuts: playerSeasonPitching.groundOuts,
            flyOuts: playerSeasonPitching.flyOuts,
            holds: playerSeasonPitching.holds,
            saveOpportunities: playerSeasonPitching.saveOpportunities,
            blownSaves: playerSeasonPitching.blownSaves,
            completeGames: playerSeasonPitching.completeGames,
            gameScore: playerSeasonPitching.gameScore,
            qualityStarts: playerSeasonPitching.qualityStarts,
            shutouts: playerSeasonPitching.shutouts,
            inheritedRunners: playerSeasonPitching.inheritedRunners,
            inheritedRunnersScored: playerSeasonPitching.inheritedRunnersScored,
            strikeoutsLooking: playerSeasonPitching.strikeoutsLooking,
            strikeoutsSwinging: playerSeasonPitching.strikeoutsSwinging,
            era: playerSeasonPitching.era,
            whip: playerSeasonPitching.whip,
            strikeoutRate: playerSeasonPitching.strikeoutRate,
            walkRate: playerSeasonPitching.walkRate,
            fip: playerSeasonPitching.fip,
            k9: playerSeasonPitching.k9,
            bb9: playerSeasonPitching.bb9,
            h9: playerSeasonPitching.h9,
            babip: playerSeasonPitching.babip,
          })
          .from(playerSeasonPitching)
          .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
          .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
          .orderBy(asc(playerSeasonPitching.era));
        const withGoAo = result.map((row: Record<string, unknown>) => {
          const go = Number(row.groundOuts ?? 0);
          const ao = Number(row.flyOuts ?? 0);
          return { ...row, goAo: ao > 0 ? (go / ao).toFixed(2) : null };
        });
        return reply.send(withGoAo);
      }

      const rows = await db.execute(sql`
        WITH totals AS (
          SELECT player_id,
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(games_started, 0))::int AS games_started,
            SUM(COALESCE(wins, 0))::int AS wins,
            SUM(COALESCE(losses, 0))::int AS losses,
            SUM(COALESCE(saves, 0))::int AS saves,
            SUM(COALESCE(innings_pitched, 0)::numeric)::numeric AS innings_pitched,
            SUM(COALESCE(hits_allowed, 0))::int AS hits_allowed,
            SUM(COALESCE(runs_allowed, 0))::int AS runs_allowed,
            SUM(COALESCE(earned_runs, 0))::int AS earned_runs,
            SUM(COALESCE(walks_allowed, 0))::int AS walks_allowed,
            SUM(COALESCE(strikeouts, 0))::int AS strikeouts,
            SUM(COALESCE(home_runs_allowed, 0))::int AS home_runs_allowed,
            SUM(COALESCE(hit_batters, 0))::int AS hit_batters,
            SUM(COALESCE(wild_pitches, 0))::int AS wild_pitches,
            SUM(COALESCE(batters_faced, 0))::int AS batters_faced,
            SUM(COALESCE(balks, 0))::int AS balks,
            SUM(COALESCE(intentional_walks, 0))::int AS intentional_walks,
            SUM(COALESCE(ground_outs, 0))::int AS ground_outs,
            SUM(COALESCE(fly_outs, 0))::int AS fly_outs,
            SUM(COALESCE(holds, 0))::int AS holds,
            SUM(COALESCE(save_opportunities, 0))::int AS save_opportunities,
            SUM(COALESCE(blown_saves, 0))::int AS blown_saves,
            SUM(COALESCE(complete_games, 0))::int AS complete_games,
            (AVG(game_score))::int AS game_score,
            SUM(COALESCE(quality_starts, 0))::int AS quality_starts,
            SUM(COALESCE(shutouts, 0))::int AS shutouts,
            SUM(COALESCE(inherited_runners, 0))::int AS inherited_runners,
            SUM(COALESCE(inherited_runners_scored, 0))::int AS inherited_runners_scored,
            SUM(COALESCE(strikeouts_looking, 0))::int AS strikeouts_looking,
            SUM(COALESCE(strikeouts_swinging, 0))::int AS strikeouts_swinging
          FROM player_season_pitching GROUP BY player_id
        ),
        latest AS (
          SELECT DISTINCT ON (player_id) player_id, team_id FROM player_season_pitching ORDER BY player_id, season_id DESC
        )
        SELECT p.id AS player_id, p.slug AS player_slug, p.first_name, p.last_name,
          t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url,
          tot.games, tot.games_started, tot.wins, tot.losses, tot.saves,
          tot.innings_pitched, tot.hits_allowed, tot.runs_allowed, tot.earned_runs,
          tot.walks_allowed, tot.strikeouts, tot.home_runs_allowed, tot.hit_batters,
          tot.wild_pitches, tot.batters_faced, tot.balks, tot.intentional_walks,
          tot.ground_outs, tot.fly_outs,
          tot.holds, tot.save_opportunities, tot.blown_saves, tot.complete_games, tot.game_score,
          tot.quality_starts, tot.shutouts, tot.inherited_runners, tot.inherited_runners_scored,
          tot.strikeouts_looking, tot.strikeouts_swinging,
          ls.team_id
        FROM totals tot
        JOIN latest ls ON tot.player_id = ls.player_id
        JOIN players p ON p.id = tot.player_id
        JOIN teams t ON t.id = ls.team_id
        ORDER BY CASE WHEN tot.innings_pitched > 0 THEN (tot.earned_runs::numeric / tot.innings_pitched) * 9 ELSE 999 END ASC
      `);

      const raw = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
      const result = Array.isArray(raw) ? raw.map((row: unknown) => {
        const r = row as Record<string, number | string | null>;
        const ip = typeof r.innings_pitched === 'string' ? parseFloat(r.innings_pitched) : Number(r.innings_pitched ?? 0);
        const ab = Math.floor(ip * 3) + Number(r.hits_allowed ?? 0) - Number(r.strikeouts ?? 0) - Number(r.home_runs_allowed ?? 0);
        const rates = computePitchingRates({
          inningsPitched: ip,
          earnedRuns: Number(r.earned_runs ?? 0),
          hitsAllowed: Number(r.hits_allowed ?? 0),
          walksAllowed: Number(r.walks_allowed ?? 0),
          strikeouts: Number(r.strikeouts ?? 0),
          battersFaced: Number(r.batters_faced ?? 0),
          atBats: ab,
          homeRunsAllowed: Number(r.home_runs_allowed ?? 0),
        });
        return {
          playerId: r.player_id,
          playerSlug: r.player_slug,
          firstName: r.first_name,
          lastName: r.last_name,
          teamName: r.team_name,
          teamShortName: r.team_short_name,
          teamLogoUrl: r.team_logo_url,
          id: null,
          teamId: r.team_id,
          seasonId: null,
          games: r.games ?? 0,
          gamesStarted: r.games_started ?? 0,
          wins: r.wins ?? 0,
          losses: r.losses ?? 0,
          saves: r.saves ?? 0,
          inningsPitched: ip.toFixed(1),
          hitsAllowed: r.hits_allowed ?? 0,
          runsAllowed: r.runs_allowed ?? 0,
          earnedRuns: r.earned_runs ?? 0,
          walksAllowed: r.walks_allowed ?? 0,
          strikeouts: r.strikeouts ?? 0,
          homeRunsAllowed: r.home_runs_allowed ?? 0,
          hitBatters: r.hit_batters ?? 0,
          wildPitches: r.wild_pitches ?? 0,
          battersFaced: r.batters_faced ?? 0,
          balks: r.balks ?? 0,
          intentionalWalks: r.intentional_walks ?? 0,
          groundOuts: r.ground_outs ?? 0,
          flyOuts: r.fly_outs ?? 0,
          holds: r.holds ?? 0,
          saveOpportunities: r.save_opportunities ?? 0,
          blownSaves: r.blown_saves ?? 0,
          completeGames: r.complete_games ?? 0,
          gameScore: r.game_score ?? null,
          qualityStarts: r.quality_starts ?? 0,
          shutouts: r.shutouts ?? 0,
          inheritedRunners: r.inherited_runners ?? 0,
          inheritedRunnersScored: r.inherited_runners_scored ?? 0,
          strikeoutsLooking: r.strikeouts_looking ?? 0,
          strikeoutsSwinging: r.strikeouts_swinging ?? 0,
          era: rates.era,
          whip: rates.whip,
          strikeoutRate: rates.strikeoutRate,
          walkRate: rates.walkRate,
          fip: rates.fip,
          k9: rates.k9,
          bb9: rates.bb9,
          h9: rates.h9,
          babip: rates.babip,
          goAo: Number(r.fly_outs ?? 0) > 0 ? (Number(r.ground_outs ?? 0) / Number(r.fly_outs ?? 0)).toFixed(2) : null,
        };
      }) : [];
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching stats' });
    }
  });

  // GET /pitching-leaders?seasonId=X or omit for all-time
  app.get<{
    Querystring: { seasonId?: string };
  }>('/pitching-leaders', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      if (!isAllTime && seasonIdNum) {
        const baseFields = {
          playerId: players.id,
          playerSlug: players.slug,
          firstName: players.firstName,
          lastName: players.lastName,
          teamName: teams.name,
          teamShortName: teams.shortName,
          teamLogoUrl: teams.logoUrl,
        };
        const eraLeaders = await db
          .select({ ...baseFields, value: playerSeasonPitching.era })
          .from(playerSeasonPitching)
          .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
          .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
          .orderBy(asc(playerSeasonPitching.era))
          .limit(5);
        const whipLeaders = await db
          .select({ ...baseFields, value: playerSeasonPitching.whip })
          .from(playerSeasonPitching)
          .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
          .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
          .orderBy(asc(playerSeasonPitching.whip))
          .limit(5);
        const descCategories = [
          { key: 'strikeouts', column: playerSeasonPitching.strikeouts, label: 'Strikeouts' },
          { key: 'wins', column: playerSeasonPitching.wins, label: 'Wins' },
          { key: 'saves', column: playerSeasonPitching.saves, label: 'Saves' },
          { key: 'inningsPitched', column: playerSeasonPitching.inningsPitched, label: 'Innings Pitched' },
        ];
        const leaders: Record<string, { label: string; players: any[] }> = {
          era: { label: 'ERA', players: eraLeaders },
          whip: { label: 'WHIP', players: whipLeaders },
        };
        for (const cat of descCategories) {
          const rows = await db
            .select({ ...baseFields, value: cat.column })
            .from(playerSeasonPitching)
            .innerJoin(players, eq(playerSeasonPitching.playerId, players.id))
            .innerJoin(teams, eq(playerSeasonPitching.teamId, teams.id))
            .where(eq(playerSeasonPitching.seasonId, seasonIdNum))
            .orderBy(desc(cat.column))
            .limit(5);
          leaders[cat.key] = { label: cat.label, players: rows };
        }
        return reply.send(leaders);
      }

      const pitchRows = await db.execute(sql`
        WITH totals AS (
          SELECT player_id,
            SUM(COALESCE(innings_pitched, 0)::numeric)::numeric AS ip,
            SUM(COALESCE(earned_runs, 0))::int AS er,
            SUM(COALESCE(hits_allowed, 0))::int AS h,
            SUM(COALESCE(walks_allowed, 0))::int AS bb,
            SUM(COALESCE(strikeouts, 0))::int AS k,
            SUM(COALESCE(wins, 0))::int AS wins,
            SUM(COALESCE(saves, 0))::int AS saves,
            SUM(COALESCE(home_runs_allowed, 0))::int AS hr
          FROM player_season_pitching GROUP BY player_id
        ),
        latest AS (
          SELECT DISTINCT ON (player_id) player_id, team_id FROM player_season_pitching ORDER BY player_id, season_id DESC
        )
        SELECT p.id AS player_id, p.slug AS player_slug, p.first_name, p.last_name,
          t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url,
          tot.ip, tot.er, tot.h, tot.bb, tot.k, tot.wins, tot.saves, tot.hr
        FROM totals tot
        JOIN latest ls ON tot.player_id = ls.player_id
        JOIN players p ON p.id = tot.player_id
        JOIN teams t ON t.id = ls.team_id
      `);
      const raw = (pitchRows as { rows?: Record<string, unknown>[] }).rows ?? pitchRows as Record<string, unknown>[];
      const rows = Array.isArray(raw) ? raw : [];
      const withRates = rows.map((r: Record<string, unknown>) => {
        const ip = Number(r.ip ?? 0);
        const er = Number(r.er ?? 0);
        const h = Number(r.h ?? 0);
        const bb = Number(r.bb ?? 0);
        const k = Number(r.k ?? 0);
        const hr = Number(r.hr ?? 0);
        return {
          playerId: r.player_id,
          playerSlug: r.player_slug,
          firstName: r.first_name,
          lastName: r.last_name,
          teamName: r.team_name,
          teamShortName: r.team_short_name,
          teamLogoUrl: r.team_logo_url,
          era: ip > 0 ? ((er / ip) * 9).toFixed(2) : null,
          whip: ip > 0 ? ((bb + h) / ip).toFixed(2) : null,
          strikeouts: Number(r.k ?? 0),
          wins: Number(r.wins ?? 0),
          saves: Number(r.saves ?? 0),
          inningsPitched: ip.toFixed(1),
        };
      });
      const leaders: Record<string, { label: string; players: any[] }> = {};
      const eraSorted = [...withRates].sort((a, b) => (parseFloat(a.era ?? '999') - parseFloat(b.era ?? '999')));
      leaders.era = { label: 'ERA', players: eraSorted.slice(0, 5).map(p => ({ ...p, value: p.era })) };
      const whipSorted = [...withRates].sort((a, b) => (parseFloat(a.whip ?? '999') - parseFloat(b.whip ?? '999')));
      leaders.whip = { label: 'WHIP', players: whipSorted.slice(0, 5).map(p => ({ ...p, value: p.whip })) };
      ['strikeouts', 'wins', 'saves', 'inningsPitched'].forEach(key => {
        const sorted = [...withRates].sort((a, b) => (Number((b as Record<string, unknown>)[key]) - Number((a as Record<string, unknown>)[key])));
        const label = key === 'inningsPitched' ? 'Innings Pitched' : key.charAt(0).toUpperCase() + key.slice(1);
        leaders[key] = { label, players: sorted.slice(0, 5).map(p => ({ ...p, value: (p as Record<string, unknown>)[key] })) };
      });
      return reply.send(leaders);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch pitching leaders' });
    }
  });

  // GET /fielding?seasonId=X or omit for all-time
  app.get<{
    Querystring: { seasonId?: string };
  }>('/fielding', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      if (!isAllTime && seasonIdNum) {
        const result = await db
          .select({
            playerId: players.id,
            playerSlug: players.slug,
            firstName: players.firstName,
            lastName: players.lastName,
            teamName: teams.name,
            teamShortName: teams.shortName,
            teamLogoUrl: teams.logoUrl,
            id: playerSeasonFielding.id,
            teamId: playerSeasonFielding.teamId,
            seasonId: playerSeasonFielding.seasonId,
            games: playerSeasonFielding.games,
            innings: playerSeasonFielding.innings,
            putouts: playerSeasonFielding.putouts,
            assists: playerSeasonFielding.assists,
            errors: playerSeasonFielding.errors,
            doublePlays: playerSeasonFielding.doublePlays,
            triplePlays: playerSeasonFielding.triplePlays,
            passedBalls: playerSeasonFielding.passedBalls,
            catcherStolenBases: playerSeasonFielding.catcherStolenBases,
            catcherCaughtStealing: playerSeasonFielding.catcherCaughtStealing,
            pickoffs: playerSeasonFielding.pickoffs,
            fieldingPct: playerSeasonFielding.fieldingPct,
          })
          .from(playerSeasonFielding)
          .innerJoin(players, eq(playerSeasonFielding.playerId, players.id))
          .innerJoin(teams, eq(playerSeasonFielding.teamId, teams.id))
          .where(eq(playerSeasonFielding.seasonId, seasonIdNum))
          .orderBy(desc(playerSeasonFielding.fieldingPct));
        return reply.send(result);
      }

      const rows = await db.execute(sql`
        WITH totals AS (
          SELECT player_id,
            SUM(COALESCE(games, 0))::int AS games,
            SUM(COALESCE(innings, 0)::numeric)::numeric AS innings,
            SUM(COALESCE(putouts, 0))::int AS putouts,
            SUM(COALESCE(assists, 0))::int AS assists,
            SUM(COALESCE(errors, 0))::int AS errors,
            SUM(COALESCE(double_plays, 0))::int AS double_plays,
            SUM(COALESCE(triple_plays, 0))::int AS triple_plays,
            SUM(COALESCE(passed_balls, 0))::int AS passed_balls,
            SUM(COALESCE(catcher_stolen_bases, 0))::int AS catcher_stolen_bases,
            SUM(COALESCE(catcher_caught_stealing, 0))::int AS catcher_caught_stealing,
            SUM(COALESCE(pickoffs, 0))::int AS pickoffs
          FROM player_season_fielding GROUP BY player_id
        ),
        latest AS (
          SELECT DISTINCT ON (player_id) player_id, team_id FROM player_season_fielding ORDER BY player_id, season_id DESC
        )
        SELECT p.id AS player_id, p.slug AS player_slug, p.first_name, p.last_name,
          t.name AS team_name, t.short_name AS team_short_name, t.logo_url AS team_logo_url,
          tot.games, tot.innings, tot.putouts, tot.assists, tot.errors,
          tot.double_plays, tot.triple_plays, tot.passed_balls,
          tot.catcher_stolen_bases, tot.catcher_caught_stealing, tot.pickoffs,
          ls.team_id
        FROM totals tot
        JOIN latest ls ON tot.player_id = ls.player_id
        JOIN players p ON p.id = tot.player_id
        JOIN teams t ON t.id = ls.team_id
        ORDER BY CASE WHEN (tot.putouts + tot.assists + tot.errors) > 0 THEN (tot.putouts + tot.assists)::numeric / (tot.putouts + tot.assists + tot.errors) ELSE 0 END DESC
      `);

      const raw = (rows as { rows?: unknown[] }).rows ?? (rows as unknown[]);
      const result = Array.isArray(raw) ? raw.map((row: unknown) => {
        const r = row as Record<string, number | string | null>;
        const po = Number(r.putouts ?? 0);
        const a = Number(r.assists ?? 0);
        const e = Number(r.errors ?? 0);
        const tc = po + a + e;
        const fp = tc > 0 ? ((po + a) / tc).toFixed(3) : null;
        return {
          playerId: r.player_id,
          playerSlug: r.player_slug,
          firstName: r.first_name,
          lastName: r.last_name,
          teamName: r.team_name,
          teamShortName: r.team_short_name,
          teamLogoUrl: r.team_logo_url,
          id: null,
          teamId: r.team_id,
          seasonId: null,
          games: r.games ?? 0,
          innings: r.innings != null ? String(r.innings) : '0',
          putouts: po,
          assists: a,
          errors: e,
          doublePlays: r.double_plays ?? 0,
          triplePlays: r.triple_plays ?? 0,
          passedBalls: r.passed_balls ?? 0,
          catcherStolenBases: r.catcher_stolen_bases ?? 0,
          catcherCaughtStealing: r.catcher_caught_stealing ?? 0,
          pickoffs: r.pickoffs ?? 0,
          fieldingPct: fp,
        };
      }) : [];
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch fielding stats' });
    }
  });

  // GET /fielding-by-position?seasonId=X&position=N&category=infield|outfield - seasonId optional for all-time
  app.get<{
    Querystring: { seasonId?: string; position?: string; category?: string };
  }>('/fielding-by-position', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const positionStr = request.query.position;
      const category = request.query.category;
      const isAllTime = !seasonId || seasonId === ALL_TIME;
      const seasonIdNum = seasonId && seasonId !== ALL_TIME ? parseInt(seasonId, 10) : null;
      if (seasonId && seasonId !== ALL_TIME && (isNaN(seasonIdNum!) || seasonIdNum! <= 0)) {
        return reply.status(400).send({ message: 'Invalid seasonId' });
      }

      const conditions: ReturnType<typeof sql>[] = [];
      if (!isAllTime && seasonIdNum) {
        conditions.push(sql`${playerGameFielding.gameId} IN (
          SELECT g.id FROM games g
          INNER JOIN leagues l ON g.league_id = l.id
          WHERE l.season_id = ${seasonIdNum}
        )`);
      }
      if (category === 'infield') {
        conditions.push(sql`${playerGameFielding.position} IN (1, 2, 3, 4, 5, 6)`);
      } else if (category === 'outfield') {
        conditions.push(sql`${playerGameFielding.position} IN (7, 8, 9)`);
      } else if (positionStr) {
        const posNum = parseInt(positionStr, 10);
        if (!isNaN(posNum)) {
          conditions.push(eq(playerGameFielding.position, posNum));
        }
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : sql`1=1`;

      const isCategoryView = category === 'infield' || category === 'outfield';
      const rows = isCategoryView
        ? await db
            .select({
              playerId: players.id,
              playerSlug: players.slug,
              firstName: players.firstName,
              lastName: players.lastName,
              teamName: teams.name,
              teamShortName: teams.shortName,
              teamLogoUrl: teams.logoUrl,
              games: sql<number>`count(*)`.as('games'),
              innings: sql<string>`sum(${playerGameFielding.innings}::numeric)`.as('innings'),
              putouts: sql<number>`sum(${playerGameFielding.putouts})`.as('putouts'),
              assists: sql<number>`sum(${playerGameFielding.assists})`.as('assists'),
              errors: sql<number>`sum(${playerGameFielding.errors})`.as('errors'),
              doublePlays: sql<number>`sum(${playerGameFielding.doublePlays})`.as('double_plays'),
              triplePlays: sql<number>`sum(${playerGameFielding.triplePlays})`.as('triple_plays'),
              passedBalls: sql<number>`sum(${playerGameFielding.passedBalls})`.as('passed_balls'),
              catcherStolenBases: sql<number>`sum(${playerGameFielding.catcherStolenBases})`.as('catcher_sb'),
              catcherCaughtStealing: sql<number>`sum(${playerGameFielding.catcherCaughtStealing})`.as('catcher_cs'),
              pickoffs: sql<number>`sum(${playerGameFielding.pickoffs})`.as('pickoffs'),
            })
            .from(playerGameFielding)
            .innerJoin(players, eq(playerGameFielding.playerId, players.id))
            .innerJoin(teams, eq(playerGameFielding.teamId, teams.id))
            .where(whereClause)
            .groupBy(
              players.id,
              players.slug,
              players.firstName,
              players.lastName,
              teams.name,
              teams.shortName,
              teams.logoUrl,
            )
            .orderBy(sql`count(*) desc`)
        : await db
            .select({
              playerId: players.id,
              playerSlug: players.slug,
              firstName: players.firstName,
              lastName: players.lastName,
              teamName: teams.name,
              teamShortName: teams.shortName,
              teamLogoUrl: teams.logoUrl,
              position: playerGameFielding.position,
              games: sql<number>`count(*)`.as('games'),
              innings: sql<string>`sum(${playerGameFielding.innings}::numeric)`.as('innings'),
              putouts: sql<number>`sum(${playerGameFielding.putouts})`.as('putouts'),
              assists: sql<number>`sum(${playerGameFielding.assists})`.as('assists'),
              errors: sql<number>`sum(${playerGameFielding.errors})`.as('errors'),
              doublePlays: sql<number>`sum(${playerGameFielding.doublePlays})`.as('double_plays'),
              triplePlays: sql<number>`sum(${playerGameFielding.triplePlays})`.as('triple_plays'),
              passedBalls: sql<number>`sum(${playerGameFielding.passedBalls})`.as('passed_balls'),
              catcherStolenBases: sql<number>`sum(${playerGameFielding.catcherStolenBases})`.as('catcher_sb'),
              catcherCaughtStealing: sql<number>`sum(${playerGameFielding.catcherCaughtStealing})`.as('catcher_cs'),
              pickoffs: sql<number>`sum(${playerGameFielding.pickoffs})`.as('pickoffs'),
            })
            .from(playerGameFielding)
            .innerJoin(players, eq(playerGameFielding.playerId, players.id))
            .innerJoin(teams, eq(playerGameFielding.teamId, teams.id))
            .where(whereClause)
            .groupBy(
              players.id,
              players.slug,
              players.firstName,
              players.lastName,
              teams.name,
              teams.shortName,
              teams.logoUrl,
              playerGameFielding.position,
            )
            .orderBy(sql`count(*) desc`);

      const result = rows.map((r: Record<string, unknown>) => {
        const po = Number(r.putouts) || 0;
        const a = Number(r.assists) || 0;
        const e = Number(r.errors) || 0;
        const tc = po + a + e;
        return {
          ...r,
          games: Number(r.games),
          putouts: po,
          assists: a,
          errors: e,
          doublePlays: Number(r.doublePlays) || 0,
          triplePlays: Number(r.triplePlays) || 0,
          passedBalls: Number(r.passedBalls) || 0,
          catcherStolenBases: Number(r.catcherStolenBases) || 0,
          catcherCaughtStealing: Number(r.catcherCaughtStealing) || 0,
          pickoffs: Number(r.pickoffs) || 0,
          innings: r.innings ?? '0',
          fieldingPct: tc > 0 ? ((po + a) / tc).toFixed(3) : null,
        };
      });

      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch fielding by position' });
    }
  });

  // GET /seasons - all seasons for the season selector
  app.get('/seasons', async (_request, reply) => {
    try {
      // Add playoff fields when available (older DBs may not have these columns).
      const hasPoCols = await (async () => {
        try {
          const rows = await db.execute(sql`
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'seasons'
              and column_name in ('has_playoffs', 'regular_season_games_per_team', 'playoff_settings')
          `);
          const list = Array.isArray((rows as any).rows) ? (rows as any).rows : (rows as any);
          return Array.isArray(list) && list.length >= 3;
        } catch {
          return false;
        }
      })();

      const result = await db
        .select({
          id: seasons.id,
          name: seasons.name,
          year: seasons.year,
          isActive: seasons.isActive,
          ...(hasPoCols
            ? {
              hasPlayoffs: seasons.hasPlayoffs,
              regularSeasonGamesPerTeam: seasons.regularSeasonGamesPerTeam,
              playoffSettings: seasons.playoffSettings,
            }
            : {}),
        })
        .from(seasons)
        .orderBy(desc(seasons.year));

      return reply.send(
        result.map((s: any) => ({
          ...s,
          hasPlayoffs: hasPoCols ? (s.hasPlayoffs ?? false) : false,
          regularSeasonGamesPerTeam: hasPoCols ? (s.regularSeasonGamesPerTeam ?? null) : null,
          playoffSettings: hasPoCols ? (s.playoffSettings ?? {}) : {},
        }))
      );
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch seasons' });
    }
  });

  const BATTED_BALL_TYPES = [
    'single', 'double', 'triple', 'home_run', 'inside_park_hr', 'ground_rule_double',
    'ground_out', 'fly_out', 'line_out', 'pop_out', 'bunt_out', 'bunt_single',
    'sacrifice_fly', 'sacrifice_bunt', 'infield_fly', 'fielders_choice',
    'error', 'sac_bunt_error', 'sac_fly_error',
  ];

  // GET /team-hit-locations?seasonId=X&teamId=Y - hit locations for a team in a season (for team spray chart)
  app.get<{ Querystring: { seasonId?: string; teamId?: string } }>('/team-hit-locations', async (request, reply) => {
    try {
      const seasonId = request.query.seasonId;
      const teamId = request.query.teamId;
      const seasonIdNum = seasonId ? parseInt(seasonId, 10) : null;
      const teamIdNum = teamId ? parseInt(teamId, 10) : null;
      if (!seasonIdNum || !teamIdNum) {
        return reply.send([]);
      }
      const rows = await db
        .selectDistinctOn([gameEvents.id], {
          eventId: gameEvents.id,
          hitLocationX: gameEvents.hitLocationX,
          hitLocationY: gameEvents.hitLocationY,
          hitType: gameEvents.hitType,
          hitHardness: gameEvents.hitHardness,
          eventType: gameEvents.eventType,
          outsRecorded: gameEvents.outsRecorded,
        })
        .from(gameEvents)
        .innerJoin(games, eq(gameEvents.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(gameLineups, and(eq(gameLineups.gameId, gameEvents.gameId), eq(gameLineups.playerId, gameEvents.batterId)))
        .where(
          and(
            eq(leagues.seasonId, seasonIdNum),
            eq(gameLineups.teamId, teamIdNum),
            sql`${gameEvents.hitLocationX} IS NOT NULL`,
            sql`${gameEvents.hitLocationY} IS NOT NULL`,
            eq(gameEvents.isDeleted, false),
            sql`${gameEvents.eventType} IN (${sql.join(BATTED_BALL_TYPES.map(t => sql`${t}`), sql`, `)})`,
          ),
        );
      const result = rows.map(r => ({
        hitLocationX: Number(r.hitLocationX ?? 0),
        hitLocationY: Number(r.hitLocationY ?? 0),
        hitType: r.hitType,
        hitHardness: r.hitHardness,
        eventType: r.eventType ?? '',
        isOut: (r.outsRecorded ?? 0) > 0,
      }));
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed to fetch team hit locations' });
    }
  });

  // GET /team-hit-locations-by-player?seasonId=X&teamId=Y
  app.get<{ Querystring: { seasonId?: string; teamId?: string } }>('/team-hit-locations-by-player', async (request, reply) => {
    try {
      const seasonIdNum = request.query.seasonId ? parseInt(request.query.seasonId, 10) : null;
      const teamIdNum = request.query.teamId ? parseInt(request.query.teamId, 10) : null;
      if (!seasonIdNum || !teamIdNum) return reply.send([]);

      const rows = await db
        .selectDistinctOn([gameEvents.id], {
          eventId: gameEvents.id,
          playerId: gameEvents.batterId,
          firstName: players.firstName,
          lastName: players.lastName,
          hitLocationX: gameEvents.hitLocationX,
          hitLocationY: gameEvents.hitLocationY,
          hitType: gameEvents.hitType,
          hitHardness: gameEvents.hitHardness,
          eventType: gameEvents.eventType,
          outsRecorded: gameEvents.outsRecorded,
        })
        .from(gameEvents)
        .innerJoin(games, eq(gameEvents.gameId, games.id))
        .innerJoin(leagues, eq(games.leagueId, leagues.id))
        .innerJoin(gameLineups, and(eq(gameLineups.gameId, gameEvents.gameId), eq(gameLineups.playerId, gameEvents.batterId)))
        .innerJoin(players, eq(players.id, gameEvents.batterId))
        .where(
          and(
            eq(leagues.seasonId, seasonIdNum),
            eq(gameLineups.teamId, teamIdNum),
            sql`${gameEvents.hitLocationX} IS NOT NULL`,
            sql`${gameEvents.hitLocationY} IS NOT NULL`,
            eq(gameEvents.isDeleted, false),
            sql`${gameEvents.eventType} IN (${sql.join(BATTED_BALL_TYPES.map(t => sql`${t}`), sql`, `)})`,
          ),
        );

      // Also get AB counts per player for sorting
      const abRows = await db
        .select({
          playerId: playerSeasonBatting.playerId,
          atBats: playerSeasonBatting.atBats,
          hits: playerSeasonBatting.hits,
          rbi: playerSeasonBatting.rbi,
        })
        .from(playerSeasonBatting)
        .where(eq(playerSeasonBatting.seasonId, seasonIdNum));

      const abMap = new Map<number, { atBats: number; hits: number; rbi: number }>();
      for (const r of abRows) {
        abMap.set(r.playerId, { atBats: r.atBats ?? 0, hits: r.hits ?? 0, rbi: r.rbi ?? 0 });
      }

      // Group hits by player
      const playerMap = new Map<number, { playerId: number; name: string; atBats: number; hits: SprayHit[] }>();
      type SprayHit = { hitLocationX: number; hitLocationY: number; hitType: string | null; hitHardness: string | null; eventType: string; isOut: boolean };
      for (const r of rows) {
        const pid = r.playerId!;
        if (!playerMap.has(pid)) {
          const stats = abMap.get(pid);
          playerMap.set(pid, {
            playerId: pid,
            name: `${r.firstName} ${r.lastName}`,
            atBats: stats?.atBats ?? 0,
            hits: [],
          });
        }
        playerMap.get(pid)!.hits.push({
          hitLocationX: Number(r.hitLocationX ?? 0),
          hitLocationY: Number(r.hitLocationY ?? 0),
          hitType: r.hitType,
          hitHardness: r.hitHardness,
          eventType: r.eventType ?? '',
          isOut: (r.outsRecorded ?? 0) > 0,
        });
      }

      const result = Array.from(playerMap.values()).sort((a, b) => b.atBats - a.atBats);
      return reply.send(result);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ message: 'Failed' });
    }
  });
}
