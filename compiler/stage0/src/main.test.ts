// Tests for the stage0 entry point (ponytail stub: only --version works).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './main.ts';

test('--version prints one line and exits 0', () => {
  const r = run(['--version']);
  assert.equal(r.code, 0);
  assert.equal(r.out, 'glyphc stage0 0.0.0\n');
  assert.equal(r.err, '');
});

test('any other command exits 2 and writes nothing to standard output', () => {
  const r = run(['check', 'a.toy']);
  assert.equal(r.code, 2);
  assert.equal(r.out, '');
  assert.equal(r.err, 'glyphc: not implemented: check a.toy\n');
});

test('no arguments exits 2 with a message', () => {
  const r = run([]);
  assert.equal(r.code, 2);
  assert.equal(r.err, 'glyphc: not implemented: (no arguments)\n');
});
