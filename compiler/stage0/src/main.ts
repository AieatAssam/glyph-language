// Entry point for stage0. bin/glyphc runs this file when compiler/ACTIVE says stage0.
// run and build of a source file compile it here (walking skeleton: lex, parse, generate). Every
// other command goes to cli.ts, which owns the usage line and the source-file rule.
import { readFileSync, writeFileSync } from 'node:fs';
import { run, isCompileCommand } from './cli.ts';
import { compile } from './compile.ts';
import { run as runWasm } from '../../../toolkit/run.ts';

const io = { stdout: process.stdout, stderr: process.stderr };

// ponytail: only run and build compile here. check still goes to cli.ts and gets "no front end
// yet". Ceiling: a source file that is not the walking-skeleton program fails in compile. Upgrade
// path: the checker and the general code generator replace compile.ts.
async function main(argv: string[]): Promise<number> {
  const [sub, path] = argv;
  if ((sub !== 'run' && sub !== 'build') || !isCompileCommand(argv) || path === undefined) {
    return run(argv, io);
  }
  let source: Buffer;
  try {
    source = readFileSync(path);
  } catch {
    io.stderr.write(`glyphc: cannot read ${path}\n`);
    return 2;
  }
  const compiled = compile(source);
  if ('reason' in compiled) {
    io.stderr.write(`glyphc: ${compiled.reason}\n`);
    return 1;
  }
  if (sub === 'build') {
    writeFileSync(argv[3] as string, compiled.wasm);
    return 0;
  }
  const ran = await runWasm(compiled.wasm);
  io.stdout.write(ran.stdout);
  io.stderr.write(ran.stderr);
  return ran.exitCode;
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
