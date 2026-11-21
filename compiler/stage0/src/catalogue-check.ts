// Checks the diagnostic codes a compile emitted against the catalogue in spec/errors.json
// (RFC 0004 section 4). Pure: it takes the parsed catalogue and the emitted codes, and reads no files.
//
// Reports:
//   missing    an emitted code has no entry in the catalogue
//   retired    an emitted code's entry is marked retired
//   repeated   a code is listed more than once in the catalogue
//   malformed  a catalogue entry has no string `code`
//
// Each (kind, code) pair is reported once, however often the code is emitted. Emitting one code at
// many spans is normal, so repeated emitted codes are not a problem and are not reported.

export type ProblemKind = 'missing' | 'retired' | 'repeated' | 'malformed';

export interface Problem {
  kind: ProblemKind;
  // The code concerned, or null for a malformed entry, which has no usable code.
  code: string | null;
  detail: string;
}

// Returns the problems for one compile. An empty list means every emitted code is catalogued and
// active, and the catalogue itself is well formed. Throws a TypeError if the catalogue is not an array.
// Output order is fixed: catalogue problems in catalogue order, then emitted-code problems in
// emitted order.
export function checkCatalogue(catalogue: unknown, emitted: readonly string[]): Problem[] {
  if (!Array.isArray(catalogue)) {
    throw new TypeError('catalogue must be an array');
  }
  const problems: Problem[] = [];
  const counts = new Map<string, number>();
  const retired = new Set<string>();

  for (const [i, entry] of catalogue.entries()) {
    const code: unknown =
      typeof entry === 'object' && entry !== null ? (entry as { code?: unknown }).code : undefined;
    if (typeof code !== 'string') {
      problems.push({ kind: 'malformed', code: null, detail: `entry ${i} has no string code` });
      continue;
    }
    counts.set(code, (counts.get(code) ?? 0) + 1);
    if ((entry as { retired?: unknown }).retired === true) retired.add(code);
  }

  for (const [code, n] of counts) {
    if (n > 1) {
      problems.push({ kind: 'repeated', code, detail: `${code} is listed ${n} times` });
    }
  }

  const reported = new Set<string>();
  for (const code of emitted) {
    if (!counts.has(code)) {
      if (!reported.has(`missing:${code}`)) {
        reported.add(`missing:${code}`);
        problems.push({ kind: 'missing', code, detail: `${code} is not in the catalogue` });
      }
    } else if (retired.has(code)) {
      if (!reported.has(`retired:${code}`)) {
        reported.add(`retired:${code}`);
        problems.push({ kind: 'retired', code, detail: `${code} is retired and cannot be emitted` });
      }
    }
  }

  return problems;
}
