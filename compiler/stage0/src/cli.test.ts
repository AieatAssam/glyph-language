// Tests for the command-line front end (RFC 0011 subtask 3). Each case calls run with fake writers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './cli.ts';

const USAGE = 'usage: glyphc --version | check FILE | run FILE | build FILE -o OUT\n';

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

test('a path that is not a source file is a usage error for now (subtask 4 changes this)', () => {
  assert.deepEqual(call(['check', 'prog.txt']), { code: 2, out: '', err: USAGE });
});

test('nothing is written to standard output except for --version', () => {
  for (const argv of [[], ['check', 'main.gl'], ['check'], ['nope']]) {
    assert.equal(call(argv).out, '', argv.join(' '));
  }
});
