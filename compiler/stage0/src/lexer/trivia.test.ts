// Tests for skipTrivia (RFC 0014 rules 3 to 5). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { skipTrivia } from './trivia.ts';

const at = (text: string, pos = 0) => skipTrivia(Buffer.from(text, 'utf8'), pos);

test('CR LF is one line end of two bytes', () => {
  assert.deepEqual(at('\r\nx'), { pos: 2, lineEnds: [{ start: 0, end: 2 }] });
});

test('a lone LF is one line end of one byte', () => {
  assert.deepEqual(at('\nx'), { pos: 1, lineEnds: [{ start: 0, end: 1 }] });
});

test('a comment ends before its LF, and the LF is the line end', () => {
  // "// abc" is bytes 0 to 5, the LF is byte 6, and x is byte 7.
  assert.deepEqual(at('// abc\nx'), { pos: 7, lineEnds: [{ start: 6, end: 7 }] });
});

test('a comment ends before the CR of a CR LF, and the pair is one line end', () => {
  // "// a" is bytes 0 to 3, CR is byte 4, LF is byte 5, and x is byte 6.
  assert.deepEqual(at('// a\r\nx'), { pos: 6, lineEnds: [{ start: 4, end: 6 }] });
});

test('a double quote inside a comment is ignored', () => {
  // The comment is bytes 0 to 4 ("// " then a quote and a), then LF at 5 and b at 6.
  assert.deepEqual(at('// "a\nb'), { pos: 6, lineEnds: [{ start: 5, end: 6 }] });
});

test('a comment at the end of the file, with no line end, gives no line end', () => {
  assert.deepEqual(at('// end'), { pos: 6, lineEnds: [] });
});

test('a line end at the end of the file is passed', () => {
  assert.deepEqual(at('a\n', 1), { pos: 2, lineEnds: [{ start: 1, end: 2 }] });
});

test('a CR LF at the end of the file is one two-byte line end', () => {
  assert.deepEqual(at('a\r\n', 1), { pos: 3, lineEnds: [{ start: 1, end: 3 }] });
});

test('spaces are skipped and produce no line end', () => {
  assert.deepEqual(at('   x'), { pos: 3, lineEnds: [] });
});

test('spaces around a line end are skipped, and the line end is recorded', () => {
  assert.deepEqual(at('  \n  x'), { pos: 5, lineEnds: [{ start: 2, end: 3 }] });
});

test('a tab is not skipped', () => {
  assert.deepEqual(at('\t// c\n'), { pos: 0, lineEnds: [] });
});

test('a lone CR is not skipped, because it is not a line end', () => {
  assert.deepEqual(at('\rx'), { pos: 0, lineEnds: [] });
});

test('a single slash is not a comment', () => {
  assert.deepEqual(at('/ 1'), { pos: 0, lineEnds: [] });
});

test('trivia stops at the first token byte and reports every line end before it', () => {
  // "// one" LF (bytes 0 to 6), blank LF (byte 7), "  // two" (bytes 8 to 15), CR LF (bytes 16 to 17),
  // then the token at byte 18.
  const text = '// one\n\n  // two\r\nlet';
  const r = at(text);
  assert.equal(r.pos, text.indexOf('let'));
  assert.deepEqual(r.lineEnds, [
    { start: 6, end: 7 },
    { start: 7, end: 8 },
    { start: 16, end: 18 },
  ]);
});

test('the start position is honoured: bytes before pos are not read', () => {
  assert.deepEqual(at('x\n y', 1), { pos: 3, lineEnds: [{ start: 1, end: 2 }] });
});

test('an empty buffer, or a position at the end, gives the position back with no line ends', () => {
  assert.deepEqual(at(''), { pos: 0, lineEnds: [] });
  assert.deepEqual(at('ab', 2), { pos: 2, lineEnds: [] });
});
