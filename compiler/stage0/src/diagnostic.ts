// Diagnostic record and JSON Lines writer (RFC 0050 section 2, which replaces RFC 0004's record).
// The key order of the output is fixed here, whatever order the caller builds the object in.

export type Severity = 'error' | 'warning';

export interface Span {
  start: number;
  end: number;
}

export interface Fix {
  span: Span;
  replacement: string;
}

export interface Diagnostic {
  code: string;
  severity?: Severity;
  span: Span;
  fix?: Fix;
}

function spanJson(span: Span): Span {
  return { start: span.start, end: span.end };
}

// Returns one record as text, with no line feed and no trailing comma. The caller adds the line feed
// when it writes the record to standard error. Keys are written in the order code, severity, span,
// fix. `severity` is written only when it is not `error`, since absent means error. `fix` is written
// only when the record has one. No other key is written.
export function toJsonLine(record: Diagnostic): string {
  const out: Record<string, unknown> = { code: record.code };
  if (record.severity !== undefined && record.severity !== 'error') {
    out.severity = record.severity;
  }
  out.span = spanJson(record.span);
  if (record.fix !== undefined) {
    out.fix = { span: spanJson(record.fix.span), replacement: record.fix.replacement };
  }
  return JSON.stringify(out);
}

// True when the code is a lexical code, E0001 to E0099 (RFC 0004 section 4).
export function isLexical(code: string): boolean {
  const m = /^E(\d{4})$/.exec(code);
  if (m === null) return false;
  const n = Number(m[1]);
  return n >= 1 && n <= 99;
}

// Returns a new array sorted by span.start, then by code. Records equal on both keys keep their
// input order, so the same input always gives the same output. The input is not changed.
export function sortRecords(records: readonly Diagnostic[]): Diagnostic[] {
  return records
    .map((record, index) => ({ record, index }))
    .sort((a, b) => {
      if (a.record.span.start !== b.record.span.start) {
        return a.record.span.start - b.record.span.start;
      }
      if (a.record.code !== b.record.code) {
        return a.record.code < b.record.code ? -1 : 1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.record);
}

// Keeps only the first lexical record, where "first" means first in the order given; call
// sortRecords before this to get the lowest span.start. The compiler stops after a lexical
// error, so every other record is dropped too. With no lexical record, returns a copy of the input.
export function firstLexicalOnly(records: readonly Diagnostic[]): Diagnostic[] {
  const first = records.find((record) => isLexical(record.code));
  return first === undefined ? [...records] : [first];
}
