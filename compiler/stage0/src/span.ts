// Byte offset to 1-based line and 1-based byte column (RFC 0004 section 2).
// A line ends at LF (0x0A). CR is an ordinary byte, so it takes a column in the line it ends.
// Offsets and columns count bytes of the UTF-8 buffer, so a multibyte character takes one
// column per byte. The open question in RFC 0004 is settled as bytes here.

export interface Position {
  line: number;
  column: number;
}

const LF = 0x0a;

// Returns the line and byte column of `offset`. An offset equal to the buffer length is the end
// of the file, which is a valid position. Any other offset outside 0..length is an error.
// ponytail: scans from the start of the buffer on every call, so a file with many lookups costs
// O(lookups * length). Upgrade path: build the line-start offsets once and binary-search them.
export function positionOf(bytes: Uint8Array, offset: number): Position {
  if (!Number.isInteger(offset) || offset < 0 || offset > bytes.length) {
    throw new RangeError(`offset ${offset} is outside 0..${bytes.length}`);
  }
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (bytes[i] === LF) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}
