import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
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
} from '../db/schema/index.js';

/** Payload shape from GET /admin/backup/export (version 2+). */
export interface BackupPayload {
  exportedAt?: string;
  version: number;
  data: {
    seasons: Record<string, unknown>[];
    leagues: Record<string, unknown>[];
    teams: Record<string, unknown>[];
    leagueTeams: Record<string, unknown>[];
    players: Record<string, unknown>[];
    playerSeasons: Record<string, unknown>[];
    games: Record<string, unknown>[];
    gameEvents: Record<string, unknown>[];
    gameLineups: Record<string, unknown>[];
    playerGameBatting: Record<string, unknown>[];
    playerGamePitching: Record<string, unknown>[];
    playerGameFielding: Record<string, unknown>[];
    playerSeasonBatting: Record<string, unknown>[];
    playerSeasonPitching: Record<string, unknown>[];
    playerSeasonFielding: Record<string, unknown>[];
    standings: Record<string, unknown>[];
    licenses: Record<string, unknown>[];
    payments: Record<string, unknown>[];
    articles: Record<string, unknown>[];
    users: Record<string, unknown>[];
    playoffs: Record<string, unknown>[];
    playoffSeries: Record<string, unknown>[];
  };
}

const TRUNCATE_SQL = `
TRUNCATE TABLE
  game_events,
  game_lineups,
  player_game_batting,
  player_game_pitching,
  player_game_fielding,
  games,
  player_season_batting,
  player_season_pitching,
  player_season_fielding,
  standings,
  payments,
  licenses,
  player_seasons,
  league_teams,
  leagues,
  articles,
  sessions,
  users,
  players,
  playoff_series,
  playoffs,
  seasons,
  teams
RESTART IDENTITY CASCADE
`;

const SERIAL_TABLES = [
  'seasons',
  'teams',
  'playoffs',
  'playoff_series',
  'leagues',
  'league_teams',
  'players',
  'users',
  'articles',
  'player_seasons',
  'licenses',
  'payments',
  'standings',
  'games',
  'game_lineups',
  'game_events',
  'player_game_batting',
  'player_game_pitching',
  'player_game_fielding',
  'player_season_batting',
  'player_season_pitching',
  'player_season_fielding',
] as const;

async function syncSequences(tx: BackupTx) {
  for (const table of SERIAL_TABLES) {
    await tx.execute(sql.raw(`
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${table}"), 1),
        (SELECT COUNT(*) > 0 FROM "${table}")
      )
    `));
  }
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

type BackupTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertRows(
  tx: BackupTx,
  table: Parameters<BackupTx['insert']>[0],
  rows: Record<string, unknown>[],
  chunk = 250,
) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    await tx.insert(table).values(slice as never);
  }
}

/**
 * Wipes all application data (same tables as backup export) and inserts rows from a backup file.
 * Call inside a transaction. Caller must enforce admin auth and confirmation token.
 */
export async function restoreFullBackup(
  tx: BackupTx,
  payload: BackupPayload,
  options: { placeholderPasswordHash: string },
): Promise<{ rowCounts: Record<string, number> }> {
  const v = payload.version;
  if (v !== 2 && v !== 3) {
    throw new Error(`Unsupported backup version: ${v} (expected 2 or 3)`);
  }

  const d = payload.data;
  if (!d || typeof d !== 'object') {
    throw new Error('Invalid backup: missing data');
  }

  await tx.execute(sql.raw(TRUNCATE_SQL));

  const ph = options.placeholderPasswordHash;

  await insertRows(tx, seasons, arr(d.seasons));
  await insertRows(tx, teams, arr(d.teams));
  await insertRows(tx, playoffs, arr(d.playoffs));
  await insertRows(tx, playoffSeries, arr(d.playoffSeries));
  await insertRows(tx, leagues, arr(d.leagues));
  await insertRows(tx, leagueTeams, arr(d.leagueTeams));
  await insertRows(tx, players, arr(d.players));

  const userRows = arr<Record<string, unknown>>(d.users).map((u) => ({
    ...u,
    passwordHash:
      typeof u.passwordHash === 'string' && (u.passwordHash as string).length > 0
        ? u.passwordHash
        : ph,
  }));
  await insertRows(tx, users, userRows);

  await insertRows(tx, articles, arr(d.articles));
  await insertRows(tx, playerSeasons, arr(d.playerSeasons));
  await insertRows(tx, licenses, arr(d.licenses));
  await insertRows(tx, payments, arr(d.payments));
  await insertRows(tx, standings, arr(d.standings));
  await insertRows(tx, games, arr(d.games));
  await insertRows(tx, gameLineups, arr(d.gameLineups));
  await insertRows(tx, gameEvents, arr(d.gameEvents));
  await insertRows(tx, playerGameBatting, arr(d.playerGameBatting));
  await insertRows(tx, playerGamePitching, arr(d.playerGamePitching));
  await insertRows(tx, playerGameFielding, arr(d.playerGameFielding));
  await insertRows(tx, playerSeasonBatting, arr(d.playerSeasonBatting));
  await insertRows(tx, playerSeasonPitching, arr(d.playerSeasonPitching));
  await insertRows(tx, playerSeasonFielding, arr(d.playerSeasonFielding));

  await syncSequences(tx);

  return {
    rowCounts: {
      seasons: arr(d.seasons).length,
      teams: arr(d.teams).length,
      leagues: arr(d.leagues).length,
      players: arr(d.players).length,
      users: userRows.length,
      games: arr(d.games).length,
      gameEvents: arr(d.gameEvents).length,
    },
  };
}
