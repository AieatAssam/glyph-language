// Lexical errors as RFC 0112 diagnostic records (RFC 0014 subtask 10). A LexError from source.ts
// (or from lex) becomes a Diagnostic, and its JSON Lines form comes from toJsonLine in diagnostic.ts.
// A record carries the code, the byte span and, when the lexer gives one, the fix. It carries no
// message, line or column: the words of a code are in spec/errors.json (RFC 0112 D1, D7).
import { toJsonLine, type Diagnostic } from '../diagnostic.ts';
import type { LexError } from './source.ts';

// The lexical codes the lexer emits. A code outside this set is refused, so a new lexer code cannot
// go out unrecorded. codes.test.ts checks that each one is in spec/errors.json.
const LEXICAL_CODES = new Set(['E0001', 'E0002', 'E0005', 'E0006']);

// Returns the record for one lexical error. Throws an Error if the code is not a lexer code.
export function lexErrorRecord(error: LexError): Diagnostic {
  if (!LEXICAL_CODES.has(error.code)) {
    throw new Error(`records: no record for lexical code ${error.code}`);
  }
  const record: Diagnostic = {
    code: error.code,
    span: { start: error.start, end: error.end },
  };
  if (error.fix !== undefined) {
    record.fix = {
      span: { start: error.fix.start, end: error.fix.end },
      replacement: error.fix.replacement,
    };
  }
  return record;
}

// Returns the record for one lexical error as one JSON line, with no line feed.
export function lexErrorLine(error: LexError): string {
  return toJsonLine(lexErrorRecord(error));
}
