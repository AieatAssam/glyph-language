// Tests for lexText (RFC 0014 rule 9). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lexText } from './text.ts';
import { Kind } from './token.ts';

const at = (text: string, pos = 0) => lexText(Buffer.from(text, 'utf8'), pos);

const str = (value: string, start = 0, bytes = Buffer.byteLength(value) + 2) => ({
  token: { kind: Kind.TEXT, start, end: start + bytes, text: value },
});

test('the empty literal "" is a text token with an empty value', () => {
  assert.deepEqual(at('""'), str(''));
});

test('"x" has the value x (RFC 0104 rule 9)', () => {
  assert.deepEqual(at('"x"'), str('x', 0, 3));
});

test('a raw LF inside the literal is content, byte 0x0A (RFC 0104 rule 9)', () => {
  assert.deepEqual(at('"a\nb"'), str('a\nb', 0, 5));
});

test('"a\\"b\\\\c" has the value a"b\\c: \\" and \\\\ are the only escapes that decode', () => {
  assert.deepEqual(at('"a\\"b\\\\c"'), str('a"b\\c', 0, 9));
});

test('\\n is not an escape: it is E0005 at the backslash and the n', () => {
  assert.deepEqual(at('"\\n"'), { error: { code: 'E0005', start: 1, end: 3 } });
});

test('\\" decodes to a quote, and the quote does not end the literal', () => {
  assert.deepEqual(at('"a\\"b"'), str('a"b', 0, 6));
});

test('\\\\ decodes to one backslash', () => {
  assert.deepEqual(at('"a\\\\b"'), str('a\\b', 0, 6));
});

test('"a//b" is text, not a comment, and the // is kept in the value', () => {
  assert.deepEqual(at('"a//b"'), str('a//b', 0, 6));
});

test('\\t is E0005 at the backslash and the t', () => {
  assert.deepEqual(at('"\\t"'), { error: { code: 'E0005', start: 1, end: 3 } });
});

test('\\q is E0005 at the backslash and the q', () => {
  assert.deepEqual(at('"\\q"'), { error: { code: 'E0005', start: 1, end: 3 } });
});

test('a bad escape before a non-ASCII character spans the whole character after the backslash', () => {
  // The quote is at 0, the backslash at 1, and the é takes bytes 2 and 3.
  assert.deepEqual(at('"\\é"'), { error: { code: 'E0005', start: 1, end: 4 } });
});

test('a LF does not end a literal: "ab LF c" is one text token', () => {
  assert.deepEqual(at('"ab\nc"'), str('ab\nc', 0, 6));
});

test('a CR LF inside a literal is E0001 at the CR, since every CR is E0001 (rule 2)', () => {
  assert.deepEqual(at('"ab\r\nc"'), { error: { code: 'E0001', start: 3, end: 4 } });
});

test('a literal unterminated at end of file is E0005 from the quote to the end of the file', () => {
  assert.deepEqual(at('"ab'), { error: { code: 'E0005', start: 0, end: 3 } });
});

test('a literal unterminated after a raw LF runs to the end of the file', () => {
  assert.deepEqual(at('"ab\nc'), { error: { code: 'E0005', start: 0, end: 5 } });
});

test('a literal that ends after a backslash-n, at end of file, is E0005 at the backslash and n, not to EOF', () => {
  assert.deepEqual(at('"\\n'), { error: { code: 'E0005', start: 1, end: 3 } });
});

test('a backslash as the last byte of the file is E0005 at the backslash only', () => {
  assert.deepEqual(at('"\\'), { error: { code: 'E0005', start: 1, end: 2 } });
});

test('a valid non-ASCII character is accepted, and its bytes are kept in the value', () => {
  // é is two bytes, so the literal runs from 0 to 4.
  assert.deepEqual(at('"é"'), str('é', 0, 4));
});

test('a four-byte character is accepted as one character', () => {
  assert.deepEqual(at('"😀"'), str('😀', 0, 6));
});

test('a tab inside the literal is E0001 at the tab, not E0005', () => {
  assert.deepEqual(at('"a\tb"'), { error: { code: 'E0001', start: 2, end: 3 } });
});

test('a lone CR inside the literal is E0001 at the CR', () => {
  assert.deepEqual(at('"a\rb"'), { error: { code: 'E0001', start: 2, end: 3 } });
});

test('a byte order mark inside the literal is E0001 over its three bytes', () => {
  assert.deepEqual(at('"\u{feff}"'), { error: { code: 'E0001', start: 1, end: 4 } });
});

test('a literal read at a later position gives offsets from the start of the file', () => {
  assert.deepEqual(at('x "a"', 2), str('a', 2, 3));
});

test('a position that is not a quote is a caller error', () => {
  assert.throws(() => at('a"'), RangeError);
});

test('a position at or past the end of the file is a caller error', () => {
  assert.throws(() => at('"', 1), RangeError);
});
