// Tests for skipTrivia (RFC 0104 rules 3 and 5). Each case is one byte string; no file is read.
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

test('there are no comments: // is not skipped, and stops trivia at its first slash', () => {
  assert.deepEqual(at('// abc\nx'), { pos: 0, lineEnds: [] });
  assert.deepEqual(at('// a\r\nx'), { pos: 0, lineEnds: [] });
  assert.deepEqual(at('// "a\nb'), { pos: 0, lineEnds: [] });
  assert.deepEqual(at('// end'), { pos: 0, lineEnds: [] });
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
  assert.deepEqual(at('\t x\n'), { pos: 0, lineEnds: [] });
});

test('a lone CR is not skipped, because it is not a line end', () => {
  assert.deepEqual(at('\rx'), { pos: 0, lineEnds: [] });
});

test('a single slash is not trivia', () => {
  assert.deepEqual(at('/ 1'), { pos: 0, lineEnds: [] });
});

test('trivia stops at the first token byte and reports every line end before it', () => {
  // LF at 0, two spaces, CR LF at 3 and 4, LF at 5, then the token at byte 6.
  const text = '\n  \r\n\nlet';
  const r = at(text);
  assert.equal(r.pos, text.indexOf('let'));
  assert.deepEqual(r.lineEnds, [
    { start: 0, end: 1 },
    { start: 3, end: 5 },
    { start: 5, end: 6 },
  ]);
});

test('the start position is honoured: bytes before pos are not read', () => {
  assert.deepEqual(at('x\n y', 1), { pos: 3, lineEnds: [{ start: 1, end: 2 }] });
});

test('an empty buffer, or a position at the end, gives the position back with no line ends', () => {
  assert.deepEqual(at(''), { pos: 0, lineEnds: [] });
  assert.deepEqual(at('ab', 2), { pos: 2, lineEnds: [] });
});
