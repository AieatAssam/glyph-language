// Tests for the diagnostic record and its JSON Lines form (RFC 0004 sections 2 and 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  firstLexicalOnly,
  sortRecords,
  toJsonLine,
  type Diagnostic,
} from './diagnostic.ts';

const span = { file: 'a.toy', start: 4, end: 7, line: 1, column: 5 };

const plain: Diagnostic = {
  code: 'E0003',
  severity: 'error',
  message: 'keyword cannot be used as a name',
  span,
};

test('record fields are written in RFC order: code, severity, message, span', () => {
  const line = toJsonLine(plain);
  assert.equal(
    line,
    '{"code":"E0003","severity":"error","message":"keyword cannot be used as a name",' +
      '"span":{"file":"a.toy","start":4,"end":7,"line":1,"column":5}}',
  );
});

test('field order does not depend on the order the caller builds the object in', () => {
  const reversed = {
    span: { column: 5, line: 1, end: 7, start: 4, file: 'a.toy' },
    message: plain.message,
    severity: 'error',
    code: 'E0003',
  } as unknown as Diagnostic;
  assert.equal(toJsonLine(reversed), toJsonLine(plain));
});

test('the fix key is absent when the record has no fix', () => {
  const parsed = JSON.parse(toJsonLine(plain)) as Record<string, unknown>;
  assert.equal('fix' in parsed, false);
  assert.deepEqual(Object.keys(parsed), ['code', 'severity', 'message', 'span']);
});

test('the fix key is present, after span, when the record has a fix', () => {
  const withFix: Diagnostic = {
    code: 'E0001',
    severity: 'error',
    message: 'leading zero in integer literal',
    span: { file: 'a.toy', start: 0, end: 3, line: 1, column: 1 },
    fix: { span: { file: 'a.toy', start: 0, end: 3, line: 1, column: 1 }, replacement: '7' },
  };
  const line = toJsonLine(withFix);
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed), ['code', 'severity', 'message', 'span', 'fix']);
  assert.deepEqual(Object.keys(parsed.fix as object), ['span', 'replacement']);
  assert.equal(
    line.endsWith(
      ',"fix":{"span":{"file":"a.toy","start":0,"end":3,"line":1,"column":1},"replacement":"7"}}',
    ),
    true,
  );
});

test('an empty replacement is written as an empty string, and the fix is kept', () => {
  const deletion: Diagnostic = {
    ...plain,
    fix: { span, replacement: '' },
  };
  const parsed = JSON.parse(toJsonLine(deletion)) as { fix: { replacement: unknown } };
  assert.equal(parsed.fix.replacement, '');
});

test('a record is one line with no trailing comma', () => {
  const line = toJsonLine(plain);
  assert.equal(line.includes('\n'), false);
  assert.equal(line.includes('\r'), false);
  assert.equal(line.endsWith('}'), true);
  assert.equal(line.endsWith(',}'), false);
});

test('two records written with a line feed between them give two lines that each parse', () => {
  const second: Diagnostic = { ...plain, code: 'E0004', message: 'second message' };
  const text = toJsonLine(plain) + '\n' + toJsonLine(second) + '\n';
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '');
  assert.equal((JSON.parse(lines[0]) as { code: string }).code, 'E0003');
  assert.equal((JSON.parse(lines[1]) as { code: string }).code, 'E0004');
});

test('a line feed inside the message is escaped, so the record stays on one line', () => {
  const odd: Diagnostic = { ...plain, message: 'first\nsecond' };
  const line = toJsonLine(odd);
  assert.equal(line.includes('\n'), false);
  assert.equal((JSON.parse(line) as { message: string }).message, 'first\nsecond');
});

// Helper for the ordering tests: a record with the given code, start offset and message.
function rec(code: string, start: number, message: string): Diagnostic {
  return {
    code,
    severity: 'error',
    message,
    span: { file: 'a.toy', start, end: start + 1, line: 1, column: start + 1 },
  };
}

const codesOf = (records: readonly Diagnostic[]) => records.map((r) => r.code);

test('sortRecords orders unsorted input by span.start', () => {
  const input = [rec('E0100', 9, 'c'), rec('E0100', 2, 'a'), rec('E0100', 5, 'b')];
  const sorted = sortRecords(input);
  assert.deepEqual(
    sorted.map((r) => r.span.start),
    [2, 5, 9],
  );
  assert.deepEqual(
    sorted.map((r) => r.message),
    ['a', 'b', 'c'],
  );
});

test('sortRecords does not change the input array', () => {
  const input = [rec('E0100', 9, 'c'), rec('E0100', 2, 'a')];
  const before = input.map((r) => r.span.start);
  sortRecords(input);
  assert.deepEqual(
    input.map((r) => r.span.start),
    before,
  );
});

test('sortRecords breaks equal starts by code', () => {
  const input = [rec('E0200', 4, 'types'), rec('E0100', 4, 'syntax'), rec('E0150', 4, 'mid')];
  assert.deepEqual(codesOf(sortRecords(input)), ['E0100', 'E0150', 'E0200']);
});

test('sortRecords keeps input order when start and code are both equal', () => {
  const input = [rec('E0100', 4, 'first'), rec('E0100', 4, 'second')];
  assert.deepEqual(
    sortRecords(input).map((r) => r.message),
    ['first', 'second'],
  );
  const reversed = [rec('E0100', 4, 'second'), rec('E0100', 4, 'first')];
  assert.deepEqual(
    sortRecords(reversed).map((r) => r.message),
    ['second', 'first'],
  );
});

test('sortRecords is deterministic: the same input gives the same output', () => {
  const input = [rec('E0300', 7, 'x'), rec('E0100', 7, 'y'), rec('E0001', 1, 'z')];
  assert.deepEqual(sortRecords(input), sortRecords(input));
});

test('firstLexicalOnly keeps a lexical error and drops the syntax error after it', () => {
  const input = [rec('E0001', 0, 'lex'), rec('E0100', 5, 'syntax')];
  assert.deepEqual(firstLexicalOnly(input), [input[0]]);
});

test('firstLexicalOnly applied after sortRecords keeps the lowest lexical error', () => {
  const input = [rec('E0050', 12, 'later lex'), rec('E0100', 3, 'syntax'), rec('E0010', 1, 'early lex')];
  const kept = firstLexicalOnly(sortRecords(input));
  assert.deepEqual(kept.map((r) => r.message), ['early lex']);
});

test('firstLexicalOnly with no lexical record returns every record, in the order given', () => {
  const input = [rec('E0300', 8, 'name'), rec('E0100', 2, 'syntax')];
  assert.deepEqual(firstLexicalOnly(input), input);
});

test('firstLexicalOnly does not change the input array', () => {
  const input = [rec('E0001', 0, 'lex'), rec('E0100', 5, 'syntax')];
  firstLexicalOnly(input);
  assert.equal(input.length, 2);
});
