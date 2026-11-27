// Syntax errors (RFC 0104 Diagnostics; G3, G13). Every parser error is one of two codes:
//   E0003  a keyword where an IDENT is required: a declaration name, a parameter name, or the name
//          after `let` or `var` (G3). The span is the keyword.
//   E0100  any other token the grammar does not accept at its position, including the EOF token
//          when the grammar needs more tokens (G13). The span is the token.
import { KEYWORD_KIND, type Token } from '../lexer/token.ts';

export type SyntaxCode = 'E0003' | 'E0100';

export interface ParseError {
  code: SyntaxCode;
  start: number;
  end: number;
}

const KEYWORD_KINDS: ReadonlySet<number> = new Set(Object.values(KEYWORD_KIND));

// E0100 at the token.
export function errAt(t: Token): ParseError {
  return { code: 'E0100', start: t.start, end: t.end };
}

// The error for a token where an IDENT is required (G3). A keyword there is E0003; any other token
// is E0100, as errAt gives.
export function nameErr(t: Token): ParseError {
  if (KEYWORD_KINDS.has(t.kind)) return { code: 'E0003', start: t.start, end: t.end };
  return errAt(t);
}
