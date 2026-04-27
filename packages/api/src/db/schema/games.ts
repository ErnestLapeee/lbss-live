import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues.js';
import { teams } from './teams.js';
import { users } from './users.js';
import { playoffSeries } from './playoff-series.js';

export const games = pgTable(
  'games',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id')
      .notNull()
      .references(() => leagues.id),
    homeTeamId: integer('home_team_id')
      .notNull()
      .references(() => teams.id),
    awayTeamId: integer('away_team_id')
      .notNull()
      .references(() => teams.id),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    venue: varchar('venue', { length: 200 }),
    umpire: varchar('umpire', { length: 200 }),
    officialScorer: varchar('official_scorer', { length: 200 }),
    status: varchar('status', { length: 20 }).default('scheduled'),
    homeScore: integer('home_score').default(0),
    awayScore: integer('away_score').default(0),
    inningsCount: integer('innings_count').default(9),
    currentInning: integer('current_inning'),
    currentHalf: varchar('current_half', { length: 3 }),
    currentOuts: integer('current_outs').default(0),
    isFinalized: boolean('is_finalized').default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    finalizedBy: integer('finalized_by').references(() => users.id),
    playoffSeriesId: integer('playoff_series_id').references(() => playoffSeries.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('games_league_id_idx').on(table.leagueId),
    index('games_status_idx').on(table.status),
    index('games_scheduled_at_idx').on(table.scheduledAt),
    index('games_home_team_id_idx').on(table.homeTeamId),
    index('games_away_team_id_idx').on(table.awayTeamId),
    index('games_playoff_series_id_idx').on(table.playoffSeriesId),
  ]
);
