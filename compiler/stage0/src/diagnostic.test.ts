// Tests for the diagnostic record and its JSON Lines form (RFC 0050 section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toJsonLine, type Diagnostic } from './diagnostic.ts';

// `let let = 1`: the keyword at bytes 4 to 7 is a syntax error (E0100).
const plain: Diagnostic = { code: 'E0100', span: { start: 4, end: 7 } };

test('the record for let let = 1 has only code and span', () => {
  assert.equal(toJsonLine(plain), '{"code":"E0100","span":{"start":4,"end":7}}');
});

test('severity error is not written, since absent means error', () => {
  assert.equal(toJsonLine({ ...plain, severity: 'error' }), toJsonLine(plain));
});

test('severity warning is written after code and before span', () => {
  assert.equal(
    toJsonLine({ ...plain, severity: 'warning' }),
    '{"code":"E0100","severity":"warning","span":{"start":4,"end":7}}',
  );
});

test('a record with a fix has its keys in RFC order, and the fix has span then replacement', () => {
  const withFix: Diagnostic = {
    code: 'E0006',
    span: { start: 0, end: 3 },
    fix: { span: { start: 0, end: 3 }, replacement: '7' },
  };
  const line = toJsonLine(withFix);
  assert.equal(
    line,
    '{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}',
  );
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed), ['code', 'span', 'fix']);
  assert.deepEqual(Object.keys(parsed.fix as object), ['span', 'replacement']);
});

test('the fix key is absent when the record has no fix', () => {
  const parsed = JSON.parse(toJsonLine(plain)) as Record<string, unknown>;
  assert.equal('fix' in parsed, false);
  assert.deepEqual(Object.keys(parsed), ['code', 'span']);
});

test('field order does not depend on the order the caller builds the object in', () => {
  const reversed = { span: { end: 7, start: 4 }, code: 'E0100' } as unknown as Diagnostic;
  assert.equal(toJsonLine(reversed), toJsonLine(plain));
});

test('a record never carries file, line, column or message, even when the object has them', () => {
  const extra = {
    code: 'E0100',
    message: 'unexpected token',
    file: 'a.gl',
    line: 1,
    column: 5,
    span: { file: 'a.gl', start: 4, end: 7, line: 1, column: 5 },
    fix: {
      span: { file: 'a.gl', start: 4, end: 7, line: 1, column: 5 },
      replacement: '',
    },
  } as unknown as Diagnostic;
  const parsed = JSON.parse(toJsonLine(extra)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(parsed), ['code', 'span', 'fix']);
  assert.deepEqual(Object.keys(parsed.span as object), ['start', 'end']);
  assert.deepEqual(Object.keys((parsed.fix as { span: object }).span), ['start', 'end']);
});

test('an empty replacement is written as an empty string, and the fix is kept', () => {
  const deletion: Diagnostic = {
    ...plain,
    fix: { span: { start: 4, end: 7 }, replacement: '' },
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
  const second: Diagnostic = { code: 'E0003', span: { start: 3, end: 6 } };
  const text = toJsonLine(plain) + '\n' + toJsonLine(second) + '\n';
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[2], '');
  assert.equal((JSON.parse(lines[0]) as { code: string }).code, 'E0100');
  assert.equal((JSON.parse(lines[1]) as { code: string }).code, 'E0003');
});

test('a line feed inside a replacement is escaped, so the record stays on one line', () => {
  const odd: Diagnostic = {
    ...plain,
    fix: { span: { start: 4, end: 7 }, replacement: 'first\nsecond' },
  };
  const line = toJsonLine(odd);
  assert.equal(line.includes('\n'), false);
  assert.equal((JSON.parse(line) as { fix: { replacement: string } }).fix.replacement, 'first\nsecond');
});
