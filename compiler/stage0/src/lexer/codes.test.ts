// Every diagnostic code the lexer emits is in spec/errors.json, and every catalogue meaning is a
// string of at most ten words (RFC 0050 section 4). A code is found where a lexer file writes it as
// a quoted literal, such as 'E0001', so comments do not count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Entry = { code: string; meaning: string };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../../spec/errors.json`, 'utf8')) as Entry[];

function emittedCodes(): Set<string> {
  const found = new Set<string>();
  for (const file of readdirSync(here)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const text = readFileSync(`${here}${file}`, 'utf8');
    for (const m of text.matchAll(/'(E\d{4})'/g)) found.add(m[1]);
  }
  return found;
}

// The codes whose meaning is not a string of at most ten words. A word is a run of non-space text.
function longMeanings(entries: { code: string; meaning: unknown }[]): string[] {
  return entries
    .filter((e) => typeof e.meaning !== 'string' || e.meaning.trim().split(/\s+/).length > 10)
    .map((e) => e.code);
}

test('the lexer emits E0001, E0005 and E0006, and the scan finds them', () => {
  const found = emittedCodes();
  for (const code of ['E0001', 'E0005', 'E0006']) {
    assert.ok(found.has(code), `scan did not find ${code}`);
  }
});

test('every code the lexer emits is listed in spec/errors.json', () => {
  const listed = new Set(catalogue.map((e) => e.code));
  const missing = [...emittedCodes()].filter((code) => !listed.has(code));
  assert.deepEqual(missing, []);
});

test('a meaning of ten words is accepted, and a meaning of eleven words is reported', () => {
  const ten = 'a b c d e f g h i j';
  const eleven = 'a b c d e f g h i j k';
  assert.deepEqual(longMeanings([{ code: 'E0001', meaning: ten }]), []);
  assert.deepEqual(longMeanings([{ code: 'E0002', meaning: eleven }]), ['E0002']);
});

test('every catalogue entry has a meaning of at most ten words', () => {
  assert.deepEqual(longMeanings(catalogue), []);
});

test('the lexer codes are catalogued with a meaning and no message key', () => {
  for (const code of ['E0001', 'E0005', 'E0006']) {
    const entry = catalogue.find((e) => e.code === code);
    assert.ok(entry, `${code} is not catalogued`);
    assert.equal(typeof entry.meaning, 'string', code);
    assert.equal('message' in entry, false, code);
  }
});
