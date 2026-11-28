// The lexical part of `glyphc check` (RFC 0004 sections 2 and 3). A source file with a lexical
// error gets one JSON Lines record, for the first error, and check exits 1 (main.ts).
//
// ponytail: only lexical errors get a record. Ceiling: a source that lexes gets no record here, so
// main.ts falls through to cli.ts and its "no front end yet". Upgrade path: the parser and checker
// RFCs add their records after this step, one error kind at a time.
import type { Buffer } from 'node:buffer';
import { toJsonLine, type Diagnostic } from './diagnostic.ts';
import { lex } from './lexer/index.ts';

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
