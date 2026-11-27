// Tests for lex (RFC 0104 rules 1 to 13). Each case is one byte string; no file is read.
// Programs are in canonical layout (RFC 0104 rule 4) unless the test is about layout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from './index.ts';
import { Kind } from './token.ts';

const src = (text: string) => lex(Buffer.from(text, 'utf8'));
const bytes = (...b: number[]) => lex(Buffer.from(b));
const kinds = (text: string) => src(text).tokens.map((t) => t.kind);

const PROGRAM = 'main io{put 1}';

test('the walking-skeleton program gives its token kinds in order, ending in NEWLINE and EOF', () => {
  assert.deepEqual(kinds(PROGRAM), [
    Kind.IDENT, Kind.KW_IO, Kind.LBRACE, Kind.KW_PUT, Kind.INT, Kind.RBRACE,
    Kind.NEWLINE, Kind.EOF,
  ]);
  assert.equal(src(PROGRAM).error, null);
});

test('the program tokens have exact spans, and the names and digits keep their text', () => {
  const { tokens } = src(PROGRAM);
  assert.deepEqual(tokens[0], { kind: Kind.IDENT, start: 0, end: 4, text: 'main' });
  assert.deepEqual(tokens[1], { kind: Kind.KW_IO, start: 5, end: 7 });
  assert.deepEqual(tokens[4], { kind: Kind.INT, start: 12, end: 13, text: '1' });
  assert.deepEqual(tokens[6], { kind: Kind.NEWLINE, start: PROGRAM.length, end: PROGRAM.length });
  assert.deepEqual(tokens[7], { kind: Kind.EOF, start: PROGRAM.length, end: PROGRAM.length });
});

test('an LF after the program is E0002 at the LF, and a CR LF is E0001 at the CR', () => {
  assert.deepEqual(src(PROGRAM + '\n'), {
    tokens: [],
    error: { code: 'E0002', start: 14, end: 15, fix: { start: 14, end: 15, replacement: '' } },
  });
  assert.deepEqual(src(PROGRAM + '\r\n'), { tokens: [], error: { code: 'E0001', start: 14, end: 15 } });
});

test('there are no comments: // is two SLASH tokens, and the text after it is lexed (RFC 0104 rule 5)', () => {
  assert.deepEqual(kinds('1//2'), [Kind.INT, Kind.SLASH, Kind.SLASH, Kind.INT, Kind.NEWLINE, Kind.EOF]);
  assert.deepEqual(kinds('fn//"x"'), [Kind.IDENT, Kind.SLASH, Kind.SLASH, Kind.TEXT, Kind.NEWLINE, Kind.EOF]);
});

test('a ; or : in a program is E0001 at that character, and nothing is lexed', () => {
  assert.deepEqual(src('let a:Int=1'), { tokens: [], error: { code: 'E0001', start: 5, end: 6 } });
  assert.deepEqual(src('put 1;'), { tokens: [], error: { code: 'E0001', start: 5, end: 6 } });
});

test('an empty file gives only EOF at offset 0', () => {
  assert.deepEqual(src(''), { tokens: [{ kind: Kind.EOF, start: 0, end: 0 }], error: null });
});

test('a file of spaces and LFs is one gap, E0002 over all of it; a CR in it is E0001 at the CR', () => {
  assert.deepEqual(src('  \n\n '), {
    tokens: [],
    error: { code: 'E0002', start: 0, end: 5, fix: { start: 0, end: 5, replacement: '' } },
  });
  assert.deepEqual(src('  \n\r\n '), { tokens: [], error: { code: 'E0001', start: 3, end: 4 } });
});

test('a file with no final line end still gets the final NEWLINE, and EOF is last', () => {
  assert.deepEqual(kinds('let a=1'), [Kind.KW_LET, Kind.IDENT, Kind.ASSIGN, Kind.INT, Kind.NEWLINE, Kind.EOF]);
});

test('a file that ends inside ( ) gets no NEWLINE from its last line end', () => {
  assert.deepEqual(kinds('f(1'), [Kind.IDENT, Kind.LPAREN, Kind.INT, Kind.EOF]);
});

test('a line feed inside ( ) is E0002 too: rule 4 has no exception for parentheses', () => {
  assert.deepEqual(src('f(1\n)'), {
    tokens: [],
    error: { code: 'E0002', start: 3, end: 4, fix: { start: 3, end: 4, replacement: '' } },
  });
});

test('==, !=, <= and >= are one token each', () => {
  assert.deepEqual(kinds('==!=<=>='), [Kind.EQ, Kind.NE, Kind.LE, Kind.GE, Kind.NEWLINE, Kind.EOF]);
});

test('=> is = then >, and -> is - then >', () => {
  assert.deepEqual(kinds('=>'), [Kind.ASSIGN, Kind.GT, Kind.NEWLINE, Kind.EOF]);
  assert.deepEqual(kinds('->'), [Kind.MINUS, Kind.GT, Kind.NEWLINE, Kind.EOF]);
});

test('a text literal is lexed to a TEXT token with its decoded value', () => {
  const { tokens, error } = src('put("a")');
  assert.equal(error, null);
  assert.deepEqual(tokens[2], { kind: Kind.TEXT, start: 4, end: 7, text: 'a' });
  assert.deepEqual(tokens.map((t) => t.kind), [
    Kind.KW_PUT, Kind.LPAREN, Kind.TEXT, Kind.RPAREN, Kind.NEWLINE, Kind.EOF,
  ]);
});

test('an integer with a leading zero is E0006 over the whole literal, with no tokens', () => {
  assert.deepEqual(src('007'), {
    tokens: [],
    error: { code: 'E0006', start: 0, end: 3, fix: { start: 0, end: 3, replacement: '7' } },
  });
});

