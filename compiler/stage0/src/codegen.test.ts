// Tests for the walking-skeleton compile path (RFC 0014 subtask 6, stage 3): compile() then generate().
// Each program that compiles is validated and run through the toolkit, and its stdout is compared.
// Sources are in canonical layout with no final LF (RFC 0104 rules 3 and 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { run } from '../../../toolkit/run.ts';
import { validate } from '../../../toolkit/validate.ts';
import { compile } from './compile.ts';

function wasmOf(text: string): Uint8Array {
  const c = compile(Buffer.from(text, 'utf8'));
  if (!('wasm' in c)) assert.fail(c.reason);
  return c.wasm;
}

function reasonOf(text: string): string {
  const c = compile(Buffer.from(text, 'utf8'));
  if ('wasm' in c) assert.fail('expected no module');
  return c.reason;
}

test('the walking-skeleton program compiles to a valid WASI command module', () => {
  assert.ok(validate(wasmOf('main io{put 1}')).ok);
});

test('main io{put 1} prints 1 and a newline, with status 0 and no stderr', async () => {
  const r = await run(wasmOf('main io{put 1}'));
  assert.equal(r.stdout, '1\n');
  assert.equal(r.stderr, '');
  assert.equal(r.exitCode, 0);
});

test('the largest Int prints in full, and 0 prints as 0', async () => {
  assert.equal((await run(wasmOf('main io{put 9223372036854775807}'))).stdout, '9223372036854775807\n');
  assert.equal((await run(wasmOf('main io{put 0}'))).stdout, '0\n');
});

test('a CR LF line end is refused, since CR is not allowed (RFC 0104 rule 2)', () => {
  assert.equal('wasm' in compile(Buffer.from('main io{put 1}\r\n', 'utf8')), false);
});

test('a call statement other than put parses (RFC 0104 stmt) and codegen refuses it by name', () => {
  assert.match(reasonOf('main io{show(1)}'), /only `put INT` or an empty body/);
});

test('a function other than main is refused', () => {
  assert.match(reasonOf('go io{put 1}'), /must be main, not go/);
});

test('a literal above the Int range is refused, not wrapped', () => {
  assert.match(reasonOf('main io{put 9223372036854775808}'), /above the Int range/);
});

test('a lexical error gives a reason with its code and byte offset', () => {
  // Canonical layout (RFC 0104 rule 4), so the tab at byte 14 is the first error.
  assert.equal(reasonOf('main io{put 1}\t'), 'lexical error E0001 at byte 14');
});

test('a syntax error gives a reason with E0100 and the byte offset (RFC 0104 G2: ret is last)', () => {
  assert.equal(reasonOf('main io{ret put 1}'), 'E0100 at byte 12');
});

test('a text literal after put parses, and codegen refuses it: only put INT is generated', () => {
  assert.match(reasonOf('main io{put"a"}'), /only `put INT` or an empty body/);
});
