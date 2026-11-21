// Tests for lexPunct (RFC 0014 rules 10 and 11). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lexPunct } from './punct.ts';
import { Kind, PUNCTUATION, PUNCTUATION_KIND } from './token.ts';

const at = (text: string, pos = 0) => lexPunct(Buffer.from(text, 'utf8'), pos);

const tok = (kind: number, start: number, end: number) => ({ token: { kind, start, end } });

const err = (start: number) => ({ error: { code: 'E0001', start, end: start + 1 } });

test('each of the eighteen punctuation tokens is one token of its own kind', () => {
  assert.equal(PUNCTUATION.length, 18);
  for (const spelling of PUNCTUATION) {
    assert.deepEqual(at(spelling), tok(PUNCTUATION_KIND[spelling], 0, spelling.length), spelling);
  }
});

test('==, !=, <= and >= are one token each, two bytes long', () => {
  assert.deepEqual(at('=='), tok(Kind.EQ, 0, 2));
  assert.deepEqual(at('!='), tok(Kind.NE, 0, 2));
  assert.deepEqual(at('<='), tok(Kind.LE, 0, 2));
  assert.deepEqual(at('>='), tok(Kind.GE, 0, 2));
});

test('a single = or < or > is one byte when no = follows', () => {
  assert.deepEqual(at('= 1'), tok(Kind.ASSIGN, 0, 1));
  assert.deepEqual(at('<a'), tok(Kind.LT, 0, 1));
  assert.deepEqual(at('>'), tok(Kind.GT, 0, 1));
});

test('=> is = then >, because => is not a token', () => {
  assert.deepEqual(at('=>', 0), tok(Kind.ASSIGN, 0, 1));
  assert.deepEqual(at('=>', 1), tok(Kind.GT, 1, 2));
});

test('-> is - then >, because -> is not a token', () => {
  assert.deepEqual(at('->', 0), tok(Kind.MINUS, 0, 1));
  assert.deepEqual(at('->', 1), tok(Kind.GT, 1, 2));
});

test('the longest match is taken inside a longer line', () => {
  assert.deepEqual(at('x==y', 1), tok(Kind.EQ, 1, 3));
  assert.deepEqual(at('a!=b', 1), tok(Kind.NE, 1, 3));
});

test('a bare ! is E0001 at the !, as in let a = !true', () => {
  assert.deepEqual(at('let a = !true', 8), err(8));
});

test('a ! followed by something other than = is E0001 at the !', () => {
  assert.deepEqual(at('!io'), err(0));
  assert.deepEqual(at('!'), err(0));
});

test('each listed character outside the set is E0001 at that character', () => {
  for (const ch of [';', '[', ']', '.', '#', "'", '?', '@', '$', '^', '&', '|', '~', '`', '\\']) {
    assert.deepEqual(at(ch), err(0), ch);
  }
});

test('a listed character in the middle of a line is E0001 at that character', () => {
  assert.deepEqual(at('a;b', 1), err(1));
  assert.deepEqual(at('f.g', 1), err(1));
});

test('a position past the end of the file is a caller error', () => {
  assert.throws(() => at('a', 1), RangeError);
  assert.throws(() => at('a', -1), RangeError);
});

test('a byte that another lexer owns is a caller error, not E0001', () => {
  for (const ch of ['a', 'Z', '0', '_', '"', ' ', '\n']) {
    assert.throws(() => at(ch), RangeError, ch);
  }
});
