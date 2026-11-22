// Tests for the call-depth and loop-step counters (RFC 0020, TR2 and TR3). Each case builds a WASI
// command whose _start calls one counter function in a loop, then runs it through the toolkit's run().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleBuilder, Op } from '../../../../toolkit/wasm-encoder.ts';
import { run } from '../../../../toolkit/run.ts';
import { validate } from '../../../../toolkit/validate.ts';
import { MAX_DEPTH, MAX_STEPS, TRAP_LINE } from './types.ts';
import { addTrapRuntime } from './rt-trap.ts';
import { addCounters, type CounterRuntime } from './rt-count.ts';

// Calls function f exactly n times in a loop (n >= 1). Local 0 is the loop counter.
function loopCalls(f: number, n: number): Op {
  return new Op()
    .i32Const(n).localSet(0)
    .loop().call(f).localGet(0).i32Const(1).i32Sub().localTee(0).brIf(0).end();
}

// A WASI command whose _start runs the ops that body returns.
function build(body: (c: CounterRuntime) => Op): Uint8Array {
  const m = new ModuleBuilder();
  const rt = addTrapRuntime(m);
  const c = addCounters(m, rt);
  m.exportFunc('_start', m.addFunc([], [], body(c), ['i32']));
  const bytes = m.toBytes();
  assert.ok(validate(bytes).ok);
  return bytes;
}

// Enough fuel and time for a billion loop steps. The default fuel alone does not cover them.
const LONG = { fuel: 1e13, timeoutMs: 120000 };

test('10000 nested enter calls pass', async () => {
  const r = await run(build((c) => loopCalls(c.enter, MAX_DEPTH)));
  assert.equal(r.exitCode, 0);
  assert.equal(r.stderr, '');
});

test('the 10001st nested enter traps stack-exhausted', async () => {
  const r = await run(build((c) => loopCalls(c.enter, MAX_DEPTH + 1)));
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderr, `${TRAP_LINE['stack-exhausted']}\n`);
  assert.equal(r.stdout, '');
});

test('leave lets a later enter pass after the depth limit was reached', async () => {
  const r = await run(build((c) => loopCalls(c.enter, MAX_DEPTH).call(c.leave).call(c.enter)));
  assert.equal(r.exitCode, 0);
  assert.equal(r.stderr, '');
});

test('1000000000 tick calls pass', async () => {
  const r = await run(build((c) => loopCalls(c.tick, MAX_STEPS)), LONG);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stderr, '');
});

test('the tick after 1000000000 calls traps step-exhausted', async () => {
  const r = await run(build((c) => loopCalls(c.tick, MAX_STEPS).call(c.tick)), LONG);
  assert.equal(r.exitCode, 1);
  assert.equal(r.stderr, `${TRAP_LINE['step-exhausted']}\n`);
  assert.equal(r.stdout, '');
});
