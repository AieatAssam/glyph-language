// Tests for spec/errors.json: the diagnostic code catalogue (RFC 0004 section 4).
// The catalogue is one JSON array. It holds no codes yet, so the checks on the real file are
// vacuous until a later subtask adds codes; the fixture cases below keep the checks honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Blocks from RFC 0004 section 4, as inclusive numeric ranges of the four-digit part.
const BLOCKS = [
  { name: 'lexical', lo: 1, hi: 99 },
  { name: 'syntax', lo: 100, hi: 199 },
  { name: 'types', lo: 200, hi: 299 },
  { name: 'name resolution', lo: 300, hi: 399 },
  { name: 'effects and capabilities', lo: 400, hi: 499 },
  { name: 'limits and constants', lo: 500, hi: 599 },
];

const KEYS = ['code', 'message', 'meaning', 'retired'];

// Returns a list of problems with a parsed catalogue. An empty list means the catalogue is valid.
function problems(entries: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(entries)) return ['catalogue is not an array'];
  const seen = new Set<string>();
  for (const [i, e] of entries.entries()) {
    const at = `entry ${i}`;
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      out.push(`${at}: not an object`);
      continue;
    }
    const obj = e as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (!KEYS.includes(k)) out.push(`${at}: unknown key ${k}`);
    }
    for (const k of ['code', 'message', 'meaning']) {
      if (typeof obj[k] !== 'string') out.push(`${at}: ${k} is not a string`);
    }
    if ('retired' in obj && typeof obj.retired !== 'boolean') {
      out.push(`${at}: retired is not a boolean`);
    }
    const code = obj.code;
    if (typeof code !== 'string') continue;
    const m = /^E(\d{4})$/.exec(code);
    if (!m) {
      out.push(`${at}: code ${JSON.stringify(code)} does not match E plus four digits`);
      continue;
    }
    if (seen.has(code)) out.push(`${at}: code ${code} is listed twice`);
    seen.add(code);
    const n = Number(m[1]);
    if (!BLOCKS.some((b) => n >= b.lo && n <= b.hi)) {
      out.push(`${at}: code ${code} lies in no block`);
    }
  }
  return out;
}

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogueText = readFileSync(`${here}../../../spec/errors.json`, 'utf8');

test('spec/errors.json parses as JSON', () => {
  const parsed: unknown = JSON.parse(catalogueText);
  assert.ok(Array.isArray(parsed), 'top level must be one array');
});

test('spec/errors.json is valid: codes, no duplicates, each in a block', () => {
  assert.deepEqual(problems(JSON.parse(catalogueText)), []);
});

test('every block in RFC 0004 section 4 is covered by the range check', () => {
  // Each block's first and last code must be accepted; the codes just outside must be rejected.
  for (const b of BLOCKS) {
    const first = 'E' + String(b.lo).padStart(4, '0');
    const last = 'E' + String(b.hi).padStart(4, '0');
    assert.deepEqual(problems([{ code: first, message: 'm', meaning: 'm' }]), [], first);
    assert.deepEqual(problems([{ code: last, message: 'm', meaning: 'm' }]), [], last);
  }
});

test('the checker rejects bad fixtures, so the tests above cannot pass vacuously', () => {
  const bad: [string, unknown][] = [
    ['not an array', { code: 'E0001', message: 'm', meaning: 'm' }],
    ['short code', [{ code: 'E001', message: 'm', meaning: 'm' }]],
    ['lowercase prefix', [{ code: 'e0001', message: 'm', meaning: 'm' }]],
    ['five digits', [{ code: 'E00001', message: 'm', meaning: 'm' }]],
    ['zero code', [{ code: 'E0000', message: 'm', meaning: 'm' }]],
    ['past last block', [{ code: 'E0600', message: 'm', meaning: 'm' }]],
    ['duplicate code', [
      { code: 'E0100', message: 'm', meaning: 'm' },
      { code: 'E0100', message: 'm', meaning: 'm' },
    ]],
    ['unknown key', [{ code: 'E0100', message: 'm', meaning: 'm', severity: 'error' }]],
    ['retired not boolean', [{ code: 'E0100', message: 'm', meaning: 'm', retired: 'yes' }]],
    ['missing meaning', [{ code: 'E0100', message: 'm' }]],
  ];
  for (const [name, fixture] of bad) {
    assert.ok(problems(fixture).length > 0, `expected a problem for: ${name}`);
  }
});

test('retired entries keep their code and still pass the checks', () => {
  const fixture = [{ code: 'E0101', message: 'm', meaning: 'm', retired: true }];
  assert.deepEqual(problems(fixture), []);
});
