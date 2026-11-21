// Every diagnostic code the lexer emits is in spec/errors.json, with a message that passes the
// message rules (RFC 0004 sections 2 and 4). A code is found where a lexer file writes it as a quoted
// literal, such as 'E0001', so comments do not count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkMessage } from '../message.ts';

type Entry = { code: string; message: string; meaning: string };

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

test('the catalogue entries for the lexer codes pass the message rules', () => {
  for (const code of ['E0001', 'E0005', 'E0006']) {
    const entry = catalogue.find((e) => e.code === code);
    assert.ok(entry, `${code} is not catalogued`);
    assert.deepEqual(checkMessage(entry.message), [], code);
  }
});
