// Tests for the print runtime (RFC 0020, P2 and P3). Each test builds a WASI command whose _start
// prints fixed values, runs it through the toolkit's run(), and compares stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleBuilder, Op } from '../../../../toolkit/wasm-encoder.ts';
import { run } from '../../../../toolkit/run.ts';
import { validate } from '../../../../toolkit/validate.ts';
import { addTrapRuntime } from './rt-trap.ts';
import { addPrintRuntime, PRINT_RESERVED_END, type PrintRuntime } from './rt-print.ts';

// Where test Text bytes are placed: above the reserved print memory.
const TEXT_AT = PRINT_RESERVED_END;

function program(body: (p: PrintRuntime) => Op, data: { at: number; bytes: Uint8Array }[] = []): Uint8Array {
  const m = new ModuleBuilder();
  const rt = addTrapRuntime(m);
  const p = addPrintRuntime(m, rt);
  for (const d of data) m.addData(d.at, d.bytes);
  const start = m.addFunc([], [], body(p));
  m.exportFunc('_start', start);
  return m.toBytes();
}

async function stdoutOf(bytes: Uint8Array): Promise<string> {
  assert.ok(validate(bytes).ok);
  const r = await run(bytes);
  assert.equal(r.exitCode, 0, r.stderr);
  assert.equal(r.stderr, '');
  return r.stdout;
}

test('print_int writes 0 with LF', async () => {
  assert.equal(await stdoutOf(program((p) => new Op().i64Const(0).call(p.printInt))), '0\n');
});

test('print_int writes a negative number with a leading minus and LF', async () => {
  assert.equal(await stdoutOf(program((p) => new Op().i64Const(-7).call(p.printInt))), '-7\n');
});

test('print_int writes the largest Int', async () => {
  const out = await stdoutOf(program((p) => new Op().i64Const(9223372036854775807n).call(p.printInt)));
  assert.equal(out, '9223372036854775807\n');
});

test('print_int writes the smallest Int, which has no positive counterpart', async () => {
  const out = await stdoutOf(program((p) => new Op().i64Const(-9223372036854775808n).call(p.printInt)));
  assert.equal(out, '-9223372036854775808\n');
});

test('print_int writes values in order, each on its own line, with no leading zeros', async () => {
  const body = (p: PrintRuntime) => new Op()
    .i64Const(10).call(p.printInt)
    .i64Const(-100).call(p.printInt)
    .i64Const(1).call(p.printInt);
  assert.equal(await stdoutOf(program(body)), '10\n-100\n1\n');
});

test('print_text of an empty Text writes only LF', async () => {
  const body = (p: PrintRuntime) => new Op().i32Const(TEXT_AT).i32Const(0).call(p.printText);
  assert.equal(await stdoutOf(program(body)), '\n');
});

test('print_text writes the bytes unchanged, including LF and quote, then LF', async () => {
  const bytes = Uint8Array.from([0x61, 0x0a, 0x22]); // a, LF, "
  const body = (p: PrintRuntime) => new Op().i32Const(TEXT_AT).i32Const(bytes.length).call(p.printText);
  assert.equal(await stdoutOf(program(body, [{ at: TEXT_AT, bytes }])), 'a\n"\n');
});

test('print_text and print_int share one stdout in call order', async () => {
  const bytes = new TextEncoder().encode('ab');
  const body = (p: PrintRuntime) => new Op()
    .i64Const(-3).call(p.printInt)
    .i32Const(TEXT_AT).i32Const(bytes.length).call(p.printText)
    .i64Const(0).call(p.printInt);
  assert.equal(await stdoutOf(program(body, [{ at: TEXT_AT, bytes }])), '-3\nab\n0\n');
});
