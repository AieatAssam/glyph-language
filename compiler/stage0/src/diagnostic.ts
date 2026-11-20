// Diagnostic record and JSON Lines writer (RFC 0004 sections 2 and 3).
// The field order of the output is fixed here, whatever order the caller builds the object in.

export type Severity = 'error' | 'warning';

export interface Span {
  file: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface Fix {
  span: Span;
  replacement: string;
}

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  span: Span;
  fix?: Fix;
}

function spanJson(span: Span): Span {
  return {
    file: span.file,
    start: span.start,
    end: span.end,
    line: span.line,
    column: span.column,
  };
}

// Returns one JSON object as text, with no line feed and no trailing comma.
// The caller adds the line feed when it writes the record to standard error.
// The `fix` key is written only when the record has a fix.
export function toJsonLine(record: Diagnostic): string {
  const out: Record<string, unknown> = {
    code: record.code,
    severity: record.severity,
    message: record.message,
    span: spanJson(record.span),
  };
  if (record.fix !== undefined) {
    out.fix = { span: spanJson(record.fix.span), replacement: record.fix.replacement };
  }
  return JSON.stringify(out);
}
