// Tests for the whole-file byte checks (RFC 0014 rules 1 to 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBytes } from './source.ts';

const bytes = (...b: number[]) => Buffer.from(b);
const text = (s: string) => Buffer.from(s, 'utf8');

test('a plain LF file passes', () => {
  assert.equal(checkBytes(text('fn main() {\n}\n')), null);
});

test('a CR LF file passes, and its CR LF is one line end', () => {
  assert.equal(checkBytes(text('fn main() {\r\n}\r\n')), null);
});

test('an empty file passes', () => {
  assert.equal(checkBytes(text('')), null);
});

test('a lone CR is E0001 at the CR', () => {
  assert.deepEqual(checkBytes(text('a\rb')), { code: 'E0001', start: 1, end: 2 });
});

test('a CR at end of file is E0001 at the CR', () => {
  assert.deepEqual(checkBytes(text('a\r')), { code: 'E0001', start: 1, end: 2 });
});

test('a tab in code is E0001 at the tab', () => {
  assert.deepEqual(checkBytes(text('a\tb')), { code: 'E0001', start: 1, end: 2 });
});

test('a tab in a comment is E0001 at the tab', () => {
  assert.deepEqual(checkBytes(text('// a\tb\n')), { code: 'E0001', start: 4, end: 5 });
});

test('a tab in a text literal is E0001 at the tab', () => {
  assert.deepEqual(checkBytes(text('"a\tb"')), { code: 'E0001', start: 2, end: 3 });
});

test('NUL, the other C0 controls and DEL are E0001', () => {
  for (let c = 0x00; c <= 0x1f; c++) {
    if (c === 0x0a || c === 0x0d) continue;
    assert.deepEqual(checkBytes(bytes(0x61, c)), { code: 'E0001', start: 1, end: 2 }, `byte ${c}`);
  }
  assert.deepEqual(checkBytes(bytes(0x61, 0x7f)), { code: 'E0001', start: 1, end: 2 });
});

test('a byte order mark at the start is E0001 over its three bytes', () => {
  assert.deepEqual(checkBytes(text('﻿fn')), { code: 'E0001', start: 0, end: 3 });
});

test('a byte order mark in the middle is E0001', () => {
  assert.deepEqual(checkBytes(text('a﻿b')), { code: 'E0001', start: 1, end: 4 });
});

test('an invalid UTF-8 byte is E0001 at that byte', () => {
  assert.deepEqual(checkBytes(bytes(0x61, 0xff)), { code: 'E0001', start: 1, end: 2 });
});

test('a lone continuation byte is E0001', () => {
  assert.deepEqual(checkBytes(bytes(0x61, 0x80, 0x62)), { code: 'E0001', start: 1, end: 2 });
});

test('an overlong encoding is E0001 at its lead byte', () => {
  assert.deepEqual(checkBytes(bytes(0xc0, 0x80)), { code: 'E0001', start: 0, end: 1 });
});

test('a UTF-16 surrogate encoded in UTF-8 is E0001', () => {
  assert.deepEqual(checkBytes(bytes(0xed, 0xa0, 0x80)), { code: 'E0001', start: 0, end: 1 });
});

test('a code point above U+10FFFF is E0001', () => {
  assert.deepEqual(checkBytes(bytes(0xf4, 0x90, 0x80, 0x80)), { code: 'E0001', start: 0, end: 1 });
});

test('a truncated sequence at end of file is E0001 at its lead byte', () => {
  assert.deepEqual(checkBytes(bytes(0x61, 0xe2, 0x82)), { code: 'E0001', start: 1, end: 2 });
});

test('a valid non-ASCII character passes at this stage', () => {
  assert.equal(checkBytes(text('"é €"')), null);
  assert.equal(checkBytes(text('"\u{1F600}"')), null);
});

test('the first error by offset is the one reported', () => {
  assert.deepEqual(checkBytes(bytes(0x61, 0x09, 0x62, 0xff)), { code: 'E0001', start: 1, end: 2 });
});
