// Tests for the source-file rule (RFC 0011). Path strings only; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSourceFile } from './source-file.ts';

test('main.gl is a source file', () => {
  assert.equal(isSourceFile('main.gl'), true);
});

test('a source file in a directory is a source file, judged on its last part', () => {
  assert.equal(isSourceFile('dir/prog.gl'), true);
});

test('only the last suffix matters: a.b.gl is a source file', () => {
  assert.equal(isSourceFile('a.b.gl'), true);
});

test('main.glyph is not a source file', () => {
  assert.equal(isSourceFile('main.glyph'), false);
});

test('prog.txt is not a source file', () => {
  assert.equal(isSourceFile('prog.txt'), false);
});

test('PROG.GL is not a source file: the match is case-sensitive', () => {
  assert.equal(isSourceFile('PROG.GL'), false);
});

test('main.gl.bak is not a source file: .gl must be the last suffix', () => {
  assert.equal(isSourceFile('main.gl.bak'), false);
});

test('.gl alone is not a source file: it needs a character before the suffix', () => {
  assert.equal(isSourceFile('.gl'), false);
});

test('a path ending in a slash is not a source file', () => {
  assert.equal(isSourceFile('dir/'), false);
});

test('the empty string is not a source file', () => {
  assert.equal(isSourceFile(''), false);
});

test('a directory named x.gl with a file inside is judged on the file part', () => {
  assert.equal(isSourceFile('x.gl/inner.txt'), false);
  assert.equal(isSourceFile('x.gl/inner.gl'), true);
});

test('a hidden file .x.gl is a source file, since it has a character before the suffix', () => {
  assert.equal(isSourceFile('dir/.x.gl'), true);
});

test('a dot-gl after a slash with no name is not a source file', () => {
  assert.equal(isSourceFile('dir/.gl'), false);
});
