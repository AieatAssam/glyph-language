// Tests for the command-line front end (RFC 0011 subtasks 3 and 4). Each case calls run with fake
// writers. No file is ever read, so no case can give ENOENT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './cli.ts';

const USAGE = 'usage: glyphc --version | check FILE | run FILE | build FILE -o OUT\n';
const NOT_SOURCE_LINE = (file: string) =>
  '{"code":"E0010","severity":"error","message":"source file does not end in .gl",' +
  `"span":{"file":"${file}","start":0,"end":0,"line":1,"column":1}}\n`;

function call(argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, {
    stdout: { write: (text: string) => out.push(text) },
    stderr: { write: (text: string) => err.push(text) },
  });
  return { code, out: out.join(''), err: err.join('') };
}

test('--version prints glyphc 0.0.0 and exits 0', () => {
  assert.deepEqual(call(['--version']), { code: 0, out: 'glyphc 0.0.0\n', err: '' });
});

test('check, run and build with a source-file path exit 2 with the no-front-end line', () => {
  const cases = [
    ['check', 'main.gl'],
    ['run', 'dir/prog.gl'],
    ['build', 'a.b.gl', '-o', 'out.wasm'],
  ];
  for (const argv of cases) {
    assert.deepEqual(call(argv), { code: 2, out: '', err: 'glyphc: no front end yet\n' }, argv.join(' '));
  }
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
    const file = argv[1] as string;
    assert.deepEqual(call(argv), { code: 1, out: '', err: NOT_SOURCE_LINE(file) }, argv.join(' '));
  }
});

test('the E0010 record has no fix key and is one line', () => {
  const { err } = call(['check', 'prog.txt']);
  assert.equal(err.split('\n').length, 2);
  assert.equal(err.includes('"fix"'), false);
});

test('the source-file rule comes before the argument checks: build without -o still gives E0010', () => {
  assert.deepEqual(call(['build', 'prog.txt']), { code: 1, out: '', err: NOT_SOURCE_LINE('prog.txt') });
  assert.deepEqual(call(['check', 'prog.txt', 'extra']), { code: 1, out: '', err: NOT_SOURCE_LINE('prog.txt') });
});

test('a path with a directory part is reported as given', () => {
  assert.deepEqual(call(['run', 'dir/prog.txt']), { code: 1, out: '', err: NOT_SOURCE_LINE('dir/prog.txt') });
});

test('a bare check, run or build with no path keeps the usage line', () => {
  assert.deepEqual(call(['check']), { code: 2, out: '', err: USAGE });
  assert.deepEqual(call(['build']), { code: 2, out: '', err: USAGE });
});
