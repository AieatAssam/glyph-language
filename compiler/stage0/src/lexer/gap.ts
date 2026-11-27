// Gaps: the bytes between two tokens, or before the first or after the last (RFC 0104 rule 4).
// A gap is the run of spaces, line feeds and control characters. Any other byte starts a token or
// is an error that the token scanner reports.
//
// Each gap is checked in order. First, a control character in it other than LF is E0001 at the
// first one (rule 2). Otherwise a gap that is not the canonical gap is E0002. The canonical gap is
// one space when the byte before the gap and the byte after it are both word characters, and
// nothing otherwise. The E0002 span is the gap, zero-length where a space is missing, and its fix
// replaces the gap with the canonical gap.
//
// The byte before a gap is the last byte of the token before it, because the lexer starts each gap
// where the previous token ends. The byte after a gap is the first byte of the next token, or a
// byte the token scanner will reject. A word character is ASCII, so a byte of 0x80 or more is not
// one: that rule holds whether or not a token follows.
import type { Buffer } from 'node:buffer';
import type { LexError } from './source.ts';

const SPACE = 0x20;
const LF = 0x0a;

function isControl(b: number): boolean {
  return b < 0x20 || b === 0x7f;
}

// An ASCII letter, a digit or `_` (RFC 0104 rule 6, and the word character of rule 4).
function isWord(b: number): boolean {
  return (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x5f;
}

// The end of the gap that starts at pos: the first byte at or after pos that is not a space, a
// line feed or a control character. Returns buf.length if the gap runs to the end of the file.
export function scanGap(buf: Buffer, pos: number): number {
  let i = pos;
  while (i < buf.length && (buf[i] === SPACE || buf[i] === LF || isControl(buf[i]))) i += 1;
  return i;
}

// Checks the gap from start to end (the bytes start..end-1). Returns the first error, or null if
// the gap is the canonical gap.
export function checkGap(buf: Buffer, start: number, end: number): LexError | null {
  for (let i = start; i < end; i += 1) {
    const b = buf[i];
    if (b !== SPACE && b !== LF && isControl(b)) return { code: 'E0001', start: i, end: i + 1 };
  }
  const before = start > 0 && isWord(buf[start - 1]);
  const after = end < buf.length && isWord(buf[end]);
  const canonical = before && after ? ' ' : '';
  // The gap is canonical when it has the canonical length and, for a space, holds that space.
  if (end - start === canonical.length && (canonical === '' || buf[start] === SPACE)) return null;
  return { code: 'E0002', start, end, fix: { start, end, replacement: canonical } };
}
