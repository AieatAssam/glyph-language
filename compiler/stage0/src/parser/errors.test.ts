// Tests for keyword and end-of-file errors (RFC 0104 G3, G4, G13). E0003 is a keyword where an
// IDENT is required; E0100 is any other token the grammar does not accept, and the EOF token when
// the grammar needs more. Each case lexes a source text and parses it. Offsets are bytes from 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { parse } from './index.ts';

const parseText = (text: string) => {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  return parse(tokens);
};

test('let let=1 gives E0003 at the first let, where the declaration name is required (G3)', () => {
  assert.deepEqual(parseText('let let=1'), { error: { code: 'E0003', start: 0, end: 3 } });
});

test('main io{let let=1} gives E0003 at the second let, the name after let (G3)', () => {
  assert.deepEqual(parseText('main io{let let=1}'), { error: { code: 'E0003', start: 12, end: 15 } });
});

test('main io{var io=1} gives E0003 at io, the name after var (G3)', () => {
  assert.deepEqual(parseText('main io{var io=1}'), { error: { code: 'E0003', start: 12, end: 14 } });
});

test('io io{} gives E0003 at the first io, the declaration name (G3)', () => {
  assert.deepEqual(parseText('io io{}'), { error: { code: 'E0003', start: 0, end: 2 } });
});

test('f(ret Int)io{} gives E0003 at ret, the parameter name (G3)', () => {
  assert.deepEqual(parseText('f(ret Int)io{}'), { error: { code: 'E0003', start: 2, end: 5 } });
});

test('f(t Text)io{} gives E0100 at Text, the type position (G4), not E0003', () => {
  assert.deepEqual(parseText('f(t Text)io{}'), { error: { code: 'E0100', start: 4, end: 8 } });
});

test('main io{put 1 gives E0100 at the EOF token, span 13 to 13 (G13)', () => {
  assert.deepEqual(parseText('main io{put 1'), { error: { code: 'E0100', start: 13, end: 13 } });
});
