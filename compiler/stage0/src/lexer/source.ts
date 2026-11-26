// Whole-file byte checks for a Glyph source file (RFC 0048 rules 1 and 2, and the LF of rule 3). This
// is the first lexical stage. It reads no tokens and knows nothing of comments or text literals, so
// it rejects a forbidden character wherever it appears. CR is a control character, so it is an error
// wherever it appears, including in a CR LF pair (RFC 0048 rule 2).
//
// Error position: a broken UTF-8 sequence is reported at the first byte of that sequence. This is
// the lead byte, so a byte that starts an ill-formed sequence is always the reported byte, even
// when the sequence is cut short by the end of the file.

export type LexError = { code: string; start: number; end: number };

const LF = 0x0a;

function fail(start: number, end: number): LexError {
  return { code: 'E0001', start, end };
}

// Length of the UTF-8 sequence that starts with this lead byte, or 0 if no sequence starts with it.
// Overlong leads (C0, C1) and leads above F4 are not valid.
function sequenceLength(lead: number): number {
  if (lead >= 0xc2 && lead <= 0xdf) return 2;
  if (lead >= 0xe0 && lead <= 0xef) return 3;
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  return 0;
}

// Range of the second byte. It is narrower than 80 to BF for E0, ED, F0 and F4, which rules out
// overlong forms, surrogates and code points above U+10FFFF.
function secondByteRange(lead: number): [number, number] {
  if (lead === 0xe0) return [0xa0, 0xbf];
  if (lead === 0xed) return [0x80, 0x9f];
  if (lead === 0xf0) return [0x90, 0xbf];
  if (lead === 0xf4) return [0x80, 0x8f];
  return [0x80, 0xbf];
}

// Returns the first error in the file, by byte offset, or null if the file passes these rules.
export function checkBytes(buf: Buffer): LexError | null {
  const n = buf.length;
  let i = 0;
  while (i < n) {
    const b = buf[i];

    if (b < 0x80) {
      if (b === LF) {
        i += 1;
        continue;
      }
      // U+0000 to U+001F and U+007F, which includes tab and CR (RFC 0048 rule 2).
      if (b < 0x20 || b === 0x7f) {
        return fail(i, i + 1);
      }
      i += 1;
      continue;
    }

    const len = sequenceLength(b);
    if (len === 0) {
      return fail(i, i + 1);
    }
    const [lo, hi] = secondByteRange(b);
    for (let k = 1; k < len; k++) {
      const next = i + k < n ? buf[i + k] : -1;
      const [min, max] = k === 1 ? [lo, hi] : [0x80, 0xbf];
      if (next < min || next > max) {
        return fail(i, i + 1);
      }
    }

    // U+FEFF, the byte order mark, is valid UTF-8 (EF BB BF) and is still an error anywhere.
    if (len === 3 && b === 0xef && buf[i + 1] === 0xbb && buf[i + 2] === 0xbf) {
      return fail(i, i + 3);
    }
    i += len;
  }
  return null;
}
