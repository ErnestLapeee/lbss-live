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
  year: integer('year').notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').default(false),
  // Playoffs are optional and fully configurable per season.
  hasPlayoffs: boolean('has_playoffs').default(false),
  // Used for "playoff picture" (seed race) calculations.
  // This is a per-team regular season game count target (manual).
  regularSeasonGamesPerTeam: integer('regular_season_games_per_team'),
  // Lightweight, season-level playoff settings (manual). The detailed structure lives in playoffs/series.
  playoffSettings: jsonb('playoff_settings').default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
