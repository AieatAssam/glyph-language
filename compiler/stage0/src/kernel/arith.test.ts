// Tests for checked i64 arithmetic (RFC 0020, E1 and E2). Each case builds a WASI command whose
// _start does one operation and prints the result, or does one operation that traps. The module
// runs through the toolkit's run().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleBuilder, Op } from '../../../../toolkit/wasm-encoder.ts';
import { run } from '../../../../toolkit/run.ts';
import { validate } from '../../../../toolkit/validate.ts';
import { INT_MAX, INT_MIN } from './types.ts';
import { addTrapRuntime } from './rt-trap.ts';
import { addPrintRuntime, type PrintRuntime } from './rt-print.ts';
import { addArith, type ArithRuntime } from './arith.ts';

type Body = (a: ArithRuntime, p: PrintRuntime) => Op;

function build(body: Body): Uint8Array {
  const m = new ModuleBuilder();
  const rt = addTrapRuntime(m);
  const p = addPrintRuntime(m, rt);
  const a = addArith(m, rt);
  m.exportFunc('_start', m.addFunc([], [], body(a, p)));
  return m.toBytes();
}

// Runs the program and expects status 0 and no stderr. Returns stdout.
async function printed(body: Body): Promise<string> {
  const bytes = build(body);
  assert.ok(validate(bytes).ok);
  const r = await run(bytes);
  assert.equal(r.stderr, '');
  assert.equal(r.exitCode, 0);
  return r.stdout;
}

// Runs the program and expects a trap: status 1, one trap line on stderr, nothing on stdout.
async function trapped(body: Body): Promise<string> {
  const bytes = build(body);
  assert.ok(validate(bytes).ok);
  const r = await run(bytes);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stdout, '');
  return r.stderr;
}

type Binary = 'add' | 'sub' | 'mul' | 'div' | 'rem';

// Prints op(x, y).
const binary = (op: Binary, x: bigint, y: bigint): Body =>
  (a, p) => new Op().i64Const(x).i64Const(y).call(a[op]).call(p.printInt);

// Runs op(x, y) for its trap and drops the result, which the trap never produces.
const binaryTrap = (op: Binary, x: bigint, y: bigint): Body =>
  (a) => new Op().i64Const(x).i64Const(y).call(a[op]).drop();

const OVERFLOW_LINE = 'trap: overflow\n';
const DIVIDE_LINE = 'trap: divide-by-zero\n';

test('7 / -2 is -3, truncated toward zero', async () => {
  assert.equal(await printed(binary('div', 7n, -2n)), '-3\n');
});

test('-7 % 3 is -1, with the sign of the dividend', async () => {
  assert.equal(await printed(binary('rem', -7n, 3n)), '-1\n');
});

test('7 % -3 is 1, with the sign of the dividend', async () => {
  assert.equal(await printed(binary('rem', 7n, -3n)), '1\n');
});

test('MIN % -1 is 0 and does not trap', async () => {
  assert.equal(await printed(binary('rem', INT_MIN, -1n)), '0\n');
});

test('MIN / 1 is MIN', async () => {
  assert.equal(await printed(binary('div', INT_MIN, 1n)), '-9223372036854775808\n');
});

test('MIN / -1 traps overflow', async () => {
  assert.equal(await trapped(binaryTrap('div', INT_MIN, -1n)), OVERFLOW_LINE);
});

test('1 / 0 traps divide-by-zero', async () => {
  assert.equal(await trapped(binaryTrap('div', 1n, 0n)), DIVIDE_LINE);
});

test('1 % 0 traps divide-by-zero, before the -1 check', async () => {
  assert.equal(await trapped(binaryTrap('rem', 1n, 0n)), DIVIDE_LINE);
});

test('4611686018427387904 * 2 traps overflow', async () => {
  assert.equal(await trapped(binaryTrap('mul', 4611686018427387904n, 2n)), OVERFLOW_LINE);
});

test('4611686018427387904 * -2 is MIN and does not trap', async () => {
  assert.equal(await printed(binary('mul', 4611686018427387904n, -2n)), '-9223372036854775808\n');
});

test('-1 * MIN traps overflow, and -1 * MAX is -MAX', async () => {
  assert.equal(await trapped(binaryTrap('mul', -1n, INT_MIN)), OVERFLOW_LINE);
  assert.equal(await printed(binary('mul', -1n, INT_MAX)), '-9223372036854775807\n');
});

test('3 * -4 is -12 and 0 * MIN is 0', async () => {
  assert.equal(await printed(binary('mul', 3n, -4n)), '-12\n');
  assert.equal(await printed(binary('mul', 0n, INT_MIN)), '0\n');
});

test('MAX * 2 traps overflow', async () => {
  assert.equal(await trapped(binaryTrap('mul', INT_MAX, 2n)), OVERFLOW_LINE);
});

test('MAX + 1 traps overflow', async () => {
  assert.equal(await trapped(binaryTrap('add', INT_MAX, 1n)), OVERFLOW_LINE);
});

test('MIN + -1 traps overflow, and MAX + -1 is MAX - 1', async () => {
  assert.equal(await trapped(binaryTrap('add', INT_MIN, -1n)), OVERFLOW_LINE);
  assert.equal(await printed(binary('add', INT_MAX, -1n)), '9223372036854775806\n');
});

test('MIN - 1 traps overflow, and 0 - MIN traps overflow', async () => {
  assert.equal(await trapped(binaryTrap('sub', INT_MIN, 1n)), OVERFLOW_LINE);
  assert.equal(await trapped(binaryTrap('sub', 0n, INT_MIN)), OVERFLOW_LINE);
});

test('5 - 7 is -2, and MAX - MAX is 0', async () => {
  assert.equal(await printed(binary('sub', 5n, 7n)), '-2\n');
  assert.equal(await printed(binary('sub', INT_MAX, INT_MAX)), '0\n');
});

test('neg(MIN) traps overflow', async () => {
  const body: Body = (a) => new Op().i64Const(INT_MIN).call(a.neg).drop();
  assert.equal(await trapped(body), OVERFLOW_LINE);
});

test('neg(5) is -5, neg(-1) is 1, and neg(MAX) is -MAX', async () => {
  const of = (x: bigint): Body => (a, p) => new Op().i64Const(x).call(a.neg).call(p.printInt);
  assert.equal(await printed(of(5n)), '-5\n');
  assert.equal(await printed(of(-1n)), '1\n');
  assert.equal(await printed(of(INT_MAX)), '-9223372036854775807\n');
});
