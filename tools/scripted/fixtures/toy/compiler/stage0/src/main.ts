// Stage 0 CLI for the toy language (M1). Node only: file I/O and WASI. The compiler is core.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { WASI } from 'node:wasi';
import { compile, type Diagnostic } from './core.ts';

function fmt(d: Diagnostic, json: boolean): string {
  if (json) {
    return JSON.stringify({ code: d.code, severity: 'error', message: d.message,
      span: { file: d.file, start: [d.span.line, d.span.col], end: [d.span.line, d.span.col] } });
  }
  return `${d.file}:${d.span.line}:${d.span.col}: error ${d.code}: ${d.message}`;
}

export function main(argv: string[]): number {
  const [cmd, file, ...rest] = argv;
  const json = rest.includes('--json');
  if (cmd === '--version') { console.log('glyphc stage0 0.1.0 (spec 0.1.0)'); return 0; }
  if (!cmd || !file || !['check', 'build', 'run'].includes(cmd)) {
    console.error('usage: glyphc check|build|run <file> [-o out.wasm] [--json]');
    return 2;
  }
  const result = compile(readFileSync(file, 'utf8'), file);
  if (!result.ok) {
    for (const d of result.diagnostics) console.log(fmt(d, json));
    return 1;
  }
  if (cmd === 'check') return 0;
  if (cmd === 'build') {
    const oi = rest.indexOf('-o');
    if (oi < 0 || !rest[oi + 1]) { console.error('build needs -o <out.wasm>'); return 2; }
    writeFileSync(rest[oi + 1]!, result.bytes);
    return 0;
  }
  const wasi = new WASI({ version: 'preview1', args: [file], env: {}, returnOnExit: true });
  const inst = new WebAssembly.Instance(new WebAssembly.Module(result.bytes), wasi.getImportObject() as WebAssembly.Imports);
  try {
    return wasi.start(inst);
  } catch (err) {
    // ponytail: every wasm trap maps to exit 1; a trap code table can come with the spec's runtime errors chapter
    console.error(`trap: ${(err as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
