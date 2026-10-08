import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  games,
  leagues,
  leagueTeams,
  playoffs,
  playoffSeries,
  playerSeasons,
  seasons,
  standings,
  teams,
} from '../db/schema/index.js';
import { annotateFinish, playoffPodium, type FinishPlace, type PlayoffSeriesResult } from './finish-places.js';

export type PlayerAccolade = {
  seasonYear: number;
  seasonName: string;
  teamName: string;
  honor: 'champion' | 'runner_up' | 'third';
};

const HONOR_BY_PLACE: Record<FinishPlace, PlayerAccolade['honor']> = {
  1: 'champion',
  2: 'runner_up',
  3: 'third',
};

type RosterRow = {
  seasonId: number;
  teamId: number;
  year: number;
  seasonName: string;
  seasonKind: string;
  parentSeasonId: number | null;
  teamName: string;
};

export async function leagueTablesComplete(leagueIds: number[]): Promise<Map<number, boolean>> {
  const complete = new Map<number, boolean>();
  for (const id of leagueIds) complete.set(id, false);
  if (leagueIds.length === 0) return complete;

  const rows = await db
    .select({
      leagueId: games.leagueId,
      isFinalized: games.isFinalized,
      status: games.status,
    })
    .from(games)
    .where(inArray(games.leagueId, leagueIds));

  const buckets = new Map<number, { final: number; open: number }>();
  for (const game of rows) {
    const bucket = buckets.get(game.leagueId) ?? { final: 0, open: 0 };
    if (game.isFinalized) bucket.final += 1;
    else if (game.status !== 'cancelled') bucket.open += 1;
    buckets.set(game.leagueId, bucket);
  }
  for (const [leagueId, bucket] of buckets) {
    complete.set(leagueId, bucket.final > 0 && bucket.open === 0);
  }
  return complete;
}

