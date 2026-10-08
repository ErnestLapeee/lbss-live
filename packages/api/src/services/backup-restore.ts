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
  teamLogos,
  playerAccolades,
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
    teamLogos?: Record<string, unknown>[];
    playerAccolades?: Record<string, unknown>[];
  };
}

const TRUNCATE_SQL = `
TRUNCATE TABLE
  scoring_client_ops,
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
  player_accolades,
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
  team_logos,
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
  'player_accolades',
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

/** Calendar dates. A full timestamp here can shift the day when Postgres stores it. */
const DATE_ONLY_KEYS = new Set(['startDate', 'endDate', 'dateOfBirth']);

/**
 * Timestamps. The export writes these as ISO strings. Drizzle's timestamp columns
 * call `.toISOString()` on insert, so a string crashes the restore.
 */
const TIMESTAMP_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'scheduledAt',
  'finalizedAt',
  'publishedAt',
  'issuedAt',
  'expiresAt',
  'confirmedAt',
  'lastComputedAt',
]);

const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/;

export function reviveBackupRow(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value !== 'string') {
      next[key] = value;
      continue;
    }
    if (DATE_ONLY_KEYS.has(key)) {
      const match = DATE_PREFIX.exec(value);
      next[key] = match ? match[1] : value;
      continue;
    }
    if (TIMESTAMP_KEYS.has(key)) {
      const parsed = new Date(value);
      next[key] = Number.isNaN(parsed.getTime()) ? value : parsed;
      continue;
    }
    next[key] = value;
  }
  return next;
}

function rowsForInsert(rows: unknown): Record<string, unknown>[] {
  return arr<Record<string, unknown>>(rows).map(reviveBackupRow);
}

/** A playoff season can point at its regular season, so the parent row has to be inserted first. */
export function orderSeasonRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byId = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const id = Number(row.id);
    if (Number.isFinite(id)) byId.set(id, row);
  }
  const ordered: Record<string, unknown>[] = [];
  const seen = new Set<number>();
  const visit = (row: Record<string, unknown>) => {
    const id = Number(row.id);
    if (!Number.isFinite(id) || seen.has(id)) return;
    const parent = row.parentSeasonId == null || row.parentSeasonId === '' ? null : Number(row.parentSeasonId);
    if (parent != null && byId.has(parent)) visit(byId.get(parent)!);
    seen.add(id);
    ordered.push(row);
  };
  for (const row of rows) visit(row);
  return ordered;
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

  await insertRows(tx, seasons, orderSeasonRows(rowsForInsert(d.seasons)));
  await insertRows(tx, teams, rowsForInsert(d.teams));
  const logoRows = rowsForInsert(d.teamLogos)
    .map((row) => ({
      teamId: Number(row.teamId),
      contentType: String(row.contentType || 'image/png'),
      data: Buffer.from(String(row.dataBase64 || ''), 'base64'),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt : new Date(),
    }))
    .filter((row) => Number.isFinite(row.teamId) && row.data.length > 0);
  await insertRows(tx, teamLogos, logoRows);
  await insertRows(tx, playoffs, rowsForInsert(d.playoffs));
  await insertRows(tx, playoffSeries, rowsForInsert(d.playoffSeries));
  await insertRows(tx, leagues, rowsForInsert(d.leagues));
  await insertRows(tx, leagueTeams, rowsForInsert(d.leagueTeams));
  await insertRows(tx, players, rowsForInsert(d.players));
  await insertRows(tx, playerAccolades, rowsForInsert(d.playerAccolades));

  const userRows = rowsForInsert(d.users).map((u) => ({
    ...u,
    passwordHash:
      typeof u.passwordHash === 'string' && u.passwordHash.length > 0
        ? u.passwordHash
        : ph,
  }));
  await insertRows(tx, users, userRows);

  await insertRows(tx, articles, rowsForInsert(d.articles));
  await insertRows(tx, playerSeasons, rowsForInsert(d.playerSeasons));
  await insertRows(tx, licenses, rowsForInsert(d.licenses));
  await insertRows(tx, payments, rowsForInsert(d.payments));
  await insertRows(tx, standings, rowsForInsert(d.standings));
  await insertRows(tx, games, rowsForInsert(d.games));
  await insertRows(tx, gameLineups, rowsForInsert(d.gameLineups));
  await insertRows(tx, gameEvents, rowsForInsert(d.gameEvents));
  await insertRows(tx, playerGameBatting, rowsForInsert(d.playerGameBatting));
  await insertRows(tx, playerGamePitching, rowsForInsert(d.playerGamePitching));
  await insertRows(tx, playerGameFielding, rowsForInsert(d.playerGameFielding));
  await insertRows(tx, playerSeasonBatting, rowsForInsert(d.playerSeasonBatting));
  await insertRows(tx, playerSeasonPitching, rowsForInsert(d.playerSeasonPitching));
  await insertRows(tx, playerSeasonFielding, rowsForInsert(d.playerSeasonFielding));

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
