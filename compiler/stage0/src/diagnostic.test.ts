// Tests for the diagnostic record and its JSON Lines form (RFC 0004 sections 2 and 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJsonLine, type Diagnostic } from './diagnostic.ts';

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
