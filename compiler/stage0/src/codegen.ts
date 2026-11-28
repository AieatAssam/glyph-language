// Code generation for the walking-skeleton program (RFC 0014 subtask 6, stage 3): one function
// `main` with the io effect whose body is one call `print(INT)`, or an empty body (RFC 0048 `{ }`).
// The module is a WASI command: it imports fd_write and proc_exit (through the trap runtime), exports
// memory, and exports `_start` as the function `main`.
//
// Two entry points. generateMain reads a declaration of the RFC 0104 parser (parser/index.ts): its
// body is `{}` or `{ put INT }`, read from the body's tokens, which the parser has already checked.
// generate reads the old tree of parser/parse.ts, kept for the `fn main() io { print(1) }` form.
//
// ponytail: only these shapes are generated. Ceiling: any other statement, callee, or function name
// makes the generator throw. Upgrade path: the kernel's checker and code generator replace this file
// one production at a time, with a conformance test for each. Statements are not in the tree yet
// (decl.ts keeps only the block's span), so generateMain reads the put from the block's tokens.
import { ModuleBuilder, Op } from '../../../toolkit/wasm-encoder.ts';
import { Kind, type Token } from './lexer/token.ts';
import type { Decl } from './parser/decl.ts';
import { addTrapRuntime } from './kernel/rt-trap.ts';
import { addPrintRuntime } from './kernel/rt-print.ts';
import { INT_MAX } from './kernel/types.ts';
import type { Program } from './parser/parse.ts';

// Returns the bytes of a WASI command module for the old-tree program. Throws an Error for a program
// outside the walking-skeleton shape.
export function generate(tree: Program): Uint8Array {
  const { fn } = tree;
  if (fn.name.text !== 'main') {
    throw new Error(`codegen: the function must be main, not ${fn.name.text}`);
  }
  if (fn.body === null) return moduleOf(null);
  if (fn.body.callee.text !== 'print') {
    throw new Error(`codegen: only print can be called, not ${fn.body.callee.text}`);
  }
  return moduleOf(intValue(fn.body.arg.text));
}

// Returns the bytes of a WASI command module for one declaration of the RFC 0104 parser, with the
// tokens it was parsed from. Throws an Error for a declaration outside the walking-skeleton shape.
export function generateMain(tokens: readonly Token[], decl: Decl): Uint8Array {
  if (decl.name.text !== 'main') {
    throw new Error(`codegen: the function must be main, not ${decl.name.text}`);
  }
  if (decl.params !== null || decl.result !== null) {
    throw new Error('codegen: main takes no parameters and has no result');
  }
  if (decl.ex.length > 0) throw new Error('codegen: examples are not generated yet');
  // The body span runs from `{` to `}`; the tokens strictly inside it are the statements.
  const inner = tokens.filter(
    (t) => t.kind !== Kind.NEWLINE && t.kind !== Kind.EOF &&
      t.start > decl.body.start && t.end < decl.body.end,
  );
  if (inner.length === 0) return moduleOf(null);
  if (inner.length === 2 && inner[0].kind === Kind.KW_PUT && inner[1].kind === Kind.INT) {
    return moduleOf(intValue(inner[1].text ?? ''));
  }
  throw new Error('codegen: only `put INT` or an empty body is generated yet');
}

// The lexer keeps the digits as written. A value above INT_MAX is the checker's E0500, which does
// not exist yet, so codegen refuses it rather than wrap it.
function intValue(text: string): bigint {
  const value = BigInt(text);
  if (value > INT_MAX) throw new Error('codegen: integer literal is above the Int range');
  return value;
}

// The module for `main`: one call of print with the value, or an empty body when value is null.
function moduleOf(value: bigint | null): Uint8Array {
  const body = new Op();
  if (value !== null) body.i64Const(value);
  const m = new ModuleBuilder();
  const rt = addTrapRuntime(m);
  const p = addPrintRuntime(m, rt);
  if (value !== null) body.call(p.printInt);
  const main = m.addFunc([], [], body);
  m.exportFunc('_start', main);
  return m.toBytes();
}
