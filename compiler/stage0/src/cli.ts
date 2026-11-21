// Command-line front end for stage0 (RFC 0011 subtasks 3 and 4). It reads no files and starts no
// processes; it writes only to the two writers it is given, so tests can pass fakes.
//
// ponytail: check, run and build need a lexer and a checker, and neither exists yet, so a source
// file gets only "no front end yet" and exit 2. Ceiling: no program is compiled. Upgrade path: the
// lexer RFC, then the checker RFC, replace this branch with real work.
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

// Returns the exit status: 0 for --version, 1 for a path that is not a source file, 2 for
// everything else in this subtask.
export function run(argv: readonly string[], io: Io): number {
  if (argv.length === 1 && argv[0] === '--version') {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  // The source-file rule comes first. The path is not read, so a missing file gives the same record.
  const [sub, path] = argv;
  if (isFileCommand(sub) && path !== undefined && !isSourceFile(path)) {
    io.stderr.write(`${toJsonLine(notSourceFile(path))}\n`);
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

// The one record for a path that does not end in .gl (RFC 0011 section 5). The file is not read,
// so the span is the start of the file.
function notSourceFile(path: string): Diagnostic {
  return {
    code: 'E0010',
    severity: 'error',
    message: 'source file does not end in .gl',
    span: { file: path, start: 0, end: 0, line: 1, column: 1 },
  };
}

function isFileCommand(sub: string | undefined): boolean {
  return sub === 'check' || sub === 'run' || sub === 'build';
}

// True for `check FILE`, `run FILE` and `build FILE -o OUT`, where FILE is a source file.
// Anything else is a usage error for now.
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
