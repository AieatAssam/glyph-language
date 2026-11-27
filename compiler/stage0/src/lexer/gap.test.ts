// Tests for the gap check (RFC 0104 rule 4). A gap is the run of bytes between two tokens, or
// before the first or after the last. Each case is one byte string and one range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { checkGap, scanGap } from './gap.ts';

const buf = (text: string) => Buffer.from(text, 'utf8');

test('one space between two word bytes is the canonical gap', () => {
  assert.equal(checkGap(buf('a b'), 1, 2), null);
});

test('no gap between a word and punctuation is canonical', () => {
  assert.equal(checkGap(buf('a(b'), 1, 1), null);
  assert.equal(checkGap(buf('a{'), 1, 1), null);
});

test('a missing space between two word bytes is zero-length E0002, fixed by one space', () => {
  assert.deepEqual(checkGap(buf('a1'), 1, 1), {
    code: 'E0002', start: 1, end: 1, fix: { start: 1, end: 1, replacement: ' ' },
  });
});

test('a space before punctuation is E0002 with empty replacement', () => {
  assert.deepEqual(checkGap(buf('a (b'), 1, 2), {
    code: 'E0002', start: 1, end: 2, fix: { start: 1, end: 2, replacement: '' },
  });
});

test('two spaces between words are E0002, fixed by one space', () => {
  assert.deepEqual(checkGap(buf('a  b'), 1, 3), {
    code: 'E0002', start: 1, end: 3, fix: { start: 1, end: 3, replacement: ' ' },
  });
});

test('a line feed in a gap is E0002 with empty replacement', () => {
  assert.deepEqual(checkGap(buf('{\nput'), 1, 2), {
    code: 'E0002', start: 1, end: 2, fix: { start: 1, end: 2, replacement: '' },
  });
});

test('a space before the first token is E0002 with empty replacement', () => {
  assert.deepEqual(checkGap(buf(' a'), 0, 1), {
    code: 'E0002', start: 0, end: 1, fix: { start: 0, end: 1, replacement: '' },
  });
});

test('a line feed after the last token is E0002 with empty replacement', () => {
  assert.deepEqual(checkGap(buf('a\n'), 1, 2), {
    code: 'E0002', start: 1, end: 2, fix: { start: 1, end: 2, replacement: '' },
  });
});

test('an empty file has no gap', () => {
  assert.equal(checkGap(buf(''), 0, 0), null);
});

test('a tab in a gap is E0001 at the tab, not E0002', () => {
  assert.deepEqual(checkGap(buf('a\tb'), 1, 2), { code: 'E0001', start: 1, end: 2 });
});

test('a control character wins over a non-canonical gap, and it is the first one that counts', () => {
  assert.deepEqual(checkGap(buf('a \rb'), 1, 3), { code: 'E0001', start: 2, end: 3 });
});

test('scanGap takes spaces, line feeds and control characters, and stops at any other byte', () => {
  assert.equal(scanGap(buf('a \n\tb'), 1), 4);
  assert.equal(scanGap(buf('a(b'), 1), 1);
  assert.equal(scanGap(buf('a'), 1), 1);
});
