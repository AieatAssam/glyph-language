// Tests for lex (RFC 0014 rules 1 to 12 and 16, without NEWLINE). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from './index.ts';
import { Kind } from './token.ts';

const src = (text: string) => lex(Buffer.from(text, 'utf8'));
const bytes = (...b: number[]) => lex(Buffer.from(b));
const kinds = (text: string) => src(text).tokens.map((t) => t.kind);

const PROGRAM = 'fn main() io { print(1) }';

test('the walking-skeleton program gives its token kinds in order, ending in EOF', () => {
  assert.deepEqual(kinds(PROGRAM), [
    Kind.KW_FN, Kind.IDENT, Kind.LPAREN, Kind.RPAREN, Kind.KW_IO,
    Kind.LBRACE, Kind.IDENT, Kind.LPAREN, Kind.INT, Kind.RPAREN, Kind.RBRACE, Kind.EOF,
  ]);
  assert.equal(src(PROGRAM).error, null);
});

test('the program tokens have exact spans and the names and digits keep their text', () => {
  const { tokens } = src(PROGRAM);
  assert.deepEqual(tokens[0], { kind: Kind.KW_FN, start: 0, end: 2 });
  assert.deepEqual(tokens[1], { kind: Kind.IDENT, start: 3, end: 7, text: 'main' });
  assert.deepEqual(tokens[8], { kind: Kind.INT, start: 21, end: 22, text: '1' });
  assert.deepEqual(tokens[11], { kind: Kind.EOF, start: PROGRAM.length, end: PROGRAM.length });
});

test('an LF or CR LF after the program changes no token', () => {
  const plain = src(PROGRAM).tokens;
  assert.deepEqual(src(PROGRAM + '\n').tokens.slice(0, -1), plain.slice(0, -1));
  assert.deepEqual(src(PROGRAM + '\r\n').tokens.slice(0, -1), plain.slice(0, -1));
});

test('a comment is skipped, and a // inside it does not start a token', () => {
  assert.deepEqual(kinds('fn // print("x")\nmain'), [Kind.KW_FN, Kind.IDENT, Kind.EOF]);
});

test('an empty file gives only EOF at offset 0', () => {
  assert.deepEqual(src(''), { tokens: [{ kind: Kind.EOF, start: 0, end: 0 }], error: null });
});

test('a file of only spaces and line ends gives only EOF', () => {
  assert.deepEqual(kinds('  \n\r\n '), [Kind.EOF]);
});

test('==, !=, <= and >= are one token each', () => {
  assert.deepEqual(kinds('== != <= >='), [Kind.EQ, Kind.NE, Kind.LE, Kind.GE, Kind.EOF]);
});

test('=> is = then >, and -> is - then >', () => {
  assert.deepEqual(kinds('=>'), [Kind.ASSIGN, Kind.GT, Kind.EOF]);
  assert.deepEqual(kinds('->'), [Kind.MINUS, Kind.GT, Kind.EOF]);
});

test('an integer with a leading zero is E0006 over the whole literal, with no tokens', () => {
  assert.deepEqual(src('007'), { tokens: [], error: { code: 'E0006', start: 0, end: 3 } });
});

test('a lone ! is E0001 at the !', () => {
  assert.deepEqual(src('let a = !true'), { tokens: [], error: { code: 'E0001', start: 8, end: 9 } });
});

test('a semicolon is E0001 at the semicolon', () => {
  assert.deepEqual(src('fn main() io { };'), { tokens: [], error: { code: 'E0001', start: 16, end: 17 } });
});

test('a tab in code is E0001 at the tab, and the tokens before it are dropped', () => {
  assert.deepEqual(src('fn\tmain'), { tokens: [], error: { code: 'E0001', start: 2, end: 3 } });
});

test('an invalid UTF-8 byte is E0001 at that byte', () => {
  assert.deepEqual(bytes(0x66, 0x6e, 0xff), { tokens: [], error: { code: 'E0001', start: 2, end: 3 } });
});

test('a non-ASCII letter in an identifier is E0001 at its first byte, with its whole scalar span', () => {
  assert.deepEqual(src('let é = 1'), { tokens: [], error: { code: 'E0001', start: 4, end: 6 } });
});

test('a scanner error before a byte error is the one reported', () => {
  // E0006 at 0..3 comes before the tab at 4.
  assert.deepEqual(src('007 \t'), { tokens: [], error: { code: 'E0006', start: 0, end: 3 } });
});

test('a byte error before a scanner error is the one reported', () => {
  // The tab at 0 comes before the leading zero at 2.
  assert.deepEqual(src('\t 007'), { tokens: [], error: { code: 'E0001', start: 0, end: 1 } });
});

test('a byte error inside a comment still stops the scan, and is reported', () => {
  assert.deepEqual(src('fn // a\tb\nmain'), { tokens: [], error: { code: 'E0001', start: 7, end: 8 } });
});

test('a text literal is not lexed yet, so lex throws rather than mis-lex it', () => {
  assert.throws(() => src('print("a")'), /text literal at byte 6/);
});
