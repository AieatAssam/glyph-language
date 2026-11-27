// Text literals (RFC 0104 rule 9).
// A text literal starts at `"` and ends at the next `"`. Between the quotes are valid UTF-8
// characters other than `"`, `\` and the characters rule 2 forbids. A raw LF is content (byte
// 0x0A). The only escapes are `\"` and `\\`. The value is the decoded bytes, held as a string in
// `text`.
//
// Errors:
//   E0005 at the backslash and the next character, for any other backslash sequence. E0005 also
//         covers a literal that is not closed: the span runs from the opening quote to the end of
//         the file. A line feed does not close it.
//   E0001 at a forbidden control character (rule 2, which includes every CR) or a byte order mark
//         (rule 1) inside the literal. These are caught here, before the scan reaches the closing
//         quote.
// checkBytes has already checked the UTF-8 form of the whole file, so this file copies the bytes of
// a non-ASCII character without checking them again.
import { Buffer } from 'node:buffer';
import type { LexError } from './source.ts';
import { Kind, type Token } from './token.ts';

export type TextResult = { token: Token } | { error: LexError };

const DOUBLE_QUOTE = 0x22;
const BACKSLASH = 0x5c;
const CR = 0x0d;

// The byte each escape character decodes to: `"` gives a quote, `\` gives a backslash (rule 9).
const ESCAPES: ReadonlyMap<number, number> = new Map([
  [0x22, DOUBLE_QUOTE],
  [0x5c, BACKSLASH],
]);

// Byte length of the UTF-8 sequence that starts with this byte. ASCII and stray continuation bytes
// give 1; checkBytes has already rejected those, so the value only sizes a character to copy.
function scalarLength(lead: number): number {
  if (lead >= 0xf0) return 4;
  if (lead >= 0xe0) return 3;
  if (lead >= 0xc0) return 2;
  return 1;
}

// Offset just past the character that starts at i, clipped to the end of the file.
function charEnd(buf: Buffer, i: number): number {
  return Math.min(i + scalarLength(buf[i]), buf.length);
}

function fail(code: 'E0001' | 'E0005', start: number, end: number): TextResult {
  return { error: { code, start, end } };
}

// Reads the text literal whose opening quote is at pos. The caller calls this only on a quote; any
// other byte there is a caller error and throws a RangeError.
export function lexText(buf: Buffer, pos: number): TextResult {
  if (pos < 0 || pos >= buf.length) {
    throw new RangeError(`lexText: position ${pos} is outside the file`);
  }
  if (buf[pos] !== DOUBLE_QUOTE) {
    throw new RangeError(`lexText: byte ${buf[pos]} at ${pos} cannot start a text literal`);
  }
  const out: number[] = [];
  let i = pos + 1;
  while (i < buf.length) {
    const b = buf[i];
    if (b === DOUBLE_QUOTE) {
      return { token: { kind: Kind.TEXT, start: pos, end: i + 1, text: Buffer.from(out).toString('utf8') } };
    }
    // A raw LF is content (rule 9). Every CR is a control character (rule 2), so it is E0001 here.
    if (b === CR) return fail('E0001', i, i + 1);
    if (b === BACKSLASH) {
      const decoded = i + 1 < buf.length ? ESCAPES.get(buf[i + 1]) : undefined;
      if (decoded === undefined) {
        const end = i + 1 < buf.length ? charEnd(buf, i + 1) : buf.length;
        return fail('E0005', i, end);
      }
      out.push(decoded);
      i += 2;
      continue;
    }
    if (b < 0x20 || b === 0x7f) return fail('E0001', i, i + 1);
    if (b < 0x80) {
      out.push(b);
      i += 1;
      continue;
    }
    // A byte order mark is valid UTF-8 but is still an error (rule 1).
    if (b === 0xef && buf[i + 1] === 0xbb && buf[i + 2] === 0xbf) return fail('E0001', i, i + 3);
    const end = charEnd(buf, i);
    for (let k = i; k < end; k++) out.push(buf[k]);
    i = end;
  }
  // No closing quote before the end of the file: the span runs from the opening quote to the end.
  return fail('E0005', pos, buf.length);
}
