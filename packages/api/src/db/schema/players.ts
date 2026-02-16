import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  date,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { teams } from './teams';
import { seasons } from './seasons';

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  firstName: varchar('first_name', { length: 100 }).notNull(),
  lastName: varchar('last_name', { length: 100 }).notNull(),
  slug: varchar('slug', { length: 200 }).notNull().unique(),
  dateOfBirth: date('date_of_birth'),
  nationality: varchar('nationality', { length: 50 }).default('LV'),
  throws: varchar('throws', { length: 1 }),
  bats: varchar('bats', { length: 1 }),
  heightCm: integer('height_cm'),
  weightKg: integer('weight_kg'),
  photoUrl: varchar('photo_url', { length: 500 }),
  bio: text('bio'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const playerSeasons = pgTable(
  'player_seasons',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    jerseyNumber: varchar('jersey_number', { length: 5 }),
    position: varchar('position', { length: 5 }),
    role: varchar('role', { length: 20 }).default('player'),
  },
  (table) => [
    uniqueIndex('player_seasons_player_id_team_id_season_id_unique').on(
      table.playerId,
      table.teamId,
      table.seasonId
    ),
  ]
);
