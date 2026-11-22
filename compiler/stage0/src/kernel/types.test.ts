// Tests for the kernel value types, trap lines and limits (RFC 0020: Types, TR1, TR2, TR3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INT_MAX,
  INT_MIN,
  MAX_DEPTH,
  MAX_STEPS,
  TRAP_KINDS,
  TRAP_LINE,
} from './types.ts';

test('the four trap lines are exactly the TR1 text', () => {
  assert.equal(TRAP_LINE.overflow, 'trap: overflow');
  assert.equal(TRAP_LINE['divide-by-zero'], 'trap: divide-by-zero');
  assert.equal(TRAP_LINE['stack-exhausted'], 'trap: stack-exhausted');
  assert.equal(TRAP_LINE['step-exhausted'], 'trap: step-exhausted');
});

test('there are exactly four trap kinds, in TR1 order', () => {
  assert.deepEqual(TRAP_KINDS, ['overflow', 'divide-by-zero', 'stack-exhausted', 'step-exhausted']);
});

test('every trap kind has a line, and no line exists for any other key', () => {
  assert.deepEqual(Object.keys(TRAP_LINE).sort(), [...TRAP_KINDS].sort());
});

test('MAX_DEPTH is 10000 (TR2)', () => {
  assert.equal(MAX_DEPTH, 10000);
});

test('MAX_STEPS is 1000000000 (TR3)', () => {
  assert.equal(MAX_STEPS, 1000000000);
});

test('INT_MIN is -9223372036854775808n', () => {
  assert.equal(INT_MIN, -9223372036854775808n);
  assert.equal(typeof INT_MIN, 'bigint');
});

test('INT_MAX is 9223372036854775807n and INT_MIN is one less than -INT_MAX', () => {
  assert.equal(INT_MAX, 9223372036854775807n);
  assert.equal(typeof INT_MAX, 'bigint');
  assert.equal(INT_MIN, -INT_MAX - 1n);
});
