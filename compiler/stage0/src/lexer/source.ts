// Whole-file byte checks: the context-free rules of RFC 0014 (rules 1 to 3).
// Rules that depend on the token around a character belong to the later lexer stages.

// A lexical error. `start` and `end` are byte offsets; `end` is exclusive.
export type LexError = {
  code: string;
  start: number;
  end: number;
};

const E0001 = 'E0001';

// Decodes the multi-byte UTF-8 sequence at `pos`. Returns null unless it is valid:
// overlong forms, surrogates and values above U+10FFFF are rejected by the range check.
function decodeAt(buf: Buffer, pos: number): { cp: number; len: number } | null {
  const b0 = buf[pos];
  let len: number;
  let cp: number;
  if (b0 >= 0xc2 && b0 <= 0xdf) {
    len = 2;
    cp = b0 & 0x1f;
  } else if (b0 >= 0xe0 && b0 <= 0xef) {
    len = 3;
    cp = b0 & 0x0f;
  } else if (b0 >= 0xf0 && b0 <= 0xf4) {
    len = 4;
    cp = b0 & 0x07;
  } else {
    return null;
  }
  if (pos + len > buf.length) return null;
  for (let i = 1; i < len; i++) {
    const b = buf[pos + i];
    if ((b & 0xc0) !== 0x80) return null;
    cp = (cp << 6) | (b & 0x3f);
  }
  const min = len === 2 ? 0x80 : len === 3 ? 0x800 : 0x10000;
  if (cp < min || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
  return { cp, len };
}

// Returns the first error by byte offset, or null if the bytes pass the whole-file rules.
export function checkBytes(buf: Buffer): LexError | null {
  const fail = (start: number, end: number): LexError => ({ code: E0001, start, end });
  let pos = 0;
  while (pos < buf.length) {
    const b = buf[pos];
    if (b === 0x0a) {
      pos += 1;
    } else if (b === 0x0d) {
      // A CR is allowed only as the first byte of a CR LF line end.
      if (buf[pos + 1] !== 0x0a) return fail(pos, pos + 1);
      pos += 2;
    } else if (b < 0x20 || b === 0x7f) {
      return fail(pos, pos + 1);
    } else if (b < 0x80) {
      pos += 1;
    } else {
      // An invalid sequence is reported at its lead byte, one byte long.
      const s = decodeAt(buf, pos);
      if (s === null) return fail(pos, pos + 1);
      if (s.cp === 0xfeff) return fail(pos, pos + s.len);
      pos += s.len;
    }
  }
  return null;
}
