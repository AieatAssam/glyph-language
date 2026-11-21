// Tests for the trap runtime (RFC 0020, TR1). A harness module traps with each kind, and the test
// checks the exit status, the single stderr line, and that nothing reaches stdout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleBuilder, Op } from '../../../../toolkit/wasm-encoder.ts';
import { run } from '../../../../toolkit/run.ts';
import { validate } from '../../../../toolkit/validate.ts';
import { TRAP_KINDS } from './types.ts';
import { addTrapRuntime } from './rt-trap.ts';

// A WASI command whose _start calls trap with the kind at index `kind`.
function harness(kind: number): Uint8Array {
  const m = new ModuleBuilder();
  const rt = addTrapRuntime(m);
  const start = m.addFunc([], [], new Op().i32Const(kind).call(rt.trap));
  m.exportFunc('_start', start);
  return m.toBytes();
}

TRAP_KINDS.forEach((kind, k) => {
  test(`trap kind ${k} (${kind}) writes one stderr line and exits 1`, async () => {
    const bytes = harness(k);
    assert.ok(validate(bytes).ok);
    const r = await run(bytes);
    assert.equal(r.exitCode, 1);
    assert.equal(r.stderr, `trap: ${kind}\n`);
    assert.equal(r.stdout, '');
  });
});
