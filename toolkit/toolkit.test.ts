// Tests for the toolkit: hand-assembled modules are validated and run through each engine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModuleBuilder, Op, sleb, uleb, type ValTypeName } from './wasm-encoder.ts';
import { validate } from './validate.ts';
import { hasWasmtime, run } from './run.ts';
import { runWasi } from './wasi-browser.ts';

const WASI = 'wasi_snapshot_preview1';

interface Funcs {
  exit: number;
  fdWrite: number;
  fdRead: number;
  pathOpen: number;
}

interface Spec {
  body: (f: Funcs) => Op;
  locals?: ValTypeName[];
  data?: [number, Uint8Array | string][];
}

// A WASI command: imports the four calls the tests use, one memory page, _start.
function command({ body, locals = [], data = [] }: Spec): Uint8Array {
  const m = new ModuleBuilder();
  const f: Funcs = {
    exit: m.importFunc(WASI, 'proc_exit', ['i32'], []),
    fdWrite: m.importFunc(WASI, 'fd_write', ['i32', 'i32', 'i32', 'i32'], ['i32']),
    fdRead: m.importFunc(WASI, 'fd_read', ['i32', 'i32', 'i32', 'i32'], ['i32']),
    pathOpen: m.importFunc(WASI, 'path_open', ['i32', 'i32', 'i32', 'i32', 'i32', 'i64', 'i64', 'i32', 'i32'], ['i32']),
  };
  m.setMemory(1);
  m.exportMemory('memory');
  for (const [offset, d] of data) m.addData(offset, d);
  const start = m.declareFunc([], []);
  m.defineFunc(start, body(f), locals);
  m.exportFunc('_start', start);
  return m.toBytes();
}

const HELLO = command({
  data: [
    [0, Uint8Array.of(16, 0, 0, 0, 6, 0, 0, 0)], // iovec: ptr 16, len 6
    [16, 'hello\n'],
  ],
  body: (f) => new Op().i32Const(1).i32Const(0).i32Const(1).i32Const(8).call(f.fdWrite).drop(),
});

const ENGINES = ['node', 'wasmtime'] as const;

// (a) arithmetic, returned through the exit code
for (const engine of ENGINES) {
  test(`(a) arithmetic exit code via ${engine}`, { skip: engine === 'wasmtime' && !hasWasmtime() }, async () => {
    const bytes = command({ body: (f) => new Op().i32Const(6).i32Const(7).i32Mul().call(f.exit) });
    assert.ok(validate(bytes).ok);
    const r = await run(bytes, { engine });
    assert.equal(r.exitCode, 42);
    assert.equal(r.trap, null);
  });
}

// (b) memory store then load
test('(b) memory store and load', async () => {
  const bytes = command({
    body: (f) => new Op().i32Const(8).i32Const(200).i32Store().i32Const(8).i32Load().call(f.exit),
  });
  assert.equal((await run(bytes, { engine: 'node' })).exitCode, 200);
});

// (c) a loop summing 1..10
test('(c) loop sums 1..10', async () => {
  const bytes = command({
    locals: ['i32', 'i32'], // local 0 = i, local 1 = sum
    body: (f) => new Op()
      .i32Const(1).localSet(0)
      .block()
        .loop()
          .localGet(0).i32Const(10).i32GtS().brIf(1)
          .localGet(1).localGet(0).i32Add().localSet(1)
          .localGet(0).i32Const(1).i32Add().localSet(0)
          .br(0)
        .end()
      .end()
      .localGet(1).call(f.exit),
  });
  assert.equal((await run(bytes, { engine: 'node' })).exitCode, 55);
});

// (d) WASI fd_write prints hello, honoring stdoutLimit
for (const engine of ENGINES) {
  test(`(d) fd_write hello world via ${engine}`, { skip: engine === 'wasmtime' && !hasWasmtime() }, async () => {
    const r = await run(HELLO, { engine });
    assert.equal(r.stdout, 'hello\n');
    assert.equal(r.exitCode, 0);
    const cut = await run(HELLO, { engine, stdoutLimit: 3 });
    assert.equal(cut.stdout, 'hel');
    assert.equal(cut.stdoutTruncated, true);
  });
}

// (e) an infinite loop runs out of fuel (wasmtime) or hits the timeout (node fallback)
test('(e) infinite loop exhausts fuel', { skip: !hasWasmtime() }, async () => {
  const bytes = command({ body: () => new Op().loop().br(0).end() });
  const r = await run(bytes, { engine: 'wasmtime', fuel: 1_000_000 });
  assert.equal(r.fuelExhausted, true);
  assert.notEqual(r.trap, null);
});

test('(e) infinite loop hits the node fallback timeout', async () => {
  const bytes = command({ body: () => new Op().loop().br(0).end() });
  const r = await run(bytes, { engine: 'node', timeoutMs: 500 });
  assert.equal(r.exitCode, 124);
  assert.match(r.trap ?? '', /^timeout/);
});

// (f) imports outside wasi_snapshot_preview1 fail validation
test('(f) env import fails validation', () => {
  const m = new ModuleBuilder();
  m.importFunc('env', 'foo', [], []);
  m.setMemory(1);
  m.exportMemory('memory');
  const start = m.declareFunc([], []);
  m.defineFunc(start, new Op());
  m.exportFunc('_start', start);
  const r = validate(m.toBytes());
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('env.foo')), r.errors.join('; '));
});

// (g) the browser shim runs hello world in-process
test('(g) browser shim runs hello world', async () => {
  const r = await runWasi(HELLO);
  assert.equal(r.stdout, 'hello\n');
  assert.equal(r.exitCode, 0);
  assert.equal(r.trap, null);
});

test('(g) browser shim reads a file through path_open and fd_read', async () => {
  const bytes = command({
    data: [[0, Uint8Array.of(100, 0, 0, 0, 5, 0, 0, 0)], [8, Uint8Array.of(100, 0, 0, 0, 5, 0, 0, 0)], [64, 'a.txt']],
    body: (f) => new Op()
      .i32Const(3).i32Const(0).i32Const(64).i32Const(5).i32Const(0)
      .i64Const(0).i64Const(0).i32Const(0).i32Const(80).call(f.pathOpen).drop()
      .i32Const(80).i32Load().i32Const(8).i32Const(1).i32Const(88).call(f.fdRead).drop()
      .i32Const(1).i32Const(0).i32Const(1).i32Const(92).call(f.fdWrite).drop(),
  });
  // path_open and fd_read write into the data at 100; the file content is copied there by fd_read
  const r = await runWasi(bytes, { files: { 'a.txt': 'hello' } });
  assert.equal(r.stdout, 'hello');
  assert.equal(r.exitCode, 0);
});

test('(g) wasi-browser.ts imports no Node APIs', () => {
  const src = readFileSync(fileURLToPath(new URL('./wasi-browser.ts', import.meta.url)), 'utf8');
  assert.doesNotMatch(src, /from\s+['"](node:|fs|path|os|child_process)/);
});

test('LEB128 encodings match the spec examples', () => {
  assert.deepEqual(Array.from(uleb(624485)), [0xe5, 0x8e, 0x26]);
  assert.deepEqual(Array.from(sleb(-123456)), [0xc0, 0xbb, 0x78]);
  assert.deepEqual(Array.from(sleb(-1)), [0x7f]);
});
