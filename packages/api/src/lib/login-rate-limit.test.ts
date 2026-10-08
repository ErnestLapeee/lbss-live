import assert from 'node:assert/strict';
import test from 'node:test';
import { loginAttemptAllowed, noteLoginFailure } from './login-rate-limit.js';

test('eight wrong passwords lock the address, and a success does not count', () => {
  const ip = `test-${Date.now()}-a`;
  for (let i = 0; i < 8; i += 1) {
    assert.equal(loginAttemptAllowed(ip).ok, true);
    noteLoginFailure(ip);
  }
  const blocked = loginAttemptAllowed(ip);
  assert.equal(blocked.ok, false);

  const other = `test-${Date.now()}-b`;
  assert.equal(loginAttemptAllowed(other).ok, true);
  assert.equal(loginAttemptAllowed(other).ok, true);
});
