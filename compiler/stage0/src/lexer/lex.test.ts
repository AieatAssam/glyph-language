// Tests for lex (RFC 0014 rules 1 to 16). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from './index.ts';
import { Kind } from './token.ts';

const src = (text: string) => lex(Buffer.from(text, 'utf8'));
const bytes = (...b: number[]) => lex(Buffer.from(b));
const kinds = (text: string) => src(text).tokens.map((t) => t.kind);

const PROGRAM = 'fn main() io { print(1) }';

test('the walking-skeleton program gives its token kinds in order, ending in NEWLINE and EOF', () => {
  assert.deepEqual(kinds(PROGRAM), [
    Kind.KW_FN, Kind.IDENT, Kind.LPAREN, Kind.RPAREN, Kind.KW_IO,
    Kind.LBRACE, Kind.IDENT, Kind.LPAREN, Kind.INT, Kind.RPAREN, Kind.RBRACE,
    Kind.NEWLINE, Kind.EOF,
  ]);
  assert.equal(src(PROGRAM).error, null);
});

test('the program tokens have exact spans, and the names and digits keep their text', () => {
  const { tokens } = src(PROGRAM);
  assert.deepEqual(tokens[0], { kind: Kind.KW_FN, start: 0, end: 2 });
  assert.deepEqual(tokens[1], { kind: Kind.IDENT, start: 3, end: 7, text: 'main' });
  assert.deepEqual(tokens[8], { kind: Kind.INT, start: 21, end: 22, text: '1' });
  assert.deepEqual(tokens[11], { kind: Kind.NEWLINE, start: PROGRAM.length, end: PROGRAM.length });
  assert.deepEqual(tokens[12], { kind: Kind.EOF, start: PROGRAM.length, end: PROGRAM.length });
});

test('an LF after the program changes no token kind', () => {
  assert.deepEqual(kinds(PROGRAM + '\n'), kinds(PROGRAM));
});

test('a CR LF after the program is E0001 at the CR, with no tokens', () => {
  assert.deepEqual(src(PROGRAM + '\r\n'), { tokens: [], error: { code: 'E0001', start: 25, end: 26 } });
});

test('a comment is skipped, and a // inside it does not start a token', () => {
  assert.deepEqual(kinds('fn // print("x")\nmain'), [Kind.KW_FN, Kind.NEWLINE, Kind.IDENT, Kind.NEWLINE, Kind.EOF]);
});

test('an empty file gives only EOF at offset 0', () => {
  assert.deepEqual(src(''), { tokens: [{ kind: Kind.EOF, start: 0, end: 0 }], error: null });
});

test('a file of only spaces and LF gives only EOF, and a CR in it is E0001 at the CR', () => {
  assert.deepEqual(kinds('  \n\n '), [Kind.EOF]);
  assert.deepEqual(src('  \n\r\n '), { tokens: [], error: { code: 'E0001', start: 3, end: 4 } });
});

test('a file with no final line end still gets the final NEWLINE, and EOF is last', () => {
  assert.deepEqual(kinds('let a = 1'), [Kind.KW_LET, Kind.IDENT, Kind.ASSIGN, Kind.INT, Kind.NEWLINE, Kind.EOF]);
});

test('a file that ends inside ( ) gets no NEWLINE from its last line end', () => {
  assert.deepEqual(kinds('f(1'), [Kind.IDENT, Kind.LPAREN, Kind.INT, Kind.EOF]);
});

test('a line end inside ( ) gives no NEWLINE', () => {
  assert.deepEqual(kinds('f(1\n)'), [Kind.IDENT, Kind.LPAREN, Kind.INT, Kind.RPAREN, Kind.NEWLINE, Kind.EOF]);
});

test('==, !=, <= and >= are one token each', () => {
  assert.deepEqual(kinds('== != <= >='), [Kind.EQ, Kind.NE, Kind.LE, Kind.GE, Kind.NEWLINE, Kind.EOF]);
});

test('=> is = then >, and -> is - then >', () => {
  assert.deepEqual(kinds('=>'), [Kind.ASSIGN, Kind.GT, Kind.NEWLINE, Kind.EOF]);
  assert.deepEqual(kinds('->'), [Kind.MINUS, Kind.GT, Kind.NEWLINE, Kind.EOF]);
});

test('a text literal is lexed to a TEXT token with its decoded value', () => {
  const { tokens, error } = src('print("a")');
  assert.equal(error, null);
  assert.deepEqual(tokens[2], { kind: Kind.TEXT, start: 6, end: 9, text: 'a' });
  assert.deepEqual(tokens.map((t) => t.kind), [
    Kind.IDENT, Kind.LPAREN, Kind.TEXT, Kind.RPAREN, Kind.NEWLINE, Kind.EOF,
  ]);
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

// Cases from the tester's proposal for subtask 9. Offsets are bytes from 0.

test('case 1: a valid file with LF gives its kinds, a NEWLINE at 9..10 and EOF at 10', () => {
  assert.deepEqual(src('let a = 1\n'), {
    tokens: [
      { kind: Kind.KW_LET, start: 0, end: 3 },
      { kind: Kind.IDENT, start: 4, end: 5, text: 'a' },
      { kind: Kind.ASSIGN, start: 6, end: 7 },
      { kind: Kind.INT, start: 8, end: 9, text: '1' },
      { kind: Kind.NEWLINE, start: 9, end: 10 },
      { kind: Kind.EOF, start: 10, end: 10 },
    ],
    error: null,
  });
});

test('case 2: a file with CR LF is E0001 at the CR at 9..10, with no tokens', () => {
  assert.deepEqual(src('let a = 1\r\n'), { tokens: [], error: { code: 'E0001', start: 9, end: 10 } });
});

test('case 3: an empty file gives EOF at 0..0 only', () => {
  assert.deepEqual(src(''), { tokens: [{ kind: Kind.EOF, start: 0, end: 0 }], error: null });
});

test('case 4: E0005 at byte 10 is reported, not the tab at byte 30 that comes later', () => {
  const text = 'let a = 12"abc\nlet c = 4      \tx\n';
  assert.deepEqual(src(text), { tokens: [], error: { code: 'E0005', start: 10, end: 14 } });
});

test('case 5: a tab at byte 5 is reported, and the E0005 at byte 10 is not reached', () => {
  const text = 'let a\t= 12"abc\n';
  assert.deepEqual(src(text), { tokens: [], error: { code: 'E0001', start: 5, end: 6 } });
});

test('case 6: an invalid byte at 4 stops the scan, so the bad escape at 11 is not reported', () => {
  const text = Buffer.concat([Buffer.from('let '), Buffer.from([0xff]), Buffer.from(' a = "\\q"\n')]);
  assert.deepEqual(lex(text), { tokens: [], error: { code: 'E0001', start: 4, end: 5 } });
});

test('case 7: a tab inside a text literal is E0001 at the tab, not E0005', () => {
  assert.deepEqual(src('let a = "x\ty"\n'), { tokens: [], error: { code: 'E0001', start: 10, end: 11 } });
});
