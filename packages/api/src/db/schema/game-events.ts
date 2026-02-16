import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  jsonb,
  numeric,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { games } from './games';
import { players } from './players';
import { users } from './users';

export const gameEvents = pgTable(
  'game_events',
  {
    id: serial('id').primaryKey(),
    gameId: integer('game_id')
      .notNull()
      .references(() => games.id),
    eventNumber: integer('event_number').notNull(),
    inning: integer('inning').notNull(),
    half: varchar('half', { length: 3 }).notNull(),
    batterId: integer('batter_id').references(() => players.id),
    pitcherId: integer('pitcher_id').references(() => players.id),
    eventType: varchar('event_type', { length: 30 }).notNull(),
    eventDetail: text('event_detail'),
    rbi: integer('rbi').default(0),
    runsScored: integer('runs_scored').default(0),
    outsRecorded: integer('outs_recorded').default(0),
    errorsOnPlay: integer('errors_on_play').default(0),
    balls: integer('balls').default(0),
    strikes: integer('strikes').default(0),
    runnerFirstId: integer('runner_first_id').references(() => players.id),
    runnerSecondId: integer('runner_second_id').references(() => players.id),
    runnerThirdId: integer('runner_third_id').references(() => players.id),
    runnersScored: jsonb('runners_scored').default([]),
    // Fielding tracking
    fieldingSequence: varchar('fielding_sequence', { length: 30 }),
    putoutFielderIds: jsonb('putout_fielder_ids').default([]),
    assistFielderIds: jsonb('assist_fielder_ids').default([]),
    errorFielderIds: jsonb('error_fielder_ids').default([]),
    // Hit location tracking
    hitLocationX: numeric('hit_location_x', { precision: 5, scale: 1 }),
    hitLocationY: numeric('hit_location_y', { precision: 5, scale: 1 }),
    hitType: varchar('hit_type', { length: 15 }), // grounder, line_drive, fly_ball, pop_up
    hitHardness: varchar('hit_hardness', { length: 10 }), // soft, medium, hard
    // Pitch tracking
    pitchCount: integer('pitch_count'),
    pitchSequence: varchar('pitch_sequence', { length: 50 }),
    isDeleted: boolean('is_deleted').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    createdBy: integer('created_by').references(() => users.id),
  },
  (table) => [
    uniqueIndex('game_events_game_id_event_number_unique').on(
      table.gameId,
      table.eventNumber
    ),
    index('game_events_game_id_idx').on(table.gameId),
    index('game_events_batter_id_idx').on(table.batterId),
    index('game_events_pitcher_id_idx').on(table.pitcherId),
    index('game_events_event_type_idx').on(table.eventType),
  ]
);
