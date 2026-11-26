// Front-end diagnostics for `check FILE` (RFC 0048 subtask 12; records as RFC 0050 section 2): lex
// the source, then parse it, and return one record for the first lexical or syntax error. A valid
// file gives no record, and the caller decides what a valid file means (main.ts passes it on to cli.ts).
//
// ponytail: one record at most, since the lexer and parser stop at their first error (RFC 0048
// rule 13 and G12). Ceiling: no checker, so E0500 and the other checker codes are not reported.
// Upgrade path: the checker RFC adds its own pass after the parser and returns a list.
import type { Buffer } from 'node:buffer';
import { type Diagnostic } from './diagnostic.ts';
import { lex } from './lexer/index.ts';
import { parse } from './parser/parse.ts';

interface Failure {
  code: string;
  start: number;
  end: number;
}

// The first failure of the file: a lexical error, else a syntax error, else none.
function firstFailure(buf: Buffer): Failure | null {
  const lexed = lex(buf);
  if (lexed.error !== null) return lexed.error;
  const parsed = parse(lexed.tokens);
  return 'error' in parsed ? parsed.error : null;
}

// The records for a source file: none when it lexes and parses, else one record at the failure.
export function diagnosticsOf(buf: Buffer): Diagnostic[] {
  const f = firstFailure(buf);
  if (f === null) return [];
  return [{ code: f.code, span: { start: f.start, end: f.end } }];
}
