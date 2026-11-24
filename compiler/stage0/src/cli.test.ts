// Tests for the command-line front end (RFC 0011 subtasks 3 and 4, RFC 0014 subtask 11). Each case
// calls run with fake writers and a fake reader, so no file is ever read from disk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Buffer } from 'node:buffer';
import { run } from './cli.ts';

const USAGE = 'usage: glyphc --version | check FILE | run FILE | build FILE -o OUT\n';
const NO_FRONT_END = 'glyphc: no front end yet\n';
// RFC 0050 section 2: the record has code and span only. The file is not read, so the span is 0 to 0.
const NOT_SOURCE_LINE = '{"code":"E0010","span":{"start":0,"end":0}}\n';

// Joins text and byte arrays into one file's bytes.
const bytes = (...parts: (string | number[])[]): Buffer =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p) : Buffer.from(p))));

const VALID = bytes('let a = 1\n');

// Runs the command. `source` is what the fake reader returns for any path; a reader that throws is
// given as `null`.
function call(argv: string[], source: Buffer | null = VALID): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
    read: () => {
      if (source === null) throw new Error('ENOENT');
      return source;
    },
  });
  return { code, out: out.join(''), err: err.join('') };
}

test('--version prints glyphc 0.0.0 and exits 0', () => {
  assert.deepEqual(call(['--version']), { code: 0, out: 'glyphc 0.0.0\n', err: '' });
});

test('check, run and build with a valid source file exit 2 with the no-front-end line', () => {
  const cases = [
    ['check', 'main.gl'],
    ['run', 'dir/prog.gl'],
    ['build', 'a.b.gl', '-o', 'out.wasm'],
  ];
  for (const argv of cases) {
    assert.deepEqual(call(argv), { code: 2, out: '', err: NO_FRONT_END }, argv.join(' '));
  }
});

test('a valid file with CR LF line ends, or with no bytes at all, exits 2 with the no-front-end line', () => {
  assert.deepEqual(call(['check', 'a.gl'], bytes('let a = 1\r\n')), { code: 2, out: '', err: NO_FRONT_END });
  assert.deepEqual(call(['check', 'a.gl'], bytes('')), { code: 2, out: '', err: NO_FRONT_END });
  assert.deepEqual(call(['run', 'a.gl'], bytes('\n')), { code: 2, out: '', err: NO_FRONT_END });
});

test('no arguments exit 2 with the usage line', () => {
  assert.deepEqual(call([]), { code: 2, out: '', err: USAGE });
});

test('an unknown command exits 2 with the usage line', () => {
  assert.deepEqual(call(['fmt', 'main.gl']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['--help']), { code: 2, out: '', err: USAGE });
});

test('--version with anything else exits 2 with the usage line', () => {
  assert.deepEqual(call(['--version', '--version']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['--version', 'main.gl']), { code: 2, out: '', err: USAGE });
});

test('check and run with no path, or with extra arguments, exit 2 with the usage line', () => {
  assert.deepEqual(call(['check']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['run']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['check', 'main.gl', 'extra']), { code: 2, out: '', err: USAGE });
});

test('build without -o OUT, or with a bad flag or empty OUT, exits 2 with the usage line', () => {
  assert.deepEqual(call(['build', 'main.gl']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['build', 'main.gl', '-o']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['build', 'main.gl', '-o', '']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['build', 'main.gl', '-x', 'out.wasm']), { code: 2, out: '', err: USAGE });
});

test('nothing is written to standard output except for --version', () => {
  for (const argv of [[], ['check', 'main.gl'], ['check'], ['nope'], ['check', 'prog.txt']]) {
    assert.equal(call(argv).out, '', argv.join(' '));
  }
});

test('check, run and build with a path that is not a source file give E0010 and exit 1', () => {
  const paths = ['prog.txt', 'PROG.GL', 'main.glyph', 'missing.txt'];
  const cases = paths.flatMap((p) => [
    ['check', p],
    ['run', p],
    ['build', p, '-o', 'out.wasm'],
  ]);
  for (const argv of cases) {
    assert.deepEqual(call(argv), { code: 1, out: '', err: NOT_SOURCE_LINE }, argv.join(' '));
  }
});

test('the E0010 record has only code and span, and is one line', () => {
  const { err } = call(['check', 'prog.txt']);
  assert.equal(err.split('\n').length, 2);
  assert.deepEqual(Object.keys(JSON.parse(err) as object), ['code', 'span']);
});

test('the source-file rule comes before the argument checks: build without -o still gives E0010', () => {
  assert.deepEqual(call(['build', 'prog.txt']), { code: 1, out: '', err: NOT_SOURCE_LINE });
  assert.deepEqual(call(['check', 'prog.txt', 'extra']), { code: 1, out: '', err: NOT_SOURCE_LINE });
});

