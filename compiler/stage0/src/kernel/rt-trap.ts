// Trap runtime (RFC 0020, TR1). Adds one function, trap(kind: i32), that writes the trap line for
// a kind to standard error and exits with status 1 through proc_exit. The kind is an index into
// TRAP_KINDS. The compiler passes only constant kinds.
//
// Memory layout, fixed by data segments:
//   0 .. 8K-1    table: entry k is the (pointer, length) of the trap line for kind k, as two
//                little-endian i32 values (K is the number of kinds)
//   32 .. 39     iovec passed to fd_write
//   40 .. 43     nwritten, the result word of fd_write
//   64 ..        the trap lines, each ending in LF
//
// ponytail: an index outside 0..K-1 reads past the table and writes whatever bytes are there, then
// exits 1. The compiler never passes one, so this is not reachable. Upgrade path: trap on a bad index.
import { Op, type ModuleBuilder } from '../../../../toolkit/wasm-encoder.ts';
import { TRAP_KINDS, TRAP_LINE } from './types.ts';

const WASI = 'wasi_snapshot_preview1';
const TABLE = 0;
const IOVEC = 32;
const NWRITTEN = 40;
const LINES = 64;
const ENTRY_BYTES = 8;

export interface TrapRuntime {
  // Function index of trap(kind: i32). It has no result and does not return.
  trap: number;
}

// Call once per module. It imports fd_write and proc_exit, so it must run before any local
// function is added, and it exports the memory.
export function addTrapRuntime(m: ModuleBuilder): TrapRuntime {
  const fdWrite = m.importFunc(WASI, 'fd_write', ['i32', 'i32', 'i32', 'i32'], ['i32']);
  const procExit = m.importFunc(WASI, 'proc_exit', ['i32'], []);
  m.setMemory(1);
  m.exportMemory('memory');

  const table = new Uint8Array(TRAP_KINDS.length * ENTRY_BYTES);
  const view = new DataView(table.buffer);
  let at = LINES;
  TRAP_KINDS.forEach((kind, k) => {
    const line = new TextEncoder().encode(`${TRAP_LINE[kind]}\n`);
    view.setInt32(k * ENTRY_BYTES, at, true);
    view.setInt32(k * ENTRY_BYTES + 4, line.length, true);
    m.addData(at, line);
    at += line.length;
  });
  m.addData(TABLE, table);

  const trap = m.addFunc(['i32'], [], new Op()
    // iovec.buf = table[kind].pointer
    .i32Const(IOVEC).localGet(0).i32Const(ENTRY_BYTES).i32Mul().i32Load(TABLE).i32Store(0)
    // iovec.len = table[kind].length
    .i32Const(IOVEC + 4).localGet(0).i32Const(ENTRY_BYTES).i32Mul().i32Load(TABLE + 4).i32Store(0)
    // fd_write(2, iovec, 1, nwritten)
    .i32Const(2).i32Const(IOVEC).i32Const(1).i32Const(NWRITTEN).call(fdWrite).drop()
    // proc_exit(1)
    .i32Const(1).call(procExit));

  return { trap };
}
