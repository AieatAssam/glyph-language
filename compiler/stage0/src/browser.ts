// Browser entry for the playground: no Node APIs. Contract: site/README.md, "Compiler module".
import { compile as compileSource, format as formatSource, type Diagnostic } from './core.ts';

export type CompileOptions = { file?: string };
export type CompileOutput = { ok: boolean; wasm?: Uint8Array; diagnostics: Diagnostic[] };

export function compile(source: string, opts: CompileOptions = {}): CompileOutput {
  const r = compileSource(source, opts.file ?? 'main.toy');
  return r.ok ? { ok: true, wasm: r.bytes, diagnostics: [] } : { ok: false, diagnostics: r.diagnostics };
}

export function format(source: string): string {
  return formatSource(source);
}
