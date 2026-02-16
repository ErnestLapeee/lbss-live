import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { leagues } from './leagues.js';

export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  shortName: varchar('short_name', { length: 20 }),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  city: varchar('city', { length: 100 }),
  logoUrl: varchar('logo_url', { length: 500 }),
  foundedYear: integer('founded_year'),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const leagueTeams = pgTable(
  'league_teams',
  {
    id: serial('id').primaryKey(),
    leagueId: integer('league_id')
      .notNull()
      .references(() => leagues.id),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
  },
  (table) => [
    uniqueIndex('league_teams_league_id_team_id_unique').on(
      table.leagueId,
      table.teamId
    ),
  ]
);
