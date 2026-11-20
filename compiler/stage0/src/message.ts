// Message rules for diagnostics (RFC 0004 section 2): one sentence, lowercase first word,
// no trailing full stop, and no quoted source text longer than 20 bytes.
// ponytail: quoted runs are found by ASCII double quotes, so an escaped quote inside a message is
// not handled. A run that is never closed runs to the end of the message.
// Upgrade path: pass the source text as a separate template argument, so quoted runs come from
// the source and not from the message text.

export type Rule = 'one-sentence' | 'lowercase-first' | 'no-trailing-stop' | 'quoted-run-length';

export interface Problem {
  rule: Rule;
  detail: string;
}

export const MAX_QUOTED_BYTES = 20;

// One quoted run: an opening quote, its content, and the closing quote if there is one.
const QUOTED = /"[^"]*"?/g;

// Returns the message rules that the text breaks. An empty list means the message is valid.
export function checkMessage(message: string): Problem[] {
  const problems: Problem[] = [];

  // One sentence: no line break, and no full stop, ! or ? outside quoted runs. A final full stop
  // is left to the trailing-stop rule, so it is not reported twice.
  const body = message.endsWith('.') ? message.slice(0, -1) : message;
  if (/[\r\n]/.test(message)) {
    problems.push({ rule: 'one-sentence', detail: 'contains a line break' });
  }
  if (/[.!?]/.test(body.replace(QUOTED, '""'))) {
    problems.push({ rule: 'one-sentence', detail: 'contains a full stop, ! or ? before the end' });
  }

  // Lowercase first word: the first character must be an ASCII lowercase letter.
  if (!/^[a-z]/.test(message)) {
    problems.push({ rule: 'lowercase-first', detail: 'first character is not a lowercase letter' });
  }

  // No trailing full stop.
  if (message.endsWith('.')) {
    problems.push({ rule: 'no-trailing-stop', detail: 'ends with a full stop' });
  }

  // No quoted run longer than 20 bytes of UTF-8.
  for (const match of message.matchAll(/"([^"]*)"?/g)) {
    const bytes = Buffer.byteLength(match[1], 'utf8');
    if (bytes > MAX_QUOTED_BYTES) {
      problems.push({
        rule: 'quoted-run-length',
        detail: `quoted run is ${bytes} bytes, limit is ${MAX_QUOTED_BYTES}`,
      });
    }
  }

  return problems;
}
