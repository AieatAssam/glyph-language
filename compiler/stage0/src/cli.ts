// Command-line front end for stage0 (RFC 0011 subtasks 3 and 4). It reads no files and starts no
// processes; it writes only to the two writers it is given, so tests can pass fakes.
//
// ponytail: check, run and build need a lexer, and none exists yet, so a source file gets only
// "glyphc: no front end yet" and exit 2. Ceiling: no program is compiled. Upgrade path: the lexer
// RFC replaces this branch with real work.
import { toJsonLine, type Diagnostic } from './diagnostic.ts';
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
const NOT_SOURCE = 'source file does not end in .gl';

// Returns the exit status: 0 for --version, 1 for a path that is not a source file, and 2 for
// everything else in this subtask.
export function run(argv: readonly string[], io: Io): number {
  if (argv.length === 1 && argv[0] === '--version') {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  // The source-file rule comes first: a path that is not a source file is never read.
  const [sub, path] = argv;
  if (isCompileSubcommand(sub) && path !== undefined && !isSourceFile(path)) {
    io.stderr.write(`${toJsonLine(notSourceRecord(path))}\n`);
    return 1;
  }
  if (isCompileCommand(argv)) {
    // ponytail: see the note at the top of this file.
    io.stderr.write('glyphc: no front end yet\n');
    return 2;
  }
  io.stderr.write(`${USAGE}\n`);
  return 2;
}

function isCompileSubcommand(sub: string | undefined): boolean {
  return sub === 'check' || sub === 'run' || sub === 'build';
}

// The one diagnostic for a path that is not a source file (RFC 0011 section 5). The file is not
// read, so the span is the start of the file.
function notSourceRecord(path: string): Diagnostic {
  return {
    code: 'E0010',
    severity: 'error',
    message: NOT_SOURCE,
    span: { file: path, start: 0, end: 0, line: 1, column: 1 },
  };
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
