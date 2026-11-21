// Entry point for stage0. bin/glyphc runs this file when compiler/ACTIVE says stage0.
//
// `run FILE` on a source file that the walking skeleton compiles (RFC 0014 subtask 6, stage 3) is
// compiled and run, and its stdout, stderr and exit status are passed on. Every other argument list,
// and every program the skeleton does not compile, goes to cli.ts as before.
//
// ponytail: a program outside the skeleton still gets cli.ts's "no front end yet" and exit 2.
// Upgrade path: the lexer, parser and checker RFCs widen compile.ts, and the lexical records come out
// of cli.ts's check path too.
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';
import { run as runCli } from './cli.ts';
import { compile } from './compile.ts';
import { isSourceFile } from './source-file.ts';
import { run as runWasm } from '../../../toolkit/run.ts';

async function main(argv: string[]): Promise<number> {
  const [sub, path] = argv;
  if (sub === 'run' && argv.length === 2 && isSourceFile(path) && existsSync(path)) {
    const compiled = compile(Buffer.from(readFileSync(path)));
    if ('wasm' in compiled) {
      const r = await runWasm(compiled.wasm);
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
      return r.exitCode;
    }
  }
  return runCli(argv, { stdout: process.stdout, stderr: process.stderr });
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
