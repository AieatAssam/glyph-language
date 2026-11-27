// Tests for the walking-skeleton parser (RFC 0104 grammar, decl and put). Each case lexes a source
// text in canonical layout and parses it.
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

const PROGRAM = 'main io{put 1}';

test('the walking-skeleton program parses to one function whose body is one put of 1', () => {
  assert.deepEqual(parseText(PROGRAM), {
    tree: {
      fn: {
        name: { text: 'main', start: 0, end: 4 },
        body: {
          callee: { text: 'print', start: 8, end: 11 },
          arg: { text: '1', start: 12, end: 13 },
          start: 8,
          end: 13,
        },
        start: 0,
        end: PROGRAM.length,
      },
    },
  });
});

test('an empty block parses to a function with no call (RFC 0104 block)', () => {
  assert.deepEqual(parseText('main io{}'), {
    tree: { fn: { name: { text: 'main', start: 0, end: 4 }, body: null, start: 0, end: 9 } },
  });
});

test('a block that is not closed is E0100 at end of file', () => {
  assert.deepEqual(parseText('main io{'), { error: { code: 'E0100', start: 8, end: 8 } });
  assert.deepEqual(parseText('main io{put 1'), { error: { code: 'E0100', start: 13, end: 13 } });
});

test('a parameter list is E0100 at the opening parenthesis (G9)', () => {
  assert.deepEqual(parseText('main()io{}'), { error: { code: 'E0100', start: 4, end: 5 } });
});

test('the old fn spelling is E0100 at the name after fn (G12)', () => {
  assert.deepEqual(parseText('fn main()io{}'), { error: { code: 'E0100', start: 3, end: 7 } });
});

test('a missing io mark is E0100 at the opening brace', () => {
  assert.deepEqual(parseText('main{put 1}'), { error: { code: 'E0100', start: 4, end: 5 } });
});

test('a statement other than put is E0100 at its first token', () => {
  assert.deepEqual(parseText('main io{ret 1}'), { error: { code: 'E0100', start: 8, end: 11 } });
});

test('a put with a name as its argument is E0100, since only an integer is accepted here', () => {
  assert.deepEqual(parseText('main io{put x}'), { error: { code: 'E0100', start: 12, end: 13 } });
});

test('a second put is E0100 at its put keyword', () => {
  assert.deepEqual(parseText('main io{put 1 put 2}'), { error: { code: 'E0100', start: 14, end: 17 } });
});

test('an empty file is E0100 at end of file, which is at offset 0', () => {
  assert.deepEqual(parseText(''), { error: { code: 'E0100', start: 0, end: 0 } });
});
