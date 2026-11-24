// Lexical errors as RFC 0050 diagnostic records (RFC 0014 subtask 10). A LexError from source.ts
// (or from lex) becomes a record, and its JSON Lines form comes from toRecordLine in diagnostic.ts.
// The record holds the code and the byte span only: no message, file, line or column.
import { toRecordLine, type DiagnosticRecord } from '../diagnostic.ts';
import type { LexError } from './source.ts';

// Returns the record for one lexical error.
export function lexErrorRecord(error: LexError): DiagnosticRecord {
  return { code: error.code, span: { start: error.start, end: error.end } };
}

// Returns the record for one lexical error as one JSON line, with no line feed.
export function lexErrorLine(error: LexError): string {
  return toRecordLine(lexErrorRecord(error));
}
