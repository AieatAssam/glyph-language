// Source text to WebAssembly bytes for the walking-skeleton program: lex, parse, generate. Any
// failure comes back as a reason string. The CLI has no diagnostic records for these yet, so
// callers decide what to print (see main.ts).
import type { Buffer } from 'node:buffer';
import { generate } from './codegen.ts';
import { lex } from './lexer/index.ts';
import { parse } from './parser/parse.ts';

export type Compiled = { wasm: Uint8Array } | { reason: string };

export function compile(buf: Buffer): Compiled {
  try {
    const lexed = lex(buf);
    if (lexed.error !== null) {
      return { reason: `lexical error ${lexed.error.code} at byte ${lexed.error.start}` };
    }
    const parsed = parse(lexed.tokens);
    if ('error' in parsed) {
      return { reason: `${parsed.error.code} at byte ${parsed.error.start}` };
    }
    return { wasm: generate(parsed.tree) };
  } catch (e) {
    // The lexer throws for a text literal, which subtask 6 has not lexed yet, and generate throws
    // for a shape it does not handle. Both come back as a reason, not a crash.
    return { reason: e instanceof Error ? e.message : String(e) };
  }
}
