// Tests for spec/errors.json: the diagnostic code catalogue (RFC 0050 section 4).
// The catalogue is one JSON array. Each entry holds a code and a meaning, and nothing else but an
// optional retired flag. The checks below run on the real file and on fixtures, so they cannot pass
// vacuously.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Blocks from RFC 0050 section 4, as inclusive numeric ranges of the four-digit part.
const BLOCKS = [
  { name: 'lexical', lo: 1, hi: 99 },
  { name: 'syntax', lo: 100, hi: 199 },
  { name: 'types', lo: 200, hi: 299 },
  { name: 'name resolution', lo: 300, hi: 399 },
  { name: 'effects and capabilities', lo: 400, hi: 499 },
  { name: 'limits and constants', lo: 500, hi: 599 },
];

const KEYS = ['code', 'meaning', 'retired'];

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
    for (const k of ['code', 'meaning']) {
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

test('every block in RFC 0050 section 4 is covered by the range check', () => {
  // Each block's first and last code must be accepted; the codes just outside must be rejected.
  for (const b of BLOCKS) {
    const first = 'E' + String(b.lo).padStart(4, '0');
    const last = 'E' + String(b.hi).padStart(4, '0');
    assert.deepEqual(problems([{ code: first, meaning: 'm' }]), [], first);
    assert.deepEqual(problems([{ code: last, meaning: 'm' }]), [], last);
  }
});

test('the checker rejects bad fixtures, so the tests above cannot pass vacuously', () => {
  const bad: [string, unknown][] = [
    ['not an array', { code: 'E0001', meaning: 'm' }],
    ['short code', [{ code: 'E001', meaning: 'm' }]],
    ['lowercase prefix', [{ code: 'e0001', meaning: 'm' }]],
    ['five digits', [{ code: 'E00001', meaning: 'm' }]],
    ['zero code', [{ code: 'E0000', meaning: 'm' }]],
    ['past last block', [{ code: 'E0600', meaning: 'm' }]],
    ['duplicate code', [
      { code: 'E0100', meaning: 'm' },
      { code: 'E0100', meaning: 'm' },
    ]],
    ['unknown key', [{ code: 'E0100', meaning: 'm', severity: 'error' }]],
    ['message key', [{ code: 'E0100', message: 'm', meaning: 'm' }]],
    ['retired not boolean', [{ code: 'E0100', meaning: 'm', retired: 'yes' }]],
    ['missing meaning', [{ code: 'E0100' }]],
  ];
  for (const [name, fixture] of bad) {
    assert.ok(problems(fixture).length > 0, `expected a problem for: ${name}`);
  }
});

test('retired entries keep their code and still pass the checks', () => {
  const fixture = [{ code: 'E0101', meaning: 'm', retired: true }];
  assert.deepEqual(problems(fixture), []);
});
