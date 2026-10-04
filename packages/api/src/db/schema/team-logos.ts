import { customType, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { teams } from './teams.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const teamLogos = pgTable('team_logos', {
  teamId: integer('team_id')
    .primaryKey()
    .references(() => teams.id, { onDelete: 'cascade' }),
  contentType: varchar('content_type', { length: 40 }).notNull(),
  data: bytea('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
