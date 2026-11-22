// Punctuation and operator tokens (RFC 0014 rules 10 and 11).
// lexPunct takes the longest of the eighteen tokens that starts at pos, reading at most one byte
// ahead. Only `==`, `!=`, `<=` and `>=` are two bytes long, so `=>` lexes as `=` then `>`, and `->`
// lexes as `-` then `>`. A byte that starts no token is error E0001 at that byte (rule 11). That
// covers `!` not followed by `=`, `;`, `[`, `]`, `.`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`,
// backtick, and `\` outside a text literal.
//
// The caller skips trivia first, so `//` never reaches this file. Words, integers and text literals
// are lexed by their own files, so a letter, digit, `_` or `"` here is a caller error.
import type { Buffer } from 'node:buffer';
import type { LexError } from './source.ts';
import { PUNCTUATION_KIND, type Punctuation, type Token } from './token.ts';

export type PunctResult = { token: Token } | { error: LexError };

function isPunctuation(spelling: string): spelling is Punctuation {
  return Object.hasOwn(PUNCTUATION_KIND, spelling);
}

// True for a byte that another lexer owns: a letter, digit, `_` or the text quote.
function belongsElsewhere(b: number): boolean {
  return (
    (b >= 0x30 && b <= 0x39) ||
    (b >= 0x41 && b <= 0x5a) ||
    (b >= 0x61 && b <= 0x7a) ||
    b === 0x5f ||
    b === 0x22
  );
}

// Reads the punctuation token that starts at pos. The caller calls this only on a printable ASCII
// byte that is not a letter, digit, `_` or quote; any other byte there is a caller error and throws
// a RangeError.
export function lexPunct(buf: Buffer, pos: number): PunctResult {
  if (pos < 0 || pos >= buf.length) {
    throw new RangeError(`lexPunct: position ${pos} is outside the file`);
  }
  const b = buf[pos];
  if (b <= 0x20 || b > 0x7e || belongsElsewhere(b)) {
    throw new RangeError(`lexPunct: byte ${b} at ${pos} does not start a punctuation token`);
  }
  // The one byte of lookahead. The two-byte spelling is tried first, so the longest match wins.
  if (pos + 1 < buf.length) {
    const pair = buf.toString('latin1', pos, pos + 2);
    if (isPunctuation(pair)) {
      return { token: { kind: PUNCTUATION_KIND[pair], start: pos, end: pos + 2 } };
    }
  }
  const single = buf.toString('latin1', pos, pos + 1);
  if (isPunctuation(single)) {
    return { token: { kind: PUNCTUATION_KIND[single], start: pos, end: pos + 1 } };
  }
  return { error: { code: 'E0001', start: pos, end: pos + 1 } };
}
