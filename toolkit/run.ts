// Runs a WASI command module with fuel, memory and stdout limits.
// Engine: `wasmtime run` when it is on PATH; otherwise node:wasi in a child process with a timeout.
// Library: run(bytes | path, opts). CLI: node toolkit/run.ts f.wasm [args...]
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const DEFAULT_FUEL = 1_000_000_000;
const DEFAULT_MEMORY_MB = 256;
const DEFAULT_STDOUT_LIMIT = 1 << 20; // 1 MiB
const DEFAULT_FALLBACK_TIMEOUT_MS = 10_000;

export interface RunOptions {
  args?: string[];
  stdin?: string | Uint8Array | 'inherit'; // default: empty stdin
  dir?: string; // host directory preopened in the guest as "."
  fuel?: number; // instruction budget, wasmtime only (default 1e9)
  memoryMb?: number; // linear memory cap, wasmtime only (default 256)
  stdoutLimit?: number; // bytes of stdout kept in the result (default 1 MiB)
  timeoutMs?: number; // node fallback only (default 10 s); wasmtime is fuel-bounded
  engine?: 'auto' | 'wasmtime' | 'node'; // default auto
  echo?: boolean; // also copy program output to this process's stdout and stderr
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  trap: string | null;
  fuelExhausted: boolean;
  stdoutTruncated: boolean;
  engine: 'wasmtime' | 'node';
}

let wasmtimeOnPath: boolean | null = null;
export function hasWasmtime(): boolean {
  if (wasmtimeOnPath === null) wasmtimeOnPath = spawnSync('wasmtime', ['--version'], { stdio: 'ignore' }).status === 0;
  return wasmtimeOnPath;
}

export async function run(input: string | Uint8Array, opts: RunOptions = {}): Promise<RunResult> {
  let tmp: string | null = null;
  let file: string;
  if (typeof input === 'string') {
    file = resolve(input);
  } else {
    tmp = mkdtempSync(join(tmpdir(), 'glyph-run-'));
    file = join(tmp, 'program.wasm');
    writeFileSync(file, input);
  }
  try {
    const engine = opts.engine ?? 'auto';
    if (engine === 'wasmtime' && !hasWasmtime()) throw new Error('wasmtime is not on PATH');
    if (engine === 'wasmtime' || (engine === 'auto' && hasWasmtime())) return await runWasmtime(file, opts);
    return await runNodeWasi(file, opts);
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

async function runWasmtime(file: string, opts: RunOptions): Promise<RunResult> {
  const memBytes = (opts.memoryMb ?? DEFAULT_MEMORY_MB) * 1024 * 1024;
  const args = ['run', '-C', 'cache=n', '-W', `fuel=${opts.fuel ?? DEFAULT_FUEL}`, '-W', `max-memory-size=${memBytes}`];
  if (opts.dir) args.push('--dir', `${resolve(opts.dir)}::.`);
  args.push(file, ...(opts.args ?? []));
  const r = await spawnCapture('wasmtime', args, opts);
  return summarize(r, 'wasmtime');
}

async function runNodeWasi(file: string, opts: RunOptions): Promise<RunResult> {
  const payload = JSON.stringify({ file, args: opts.args ?? [], dir: opts.dir ? resolve(opts.dir) : null });
  const r = await spawnCapture(process.execPath, ['--no-warnings=ExperimentalWarning', SELF, '--node-wasi', payload], opts, opts.timeoutMs ?? DEFAULT_FALLBACK_TIMEOUT_MS);
  return summarize(r, 'node');
}

interface Captured {
  code: number;
  stdout: Buffer;
  stdoutTruncated: boolean;
  stderr: Buffer;
  timedOut: boolean;
}

function collector(limit: number) {
  const parts: Buffer[] = [];
  let size = 0;
  let truncated = false;
  return {
    add(chunk: Buffer): void {
      const room = limit - size;
      if (chunk.length > room) truncated = true;
      if (room > 0) {
        const take = chunk.subarray(0, Math.min(room, chunk.length));
        parts.push(take);
        size += take.length;
      }
    },
    result: () => ({ bytes: Buffer.concat(parts), truncated }),
  };
}

function spawnCapture(cmd: string, args: string[], opts: RunOptions, timeoutMs?: number): Promise<Captured> {
  const limit = opts.stdoutLimit ?? DEFAULT_STDOUT_LIMIT;
  const inherit = opts.stdin === 'inherit';
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: [inherit ? 'inherit' : 'pipe', 'pipe', 'pipe'] });
    const out = collector(limit);
    const err = collector(limit);
    let timedOut = false;
    const timer = timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs) : null;
    child.stdout.on('data', (c: Buffer) => {
      if (opts.echo) process.stdout.write(c);
      out.add(c);
    });
    child.stderr.on('data', (c: Buffer) => {
      if (opts.echo) process.stderr.write(c);
      err.add(c);
    });
    if (child.stdin) {
      child.stdin.on('error', () => {}); // the program may exit without reading its input
      child.stdin.end(opts.stdin ?? '');
    }
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const o = out.result();
      const e = err.result();
      resolvePromise({
        code: timedOut ? 124 : (code ?? 1),
        stdout: o.bytes,
        stdoutTruncated: o.truncated,
        stderr: e.bytes,
        timedOut,
      });
    });
  });
}

const TRAP_PREFIX = 'wasm trap: ';

function summarize(r: Captured, engine: 'wasmtime' | 'node'): RunResult {
  const stderr = r.stderr.toString('utf8');
  let trap: string | null = null;
  if (r.timedOut) trap = 'timeout: node fallback exceeded its time limit';
  const line = stderr.split('\n').find((l) => l.includes(TRAP_PREFIX));
  if (!trap && line) trap = line.slice(line.indexOf(TRAP_PREFIX) + TRAP_PREFIX.length).trim();
  return {
    exitCode: r.code,
    stdout: r.stdout.toString('utf8'),
    stderr,
    trap,
    fuelExhausted: engine === 'wasmtime' && trap !== null && /fuel/i.test(trap),
    stdoutTruncated: r.stdoutTruncated,
    engine,
  };
}

// Child process entry for the node fallback: runs the module with node:wasi on this process's stdio.
async function nodeWasiChild(payload: string): Promise<void> {
  const { WASI } = await import('node:wasi');
  const cfg = JSON.parse(payload) as { file: string; args: string[]; dir: string | null };
  const wasi = new WASI({
    version: 'preview1',
    args: ['program.wasm', ...cfg.args],
    env: {},
    preopens: cfg.dir ? { '.': cfg.dir } : {},
    returnOnExit: true,
  });
  try {
    const module = await WebAssembly.compile(readFileSync(cfg.file));
    const instance = await WebAssembly.instantiate(module, wasi.getImportObject());
    process.exitCode = wasi.start(instance);
  } catch (e) {
    if (e instanceof WebAssembly.RuntimeError) {
      process.stderr.write(`${TRAP_PREFIX}${(e as Error).message}\n`);
      process.exitCode = 134;
    } else {
      process.stderr.write(`error: ${(e as Error).message}\n`);
      process.exitCode = 2;
    }
  }
}

function isMain(): boolean {
  return process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isMain()) {
  const [first, second, ...rest] = process.argv.slice(2);
  if (first === '--node-wasi') {
    await nodeWasiChild(second);
  } else if (!first) {
    console.error('usage: node toolkit/run.ts f.wasm [args...]');
    process.exitCode = 2;
  } else {
    const r = await run(first, { args: [second, ...rest].filter((a) => a !== undefined), stdin: 'inherit', echo: true });
    process.exitCode = r.exitCode;
  }
}
