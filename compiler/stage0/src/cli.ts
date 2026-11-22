// Command-line front end for stage0 (RFC 0011 subtask 3). It reads no files and starts no
// processes; it writes only to the two writers it is given, so tests can pass fakes.
//
// ponytail: check, run and build need a lexer, and none exists yet, so a source file gets only
// "glyphc: no front end yet" and exit 2. Ceiling: no program is compiled. Upgrade path: the lexer
// RFC replaces this branch with real work.
import { isSourceFile } from './source-file.ts';

export interface Writer {
  write(text: string): unknown;
}

export interface Io {
  stdout: Writer;
  stderr: Writer;
}

const VERSION = 'glyphc 0.0.0';
const USAGE = 'usage: glyphc --version | check FILE | run FILE | build FILE -o OUT';

// Returns the exit status: 0 for --version, 2 for everything else in this subtask.
export function run(argv: readonly string[], io: Io): number {
  if (argv.length === 1 && argv[0] === '--version') {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (isCompileCommand(argv)) {
    // ponytail: see the note at the top of this file.
    io.stderr.write('glyphc: no front end yet\n');
    return 2;
  }
  io.stderr.write(`${USAGE}\n`);
  return 2;
}

// True for `check FILE`, `run FILE` and `build FILE -o OUT`, where FILE is a source file.
function isCompileCommand(argv: readonly string[]): boolean {
  const [sub, path] = argv;
  if (path === undefined || !isSourceFile(path)) return false;
  if (sub === 'check' || sub === 'run') return argv.length === 2;
  if (sub === 'build') {
    const out = argv[3];
    return argv.length === 4 && argv[2] === '-o' && out !== undefined && out.length > 0;
  }
  return false;
}