test('a lone ! is E0001 at the !', () => {
  assert.deepEqual(src('let a=!true'), { tokens: [], error: { code: 'E0001', start: 6, end: 7 } });
});

test('a semicolon is E0001 at the semicolon', () => {
  assert.deepEqual(src('fn main()io{};'), { tokens: [], error: { code: 'E0001', start: 13, end: 14 } });
});

test('a tab in code is E0001 at the tab, and the tokens before it are dropped', () => {
  assert.deepEqual(src('fn\tmain'), { tokens: [], error: { code: 'E0001', start: 2, end: 3 } });
});

test('an invalid UTF-8 byte is E0001 at that byte', () => {
  assert.deepEqual(bytes(0x66, 0x6e, 0xff), { tokens: [], error: { code: 'E0001', start: 2, end: 3 } });
});

test('a non-ASCII letter in an identifier is E0001 at its first byte, with its whole scalar span', () => {
  assert.deepEqual(src('let\u00e9=1'), { tokens: [], error: { code: 'E0001', start: 3, end: 5 } });
});

test('a scanner error before a byte error is the one reported', () => {
  // E0006 at 0..3 comes before the tab at 4.
  assert.deepEqual(src('007\t'), {
    tokens: [],
    error: { code: 'E0006', start: 0, end: 3, fix: { start: 0, end: 3, replacement: '7' } },
  });
});

test('a byte error before a scanner error is the one reported', () => {
  // The tab at 0 comes before the leading zero at 2.
  assert.deepEqual(src('\t 007'), { tokens: [], error: { code: 'E0001', start: 0, end: 1 } });
});

test('there are no comments, so a tab after // is E0001 at the tab', () => {
  assert.deepEqual(src('fn//a\tb'), { tokens: [], error: { code: 'E0001', start: 5, end: 6 } });
});

// Cases from the tester's proposal for subtask 9. Offsets are bytes from 0.

test('case 1: a valid file gives its tokens, a NEWLINE at 7..7 and EOF at 7', () => {
  assert.deepEqual(src('let a=1'), {
    tokens: [
      { kind: Kind.KW_LET, start: 0, end: 3 },
      { kind: Kind.IDENT, start: 4, end: 5, text: 'a' },
      { kind: Kind.ASSIGN, start: 5, end: 6 },
      { kind: Kind.INT, start: 6, end: 7, text: '1' },
      { kind: Kind.NEWLINE, start: 7, end: 7 },
      { kind: Kind.EOF, start: 7, end: 7 },
    ],
    error: null,
  });
});

test('case 2: a file with CR LF is E0001 at the CR, and no tokens', () => {
  assert.deepEqual(src('let a=1\r\n'), { tokens: [], error: { code: 'E0001', start: 7, end: 8 } });
});

test('case 3: an empty file gives EOF at 0..0 only', () => {
  assert.deepEqual(src(''), { tokens: [{ kind: Kind.EOF, start: 0, end: 0 }], error: null });
});

test('case 4: a raw LF is text content (rule 9), so the literal runs on to the tab at byte 20, which is E0001', () => {
  const text = 'let a=12"abc\nlet c=4\tx\n';
  assert.deepEqual(src(text), { tokens: [], error: { code: 'E0001', start: 20, end: 21 } });
});

test('RFC 0104 rule 9 examples: "x" is x, a raw LF is content, and \\" and \\\\ decode', () => {
  assert.deepEqual(kinds('main io{put"x"}'), [
    Kind.IDENT, Kind.KW_IO, Kind.LBRACE, Kind.KW_PUT, Kind.TEXT, Kind.RBRACE, Kind.NEWLINE, Kind.EOF,
  ]);
  assert.deepEqual(src('put"a\nb"').tokens[1], { kind: Kind.TEXT, start: 3, end: 8, text: 'a\nb' });
  assert.deepEqual(src('put"a\\"b\\\\c"').tokens[1], { kind: Kind.TEXT, start: 3, end: 12, text: 'a"b\\c' });
});

test('"\\n" is E0005 at 12 to 14 of main io{put"\\n"}: the backslash and the n', () => {
  assert.deepEqual(src('main io{put"\\n"}'), { tokens: [], error: { code: 'E0005', start: 12, end: 14 } });
});

test('put"ab at end of file is E0005 at 11 to 14, from the quote to the end of the file', () => {
  assert.deepEqual(src('main io{put"ab'), { tokens: [], error: { code: 'E0005', start: 11, end: 14 } });
});

test('a byte order mark at byte 0 is E0001 over its three bytes', () => {
  assert.deepEqual(src('\u{feff}main io{}'), { tokens: [], error: { code: 'E0001', start: 0, end: 3 } });
});

test('case 5: a tab at byte 5 is reported, and the E0005 at byte 10 is not reached', () => {
  const text = 'let a\t=12"abc\n';
  assert.deepEqual(src(text), { tokens: [], error: { code: 'E0001', start: 5, end: 6 } });
});

test('case 6: a space before an invalid byte is E0002 first, so the bad escape after it is not reported', () => {
  const text = Buffer.concat([Buffer.from('let '), Buffer.from([0xff]), Buffer.from(' a="\\q"\n')]);
  assert.deepEqual(lex(text), {
    tokens: [],
    error: { code: 'E0002', start: 3, end: 4, fix: { start: 3, end: 4, replacement: '' } },
  });
});

test('case 7: a tab inside a text literal is E0001 at the tab, not E0005', () => {
  assert.deepEqual(src('let a="x\ty"\n'), { tokens: [], error: { code: 'E0001', start: 8, end: 9 } });
});
