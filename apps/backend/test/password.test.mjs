import test from 'node:test';
import assert from 'node:assert/strict';
import { passwordHash, passwordMatches } from '../src/security.mjs';

test('password policy accepts 10 characters and rejects values outside 10–128', () => {
  assert.throws(() => passwordHash('a'.repeat(9)), /10至128/);
  const password = 'a'.repeat(10);
  assert.equal(passwordMatches(password, passwordHash(password)), true);
  assert.doesNotThrow(() => passwordHash('a'.repeat(128)));
  assert.throws(() => passwordHash('a'.repeat(129)), /10至128/);
});
