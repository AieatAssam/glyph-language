// Tests for the walking-skeleton parser (RFC 0014 rule 13). Each case lexes a source text and parses it.
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

const PROGRAM = 'fn main() io { print(1) }';

test('the walking-skeleton program parses to one function with one call', () => {
  assert.deepEqual(parseText(PROGRAM), {
    tree: {
      fn: {
        name: { text: 'main', start: 3, end: 7 },
        body: {
          callee: { text: 'print', start: 15, end: 20 },
          arg: { text: '1', start: 21, end: 22 },
          start: 15,
          end: 23,
        },
        start: 0,
        end: PROGRAM.length,
      },
    },
  });
});

test('an empty body parses to a function with a null body, with its span up to the closing brace', () => {
  assert.deepEqual(parseText('fn main() io { }'), {
    tree: {
      fn: { name: { text: 'main', start: 3, end: 7 }, body: null, start: 0, end: 16 },
    },
  });
});

test('a trailing LF changes no tree, and a CR LF is E0001 at its CR, not a line end', () => {
  const plain = parseText(PROGRAM);
  assert.deepEqual(parseText(PROGRAM + '\n'), plain);
  assert.deepEqual(lex(Buffer.from(PROGRAM + '\r\n', 'utf8')).error, { code: 'E0001', start: 25, end: 26 });
});

test('a missing io effect is E0100 at the opening brace', () => {
  assert.deepEqual(parseText('fn main() { print(1) }'), {
    error: { code: 'E0100', start: 10, end: 11 },
  });
});

test('a missing closing brace is E0100 at end of file', () => {
  const text = 'fn main() io { print(1)';
  assert.deepEqual(parseText(text), { error: { code: 'E0100', start: text.length, end: text.length } });
});

test('an unbalanced closing parenthesis after the body is E0100 at that token', () => {
  assert.deepEqual(parseText('fn main() io { print(1) } )'), {
    error: { code: 'E0100', start: 26, end: 27 },
  });
});

test('a name as the argument is E0100, since only an integer is accepted here', () => {
  assert.deepEqual(parseText('fn main() io { print(x) }'), {
    error: { code: 'E0100', start: 21, end: 22 },
  });
});

test('an empty file is E0100 at end of file, which is at offset 0', () => {
  assert.deepEqual(parseText(''), { error: { code: 'E0100', start: 0, end: 0 } });
});

test('a second statement is E0100 at its first token', () => {
  assert.deepEqual(parseText('fn main() io { print(1) print(2) }'), {
    error: { code: 'E0100', start: 24, end: 29 },
  });
});

test('the arrow form of a result type is E0100 at the minus sign', () => {
  assert.deepEqual(parseText('fn main() -> Int { print(1) }'), {
    error: { code: 'E0100', start: 10, end: 11 },
  });
});
