// Validates a WebAssembly module against the runtime contract: WASI-only imports, and (by default) a command shape.
// CLI: node toolkit/validate.ts f.wasm   (prints JSON, exit 0 if ok, 1 otherwise)
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const WASI_MODULE = 'wasi_snapshot_preview1';

export interface ImportInfo {
  module: string;
  name: string;
  kind: string;
}

export interface ValidateResult {
  ok: boolean;
  errors: string[];
  imports: ImportInfo[];
}

export interface ValidateOptions {
  requireCommand?: boolean; // default true: must export function `_start` and memory `memory`
}

export function validate(bytes: Uint8Array, opts: ValidateOptions = {}): ValidateResult {
  const requireCommand = opts.requireCommand ?? true;
  const errors: string[] = [];

  let mod: WebAssembly.Module | null = null;
  try {
    mod = new WebAssembly.Module(bytes);
  } catch (e) {
    errors.push(`invalid module: ${(e as Error).message}`);
  }
  if (!mod) {
    if (WebAssembly.validate(bytes) === false && errors.length === 0) errors.push('invalid module');
    return { ok: false, errors, imports: [] };
  }

  const imports = WebAssembly.Module.imports(mod).map((i) => ({ module: i.module, name: i.name, kind: i.kind }));
  for (const im of imports) {
    if (im.module !== WASI_MODULE) {
      errors.push(`import ${im.module}.${im.name} is not allowed (only "${WASI_MODULE}" imports are permitted)`);
    }
  }

  if (requireCommand) {
    const exports = WebAssembly.Module.exports(mod);
    const start = exports.find((e) => e.name === '_start');
    if (!start || start.kind !== 'function') errors.push('missing export: _start (function)');
    const memory = exports.find((e) => e.name === 'memory');
    if (!memory || memory.kind !== 'memory') errors.push('missing export: memory (linear memory)');
  }

  return { ok: errors.length === 0, errors, imports };
}

function isMain(): boolean {
  return process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isMain()) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node toolkit/validate.ts f.wasm');
    process.exitCode = 2;
  } else {
    const result = validate(readFileSync(file));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  }
}
