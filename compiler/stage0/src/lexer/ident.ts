// Words: identifiers and keywords (RFC 0014 rules 6, 7 and 16).
// A word is one ASCII letter or `_`, then ASCII letters, digits or `_`. A word whose spelling is one
// of the fourteen lowercase keywords gets that keyword's kind. Any other word is IDENT, and keeps
// its spelling in `text`. Keywords carry no text.
//
// A byte of 0x80 or more where a token starts is not a word. It is error E0001 at that character,
// which is one whole UTF-8 scalar. checkBytes has already rejected invalid UTF-8, so the lead byte
// gives the scalar's length.
import type { Buffer } from 'node:buffer';
import type { LexError } from './source.ts';
import { Kind, keywordKind, type Token } from './token.ts';

export type WordResult = { token: Token } | { error: LexError };

function isLetter(b: number): boolean {
  return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a);
}

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

function isStart(b: number): boolean {
  return isLetter(b) || b === 0x5f;
}

function isPart(b: number): boolean {
  return isStart(b) || isDigit(b);
}

// Byte length of the UTF-8 sequence that starts with this lead byte.
function scalarLength(lead: number): number {
  if (lead >= 0xf0) return 4;
  if (lead >= 0xe0) return 3;
  if (lead >= 0xc0) return 2;
  return 1;
}

// Reads the word that starts at pos. The caller calls this only where a token starts, and only on
// a byte that is an ASCII letter, `_` or 0x80 or more; any other byte there is a caller error and
// throws a RangeError. Returns the token, or E0001 for a non-ASCII character at the token start.
export function lexWord(buf: Buffer, pos: number): WordResult {
  if (pos < 0 || pos >= buf.length) {
    throw new RangeError(`lexWord: position ${pos} is outside the file`);
  }
  const first = buf[pos];
  if (first >= 0x80) {
    const len = Math.min(scalarLength(first), buf.length - pos);
    return { error: { code: 'E0001', start: pos, end: pos + len } };
  }
  if (!isStart(first)) {
    throw new RangeError(`lexWord: byte ${first} at ${pos} cannot start a word`);
  }
  let end = pos + 1;
  while (end < buf.length && isPart(buf[end])) end += 1;
  // Only ASCII bytes were read, so latin1 decodes them exactly.
  const text = buf.toString('latin1', pos, end);
  const kind = keywordKind(text);
  if (kind !== null) return { token: { kind, start: pos, end } };
  return { token: { kind: Kind.IDENT, start: pos, end, text } };
}
