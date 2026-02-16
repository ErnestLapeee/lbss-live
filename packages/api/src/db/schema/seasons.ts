import {
  pgTable,
  serial,
  integer,
  varchar,
  boolean,
  date,
  timestamp,
} from 'drizzle-orm/pg-core';

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  year: integer('year').notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  isActive: boolean('is_active').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
