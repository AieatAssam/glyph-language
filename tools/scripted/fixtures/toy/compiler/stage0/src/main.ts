// Stage 0 CLI for the toy language (M1): the SPEC section 8 command table, with diagnostics in the
// SPEC section 7 envelope. Node only (file I/O, process, the toolkit runner). The compiler is core.ts.
// Entry point only: no import guard, so it runs however the path is spelled (symlinks included).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, dump, format, type Diagnostic, type Stage } from './core.ts';
import { run } from '../../../toolkit/run.ts';

const SPEC = join(dirname(fileURLToPath(import.meta.url)), '../../../spec');
const VERSION = '0.1.0';
const USAGE = `usage: glyphc check <file> [--json]
       glyphc build <file> -o <out.wasm> [--json]
       glyphc run <file> [args] [--json]
       glyphc fmt <file> [--check]
       glyphc explain <code>
       glyphc --dump tokens|ast|ir <file>
       glyphc --version`;

type Entry = { title: string; explanation: string; example: string; fixed: string };

function envelope(d: Diagnostic) {
  return {
    code: d.code,
    severity: 'error',
    message: d.message,
    span: { file: d.file, start: [d.span.line, d.span.col], end: [d.end.line, d.end.col] },
    doc: `spec/errors.json#${d.code}`,
  };
}

function report(ds: Diagnostic[], json: boolean): void {
  for (const d of ds) {
    console.log(json ? JSON.stringify(envelope(d))
      : `${d.file}:${d.span.line}:${d.span.col}: error ${d.code}: ${d.message}`);
    // The gate reads JSON Lines diagnostics on stderr (RFC 0004).
    process.stderr.write(JSON.stringify({ code: d.code, span: { line: d.span.line, column: d.span.col } }) + '\n');
  }
}

// Object keys sorted at every level, so dumps are byte-stable.
function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
    : x), 2) + '\n';
}

function readSource(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch (err) {
    console.error(`glyphc: cannot read ${file}: ${(err as Error).message}`);
    return null;
  }
}

function flagValue(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

function check(file: string, json: boolean): number {
  const src = readSource(file);
  if (src === null) return 2;
  const r = compile(src, file);
  if (!r.ok) { report(r.diagnostics, json); return 1; }
  return 0;
}

function build(file: string, rest: string[], json: boolean): number {
  const out = flagValue(rest, '-o');
  if (!out) { console.error('build needs -o <out.wasm>'); return 2; }
  const src = readSource(file);
  if (src === null) return 2;
  const r = compile(src, file);
  if (!r.ok) { report(r.diagnostics, json); return 1; }
  try {
    writeFileSync(out, r.bytes);
  } catch (err) {
    console.error(`glyphc: cannot write ${out}: ${(err as Error).message}`);
    return 2;
  }
  return 0;
}

async function runProgram(file: string, args: string[], json: boolean): Promise<number> {
  const src = readSource(file);
  if (src === null) return 2;
  const r = compile(src, file);
  if (!r.ok) { report(r.diagnostics, json); return 1; }
  const res = await run(r.bytes, { args, stdin: 'inherit' });
  process.stdout.write(res.stdout);
  // SPEC section 8: a runtime failure is a fixed one-line message on stderr and exit 1, never a raw runtime dump.
  if (res.trap !== null) { console.error(`trap: ${res.trap}`); return 1; }
  process.stderr.write(res.stderr);
  return res.exitCode;
}

function fmtCmd(file: string, rest: string[]): number {
  const src = readSource(file);
  if (src === null) return 2;
  const r = compile(src, file);
  if (!r.ok) { report(r.diagnostics, false); return 1; }
  const out = format(src);
  if (rest.includes('--check')) {
    if (out !== src) { console.error(`${file}: not canonically formatted`); return 1; }
    return 0;
  }
  process.stdout.write(out);
  return 0;
}

function explain(code: string | undefined): number {
  if (!code) { console.error('usage: glyphc explain <code>'); return 2; }
  const catalogue: Record<string, Entry> = JSON.parse(readFileSync(join(SPEC, 'errors.json'), 'utf8'));
  if (!Object.hasOwn(catalogue, code)) { console.error(`glyphc: unknown error code ${code}`); return 1; }
  const e = catalogue[code]!;
  console.log(`${code}: ${e.title}\n\n${e.explanation}\n\nexample:\n${e.example}\n\nfixed:\n${e.fixed}`);
  return 0;
}

function dumpCmd(stage: string | undefined, file: string | undefined): number {
  if (!file || !['tokens', 'ast', 'ir'].includes(stage ?? '')) { console.error(USAGE); return 2; }
  const src = readSource(file);
  if (src === null) return 2;
  const r = dump(src, stage as Stage, file);
  if (!r.ok) { report(r.diagnostics, false); return 1; }
  process.stdout.write(canonical(r.value));
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case '--version':
      console.log(`glyphc stage0 ${VERSION} (spec ${readFileSync(join(SPEC, 'VERSION'), 'utf8').trim()})`);
      return 0;
    case '--dump': return dumpCmd(rest[0], rest[1]);
    case 'explain': return explain(rest[0]);
  }
  const file = rest[0];
  if (!file) { console.error(USAGE); return 2; }
  const json = rest.includes('--json');
  switch (cmd) {
    case 'check': return check(file, json);
    case 'build': return build(file, rest, json);
    case 'run': return runProgram(file, rest.slice(1).filter((a) => a !== '--json'), json);
    case 'fmt': return fmtCmd(file, rest);
    default: console.error(USAGE); return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
