// Source text to WebAssembly bytes for the walking-skeleton program: lex, parse, generate. Any
// failure comes back as a reason string. The CLI has no diagnostic records for these yet, so
// callers decide what to print (see main.ts).
import type { Buffer } from 'node:buffer';
import { generate, generateMain } from './codegen.ts';
import { lex } from './lexer/index.ts';
import { parse as parseOld } from './parser/parse.ts';
import { parse } from './parser/index.ts';

export type Compiled = { wasm: Uint8Array } | { reason: string };

// ponytail: when the RFC 0104 parser rejects the source, parser/parse.ts still reads the old
// `fn main() io { print(1) }` form, so conformance kernel/print-one keeps passing. Ceiling: that one
// form. Upgrade path: subtask 22 of rfcs/0109.plan.md retires print-one and this fallback with it.
export function compile(buf: Buffer): Compiled {
  try {
    const lexed = lex(buf);
    if (lexed.error !== null) {
      return { reason: `lexical error ${lexed.error.code} at byte ${lexed.error.start}` };
    }
    const parsed = parse(lexed.tokens);
    if ('error' in parsed) {
      const old = parseOld(lexed.tokens);
      if ('tree' in old) return { wasm: generate(old.tree) };
      return { reason: `${parsed.error.code} at byte ${parsed.error.start}` };
    }
    if (parsed.tree.decls.length !== 1) {
      return { reason: 'codegen: the walking skeleton takes exactly one declaration' };
    }
    return { wasm: generateMain(lexed.tokens, parsed.tree.decls[0]) };
  } catch (e) {
    // The lexer throws for a text literal, which subtask 6 has not lexed yet, and generate throws
    // for a shape it does not handle. Both come back as a reason, not a crash.
    return { reason: e instanceof Error ? e.message : String(e) };
  }
}
