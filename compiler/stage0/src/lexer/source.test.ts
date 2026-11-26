// Tests for checkBytes (RFC 0014 rules 1 to 3). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { checkBytes } from './source.ts';

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'utf8') : Buffer.from(p))));

test('an empty file passes', () => {
  assert.equal(checkBytes(Buffer.alloc(0)), null);
});

test('plain ASCII with LF line ends passes', () => {
  assert.equal(checkBytes(Buffer.from('let a = 1\nlet b = 2\n', 'utf8')), null);
});

test('a CR LF file is E0001 at the CR (RFC 0048 rules 2 and 3)', () => {
  assert.deepEqual(checkBytes(Buffer.from('let a = 1\r\nlet b = 2\r\n', 'utf8')), { code: 'E0001', start: 9, end: 10 });
});

test('a CR in a comment or in a text literal is E0001 at the CR', () => {
  assert.deepEqual(checkBytes(Buffer.from('// a\rb\n', 'utf8')), { code: 'E0001', start: 4, end: 5 });
  assert.deepEqual(checkBytes(Buffer.from('"a\rb"\n', 'utf8')), { code: 'E0001', start: 2, end: 3 });
});

test('valid non-ASCII text outside any literal passes: 2, 3 and 4 byte sequences', () => {
  // é is C3 A9, € is E2 82 AC, and U+1F600 is F0 9F 98 80.
  assert.equal(checkBytes(Buffer.from('é€😀\n', 'utf8')), null);
});

test('the boundary scalars of each UTF-8 length pass', () => {
  // U+007F is excluded (control). U+0080, U+07FF, U+0800, U+FFFF (not BOM), U+10000, U+10FFFF.
  const scalars = [0x80, 0x7ff, 0x800, 0xfffe, 0x10000, 0x10ffff];
  for (const cp of scalars) {
    assert.equal(checkBytes(Buffer.from(String.fromCodePoint(cp), 'utf8')), null, `U+${cp.toString(16)}`);
  }
});

test('an invalid lone byte 0xFF is E0001 at that byte', () => {
  assert.deepEqual(checkBytes(bytes('a', [0xff], 'b')), { code: 'E0001', start: 1, end: 2 });
});

test('a continuation byte with no lead is E0001 at that byte', () => {
  assert.deepEqual(checkBytes(bytes([0x80])), { code: 'E0001', start: 0, end: 1 });
});

test('an overlong encoding of "/" (C0 AF) is E0001 at the lead byte', () => {
  assert.deepEqual(checkBytes(bytes([0xc0, 0xaf])), { code: 'E0001', start: 0, end: 1 });
});

test('a surrogate (ED A0 80) is E0001 at the lead byte, the one whose second byte is out of range', () => {
  assert.deepEqual(checkBytes(bytes('x', [0xed, 0xa0, 0x80])), { code: 'E0001', start: 1, end: 2 });
});

test('a code point above U+10FFFF (F4 90 80 80) is E0001 at the lead byte', () => {
  assert.deepEqual(checkBytes(bytes([0xf4, 0x90, 0x80, 0x80])), { code: 'E0001', start: 0, end: 1 });
});

test('a sequence cut short by a following ASCII byte is E0001 at its lead byte', () => {
  // E2 82 is the start of a euro sign, but 61 ("a") is not a continuation byte.
  assert.deepEqual(checkBytes(bytes([0xe2, 0x82], 'a')), { code: 'E0001', start: 0, end: 1 });
});

test('a sequence cut short by the end of the file is E0001 at its lead byte', () => {
  assert.deepEqual(checkBytes(bytes('ab', [0xf0, 0x9f, 0x98])), { code: 'E0001', start: 2, end: 3 });
});

test('the byte order mark at the start of the file is E0001 over its three bytes', () => {
  assert.deepEqual(checkBytes(bytes([0xef, 0xbb, 0xbf], 'let a = 1\n')), { code: 'E0001', start: 0, end: 3 });
});

test('the byte order mark in the middle of the file is E0001 over its three bytes', () => {
  assert.deepEqual(checkBytes(bytes('a', [0xef, 0xbb, 0xbf], 'b')), { code: 'E0001', start: 1, end: 4 });
});

test('a NUL byte is E0001 at that byte', () => {
  assert.deepEqual(checkBytes(bytes('a', [0x00], 'b')), { code: 'E0001', start: 1, end: 2 });
});

test('the other C0 controls are E0001: ESC (0x1B) and BEL (0x07)', () => {
  assert.deepEqual(checkBytes(bytes('a', [0x1b])), { code: 'E0001', start: 1, end: 2 });
  assert.deepEqual(checkBytes(bytes([0x07])), { code: 'E0001', start: 0, end: 1 });
});

test('DEL (U+007F) is E0001 at that byte', () => {
  assert.deepEqual(checkBytes(bytes('a', [0x7f])), { code: 'E0001', start: 1, end: 2 });
});

test('a tab in code is E0001 at the tab', () => {
  assert.deepEqual(checkBytes(Buffer.from('let\ta = 1\n', 'utf8')), { code: 'E0001', start: 3, end: 4 });
});

test('a tab inside what would be a comment is E0001 at the tab', () => {
  // The byte check does not know about comments, so the tab is caught anyway.
  assert.deepEqual(checkBytes(Buffer.from('// a\tb\n', 'utf8')), { code: 'E0001', start: 4, end: 5 });
});

test('a tab inside what would be a text literal is E0001 at the tab', () => {
  assert.deepEqual(checkBytes(Buffer.from('"a\tb"\n', 'utf8')), { code: 'E0001', start: 2, end: 3 });
});

test('a lone CR followed by a letter is E0001 at the CR', () => {
  assert.deepEqual(checkBytes(Buffer.from('a\rb\n', 'utf8')), { code: 'E0001', start: 1, end: 2 });
});

test('a CR at the end of the file, with no LF after it, is E0001 at the CR', () => {
  assert.deepEqual(checkBytes(Buffer.from('a\r', 'utf8')), { code: 'E0001', start: 1, end: 2 });
});

test('two CRs in a row, then LF, is E0001 at the first CR', () => {
  // The first CR is followed by CR, not LF, so it is alone. The second CR is part of a pair.
  assert.deepEqual(checkBytes(Buffer.from('a\r\r\nb', 'utf8')), { code: 'E0001', start: 1, end: 2 });
});

test('the first error by byte offset is reported, even when a later one exists', () => {
  // The tab at byte 1 comes before the invalid byte at byte 3.
  assert.deepEqual(checkBytes(bytes('a\t', 'b', [0xff])), { code: 'E0001', start: 1, end: 2 });
});

test('an invalid byte before a tab is reported first', () => {
  assert.deepEqual(checkBytes(bytes('a', [0xff], '\tb')), { code: 'E0001', start: 1, end: 2 });
});
