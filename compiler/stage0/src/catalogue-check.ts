// Checks the diagnostic codes a compile emitted against the catalogue in spec/errors.json
// (RFC 0050 section 4, which replaces RFC 0004 section 4). Pure: it takes the parsed catalogue and the
// emitted codes, and reads no files.
//
// Reports:
//   missing    an emitted code has no entry in the catalogue
//   retired    an emitted code's entry is marked retired
//   repeated   a code is listed more than once in the catalogue
//   malformed  a catalogue entry has no string `code`
//   block      a catalogue code lies in no block of RFC 0050 section 4
//
// Each (kind, code) pair is reported once, however often the code is emitted. Emitting one code at
// many spans is normal, so repeated emitted codes are not a problem and are not reported.

export type ProblemKind = 'missing' | 'retired' | 'repeated' | 'malformed' | 'block';

export interface Problem {
  kind: ProblemKind;
  // The code concerned, or null for a malformed entry, which has no usable code.
  code: string | null;
  detail: string;
}

// The blocks of RFC 0050 section 4, as inclusive ranges of the four-digit part of a code.
const BLOCKS: readonly { lo: number; hi: number }[] = [
  { lo: 1, hi: 99 },
  { lo: 100, hi: 199 },
  { lo: 200, hi: 299 },
  { lo: 300, hi: 399 },
  { lo: 400, hi: 499 },
  { lo: 500, hi: 599 },
];

// True when the code is E and four digits, and its number lies in one of the blocks.
function inABlock(code: string): boolean {
  const m = /^E(\d{4})$/.exec(code);
  if (m === null) return false;
  const n = Number(m[1]);
  return BLOCKS.some((b) => n >= b.lo && n <= b.hi);
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
  const blockReported = new Set<string>();

  for (const [i, entry] of catalogue.entries()) {
    const code: unknown =
      typeof entry === 'object' && entry !== null ? (entry as { code?: unknown }).code : undefined;
    if (typeof code !== 'string') {
      problems.push({ kind: 'malformed', code: null, detail: `entry ${i} has no string code` });
      continue;
    }
    if (!inABlock(code) && !blockReported.has(code)) {
      blockReported.add(code);
      problems.push({ kind: 'block', code, detail: `${code} lies in no block of RFC 0050 section 4` });
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
