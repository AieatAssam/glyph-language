// Code generation for the walking-skeleton program (RFC 0014 subtask 6, stage 3): one function
// `main` with the io effect whose body is one call `print(INT)`, or an empty body (RFC 0048 `{ }`).
// The module is a WASI command: it imports fd_write and proc_exit (through the trap runtime), exports
// memory, and exports `_start` as the function `main`.
//
// ponytail: only this shape is generated. Ceiling: any other callee, or any other function name,
// makes generate throw. Upgrade path: the kernel's checker and code generator replace this file one
// production at a time, with a conformance test for each.
import { ModuleBuilder, Op } from '../../../toolkit/wasm-encoder.ts';
import { addTrapRuntime } from './kernel/rt-trap.ts';
import { addPrintRuntime } from './kernel/rt-print.ts';
import { INT_MAX } from './kernel/types.ts';
import type { Program } from './parser/parse.ts';

// Returns the bytes of a WASI command module for the program. Throws an Error for a program outside
// the walking-skeleton shape.
export function generate(tree: Program): Uint8Array {
  const { fn } = tree;
  if (fn.name.text !== 'main') {
    throw new Error(`codegen: the function must be main, not ${fn.name.text}`);
  }
  const body = new Op();
  if (fn.body !== null) {
    if (fn.body.callee.text !== 'print') {
      throw new Error(`codegen: only print can be called, not ${fn.body.callee.text}`);
    }
    // The lexer keeps the digits as written. A value above INT_MAX is the checker's E0500, which does
    // not exist yet, so codegen refuses it rather than wrap it.
    const value = BigInt(fn.body.arg.text);
    if (value > INT_MAX) {
      throw new Error('codegen: integer literal is above the Int range');
    }
    body.i64Const(value);
    // The print call is added below, once the runtime exists.
  }

  const m = new ModuleBuilder();
  const rt = addTrapRuntime(m);
  const p = addPrintRuntime(m, rt);
  if (fn.body !== null) body.call(p.printInt);
  const main = m.addFunc([], [], body);
  m.exportFunc('_start', main);
  return m.toBytes();
}
