// Tests for the diagnostic record and its JSON Lines form (RFC 0112 D1 to D4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJsonLine, type Diagnostic } from './diagnostic.ts';

const span = { start: 4, end: 7 };

const plain: Diagnostic = {
  code: 'E0003',
  span,
};

test('record keys are written in RFC order: code, span', () => {
  assert.equal(toJsonLine(plain), '{"code":"E0003","span":{"start":4,"end":7}}');
});

test('field order does not depend on the order the caller builds the object in', () => {
  const reversed = {
    span: { end: 7, start: 4 },
    code: 'E0003',
  } as unknown as Diagnostic;
  assert.equal(toJsonLine(reversed), toJsonLine(plain));
});

test('span has only start and end', () => {
  const parsed = JSON.parse(toJsonLine(plain)) as { span: Record<string, unknown> };
  assert.deepEqual(Object.keys(parsed.span), ['start', 'end']);
});

test('no severity, message, file, line or column is written, even if the caller sets one', () => {
  const extra = {
    ...plain,
    severity: 'error',
    message: 'm',
    span: { file: 'a.gl', start: 4, end: 7, line: 1, column: 5 },
  } as unknown as Diagnostic;
  assert.equal(toJsonLine(extra), toJsonLine(plain));
  assert.equal(/severity|message|file|line|column/.test(toJsonLine(extra)), false);
});

test('the fix key is absent when the record has no fix', () => {
  const parsed = JSON.parse(toJsonLine(plain)) as Record<string, unknown>;
  assert.equal('fix' in parsed, false);
  assert.deepEqual(Object.keys(parsed), ['code', 'span']);
});

test('the fix key is present, after span, when the record has a fix', () => {
  const withFix: Diagnostic = {
    code: 'E0006',
    span: { start: 12, end: 15 },
    fix: { span: { start: 12, end: 15 }, replacement: '7' },
  };
  const line = toJsonLine(withFix);
  assert.equal(
    line,
    '{"code":"E0006","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}',
  );
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed), ['code', 'span', 'fix']);
  assert.deepEqual(Object.keys(parsed.fix as object), ['span', 'replacement']);
  assert.deepEqual(Object.keys((parsed.fix as { span: object }).span), ['start', 'end']);
});

test('an empty replacement is written as an empty string, and the fix is kept', () => {
  const deletion: Diagnostic = { ...plain, fix: { span, replacement: '' } };
  assert.equal(toJsonLine(deletion), '{"code":"E0003","span":{"start":4,"end":7},"fix":{"span":{"start":4,"end":7},"replacement":""}}');
});

test('a record is one line, compact, with no spaces and no trailing comma', () => {
  const line = toJsonLine({ ...plain, fix: { span, replacement: '' } });
  assert.equal(line.includes('\n'), false);
  assert.equal(line.includes('\r'), false);
  assert.equal(line.includes(' '), false);
  assert.equal(line.endsWith('}'), true);
  assert.equal(line.endsWith(',}'), false);
});

test('two records written with a line feed between them give two lines that each parse', () => {
  const second: Diagnostic = { ...plain, code: 'E0004' };
  const text = toJsonLine(plain) + '\n' + toJsonLine(second) + '\n';
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '');
  assert.equal((JSON.parse(lines[0]) as { code: string }).code, 'E0003');
  assert.equal((JSON.parse(lines[1]) as { code: string }).code, 'E0004');
});
