// Tests for the walking-skeleton compile path (RFC 0014 subtask 6, stage 3): compile() then generate().
// Each program that compiles is validated and run through the toolkit, and its stdout is compared.
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
  assert.ok(validate(wasmOf('fn main() io { print(1) }')).ok);
});

test('fn main() io { print(1) } prints 1 and a newline, with status 0 and no stderr', async () => {
  const r = await run(wasmOf('fn main() io { print(1) }\n'));
  assert.equal(r.stdout, '1\n');
  assert.equal(r.stderr, '');
  assert.equal(r.exitCode, 0);
});

test('the largest Int prints in full, and 0 prints as 0', async () => {
  assert.equal((await run(wasmOf('fn main() io { print(9223372036854775807) }'))).stdout, '9223372036854775807\n');
  assert.equal((await run(wasmOf('fn main() io { print(0) }'))).stdout, '0\n');
});

test('a CR LF line end is refused, since CR is not allowed (RFC 0048 rule 3)', () => {
  assert.equal('wasm' in compile(Buffer.from('fn main() io { print(1) }\r\n', 'utf8')), false);
});

test('a callee other than print is refused with a reason that names it', () => {
  assert.match(reasonOf('fn main() io { show(1) }'), /only print can be called, not show/);
});

test('a function other than main is refused', () => {
  assert.match(reasonOf('fn go() io { print(1) }'), /must be main, not go/);
});

test('a literal above the Int range is refused, not wrapped', () => {
  assert.match(reasonOf('fn main() io { print(9223372036854775808) }'), /above the Int range/);
});

test('a lexical error gives a reason with its code and byte offset', () => {
  assert.equal(reasonOf('fn main() io { print(1) }\t'), 'lexical error E0001 at byte 25');
});

test('a syntax error gives a reason with E0100 and the byte offset', () => {
  assert.equal(reasonOf('fn main() { print(1) }'), 'E0100 at byte 10');
});

test('a text literal, which the parser does not accept yet, gives E0100 at its byte and does not throw', () => {
  assert.equal(reasonOf('fn main() io { print("a") }'), 'E0100 at byte 21');
});
