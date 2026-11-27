// Diagnostic record and JSON Lines writer (RFC 0112 D1 to D5).
// A record has the keys code, span and, when one edit repairs the code, fix. Nothing else is
// written. The key order of the output is fixed here, whatever order the caller builds the object in.

// Byte offsets into the one file on the command line. end is exclusive.
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
  span: Span;
  fix?: Fix;
}

function spanJson(span: Span): Span {
  return { start: span.start, end: span.end };
}

// Returns one JSON object as text, with no line feed, no spaces and no trailing comma.
// The caller adds the line feed when it writes the record to standard error.
// The `fix` key is written only when the record has a fix.
export function toJsonLine(record: Diagnostic): string {
  const out: Record<string, unknown> = {
    code: record.code,
    span: spanJson(record.span),
  };
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

// Returns a new array sorted by span.start, then by code. Records equal on both keep their
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
