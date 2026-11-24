// Tests for the RFC 0050 record writer as the diagnostic module exposes it (RFC 0050 section 2).
// The ordering helpers are tested in diagnostic-order.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toRecordLine, type DiagnosticRecord } from './diagnostic.ts';

test('the record for let let = 1 has only code and span', () => {
  const line = toRecordLine({ code: 'E0100', span: { start: 4, end: 7 } });
  assert.equal(line, '{"code":"E0100","span":{"start":4,"end":7}}');
});

test('a record with a fix has its keys in RFC order: code, span, fix', () => {
  const line = toRecordLine({
    code: 'E0006',
    span: { start: 0, end: 3 },
    fix: { span: { start: 0, end: 3 }, replacement: '7' },
  });
  assert.equal(
    line,
    '{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}',
  );
  assert.deepEqual(Object.keys(JSON.parse(line) as object), ['code', 'span', 'fix']);
});

test('a record never carries file, line, column or message, even when the caller passes them', () => {
  const extra = {
    code: 'E0100',
    message: 'x',
    file: 'a.gl',
    line: 1,
    column: 5,
    span: { file: 'a.gl', start: 4, end: 7, line: 1, column: 5 },
  } as unknown as DiagnosticRecord;
  const line = toRecordLine(extra);
  assert.equal(line, '{"code":"E0100","span":{"start":4,"end":7}}');
  for (const word of ['message', 'file', 'line', 'column']) {
    assert.equal(line.includes(word), false, word);
  }
});

test('severity warning is written between code and span; error is not written', () => {
  assert.equal(
    toRecordLine({ code: 'E0100', severity: 'warning', span: { start: 4, end: 7 } }),
    '{"code":"E0100","severity":"warning","span":{"start":4,"end":7}}',
  );
  assert.equal(
    toRecordLine({ code: 'E0100', severity: 'error', span: { start: 4, end: 7 } }),
    '{"code":"E0100","span":{"start":4,"end":7}}',
  );
});
