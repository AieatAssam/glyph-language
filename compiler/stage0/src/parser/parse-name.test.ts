// Tests for a keyword in the function name position (RFC 0048 G3, E0003). Each case lexes a source
// text and parses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { parse } from './parse.ts';

const parseText = (text: string) => {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  return parse(tokens);
};

test('a keyword as the function name is E0003 at the keyword', () => {
  assert.deepEqual(parseText('fn let() io { }'), { error: { code: 'E0003', start: 3, end: 6 } });
});

test('the keyword io as the function name is E0003, and fn as well', () => {
  assert.deepEqual(parseText('fn io() io { }'), { error: { code: 'E0003', start: 3, end: 5 } });
  assert.deepEqual(parseText('fn fn() io { }'), { error: { code: 'E0003', start: 3, end: 5 } });
});

test('a keyword as the name of a let in a body is E0003 at that keyword (G3)', () => {
  assert.deepEqual(parseText('fn main() io { let let = 1 }'), { error: { code: 'E0003', start: 19, end: 22 } });
  assert.deepEqual(parseText('fn main() io { var fn = 1 }'), { error: { code: 'E0003', start: 19, end: 21 } });
});

test('a let whose name is not a keyword is E0100 at the let, since no statement is accepted yet', () => {
  assert.deepEqual(parseText('fn main() io { let x = 1 }'), { error: { code: 'E0100', start: 15, end: 18 } });
});

test('a non-keyword name still parses, so the change does not widen the name rule', () => {
  assert.deepEqual(parseText('fn put() io { }'), {
    tree: { fn: { name: { text: 'put', start: 3, end: 6 }, body: null, start: 0, end: 15 } },
  });
});
