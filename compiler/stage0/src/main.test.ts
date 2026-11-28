// Tests for the entry point's run and build branches (RFC 0014 subtask 6, stage 3; RFC 0020 subtask 18).
// main.ts runs on import, so each case starts it as a child process, the way bin/glyphc does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runWasm } from '../../../toolkit/run.ts';
import { validate } from '../../../toolkit/validate.ts';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));

// Writes a source file with the given text into a fresh directory and returns its path.
function source(name: string, text: string): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'glyph-main-'));
  const file = join(dir, name);
  writeFileSync(file, text);
  return { dir, file };
}

function glyphc(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const p = spawnSync(process.execPath, [MAIN, ...args], { encoding: 'utf8' });
  return { status: p.status, stdout: p.stdout, stderr: p.stderr };
}

test('run of the walking-skeleton program prints 1 and exits 0', () => {
  const { file } = source('prog.gl', 'main io{put 1}');
  const r = glyphc(['run', file]);
  assert.equal(r.stdout, '1\n');
  assert.equal(r.status, 0);
});

test('build writes a module that validates and prints 1 when run', async () => {
  const { dir, file } = source('prog.gl', 'main io{put 1}');
  const out = join(dir, 'prog.wasm');
  const r = glyphc(['build', file, '-o', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
  const bytes = new Uint8Array(readFileSync(out));
  assert.ok(validate(bytes).ok);
  const ran = await runWasm(bytes);
  assert.equal(ran.stdout, '1\n');
  assert.equal(ran.exitCode, 0);
});

test('two builds of the same source write the same bytes', () => {
  const { dir, file } = source('prog.gl', 'main io{put 1}');
  glyphc(['build', file, '-o', join(dir, 'a.wasm')]);
  glyphc(['build', file, '-o', join(dir, 'b.wasm')]);
  assert.deepEqual(readFileSync(join(dir, 'a.wasm')), readFileSync(join(dir, 'b.wasm')));
});

test('build of a program outside the skeleton exits 1 with the compile reason and writes nothing', () => {
  const { dir, file } = source('prog.gl', 'main io{ret put 1}');
  const out = join(dir, 'prog.wasm');
  const r = glyphc(['build', file, '-o', out]);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.endsWith('glyphc: E0100 at byte 12\n'), r.stderr);
  assert.equal(existsSync(out), false);
});

test('build of a path that is not a source file still gets the E0010 record from cli.ts', () => {
  const { dir, file } = source('prog.txt', 'main io{put 1}');
  const r = glyphc(['build', file, '-o', join(dir, 'prog.wasm')]);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes('"code":"E0010"'), r.stderr);
});
