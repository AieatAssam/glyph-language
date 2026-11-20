// Print runtime (RFC 0020, P2 and P3). Adds two functions:
//   print_int(v: i64)          writes v in decimal, a leading "-" if negative, no leading zeros, then LF
//   print_text(ptr: i32, len: i32)  writes len bytes at ptr unchanged, then LF
// Both write to standard output (fd 1) through fd_write, once per call, so each print finishes
// before the next statement runs.
//
// Memory layout, fixed here. Anything the compiler places in memory must start at or above
// PRINT_RESERVED_END (rt-trap uses 0 .. 143):
//   256 .. 287   digit buffer for print_int, written from the end backwards
//   288 .. 303   iovec array for fd_write (one entry for print_int, two for print_text)
//   304          the LF byte, for print_text
//
// ponytail: fd_write may write fewer bytes than asked for. Neither function retries a short write.
// Upgrade path: loop on nwritten until every iovec byte is written.
import { Op, type ModuleBuilder } from '../../../../toolkit/wasm-encoder.ts';
import type { TrapRuntime } from './rt-trap.ts';

const DIGITS = 256;
const DIGITS_END = 288;
const IOV = 288;
const LF = 304;
const NWRITTEN = 40; // same word rt-trap uses for the fd_write result
const STDOUT = 1;

// First memory address the compiler may use for its own data.
export const PRINT_RESERVED_END = 320;

export interface PrintRuntime {
  // Function index of print_int(v: i64).
  printInt: number;
  // Function index of print_text(ptr: i32, len: i32).
  printText: number;
}

// Call once per module, after addTrapRuntime (which imports fd_write) and before any user function.
export function addPrintRuntime(m: ModuleBuilder, rt: TrapRuntime): PrintRuntime {
  const fdWrite = rt.fdWrite;

  // Locals: 0 = v (taken as the running quotient), 1 = pos, 2 = neg (0 or 1), 3 = remainder.
  const printInt = m.addFunc(['i64'], [], new Op()
    // neg = v < 0
    .localGet(0).i64Const(0).i64LtS().localSet(2)
    // the LF is the last byte; pos starts on it, and each digit is written before pos moves back
    .i32Const(DIGITS_END - 1).i32Const(10).i32Store8()
    .i32Const(DIGITS_END - 1).localSet(1)
    .loop()
      // pos -= 1
      .localGet(1).i32Const(1).i32Sub().localSet(1)
      // r = v % 10, which has the sign of v, and the wrap is exact because |r| <= 9
      .localGet(0).i64Const(10).i64RemS().i32WrapI64().localSet(3)
      // digit = neg ? -r : r, so the digit is never negative
      .localGet(1)
      .i32Const(0).localGet(3).i32Sub()
      .localGet(3)
      .localGet(2)
      .select()
      .i32Const(48).i32Add()
      .i32Store8()
      // v = v / 10, which truncates toward zero, so a negative v reaches 0 too
      .localGet(0).i64Const(10).i64DivS().localSet(0)
      // repeat while v != 0
      .localGet(0).i64Const(0).i64Ne().brIf(0)
    .end()
    // a negative value gets its sign in front of the digits
    .localGet(2).if_()
      .localGet(1).i32Const(1).i32Sub().localSet(1)
      .localGet(1).i32Const(45).i32Store8()
    .end()
    // one iovec: the bytes from pos to the end of the buffer
    .i32Const(IOV).localGet(1).i32Store()
    .i32Const(IOV + 4).i32Const(DIGITS_END).localGet(1).i32Sub().i32Store()
    .i32Const(STDOUT).i32Const(IOV).i32Const(1).i32Const(NWRITTEN).call(fdWrite).drop(),
    ['i32', 'i32', 'i32']);

  // Two iovecs: the Text bytes, then the LF byte.
  const printText = m.addFunc(['i32', 'i32'], [], new Op()
    .i32Const(LF).i32Const(10).i32Store8()
    .i32Const(IOV).localGet(0).i32Store()
    .i32Const(IOV + 4).localGet(1).i32Store()
    .i32Const(IOV + 8).i32Const(LF).i32Store()
    .i32Const(IOV + 12).i32Const(1).i32Store()
    .i32Const(STDOUT).i32Const(IOV).i32Const(2).i32Const(NWRITTEN).call(fdWrite).drop());

  return { printInt, printText };
}
