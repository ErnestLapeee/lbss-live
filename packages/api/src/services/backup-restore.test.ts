import assert from 'node:assert/strict';
import test from 'node:test';
import { seasons } from '../db/schema/seasons.js';
import { orderSeasonRows, reviveBackupRow } from './backup-restore.js';

test('exported timestamps become dates drizzle can write back', () => {
  const scheduledAt = '2026-08-02T12:30:00.000Z';
  assert.throws(() => seasons.createdAt.mapToDriverValue(scheduledAt as never));

  const row = reviveBackupRow({
    createdAt: scheduledAt,
    startDate: '2026-05-17T00:00:00.000Z',
    dateOfBirth: '1990-01-02',
    runnersScored: [4, 9],
    lastComputedAt: null,
  });

  assert.ok(row.createdAt instanceof Date);
  assert.equal(seasons.createdAt.mapToDriverValue(row.createdAt as Date), scheduledAt);
  assert.equal(row.startDate, '2026-05-17');
  assert.equal(row.dateOfBirth, '1990-01-02');
  assert.deepEqual(row.runnersScored, [4, 9]);
  assert.equal(row.lastComputedAt, null);
});

test('a playoff season is inserted after the regular season it belongs to', () => {
  const ordered = orderSeasonRows([
    { id: 9, name: 'Playoffs', parentSeasonId: 3 },
    { id: 3, name: 'Regular', parentSeasonId: null },
  ]);
  assert.deepEqual(ordered.map((row) => row.id), [3, 9]);
});
