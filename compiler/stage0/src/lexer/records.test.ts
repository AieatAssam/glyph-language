// Tests for lexical error records (RFC 0014 subtask 10, RFC 0050 section 2): the keys written and
// the span. No file is written; the catalogue is only read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lex } from './index.ts';
import { lexErrorLine, lexErrorRecord } from './records.ts';

type Entry = { code: string; meaning: string };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../../spec/errors.json`, 'utf8')) as Entry[];

const CODES = ['E0001', 'E0005', 'E0006'];

test('a record has the keys code and span, in that order', () => {
  const line = lexErrorLine({ code: 'E0001', start: 4, end: 5 });
  assert.equal(line, '{"code":"E0001","span":{"start":4,"end":5}}');
  assert.deepEqual(Object.keys(JSON.parse(line)), ['code', 'span']);
});

test('the record has no fix key and no severity key', () => {
  const record = lexErrorRecord({ code: 'E0005', start: 4, end: 5 });
  assert.deepEqual(record, { code: 'E0005', span: { start: 4, end: 5 } });
});

test('the record carries no file, line, column or message', () => {
  const record = lexErrorRecord({ code: 'E0001', start: 4, end: 5 });
  for (const key of ['file', 'line', 'column', 'message']) {
    assert.equal(key in record, false, key);
    assert.equal(key in record.span, false, key);
  }
});

test('a lexer error found by lex() gives the record with its byte span', () => {
  const bytes = Buffer.from('let a = 1\nlet b = 2\nlet c = 007\n', 'utf8');
  const { tokens, error } = lex(bytes);
  assert.deepEqual(tokens, []);
  assert.ok(error !== null);
  assert.deepEqual(lexErrorRecord(error), { code: 'E0006', span: { start: 28, end: 31 } });
});

test('each lexer code is in spec/errors.json exactly once', () => {
  for (const code of CODES) {
    assert.equal(catalogue.filter((e) => e.code === code).length, 1, code);
  }
});
