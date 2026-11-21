// Entry point for stage0. bin/glyphc runs this file when compiler/ACTIVE says stage0.
//
// `run FILE` and `build FILE -o OUT` on a source file that the walking skeleton compiles (RFC 0014
// subtask 6, stage 3; RFC 0020 subtask 18) are compiled, and run or written. Every other argument
// list, and every `run` of a program the skeleton does not compile, goes to cli.ts as before.
//
// ponytail: a `run` of a program outside the skeleton still gets cli.ts's "no front end yet" and
// exit 2. A `build` of one gets the compile reason on standard error and exit 1, since the reason is
// the only useful output. Ceiling: no diagnostic records for either. Upgrade path: the lexer, parser
// and checker RFCs widen compile.ts, and the records come out of cli.ts's check path too.
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
  if (sub === 'build' && argv.length === 4 && argv[2] === '-o' && argv[3] !== '' &&
      isSourceFile(path) && existsSync(path)) {
    const compiled = compile(Buffer.from(readFileSync(path)));
    if ('wasm' in compiled) {
      writeFileSync(argv[3], compiled.wasm);
      return 0;
    }
    process.stderr.write(`glyphc: ${compiled.reason}\n`);
    return 1;
  }
  return runCli(argv, { stdout: process.stdout, stderr: process.stderr });
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
