// Lexical errors as RFC 0004 diagnostic records (RFC 0014 subtask 10). A LexError from source.ts
// (or from lex) becomes a Diagnostic, and its JSON Lines form comes from toJsonLine in diagnostic.ts.
// The span's line and column come from span.ts. Messages follow spec/errors.json, and each one
// passes the message rules in message.ts (checked by records.test.ts).
//
// ponytail: only the three codes the lexer emits (E0001, E0005, E0006) have a message here. Ceiling:
// a new lexer code needs a row here and a catalogue entry. Upgrade path: read the message from
// spec/errors.json once the catalogue is loaded by the driver.
import { toJsonLine, type Diagnostic } from '../diagnostic.ts';
import { positionOf } from '../span.ts';
import type { LexError } from './source.ts';

// The catalogue message for each lexical code. These are the same strings as spec/errors.json.
const MESSAGES = new Map<string, string>([
  ['E0001', 'invalid byte or character in source'],
  ['E0005', 'malformed text literal'],
  ['E0006', 'integer literal has a leading zero'],
]);

// Returns the record for one lexical error. `bytes` is the whole file, which gives the line and
// column of the error's start. `file` is the path as the caller was given it.
// Throws an Error if the code has no message here, so a new lexer code cannot go out unnamed.
export function lexErrorRecord(error: LexError, bytes: Uint8Array, file: string): Diagnostic {
  const message = MESSAGES.get(error.code);
  if (message === undefined) {
    throw new Error(`records: no message for lexical code ${error.code}`);
  }
  const { line, column } = positionOf(bytes, error.start);
  return {
    code: error.code,
    severity: 'error',
    message,
    span: { file, start: error.start, end: error.end, line, column },
  };
}

// Returns the record for one lexical error as one JSON line, with no line feed.
export function lexErrorLine(error: LexError, bytes: Uint8Array, file: string): string {
  return toJsonLine(lexErrorRecord(error, bytes, file));
}
