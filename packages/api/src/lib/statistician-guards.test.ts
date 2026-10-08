import assert from 'node:assert/strict';
import test from 'node:test';
import { scorerMayMutate } from './statistician-guards.js';

test('a scorer can change games and the live book', () => {
  assert.equal(scorerMayMutate('/api/admin/games'), true);
  assert.equal(scorerMayMutate('/api/admin/games/4'), true);
  assert.equal(scorerMayMutate('/api/admin/scoring/4/events'), true);
});

test('a scorer cannot reach backup by hiding it in the games path', () => {
  assert.equal(scorerMayMutate('/api/admin/backup/import'), false);
  assert.equal(scorerMayMutate('/api/admin/games/../backup/import'), false);
  assert.equal(scorerMayMutate('/api/admin/users'), false);
});
