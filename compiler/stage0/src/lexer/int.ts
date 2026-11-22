// Integer literals (RFC 0014 rule 8).
// A decimal literal is `0`, or a digit from 1 to 9 then zero or more digits. It has no sign and no
// underscore. The lexer records the digits as written.
//
// A digit sequence with a leading zero and more than one digit, such as `007` or `00`, is E0006
// over the whole sequence. The range check (at most 9223372036854775807) belongs to the checker
// (E0500), so this file does no value arithmetic.
import type { Buffer } from 'node:buffer';
import type { LexError } from './source.ts';
import { Kind, type Token } from './token.ts';

export type IntResult = { token: Token } | { error: LexError };

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

// Reads the integer literal that starts at pos. The caller calls this only where a token starts,
// and only on an ASCII digit; any other byte there is a caller error and throws a RangeError.
export function lexInt(buf: Buffer, pos: number): IntResult {
  if (pos < 0 || pos >= buf.length) {
    throw new RangeError(`lexInt: position ${pos} is outside the file`);
  }
  if (!isDigit(buf[pos])) {
    throw new RangeError(`lexInt: byte ${buf[pos]} at ${pos} cannot start an integer`);
  }
  let end = pos + 1;
  while (end < buf.length && isDigit(buf[end])) end += 1;
  if (buf[pos] === 0x30 && end - pos > 1) {
    return { error: { code: 'E0006', start: pos, end } };
  }
  // Only ASCII digits were read, so latin1 decodes them exactly.
  return { token: { kind: Kind.INT, start: pos, end, text: buf.toString('latin1', pos, end) } };
}
