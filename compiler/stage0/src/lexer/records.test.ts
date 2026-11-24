// Tests for lexical error records (RFC 0014 subtask 10, RFC 0050 sections 2 and 4). The record holds
// code and span only, in RFC order. No file is written; the catalogue is only read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { lex } from './index.ts';
import { lexErrorLine, lexErrorRecord } from './records.ts';

type Entry = { code: string };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../../spec/errors.json`, 'utf8')) as Entry[];

const CODES = ['E0001', 'E0005', 'E0006'];

test('a record has only code and span, in RFC order', () => {
  const line = lexErrorLine({ code: 'E0001', start: 4, end: 5 });
  assert.equal(line, '{"code":"E0001","span":{"start":4,"end":5}}');
  assert.deepEqual(Object.keys(JSON.parse(line)), ['code', 'span']);
});

test('the record has no fix key', () => {
  const record = lexErrorRecord({ code: 'E0005', start: 4, end: 5 });
  assert.equal('fix' in record, false);
  assert.equal('fix' in JSON.parse(lexErrorLine({ code: 'E0005', start: 4, end: 5 })), false);
});

test('the span is the byte range of the error, with no line, column or file', () => {
  const record = lexErrorRecord({ code: 'E0001', start: 4, end: 5 });
  assert.deepEqual(record.span, { start: 4, end: 5 });
});

test('a lexer error found by lex() gives the record for its byte range', () => {
  const bytes = Buffer.from('let a = 1\nlet b = 2\nlet c = 007\n', 'utf8');
  const { tokens, error } = lex(bytes);
  assert.deepEqual(tokens, []);
  assert.ok(error !== null);
  assert.equal(lexErrorLine(error), '{"code":"E0006","span":{"start":28,"end":31}}');
});

test('each lexer code is in spec/errors.json exactly once', () => {
  for (const code of CODES) {
    assert.equal(catalogue.filter((e) => e.code === code).length, 1, code);
  }
});

test('each lexer code gives a record with that code', () => {
  for (const code of CODES) {
    assert.equal(lexErrorRecord({ code, start: 0, end: 1 }).code, code);
  }
});
