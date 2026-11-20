import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSourceFile } from './source-file.ts';

test('accepts paths whose last component is NAME.gl', () => {
  assert.equal(isSourceFile('main.gl'), true);
  assert.equal(isSourceFile('dir/prog.gl'), true);
  assert.equal(isSourceFile('a.b.gl'), true);
});

test('rejects other extensions', () => {
  assert.equal(isSourceFile('main.glyph'), false);
  assert.equal(isSourceFile('prog.txt'), false);
  assert.equal(isSourceFile('main.gl.bak'), false);
});

test('the suffix match is case-sensitive', () => {
  assert.equal(isSourceFile('PROG.GL'), false);
  assert.equal(isSourceFile('prog.Gl'), false);
});

test('a bare suffix or a directory path is not a source file', () => {
  assert.equal(isSourceFile('.gl'), false);
  assert.equal(isSourceFile('dir/'), false);
  assert.equal(isSourceFile('dir/.gl'), false);
  assert.equal(isSourceFile(''), false);
});
