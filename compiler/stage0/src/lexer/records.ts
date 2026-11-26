// Lexical errors as RFC 0050 diagnostic records (RFC 0014 subtask 10). A LexError from source.ts
// (or from lex) becomes a Diagnostic, and its JSON Lines form comes from toJsonLine in diagnostic.ts.
// A record holds the code and the span only. Line and column are not written: a tool derives them
// from span.start (positionOf in span.ts) when it needs them.
import { toJsonLine, type Diagnostic } from '../diagnostic.ts';
import type { LexError } from './source.ts';

// Returns the record for one lexical error.
export function lexErrorRecord(error: LexError): Diagnostic {
  return { code: error.code, span: { start: error.start, end: error.end } };
}

// Returns the record for one lexical error as one JSON line, with no line feed.
export function lexErrorLine(error: LexError): string {
  return toJsonLine(lexErrorRecord(error));
}
