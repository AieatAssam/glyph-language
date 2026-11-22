// NEWLINE and EOF (RFC 0014 rules 14 and 15). The driver feeds this stage the tokens and the
// line-end spans in source order, and the stage decides where a NEWLINE goes. It reads no bytes.
//
// State: the parenthesis depth (`(` adds one; `)` subtracts one and stops at zero), and the last
// kind emitted. The last kind is null until a token has been emitted, which is the "any token yet"
// flag of rule 14.
//
// ponytail: the driver must call finish with the file length. The virtual line end at the end of
// the file has zero width, at that offset. Ceiling: none known. Upgrade path: none needed.
import type { Span } from './trivia.ts';
import { Kind, type Token } from './token.ts';

export class NewlineStage {
  // The tokens emitted so far, in source order.
  readonly tokens: Token[] = [];
  private depth = 0;
  private last: Kind | null = null;

  // Adds a token from the driver. The driver never passes NEWLINE or EOF; this stage makes them.
  token(t: Token): void {
    if (t.kind === Kind.NEWLINE || t.kind === Kind.EOF) {
      throw new Error('newline: NEWLINE and EOF are made by this stage, not fed in');
    }
    if (t.kind === Kind.LPAREN) this.depth += 1;
    if (t.kind === Kind.RPAREN && this.depth > 0) this.depth -= 1;
    this.tokens.push(t);
    this.last = t.kind;
  }

  // Passes a line end. It emits one NEWLINE with the line end's span, if the depth is zero, a
  // token has been emitted, and the last kind is not NEWLINE (rule 14).
  lineEnd(span: Span): void {
    if (this.depth !== 0 || this.last === null || this.last === Kind.NEWLINE) return;
    this.tokens.push({ kind: Kind.NEWLINE, start: span.start, end: span.end });
    this.last = Kind.NEWLINE;
  }

  // Ends the file at offset eof (rule 15). The last line ends as if a line end were there, then EOF
  // is emitted. Returns every token, EOF last.
  finish(eof: number): Token[] {
    this.lineEnd({ start: eof, end: eof });
    this.tokens.push({ kind: Kind.EOF, start: eof, end: eof });
    return this.tokens;
  }
}