export async function accoladesForPlayer(playerId: number): Promise<PlayerAccolade[]> {
  const roster = await db
    .select({
      seasonId: playerSeasons.seasonId,
      teamId: playerSeasons.teamId,
      year: seasons.year,
      seasonName: seasons.name,
      seasonKind: seasons.seasonKind,
      parentSeasonId: seasons.parentSeasonId,
      teamName: teams.name,
    })
    .from(playerSeasons)
    .innerJoin(seasons, eq(playerSeasons.seasonId, seasons.id))
    .innerJoin(teams, eq(playerSeasons.teamId, teams.id))
    .where(eq(playerSeasons.playerId, playerId));

  const regular = roster.filter((row) => row.seasonKind !== 'playoff');
  const playoffMembership = roster.filter((row) => row.seasonKind === 'playoff' && row.parentSeasonId != null);
  const seasonIds = [
    ...new Set([
      ...regular.map((row) => row.seasonId),
      ...playoffMembership.map((row) => row.parentSeasonId as number),
    ]),
  ];
  if (seasonIds.length === 0) return [];

  const parentMeta = await db
    .select({ id: seasons.id, year: seasons.year, name: seasons.name })
    .from(seasons)
    .where(inArray(seasons.id, seasonIds));
  const playoffSeasons = await db
    .select({
      id: seasons.id,
      parentSeasonId: seasons.parentSeasonId,
    })
    .from(seasons)
    .where(and(eq(seasons.seasonKind, 'playoff'), inArray(seasons.parentSeasonId, seasonIds)));

  const playoffSeasonIds = playoffSeasons.map((row) => row.id);
  const playoffByParent = new Map<number, number[]>();
  for (const row of playoffSeasons) {
    if (row.parentSeasonId == null) continue;
    const list = playoffByParent.get(row.parentSeasonId) ?? [];
    list.push(row.id);
    playoffByParent.set(row.parentSeasonId, list);
  }

  const membership = new Set(roster.map((row) => `${row.seasonId}:${row.teamId}`));
  const playoffRosterTeams = new Set<string>();
  if (playoffSeasonIds.length > 0) {
    const playoffRoster = await db
      .select({ seasonId: playerSeasons.seasonId, teamId: playerSeasons.teamId })
      .from(playerSeasons)
      .where(inArray(playerSeasons.seasonId, playoffSeasonIds));
    for (const row of playoffRoster) playoffRosterTeams.add(`${row.seasonId}:${row.teamId}`);
  }

  const seriesByParent = new Map<number, PlayoffSeriesResult[]>();
  if (playoffSeasonIds.length > 0) {
    const seriesRows = await db
      .select({
        seasonId: playoffs.seasonId,
        roundNumber: playoffSeries.roundNumber,
        label: playoffSeries.label,
        higherTeamId: playoffSeries.higherTeamId,
        lowerTeamId: playoffSeries.lowerTeamId,
        winnerTeamId: playoffSeries.winnerTeamId,
      })
      .from(playoffSeries)
      .innerJoin(playoffs, eq(playoffSeries.playoffsId, playoffs.id))
      .where(inArray(playoffs.seasonId, playoffSeasonIds));
    for (const row of seriesRows) {
      const parent = playoffSeasons.find((season) => season.id === row.seasonId)?.parentSeasonId;
      if (parent == null) continue;
      const list = seriesByParent.get(parent) ?? [];
      list.push(row);
      seriesByParent.set(parent, list);
    }
  }

  const leagueLinks = await db
    .select({
      seasonId: leagues.seasonId,
      leagueId: leagues.id,
      teamId: leagueTeams.teamId,
    })
    .from(leagueTeams)
    .innerJoin(leagues, eq(leagueTeams.leagueId, leagues.id))
    .where(inArray(leagues.seasonId, seasonIds));

  const leagueIds = [...new Set(leagueLinks.map((row) => row.leagueId))];
  const complete = await leagueTablesComplete(leagueIds);
  const standingRows = leagueIds.length
    ? await db
        .select({
          leagueId: standings.leagueId,
          teamId: standings.teamId,
          teamName: teams.name,
          wins: standings.wins,
          losses: standings.losses,
          winPct: standings.winPct,
        })
        .from(standings)
        .innerJoin(teams, eq(standings.teamId, teams.id))
        .where(inArray(standings.leagueId, leagueIds))
    : [];

  const placeByLeagueTeam = new Map<string, FinishPlace>();
  for (const leagueId of leagueIds) {
    const rows = standingRows.filter((row) => row.leagueId === leagueId);
    for (const row of annotateFinish(
      rows.map((item) => ({
        teamId: item.teamId,
        teamName: item.teamName,
        wins: item.wins ?? 0,
        losses: item.losses ?? 0,
        winPct: item.winPct,
      })),
      complete.get(leagueId) === true,
    )) {
      if (row.place != null) placeByLeagueTeam.set(`${leagueId}:${row.teamId}`, row.place);
    }
  }

  const accolades: PlayerAccolade[] = [];
  const seen = new Set<string>();
  const push = (row: RosterRow, honor: PlayerAccolade['honor']) => {
    const key = `${row.seasonId}:${honor}:${row.teamId}`;
    if (seen.has(key)) return;
    seen.add(key);
    accolades.push({
      seasonYear: row.year,
      seasonName: row.seasonName,
      teamName: row.teamName,
      honor,
    });
  };

  const onClub = (teamId: number, regularSeasonId: number) => {
    const childIds = playoffByParent.get(regularSeasonId) ?? [];
    const playoffListsThisClub = childIds.some((seasonId) => playoffRosterTeams.has(`${seasonId}:${teamId}`));
    if (playoffListsThisClub) {
      return childIds.some((seasonId) => membership.has(`${seasonId}:${teamId}`));
    }
    return membership.has(`${regularSeasonId}:${teamId}`);
  };

  const rowsToScore: RosterRow[] = [...regular];
  for (const row of playoffMembership) {
    const parentId = row.parentSeasonId as number;
    if (regular.some((item) => item.seasonId === parentId && item.teamId === row.teamId)) continue;
    const parent = parentMeta.find((item) => item.id === parentId);
    if (!parent) continue;
    rowsToScore.push({
      seasonId: parentId,
      teamId: row.teamId,
      year: parent.year,
      seasonName: parent.name,
      seasonKind: 'regular',
      parentSeasonId: null,
      teamName: row.teamName,
    });
  }

  for (const row of rowsToScore) {
    const links = leagueLinks.filter((link) => link.seasonId === row.seasonId && link.teamId === row.teamId);
    const podium = playoffPodium(seriesByParent.get(row.seasonId) ?? []);
    if (podium.hasBracket) {
      if (!podium.decided || !onClub(row.teamId, row.seasonId)) continue;
      if (podium.championTeamId === row.teamId) push(row, 'champion');
      if (podium.runnerUpTeamId === row.teamId) push(row, 'runner_up');
      if (podium.thirdTeamId === row.teamId) push(row, 'third');
      continue;
    }
    for (const link of links) {
      const place = placeByLeagueTeam.get(`${link.leagueId}:${row.teamId}`);
      if (place != null) push(row, HONOR_BY_PLACE[place]);
    }
  }

  const order: Record<PlayerAccolade['honor'], number> = { champion: 0, runner_up: 1, third: 2 };
  accolades.sort((a, b) => b.seasonYear - a.seasonYear || order[a.honor] - order[b.honor]);
  return accolades;
}