test('the source-file rule comes before the read: a non-source path is never read', () => {
  // A reader that throws shows the file was never opened: the answer is still E0010.
  assert.deepEqual(call(['check', 'prog.txt'], null), { code: 1, out: '', err: NOT_SOURCE_LINE });
});

test('a path with a directory part is reported as given', () => {
  assert.deepEqual(call(['run', 'dir/prog.txt']), { code: 1, out: '', err: NOT_SOURCE_LINE });
});

test('a bare check, run or build with no path keeps the usage line', () => {
  assert.deepEqual(call(['check']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['build']), { code: 2, out: '', err: USAGE });
});

test('a source file that cannot be read exits 2 and names the path', () => {
  assert.deepEqual(call(['check', 'gone.gl'], null), {
    code: 2,
    out: '',
    err: 'glyphc: cannot read gone.gl\n',
  });
});

// Each lexical error: the one record on standard error, exit 1, empty standard output. The record is
// compared by code, span and key set, since its message is checked by records.test.ts.
type Case = { name: string; argv: string[]; source: Buffer; code: string; start: number; end: number; line: number; column: number };

const LEX_ERRORS: Case[] = [
  // A tab after a complete line: the first error is the tab at byte 10.
  { name: 'tab in code', argv: ['check', 'a.gl'], source: bytes('let a = 1\n', '\t', 'let b = 2\n'), code: 'E0001', start: 10, end: 11, line: 2, column: 1 },
  // A byte FF, which is never valid UTF-8.
  { name: 'invalid UTF-8', argv: ['run', 'a.gl'], source: bytes('let a = 1\n', [0xff], '\n'), code: 'E0001', start: 10, end: 11, line: 2, column: 1 },
  // A byte order mark at the start of the file.
  { name: 'byte order mark', argv: ['build', 'a.gl', '-o', 'out.wasm'], source: bytes([0xef, 0xbb, 0xbf], 'let a = 1\n'), code: 'E0001', start: 0, end: 3, line: 1, column: 1 },
  // A CR that is not followed by LF.
  { name: 'lone CR', argv: ['check', 'a.gl'], source: bytes('let a = 1\r', 'x\n'), code: 'E0001', start: 9, end: 10, line: 1, column: 10 },
  // A printable character outside the token set: `!` not followed by `=`.
  { name: 'bang alone', argv: ['check', 'a.gl'], source: bytes('let a = !true\n'), code: 'E0001', start: 8, end: 9, line: 1, column: 9 },
  // An unknown escape in a text literal: the backslash and the `t` after it.
  { name: 'bad text escape', argv: ['check', 'a.gl'], source: bytes('let a = "', '\\t"\n'), code: 'E0005', start: 9, end: 11, line: 1, column: 10 },
  // A text literal that reaches the line end before its closing quote.
  { name: 'unterminated text', argv: ['check', 'a.gl'], source: bytes('let a = "ab\n'), code: 'E0005', start: 8, end: 11, line: 1, column: 9 },
  // An integer with a leading zero.
  { name: 'leading zero', argv: ['run', 'a.gl'], source: bytes('let a = 007\n'), code: 'E0006', start: 8, end: 11, line: 1, column: 9 },
  // A tab on line 1 and a bad escape later: the tab comes first, and the escape error is not reported.
  { name: 'tab before bad escape', argv: ['check', 'a.gl'], source: bytes('let', '\t', 'a = "', '\\t"\n'), code: 'E0001', start: 3, end: 4, line: 1, column: 4 },
];

for (const c of LEX_ERRORS) {
  test(`lexical error, ${c.name}: one record, exit 1, nothing on stdout`, () => {
    const r = call(c.argv, c.source);
    assert.equal(r.code, 1);
    assert.equal(r.out, '');
    assert.equal(r.err.endsWith('\n'), true);
    assert.equal(r.err.split('\n').length, 2, 'exactly one line');
    const record = JSON.parse(r.err) as Record<string, unknown>;
    assert.deepEqual(Object.keys(record), ['code', 'severity', 'message', 'span']);
    assert.equal(record.code, c.code);
    assert.deepEqual(record.span, {
      file: (c.argv[1] as string),
      start: c.start,
      end: c.end,
      line: c.line,
      column: c.column,
    });
  });
}

test('the lexical error record names the file as the command gave it', () => {
  const r = call(['check', 'dir/a.gl'], bytes('let a = 007\n'));
  assert.equal((JSON.parse(r.err) as { span: { file: string } }).span.file, 'dir/a.gl');
});
