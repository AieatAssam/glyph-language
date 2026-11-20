// Tests for byte offset to line and column (RFC 0004 section 2: line and column are 1-based,
// and column counts bytes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { positionOf } from './span.ts';

const at = (text: string, offset: number) => positionOf(Buffer.from(text, 'utf8'), offset);

test('the first byte of the file is line 1, column 1', () => {
  assert.deepEqual(at('abc', 0), { line: 1, column: 1 });
});

test('a byte later on the first line counts columns from 1', () => {
  assert.deepEqual(at('abc', 2), { line: 1, column: 3 });
});

test('an offset at the start of a line is column 1 of that line', () => {
  // "ab\ncd": byte 3 is 'c', the first byte of line 2.
  assert.deepEqual(at('ab\ncd', 3), { line: 2, column: 1 });
});

test('the LF that ends a line belongs to that line', () => {
  // "ab\ncd": byte 2 is the LF itself, column 3 of line 1.
  assert.deepEqual(at('ab\ncd', 2), { line: 1, column: 3 });
});

test('multibyte text before the offset is counted in bytes, not characters', () => {
  // "é" is two bytes (C3 A9), so 'b' is at byte 3 and column 4.
  assert.deepEqual(at('aéb', 3), { line: 1, column: 4 });
});

test('multibyte text on an earlier line does not change the column on a later line', () => {
  // "é\nxy": 'x' is byte 3, the first byte of line 2.
  assert.deepEqual(at('é\nxy', 3), { line: 2, column: 1 });
  assert.deepEqual(at('é\nxy', 4), { line: 2, column: 2 });
});

test('a four-byte character before the offset adds four to the column', () => {
  // U+1F600 is four bytes (F0 9F 98 80), so 'z' is at byte 4 and column 5.
  assert.deepEqual(at('😀z', 4), { line: 1, column: 5 });
});

test('the offset equal to the length of the file is the end of the file', () => {
  // "ab\ncd" is 5 bytes; the end is line 2, column 3.
  assert.deepEqual(at('ab\ncd', 5), { line: 2, column: 3 });
});

test('the end of a file that ends with LF is at column 1 of a new line', () => {
  assert.deepEqual(at('ab\n', 3), { line: 2, column: 1 });
});

test('an empty file has its only position at line 1, column 1', () => {
  assert.deepEqual(at('', 0), { line: 1, column: 1 });
});

test('CRLF before LF: CR is a byte of its line and the next line starts after the LF', () => {
  // "a\r\nb": a=0, CR=1, LF=2, b=3.
  assert.deepEqual(at('a\r\nb', 1), { line: 1, column: 2 });
  assert.deepEqual(at('a\r\nb', 2), { line: 1, column: 3 });
  assert.deepEqual(at('a\r\nb', 3), { line: 2, column: 1 });
});

test('several line feeds count each line', () => {
  assert.deepEqual(at('\n\n\nx', 3), { line: 4, column: 1 });
});

test('a CR alone does not start a new line', () => {
  assert.deepEqual(at('a\rb', 2), { line: 1, column: 3 });
});

test('an offset below zero, above the length, or not an integer is rejected', () => {
  const buf = Buffer.from('ab', 'utf8');
  assert.throws(() => positionOf(buf, -1), RangeError);
  assert.throws(() => positionOf(buf, 3), RangeError);
  assert.throws(() => positionOf(buf, 1.5), RangeError);
});
