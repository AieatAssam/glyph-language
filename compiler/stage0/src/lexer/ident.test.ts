// Tests for lexWord (RFC 0014 rules 6, 7 and 16). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lexWord } from './ident.ts';
import { Kind, KEYWORDS } from './token.ts';

const at = (text: string, pos = 0) => lexWord(Buffer.from(text, 'utf8'), pos);

const ident = (text: string, start = 0) => ({
  token: { kind: Kind.IDENT, start, end: start + Buffer.byteLength(text), text },
});

test('a word that starts with an underscore is an identifier', () => {
  assert.deepEqual(at('_a'), ident('_a'));
});

test('a word with uppercase letters and a digit is an identifier', () => {
  assert.deepEqual(at('Count2'), ident('Count2'));
});

test('a word with an underscore and a digit inside is an identifier', () => {
  assert.deepEqual(at('x_9'), ident('x_9'));
});

test('the type names Int, Bool and Text are identifiers, not keywords', () => {
  assert.deepEqual(at('Int'), ident('Int'));
  assert.deepEqual(at('Bool'), ident('Bool'));
  assert.deepEqual(at('Text'), ident('Text'));
});

test('print and main are identifiers', () => {
  assert.deepEqual(at('print'), ident('print'));
  assert.deepEqual(at('main'), ident('main'));
});

test('Fn and IO are identifiers, because keywords are lowercase only', () => {
  assert.deepEqual(at('Fn'), ident('Fn'));
  assert.deepEqual(at('IO'), ident('IO'));
});

test('io is the io keyword and has no text', () => {
  assert.deepEqual(at('io'), { token: { kind: Kind.KW_IO, start: 0, end: 2 } });
});

test('every one of the fifteen keywords lexes as its own kind', () => {
  const kinds = [
    Kind.KW_LET, Kind.KW_VAR, Kind.KW_IF, Kind.KW_ELSE, Kind.KW_WH, Kind.KW_RET,
    Kind.KW_TRUE, Kind.KW_FALSE, Kind.KW_AND, Kind.KW_OR, Kind.KW_NOT, Kind.KW_EX, Kind.KW_IO,
    Kind.KW_PUT, Kind.KW_FAIL,
  ];
  assert.equal(KEYWORDS.length, 15);
  KEYWORDS.forEach((word, i) => {
    assert.deepEqual(at(word), { token: { kind: kinds[i], start: 0, end: word.length } }, word);
  });
});

test('lex/kw-fail: fail is a keyword, and failure is an identifier', () => {
  assert.deepEqual(at('fail'), { token: { kind: Kind.KW_FAIL, start: 0, end: 4 } });
  assert.deepEqual(at('failure'), ident('failure'));
});

test('fn, while, return and example are identifiers now (RFC 0104 rule 7)', () => {
  assert.deepEqual(at('fn'), ident('fn'));
  assert.deepEqual(at('while'), ident('while'));
  assert.deepEqual(at('return'), ident('return'));
  assert.deepEqual(at('example'), ident('example'));
});

test('a keyword followed by a space stops at the space', () => {
  assert.deepEqual(at('if x', 0), { token: { kind: Kind.KW_IF, start: 0, end: 2 } });
});

test('a keyword that is the prefix of a longer word is an identifier', () => {
  assert.deepEqual(at('iff'), ident('iff'));
  assert.deepEqual(at('ifx1'), ident('ifx1'));
});

test('the word stops at a character that is not a letter, digit or underscore', () => {
  assert.deepEqual(at('a1-b'), ident('a1'));
  assert.deepEqual(at('x_(y)'), ident('x_'));
});

test('a word read at a later position gives offsets from the start of the file', () => {
  assert.deepEqual(at('let abc', 4), ident('abc', 4));
});

test('a letter after an ASCII word stops the word before the non-ASCII character', () => {
  // "a" is one byte, then é is C3 A9 at byte 1. The word is "a" and ends at byte 1.
  assert.deepEqual(at('aé'), ident('a'));
});

test('é at a token start is E0001 with the two-byte span of that character', () => {
  assert.deepEqual(at('é'), { error: { code: 'E0001', start: 0, end: 2 } });
});

test('é at a later token start is E0001 at its own span', () => {
  assert.deepEqual(at('let é', 4), { error: { code: 'E0001', start: 4, end: 6 } });
});

test('a four-byte character at a token start is E0001 over all four bytes', () => {
  assert.deepEqual(at('😀'), { error: { code: 'E0001', start: 0, end: 4 } });
});

test('a three-byte character at a token start is E0001 over all three bytes', () => {
  assert.deepEqual(at('€'), { error: { code: 'E0001', start: 0, end: 3 } });
});

test('a word at the very end of the file ends at the end of the file', () => {
  assert.deepEqual(at('ab'), ident('ab'));
});

test('a position at or past the end of the file is a caller error', () => {
  assert.throws(() => at('a', 1), RangeError);
});

test('a byte that cannot start a word is a caller error', () => {
  assert.throws(() => at('1a'), RangeError);
  assert.throws(() => at(' a'), RangeError);
});
