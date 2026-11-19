# WebAssembly toolkit

Node 24 TypeScript, run directly (type stripping, erasable syntax only, no npm dependencies).
Run the tests from the repo root: `node --test toolkit/`.

## Files

- `wasm-encoder.ts`: `ModuleBuilder` and `Op` for writing modules, plus `uleb` and `sleb` (LEB128).
- `validate.ts`: `validate(bytes, { requireCommand })` checks imports and command exports.
- `run.ts`: `run(input, opts)` runs a module with wasmtime, or with `node:wasi` when wasmtime is absent.
- `wasi-browser.ts`: `createWasi` and `runWasi`, a WASI preview1 subset with no Node APIs.
- `toolkit.test.ts`: the test suite. `package.json` points `node --test toolkit/` at it.

## Public API

```ts
const m = new ModuleBuilder();
const exit = m.importFunc('wasi_snapshot_preview1', 'proc_exit', ['i32'], []);
m.setMemory(1); m.exportMemory('memory');
const start = m.declareFunc([], []);
m.defineFunc(start, new Op().i32Const(42).call(exit));
m.exportFunc('_start', start);
const bytes = m.toBytes();

validate(bytes);                       // { ok, errors, imports }
await run(bytes, { fuel, memoryMb, stdoutLimit, timeoutMs, engine, args, stdin, dir });
// -> { exitCode, stdout, stderr, trap, fuelExhausted, stdoutTruncated, engine }
await runWasi(bytes, { args, stdin, files });   // browser: -> { exitCode, stdout, stderr, trap }
```

Imports must be added before `declareFunc`. Each function body gets its final `end` automatically.

## Limits

- wasmtime: `fuel` (default 1e9) and `memoryMb` (default 256) are enforced. `fuelExhausted` reports fuel runs out.
- node fallback: no fuel or memory limit. `timeoutMs` (default 10 s) kills the child with exit 124.
- Exit codes: `proc_exit(n)` returns n. A trap returns 134, as wasmtime does.
- `wasi-browser` is read-only: `path_open` reads from `files`. `clock_time_get` returns 0 and `random_get` fills zeros.

## CLI

```
node toolkit/validate.ts f.wasm          # JSON result, exit 0 if ok
node toolkit/run.ts f.wasm [args...]     # streams stdin, exits with the program's code
```
