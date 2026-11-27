// Trivia: spaces and line ends (RFC 0104 rules 3 and 5). There are no comments: `//` is two `/`
// tokens, so this file never skips a slash.
// The caller passes a byte position and gets back the position of the next token byte, plus the
// line-end spans it passed. Subtask 8 uses the line-end spans to emit NEWLINE. A tab is not
// trivia (rule 2, already rejected by checkBytes), so skipTrivia stops at it, and so it stops at
// any other byte that is not a space or a line end.

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

// Skips spaces and line ends from `pos`, and stops at the first other byte.
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
    break;
  }
  return { pos: i, lineEnds };
}
