// Minimal WASI preview1 shim for browsers: no filesystem, no Node APIs.
// Supports stdio (fd 0-2), args, env, an in-memory read-only file map (preopen fd 3 = "."), proc_exit.
// clock_time_get returns 0 and random_get fills zeros, so runs are deterministic. Other calls are not provided.
// Usage: const { exitCode, stdout, stderr, trap } = await runWasi(bytes, { args, stdin, files })

export const WASI_MODULE = 'wasi_snapshot_preview1';
export const ERRNO = { SUCCESS: 0, BADF: 8, NOENT: 44, INVAL: 28 } as const;
const PREOPEN_FD = 3;

export class WasiExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`proc_exit(${code})`);
    this.code = code;
  }
}

export interface WasiOptions {
  args?: string[];
  env?: Record<string, string>;
  stdin?: Uint8Array | string;
  files?: Record<string, Uint8Array | string>; // readable from the preopened "." directory
  onStdout?: (chunk: Uint8Array) => void;
  onStderr?: (chunk: Uint8Array) => void;
}

export interface WasiShim {
  imports: WebAssembly.Imports;
  bind(memory: WebAssembly.Memory): void; // call with instance.exports.memory before _start runs
}

export function createWasi(opts: WasiOptions = {}): WasiShim {
  const enc = new TextEncoder();
  const args = (opts.args ?? []).map((a) => enc.encode(`${a}\0`));
  const env = Object.entries(opts.env ?? {}).map(([k, v]) => enc.encode(`${k}=${v}\0`));
  const stdin = typeof opts.stdin === 'string' ? enc.encode(opts.stdin) : (opts.stdin ?? new Uint8Array());
  let stdinPos = 0;
  let memory: WebAssembly.Memory | null = null;
  const files = new Map(Object.entries(opts.files ?? {}).map(([k, v]) => [k, typeof v === 'string' ? enc.encode(v) : v]));
  const handles = new Map<number, { data: Uint8Array; pos: number }>(); // fds >= 4 from path_open
  let nextFd = PREOPEN_FD + 1;

  const bytes = (ptr: number, len: number): Uint8Array => new Uint8Array(memory!.buffer, ptr, len);
  const view = (): DataView => new DataView(memory!.buffer);
  const u32 = (ptr: number, v: number): void => view().setUint32(ptr, v, true);

  // Writes the list of NUL-terminated strings: pointer array at ptrsPtr, bytes at bufPtr.
  const writeStrings = (list: Uint8Array[], ptrsPtr: number, bufPtr: number): number => {
    let off = bufPtr;
    list.forEach((s, i) => {
      u32(ptrsPtr + i * 4, off);
      bytes(off, s.length).set(s);
      off += s.length;
    });
    return ERRNO.SUCCESS;
  };
  const sizesOf = (list: Uint8Array[], countPtr: number, sizePtr: number): number => {
    u32(countPtr, list.length);
    u32(sizePtr, list.reduce((n, s) => n + s.length, 0));
    return ERRNO.SUCCESS;
  };

  const sink = (cb: ((chunk: Uint8Array) => void) | undefined): ((chunk: Uint8Array) => void) =>
    cb ?? (() => {});
  const onOut = sink(opts.onStdout);
  const onErr = sink(opts.onStderr);

  const wasi = {
    args_sizes_get: (countPtr: number, sizePtr: number) => sizesOf(args, countPtr, sizePtr),
    args_get: (ptrsPtr: number, bufPtr: number) => writeStrings(args, ptrsPtr, bufPtr),
    environ_sizes_get: (countPtr: number, sizePtr: number) => sizesOf(env, countPtr, sizePtr),
    environ_get: (ptrsPtr: number, bufPtr: number) => writeStrings(env, ptrsPtr, bufPtr),
    fd_write: (fd: number, iovs: number, iovsLen: number, nwrittenPtr: number): number => {
      if (fd !== 1 && fd !== 2) return ERRNO.BADF;
      const out = fd === 1 ? onOut : onErr;
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        out(bytes(ptr, len).slice());
        total += len;
      }
      u32(nwrittenPtr, total);
      return ERRNO.SUCCESS;
    },
    fd_read: (fd: number, iovs: number, iovsLen: number, nreadPtr: number): number => {
      const src = fd === 0 ? { data: stdin, pos: stdinPos } : handles.get(fd);
      if (!src) return ERRNO.BADF;
      let total = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = view().getUint32(iovs + i * 8, true);
        const len = view().getUint32(iovs + i * 8 + 4, true);
        const n = Math.min(len, src.data.length - src.pos);
        bytes(ptr, n).set(src.data.subarray(src.pos, src.pos + n));
        src.pos += n;
        total += n;
        if (n < len) break;
      }
      if (fd === 0) stdinPos = src.pos;
      u32(nreadPtr, total);
      return ERRNO.SUCCESS;
    },
    fd_close: (fd: number) => (fd >= PREOPEN_FD + 1 && handles.delete(fd) ? ERRNO.SUCCESS : ERRNO.BADF),
    fd_prestat_get: (fd: number, prestatPtr: number): number => {
      if (fd !== PREOPEN_FD) return ERRNO.BADF;
      view().setUint8(prestatPtr, 0); // preopen type: directory
      u32(prestatPtr + 4, 1); // name length of "."
      return ERRNO.SUCCESS;
    },
    fd_prestat_dir_name: (fd: number, pathPtr: number, pathLen: number): number => {
      if (fd !== PREOPEN_FD || pathLen < 1) return ERRNO.BADF;
      bytes(pathPtr, 1).set(enc.encode('.'));
      return ERRNO.SUCCESS;
    },
    path_open: (dirfd: number, _dirflags: number, pathPtr: number, pathLen: number, _oflags: number,
      _rights: bigint, _inherit: bigint, _fdflags: number, fdPtr: number): number => {
      if (dirfd !== PREOPEN_FD) return ERRNO.BADF;
      const name = new TextDecoder().decode(bytes(pathPtr, pathLen));
      const data = files.get(name);
      if (!data) return ERRNO.NOENT;
      handles.set(nextFd, { data, pos: 0 });
      u32(fdPtr, nextFd++);
      return ERRNO.SUCCESS;
    },
    clock_time_get: (_id: number, _precision: bigint, timePtr: number): number => {
      view().setBigUint64(timePtr, 0n, true);
      return ERRNO.SUCCESS;
    },
    random_get: (ptr: number, len: number): number => {
      bytes(ptr, len).fill(0);
      return ERRNO.SUCCESS;
    },
    proc_exit: (code: number): never => {
      throw new WasiExit(code);
    },
  };

  return {
    imports: { [WASI_MODULE]: wasi },
    bind(m: WebAssembly.Memory) {
      memory = m;
    },
  };
}

export interface BrowserRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  trap: string | null;
}

// Runs a WASI command module (exports _start and memory) and collects its output as text.
export async function runWasi(bytes: BufferSource, opts: WasiOptions = {}): Promise<BrowserRunResult> {
  const dec = new TextDecoder();
  const out: Uint8Array[] = [];
  const err: Uint8Array[] = [];
  const shim = createWasi({
    ...opts,
    onStdout: (c) => { out.push(c); opts.onStdout?.(c); },
    onStderr: (c) => { err.push(c); opts.onStderr?.(c); },
  });
  const { instance } = await WebAssembly.instantiate(bytes, shim.imports);
  const memory = instance.exports.memory as WebAssembly.Memory;
  shim.bind(memory);
  const finish = (exitCode: number, trap: string | null): BrowserRunResult => ({
    exitCode,
    stdout: dec.decode(concat(out)),
    stderr: dec.decode(concat(err)),
    trap,
  });
  try {
    (instance.exports._start as () => void)();
    return finish(0, null);
  } catch (e) {
    if (e instanceof WasiExit) return finish(e.code, null);
    if (e instanceof WebAssembly.RuntimeError) return finish(134, e.message);
    throw e;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    result.set(p, off);
    off += p.length;
  }
  return result;
}
