// Node tests for the key, catalogue and retired rules of RFC 0050 sections 2 to 4. They read back the
// JSON Lines text that the lexer, the front end and cli.ts write, so they see what a reader sees.
// These replace RFC 0050's (check) tests, which the runner cannot run (plan B5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkCatalogue } from './catalogue-check.ts';
import { diagnosticsOf } from './check.ts';
import { toJsonLine } from './diagnostic.ts';
import { run as runCli } from './cli.ts';
import { lex } from './lexer/index.ts';
import { lexErrorLine } from './lexer/records.ts';

type Json = Record<string, unknown>;
type Entry = { code: string; meaning: string; retired?: boolean };

const here = fileURLToPath(new URL('.', import.meta.url));
const catalogue = JSON.parse(readFileSync(`${here}../../../spec/errors.json`, 'utf8')) as Entry[];

// One string per record written for the inputs below: lexical errors, a fix record, the E0010
// record from cli.ts, and the front-end records from check.ts.
function recordLines(): string[] {
  const lines: string[] = [];
  for (const text of ['\x01', '"ab', '007', 'let a = 1\r\n']) {
    const { error } = lex(Buffer.from(text, 'utf8'));
    if (error === null) throw new Error(`no lexical error for ${JSON.stringify(text)}`);
    lines.push(lexErrorLine(error));
  }
  lines.push(toJsonLine({
    code: 'E0006',
    span: { start: 0, end: 3 },
    fix: { span: { start: 0, end: 3 }, replacement: '7' },
  }));
  const err: string[] = [];
  runCli(['check', 'prog.txt'], {
    stdout: { write: () => {} },
    stderr: { write: (t: string) => err.push(t) },
  });
  lines.push(...err.join('').split('\n').filter((l) => l !== ''));
  for (const text of ['fn let() io { }\n', 'fn main() io {\n  put(1)\n']) {
    for (const r of diagnosticsOf(Buffer.from(text, 'utf8'))) lines.push(toJsonLine(r));
  }
  return lines;
}

const codesOf = (lines: string[]): string[] =>
  lines.map((l) => (JSON.parse(l) as { code: string }).code);

// The keys of `obj` that the rule does not allow.
const extraKeys = (obj: object, allowed: string[]): string[] =>
  Object.keys(obj).filter((k) => !allowed.includes(k));

test('the inputs give enough records to test, and each record is one line of JSON', () => {
  const lines = recordLines();
  assert.ok(lines.length >= 8, `only ${lines.length} records`);
  for (const line of lines) assert.doesNotThrow(() => JSON.parse(line), line);
});

test('every record has only the keys code, severity, span and fix', () => {
  for (const line of recordLines()) {
    const rec = JSON.parse(line) as Json;
    assert.deepEqual(extraKeys(rec, ['code', 'severity', 'span', 'fix']), [], line);
    assert.ok('code' in rec && 'span' in rec, `code and span are required: ${line}`);
  }
});

test('span and fix.span have only the keys start and end, and fix has only span and replacement', () => {
  for (const line of recordLines()) {
    const rec = JSON.parse(line) as Json;
    const span = rec.span as Json;
    assert.deepEqual(Object.keys(span), ['start', 'end'], line);
    if ('fix' in rec) {
      const fix = rec.fix as Json;
      assert.deepEqual(extraKeys(fix, ['span', 'replacement']), [], line);
      assert.deepEqual(Object.keys(fix.span as Json), ['start', 'end'], line);
    }
  }
});

test('every emitted code is in spec/errors.json, listed once, and in its block', () => {
  const emitted = codesOf(recordLines());
  for (const code of new Set(emitted)) {
    assert.match(code, /^E\d{4}$/);
    assert.equal(catalogue.filter((e) => e.code === code).length, 1, code);
  }
  // checkCatalogue reports a catalogue code outside its block, or listed twice, and a missing code.
  assert.deepEqual(checkCatalogue(catalogue, emitted), []);
});

test('a retired entry whose code is emitted is reported as retired', () => {
  const emitted = codesOf(recordLines());
  assert.ok(emitted.includes('E0010'), 'the fixture needs E0010 to be emitted');
  const retiredE0010 = catalogue.map((e) => (e.code === 'E0010' ? { ...e, retired: true } : e));
  const problems = checkCatalogue(retiredE0010, emitted);
  assert.deepEqual(problems.map((p) => `${p.kind}:${p.code}`), ['retired:E0010']);
});

test('a retired entry whose code is not emitted is not reported', () => {
  const emitted = codesOf(recordLines());
  assert.equal(emitted.includes('E0500'), false, 'the fixture needs E0500 not to be emitted');
  const retiredE0500 = catalogue.map((e) => (e.code === 'E0500' ? { ...e, retired: true } : e));
  assert.deepEqual(checkCatalogue(retiredE0500, emitted), []);
});
