// Tests for the E0010 entry in spec/errors.json (RFC 0011 section 6, plan subtask 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkMessage } from './message.ts';

type Entry = { code: string; message: string; meaning: string; retired?: boolean };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../spec/errors.json`, 'utf8')) as Entry[];
const entries = catalogue.filter((e) => e.code === 'E0010');

test('E0010 is listed exactly once in spec/errors.json', () => {
  assert.equal(entries.length, 1);
});

test('E0010 lies in the lexical block E0001 to E0099', () => {
  const n = Number(entries[0]?.code.slice(1));
  assert.ok(n >= 1 && n <= 99, `E0010 is out of the lexical block: ${n}`);
});

test('E0010 has the message and meaning given by RFC 0011', () => {
  assert.equal(entries[0]?.message, 'source file does not end in .gl');
  assert.equal(entries[0]?.meaning, 'the path given is not a source file');
});

test('E0010 message passes the RFC 0004 message rules in message.ts', () => {
  assert.deepEqual(checkMessage(entries[0]?.message ?? ''), []);
});
