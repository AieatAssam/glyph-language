// Command-line front end for stage0 (RFC 0011 subtasks 3 and 4, RFC 0014 subtask 11). It writes
// only to the two writers it is given. It reads a source file only through io.read, which defaults
// to reading from disk, so tests pass a fake.
//
// run and build of a source file are compiled by main.ts, which calls isCompileCommand from here.
// check, run and build lex the file here. A lexical error is one record on standard error and exit 1.
// ponytail: check still gets "glyphc: no front end yet" and exit 2 for a source file that lexes.
// Ceiling: check does not parse or type-check. Upgrade path: the checker RFC replaces this branch.
import { readFileSync } from 'node:fs';
import type { Buffer } from 'node:buffer';
import { toRecordLine } from './diagnostic.ts';
import { lex } from './lexer/index.ts';
import { lexErrorLine } from './lexer/records.ts';
import { isSourceFile } from './source-file.ts';

export interface Writer {
  write(text: string): unknown;
}

export interface Io {
  stdout: Writer;
  stderr: Writer;
  // Returns the bytes of a source file. Defaults to reading the file from disk.
  read?: (path: string) => Buffer;
}

const VERSION = 'glyphc 0.0.0';
const USAGE = 'usage: glyphc --version | check FILE | run FILE | build FILE -o OUT';

// Returns the exit status: 0 for --version, 1 for a path that is not a source file or a source file
// with a lexical error, and 2 for everything else in this subtask.
export function run(argv: readonly string[], io: Io): number {
  if (argv.length === 1 && argv[0] === '--version') {
    io.stdout.write(`${VERSION}\n`);
    return 0;
  }
  // The source-file rule comes first: a path that is not a source file is never read.
  const [sub, path] = argv;
  if (isCompileSubcommand(sub) && path !== undefined && !isSourceFile(path)) {
    io.stderr.write(`${notSourceLine()}\n`);
    return 1;
  }
  if (isCompileCommand(argv) && path !== undefined) {
    const read = io.read ?? readFileSync;
    let bytes: Buffer;
    try {
      bytes = read(path);
    } catch {
      io.stderr.write(`glyphc: cannot read ${path}\n`);
      return 2;
    }
    const lexed = lex(bytes);
    if (lexed.error !== null) {
      io.stderr.write(`${lexErrorLine(lexed.error)}\n`);
      return 1;
    }
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

// The one record for a path that is not a source file (RFC 0011 section 5, RFC 0050 section 2). The
// file is not read, so the span is the start of the file, and the record names no file.
function notSourceLine(): string {
  return toRecordLine({ code: 'E0010', span: { start: 0, end: 0 } });
}

// True for `check FILE`, `run FILE` and `build FILE -o OUT`, where FILE is a source file.
export function isCompileCommand(argv: readonly string[]): boolean {
  const [sub, path] = argv;
  if (path === undefined || !isSourceFile(path)) return false;
  if (sub === 'check' || sub === 'run') return argv.length === 2;
  if (sub === 'build') {
    const out = argv[3];
    return argv.length === 4 && argv[2] === '-o' && out !== undefined && out.length > 0;
  }
  return false;
}
