// Tests for the ordering helpers in diagnostic.ts (RFC 0004 section 3, RFC 0112 D5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstLexicalOnly, isLexical, sortRecords, type Diagnostic } from './diagnostic.ts';

function rec(code: string, start: number): Diagnostic {
  return { code, span: { start, end: start + 1 } };
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
  const first = rec('E0100', 4);
  const second = rec('E0100', 4);
  const out = sortRecords([first, second]);
  assert.equal(out[0], first);
  assert.equal(out[1], second);
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
  const lexical = rec('E0003', 10);
  const out = firstLexicalOnly([lexical, rec('E0100', 20)]);
  assert.deepEqual(keys(out), ['E0003@10']);
  assert.equal(out[0], lexical);
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
