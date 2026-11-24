// Tests for the RFC 0050 record writer, toRecordLine (subtask 1, part 1a). The record has the keys
// code, severity (only when not error), span as {start,end}, and fix as {span,replacement}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecordLine, type DiagnosticRecord } from './diagnostic.ts';

test('the record for let let = 1 is one code and one span, with no severity and no other key', () => {
  const record: DiagnosticRecord = { code: 'E0100', span: { start: 4, end: 7 } };
  assert.equal(toRecordLine(record), '{"code":"E0100","span":{"start":4,"end":7}}');
});

test('severity error is not written, and severity warning is written after code', () => {
  const explicit: DiagnosticRecord = { code: 'E0100', severity: 'error', span: { start: 4, end: 7 } };
  assert.equal(toRecordLine(explicit), '{"code":"E0100","span":{"start":4,"end":7}}');
  const warning: DiagnosticRecord = { code: 'E0100', severity: 'warning', span: { start: 4, end: 7 } };
  assert.equal(toRecordLine(warning), '{"code":"E0100","severity":"warning","span":{"start":4,"end":7}}');
});

test('a record with a fix writes the keys in RFC order: code, severity, span, fix', () => {
  const withFix: DiagnosticRecord = {
    code: 'E0006',
    severity: 'warning',
    span: { start: 0, end: 3 },
    fix: { span: { start: 0, end: 3 }, replacement: '7' },
  };
  const line = toRecordLine(withFix);
  assert.equal(
    line,
    '{"code":"E0006","severity":"warning","span":{"start":0,"end":3},' +
      '"fix":{"span":{"start":0,"end":3},"replacement":"7"}}',
  );
  assert.deepEqual(Object.keys(JSON.parse(line) as object), ['code', 'severity', 'span', 'fix']);
});

test('the leading-zero fix of 007 is written as RFC 0050 section 2 gives it', () => {
  const line = toRecordLine({
    code: 'E0006',
    span: { start: 0, end: 3 },
    fix: { span: { start: 0, end: 3 }, replacement: '7' },
  });
  assert.equal(
    line,
    '{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}',
  );
});

test('field order does not depend on the order the caller builds the object in', () => {
  const reversed = {
    fix: { replacement: '7', span: { end: 3, start: 0 } },
    span: { end: 3, start: 0 },
    code: 'E0006',
  } as unknown as DiagnosticRecord;
  assert.equal(
    toRecordLine(reversed),
    toRecordLine({ code: 'E0006', span: { start: 0, end: 3 }, fix: { span: { start: 0, end: 3 }, replacement: '7' } }),
  );
});

test('a record never carries file, line, column or message, even when the caller passes them', () => {
  const extra = {
    code: 'E0100',
    message: 'x',
    span: { file: 'a.gl', start: 4, end: 7, line: 1, column: 5 },
  } as unknown as DiagnosticRecord;
  const line = toRecordLine(extra);
  assert.equal(line, '{"code":"E0100","span":{"start":4,"end":7}}');
  for (const word of ['message', 'file', 'line', 'column']) {
    assert.equal(line.includes(word), false, word);
  }
});

test('an empty replacement is written as an empty string, and the fix is kept', () => {
  const line = toRecordLine({
    code: 'E0006',
    span: { start: 2, end: 3 },
    fix: { span: { start: 2, end: 3 }, replacement: '' },
  });
  assert.equal((JSON.parse(line) as { fix: { replacement: unknown } }).fix.replacement, '');
});

test('a record is one line with no trailing comma', () => {
  const line = toRecordLine({ code: 'E0100', span: { start: 4, end: 7 } });
  assert.equal(line.includes('\n'), false);
  assert.equal(line.includes('\r'), false);
  assert.equal(line.endsWith('}'), true);
  assert.equal(line.endsWith(',}'), false);
});
