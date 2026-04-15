import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  date,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  /** Calendar year for display/sorting; not globally unique (regular + playoff can share a year). */
  year: integer('year').notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').default(false),
  /**
   * `regular` = standard league season; `playoff` = separate season row (e.g. "LBL Playoffs 2025")
   * so stats and schedules can be isolated from regular-season data.
   */
  seasonKind: varchar('season_kind', { length: 20 }).notNull().default('regular'),
  /** Links a playoff season to the regular season it continues (optional). */
  parentSeasonId: integer('parent_season_id'),
  // Playoffs are optional and fully configurable per season.
  hasPlayoffs: boolean('has_playoffs').default(false),
  // Used for "playoff picture" (seed race) calculations.
  // This is a per-team regular season game count target (manual).
  regularSeasonGamesPerTeam: integer('regular_season_games_per_team'),
  // Lightweight, season-level playoff settings (manual). The detailed structure lives in playoffs/series.
  playoffSettings: jsonb('playoff_settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
