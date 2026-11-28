// The lexical and syntax part of `glyphc check` (RFC 0004 sections 2 and 3). A source file with a
// lexical or syntax error gets one JSON Lines record, for the first error, and check exits 1
// (main.ts).
//
// ponytail: only lexical and syntax errors get a record. Ceiling: a source that parses gets no record
// here, so main.ts falls through to cli.ts and its "no front end yet". Upgrade path: the checker
// RFC adds its records after this step, one error kind at a time.
import type { Buffer } from 'node:buffer';
import { toJsonLine, type Diagnostic } from './diagnostic.ts';
import { lex } from './lexer/index.ts';
import { parse } from './parser/index.ts';

// Returns the record line for the first lexical or syntax error in buf, or null when buf parses.
export function checkRecord(buf: Buffer): string | null {
  const lexed = lexRecord(buf);
  if (lexed !== null) return lexed;
  const { tokens } = lex(buf);
  const parsed = parse(tokens);
  if (!('error' in parsed)) return null;
  return toJsonLine({ code: parsed.error.code, span: { start: parsed.error.start, end: parsed.error.end } });
}

// Returns the record line for the first lexical error in buf, or null when buf lexes.
export function lexRecord(buf: Buffer): string | null {
  const { error } = lex(buf);
  if (error === null) return null;
  const record: Diagnostic = { code: error.code, span: { start: error.start, end: error.end } };
  if (error.fix !== undefined) {
    const { start, end, replacement } = error.fix;
    record.fix = { span: { start, end }, replacement };
  }
  return toJsonLine(record);
}
