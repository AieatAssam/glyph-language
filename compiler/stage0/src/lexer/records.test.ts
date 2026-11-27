// Tests for lexical error records (RFC 0112 D1 to D4; RFC 0014 subtask 10): key order, no fix when
// the lexer gives none, no message, line or column, the E0006 and E0002 fixes, and the catalogue.
// No file is written; the catalogue is only read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lex } from './index.ts';
import { lexErrorLine, lexErrorRecord } from './records.ts';
import type { LexError } from './source.ts';

type Entry = { code: string; message: string; meaning: string };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../../spec/errors.json`, 'utf8')) as Entry[];

// The lexer codes that are in the catalogue. E0002 is emitted by gap.ts and is checked by codes.test.ts.
const CODES = ['E0001', 'E0005', 'E0006'];

test('a record has its keys in RFC 0112 order: code, span', () => {
  const line = lexErrorLine({ code: 'E0001', start: 4, end: 5 });
  assert.equal(line, '{"code":"E0001","span":{"start":4,"end":5}}');
  assert.deepEqual(Object.keys(JSON.parse(line)), ['code', 'span']);
  assert.deepEqual(Object.keys((JSON.parse(line) as { span: object }).span), ['start', 'end']);
});

test('the record has no fix key when the lexer gives no fix', () => {
  const record = lexErrorRecord({ code: 'E0005', start: 4, end: 5 });
  assert.equal('fix' in record, false);
  assert.equal('fix' in JSON.parse(lexErrorLine({ code: 'E0005', start: 4, end: 5 })), false);
});

test('no severity, message, file, line or column is written on any lexical record', () => {
  const bytes = Buffer.from('main io{put 007}\n', 'utf8');
  const { error } = lex(bytes);
  assert.ok(error !== null);
  const line = lexErrorLine(error);
  for (const key of ['severity', 'message', 'file', 'line', 'column']) {
    assert.equal(line.includes(`"${key}"`), false, key);
  }
});

test('an E0002 record from lex() has the span of the gap and its canonical fix', () => {
  // A line feed between two words is E0002, and the fix is one space (RFC 0104 rule 4).
  const { tokens, error } = lex(Buffer.from('let a=1\nlet b=2\n', 'utf8'));
  assert.deepEqual(tokens, []);
  assert.ok(error !== null);
  assert.equal(
    lexErrorLine(error),
    '{"code":"E0002","span":{"start":7,"end":8},"fix":{"span":{"start":7,"end":8},"replacement":" "}}',
  );
});

test('an E0006 record carries the fix key: the literal span, then the replacement (RFC 0104 rule 8)', () => {
  const { error } = lex(Buffer.from('main io{put 007}', 'utf8'));
  assert.ok(error !== null);
  const record = lexErrorRecord(error);
  assert.deepEqual(record.fix, { span: { start: 12, end: 15 }, replacement: '7' });
  assert.equal(
    lexErrorLine(error),
    '{"code":"E0006","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}',
  );
});

test('each lexer code is in spec/errors.json exactly once', () => {
  for (const code of CODES) {
    assert.equal(catalogue.filter((e) => e.code === code).length, 1, code);
  }
});

test('a code the lexer does not emit is refused, not written as a record', () => {
  const unknown: LexError = { code: 'E0099', start: 0, end: 1 };
  assert.throws(() => lexErrorRecord(unknown), /no record for lexical code E0099/);
});
