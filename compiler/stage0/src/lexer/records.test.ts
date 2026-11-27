// Tests for lexical error records (RFC 0014 subtask 10): RFC 0004 field order, no fix key, line and
// column, message rules, and the catalogue. No file is written; the catalogue is only read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lex } from './index.ts';
import { lexErrorLine, lexErrorRecord } from './records.ts';
import { checkMessage } from '../message.ts';
import type { LexError } from './source.ts';

type Entry = { code: string; message: string; meaning: string };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../../spec/errors.json`, 'utf8')) as Entry[];

const CODES = ['E0001', 'E0005', 'E0006'];

// A file whose tab is on line 3, at byte 4 ("a\nb\n\tc": a, LF, b, LF, TAB, c).
const LINE3 = Buffer.from('a\nb\n\tc', 'utf8');

test('a record has its fields in RFC order: code, severity, message, span', () => {
  const line = lexErrorLine({ code: 'E0001', start: 4, end: 5 }, LINE3, 'a.gl');
  assert.equal(
    line,
    '{"code":"E0001","severity":"error","message":"invalid byte or character in source",' +
      '"span":{"file":"a.gl","start":4,"end":5,"line":3,"column":1}}',
  );
  assert.deepEqual(Object.keys(JSON.parse(line)), ['code', 'severity', 'message', 'span']);
});

test('the record has no fix key', () => {
  const record = lexErrorRecord({ code: 'E0005', start: 4, end: 5 }, LINE3, 'a.gl');
  assert.equal('fix' in record, false);
  assert.equal('fix' in JSON.parse(lexErrorLine({ code: 'E0005', start: 4, end: 5 }, LINE3, 'a.gl')), false);
});

test('an error on line 3 gives line 3 and the byte column on that line', () => {
  const record = lexErrorRecord({ code: 'E0001', start: 4, end: 5 }, LINE3, 'a.gl');
  assert.deepEqual(record.span, { file: 'a.gl', start: 4, end: 5, line: 3, column: 1 });
});

test('a lexer error found by lex() gives the same record, with its line and column', () => {
  // A line feed outside text is E0002 (RFC 0104 rule 4), so the first one ends the lex.
  const bytes = Buffer.from('let a=1\nlet b=2\n', 'utf8');
  const { tokens, error } = lex(bytes);
  assert.deepEqual(tokens, []);
  assert.ok(error !== null);
  const record = lexErrorRecord(error, bytes, 'prog.gl');
  assert.equal(record.code, 'E0002');
  assert.deepEqual(record.span, { file: 'prog.gl', start: 7, end: 8, line: 1, column: 8 });
});

test('an E0006 record carries the fix key: the literal span, then the replacement (RFC 0104 rule 8)', () => {
  const bytes = Buffer.from('main io{put 007}', 'utf8');
  const { error } = lex(bytes);
  assert.ok(error !== null);
  const record = lexErrorRecord(error, bytes, 'p.gl');
  assert.deepEqual(record.fix, {
    span: { file: 'p.gl', start: 12, end: 15, line: 1, column: 13 },
    replacement: '7',
  });
  assert.equal(
    lexErrorLine(error, bytes, 'p.gl'),
    '{"code":"E0006","severity":"error","message":"integer literal has a leading zero",' +
      '"span":{"file":"p.gl","start":12,"end":15,"line":1,"column":13},' +
      '"fix":{"span":{"file":"p.gl","start":12,"end":15,"line":1,"column":13},"replacement":"7"}}',
  );
});

test('each lexer code has a message that passes the message rules', () => {
  for (const code of CODES) {
    const record = lexErrorRecord({ code, start: 0, end: 1 }, LINE3, 'a.gl');
    assert.deepEqual(checkMessage(record.message), [], code);
  }
});

test('each lexer code is in spec/errors.json exactly once', () => {
  for (const code of CODES) {
    assert.equal(catalogue.filter((e) => e.code === code).length, 1, code);
  }
});

test('each lexer record message is the catalogue message for its code', () => {
  for (const code of CODES) {
    const entry = catalogue.find((e) => e.code === code);
    assert.equal(lexErrorRecord({ code, start: 0, end: 1 }, LINE3, 'a.gl').message, entry?.message, code);
  }
});

test('a code with no message here is refused, not written without a message', () => {
  const unknown: LexError = { code: 'E0099', start: 0, end: 1 };
  assert.throws(() => lexErrorRecord(unknown, LINE3, 'a.gl'), /no message for lexical code E0099/);
});
