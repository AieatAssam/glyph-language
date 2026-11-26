// Front-end diagnostics for `check FILE` (RFC 0048 subtask 12, RFC 0004 section 2): lex the source,
// then parse it, and return one record for the first lexical or syntax error. A valid file gives no
// record, and the caller decides what a valid file means (main.ts passes it on to cli.ts).
//
// ponytail: one record at most, since the lexer and parser stop at their first error (RFC 0048
// rule 13 and G12). Ceiling: no checker, so E0500 and the other checker codes are not reported.
// Upgrade path: the checker RFC adds its own pass after the parser and returns a list.
import type { Buffer } from 'node:buffer';
import { type Diagnostic } from './diagnostic.ts';
import { lex } from './lexer/index.ts';
import { parse } from './parser/parse.ts';
import { positionOf } from './span.ts';

// The messages of spec/errors.json, for the codes this front end emits.
const MESSAGES: Readonly<Record<string, string>> = {
  E0001: 'invalid byte or character in source',
  E0003: 'keyword where a name is required',
  E0005: 'malformed text literal',
  E0006: 'integer literal has a leading zero',
  E0100: 'unexpected token',
};

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
export function diagnosticsOf(buf: Buffer, file: string): Diagnostic[] {
  const f = firstFailure(buf);
  if (f === null) return [];
  const pos = positionOf(buf, f.start);
  return [{
    code: f.code,
    severity: 'error',
    message: MESSAGES[f.code] ?? f.code,
    span: { file, start: f.start, end: f.end, line: pos.line, column: pos.column },
  }];
}
