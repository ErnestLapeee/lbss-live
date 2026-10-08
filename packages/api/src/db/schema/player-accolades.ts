import { pgTable, serial, integer, varchar, timestamp } from 'drizzle-orm/pg-core';

/** Staff-entered honors. Computed finishes still come from the table and the bracket. */
export const playerAccolades = pgTable('player_accolades', {
  id: serial('id').primaryKey(),
  playerId: integer('player_id').notNull(),
  seasonId: integer('season_id'),
  teamId: integer('team_id'),
  seasonYear: integer('season_year').notNull(),
  honor: varchar('honor', { length: 40 }).notNull(),
  label: varchar('label', { length: 120 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
