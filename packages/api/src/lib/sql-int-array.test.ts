import assert from 'node:assert/strict';
import test from 'node:test';
import { sqlIntArray } from './sql-int-array.js';

test('integer lists become an int array literal', () => {
  const query = sqlIntArray([3, 10]);
  const chunk = query.queryChunks[0] as { value: string[] };
  assert.equal(chunk.value[0], 'ARRAY[3,10]::int[]');
});

test('a non-integer is refused', () => {
  assert.throws(() => sqlIntArray([1, Number.NaN]));
  assert.throws(() => sqlIntArray([1.5]));
  assert.throws(() => sqlIntArray([]));
});
