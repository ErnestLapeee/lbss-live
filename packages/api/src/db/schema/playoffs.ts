import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { seasons } from './seasons.js';

// A season may or may not have playoffs. When present, playoffs are configured manually.
export const playoffs = pgTable(
  'playoffs',
  {
    id: serial('id').primaryKey(),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    // When true, standings pages should show the playoff picture/bracket.
    isActive: boolean('is_active').default(true),
    // Fully manual config; used for auto-seeding previews and rendering.
    // Example:
    // { format: "single_elim" | "best_of", seeds: 4, rounds: [{ name, bestOf }...], notes? }
    config: jsonb('config').default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('playoffs_season_id_idx').on(t.seasonId),
    index('playoffs_active_idx').on(t.isActive),
  ]
);

