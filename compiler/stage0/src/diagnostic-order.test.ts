// Tests for the ordering helpers in diagnostic.ts (RFC 0050 section 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstLexicalOnly, isLexical, sortRecords, type Diagnostic } from './diagnostic.ts';

// A record with the given code and span. `end` defaults to start + 1; tests that need to tell two
// records with the same start and code apart give them different ends.
function rec(code: string, start: number, end = start + 1): Diagnostic {
  return { code, span: { start, end } };
}

const keys = (records: Diagnostic[]): string[] =>
  records.map((r) => `${r.code}@${r.span.start}`);

test('unsorted input comes out in span.start order, and the input array is not changed', () => {
  const input = [rec('E0100', 9), rec('E0100', 2), rec('E0100', 5)];
  assert.deepEqual(keys(sortRecords(input)), ['E0100@2', 'E0100@5', 'E0100@9']);
  assert.deepEqual(keys(input), ['E0100@9', 'E0100@2', 'E0100@5']);
});

test('equal starts are ordered by code, whichever order they arrive in', () => {
  assert.deepEqual(keys(sortRecords([rec('E0200', 4), rec('E0100', 4)])), ['E0100@4', 'E0200@4']);
  assert.deepEqual(keys(sortRecords([rec('E0100', 4), rec('E0200', 4)])), ['E0100@4', 'E0200@4']);
});

test('equal start and equal code keep their input order', () => {
  const out = sortRecords([rec('E0100', 4, 5), rec('E0100', 4, 6)]);
  assert.deepEqual(out.map((r) => r.span.end), [5, 6]);
  const reversed = sortRecords([rec('E0100', 4, 6), rec('E0100', 4, 5)]);
  assert.deepEqual(reversed.map((r) => r.span.end), [6, 5]);
});

test('sorting twice gives the same result', () => {
  const input = [rec('E0300', 7), rec('E0100', 7), rec('E0200', 1), rec('E0100', 3)];
  assert.deepEqual(keys(sortRecords(input)), keys(sortRecords(input)));
  assert.deepEqual(keys(sortRecords(input)), ['E0200@1', 'E0100@3', 'E0100@7', 'E0300@7']);
});

test('isLexical covers E0001 to E0099 only', () => {
  assert.equal(isLexical('E0001'), true);
  assert.equal(isLexical('E0099'), true);
  assert.equal(isLexical('E0000'), false);
  assert.equal(isLexical('E0100'), false);
  assert.equal(isLexical('e0001'), false);
  assert.equal(isLexical('E001'), false);
});

test('firstLexicalOnly keeps a lexical error and drops the syntax error after it', () => {
  const input = [rec('E0003', 10), rec('E0100', 20)];
  assert.deepEqual(keys(firstLexicalOnly(input)), ['E0003@10']);
});

test('firstLexicalOnly keeps only the first of two lexical errors', () => {
  assert.deepEqual(keys(firstLexicalOnly([rec('E0001', 5), rec('E0002', 30)])), ['E0001@5']);
});

test('firstLexicalOnly, after sortRecords, keeps the lexical error even if a syntax error came first in input', () => {
  const sorted = sortRecords([rec('E0100', 20), rec('E0003', 10)]);
  assert.deepEqual(keys(firstLexicalOnly(sorted)), ['E0003@10']);
});

test('firstLexicalOnly with no lexical record returns the same records in a new array', () => {
  const input = [rec('E0100', 1), rec('E0200', 2)];
  const out = firstLexicalOnly(input);
  assert.deepEqual(keys(out), ['E0100@1', 'E0200@2']);
  assert.notEqual(out, input);
});

test('firstLexicalOnly on an empty list gives an empty list', () => {
  assert.deepEqual(firstLexicalOnly([]), []);
});
