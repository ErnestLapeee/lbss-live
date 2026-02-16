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
import { players } from './players';
import { seasons } from './seasons';
import { users } from './users';

export const licenses = pgTable(
  'licenses',
  {
    id: serial('id').primaryKey(),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id),
    status: varchar('status', { length: 20 }).default('pending'),
    medicalClearance: boolean('medical_clearance').default(false),
    insuranceVerified: boolean('insurance_verified').default(false),
    paymentStatus: varchar('payment_status', { length: 20 }).default('unpaid'),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('licenses_player_id_season_id_unique').on(
      table.playerId,
      table.seasonId
    ),
  ]
);

export const payments = pgTable('payments', {
  id: serial('id').primaryKey(),
  licenseId: integer('license_id')
    .notNull()
    .references(() => licenses.id),
  amountCents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 3 }).default('EUR'),
  method: varchar('method', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).default('pending'),
  stripePaymentId: varchar('stripe_payment_id', { length: 200 }),
  referenceNumber: varchar('reference_number', { length: 100 }),
  confirmedBy: integer('confirmed_by').references(() => users.id),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
