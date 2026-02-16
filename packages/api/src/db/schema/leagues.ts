import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { seasons } from './seasons.js';

export const leagues = pgTable(
  'leagues',
  {
    id: serial('id').primaryKey(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    sport: varchar('sport', { length: 20 }).default('baseball'),
    level: varchar('level', { length: 20 }).default('senior'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('leagues_season_id_slug_unique').on(table.seasonId, table.slug),
    index('leagues_season_id_idx').on(table.seasonId),
  ]
);
