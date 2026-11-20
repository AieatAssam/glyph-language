// Trivia: spaces, line ends and // comments (RFC 0014 rules 3 to 5).
// The caller passes a byte position and gets back the position of the next token byte, plus the
// line-end spans it passed. Subtask 8 uses the line-end spans to emit NEWLINE. A tab is not
// trivia (rule 2, already rejected by checkBytes), so skipTrivia stops at it, and so it stops at
// any other byte that is not a space, a line end or the start of a comment.

export interface Span {
  start: number;
  end: number;
}

export interface TriviaResult {
  // Byte offset of the first byte that is not trivia, or buf.length.
  pos: number;
  // Each line end passed, in order. A CR LF pair is one span of two bytes.
  lineEnds: Span[];
}

const SPACE = 0x20;
const LF = 0x0a;
const CR = 0x0d;
const SLASH = 0x2f;

// Returns the offset of the line end that ends the comment starting at `start`, or buf.length if
// the comment runs to the end of the file. The comment does not include that line end. A CR that
// is not followed by LF is part of the comment here; checkBytes has already rejected it.
function commentEnd(buf: Buffer, start: number): number {
  const n = buf.length;
  let i = start + 2;
  while (i < n) {
    if (buf[i] === LF) return i;
    if (buf[i] === CR && i + 1 < n && buf[i + 1] === LF) return i;
    i += 1;
  }
  return n;
}

// Skips spaces, line ends and comments from `pos`, and stops at the first other byte.
export function skipTrivia(buf: Buffer, pos: number): TriviaResult {
  const n = buf.length;
  const lineEnds: Span[] = [];
  let i = pos;
  while (i < n) {
    const b = buf[i];
    if (b === SPACE) {
      i += 1;
      continue;
    }
    if (b === LF) {
      lineEnds.push({ start: i, end: i + 1 });
      i += 1;
      continue;
    }
    if (b === CR && i + 1 < n && buf[i + 1] === LF) {
      lineEnds.push({ start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (b === SLASH && i + 1 < n && buf[i + 1] === SLASH) {
      i = commentEnd(buf, i);
      continue;
    }
    break;
  }
  return { pos: i, lineEnds };
}
