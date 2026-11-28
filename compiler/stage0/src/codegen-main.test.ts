// Tests for generateMain through compile(): the RFC 0104 declaration path (walking skeleton, stage 3).
// Sources are in canonical layout (RFC 0104 rule 4) with no final LF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { compile } from './compile.ts';

const reasonOf = (text: string) => {
  const r = compile(Buffer.from(text, 'utf8'));
  assert.ok('reason' in r, `expected a refusal for ${text}`);
  return r.reason;
};

test('main io{} compiles to a module', () => {
  assert.ok('wasm' in compile(Buffer.from('main io{}', 'utf8')));
});

test('main io{put 1} compiles to a module', () => {
  assert.ok('wasm' in compile(Buffer.from('main io{put 1}', 'utf8')));
});

test('main io{put 9223372036854775807} compiles: the largest Int is in range', () => {
  assert.ok('wasm' in compile(Buffer.from('main io{put 9223372036854775807}', 'utf8')));
});

test('put of an integer above the Int range is refused with the Int range reason', () => {
  assert.match(reasonOf('main io{put 9223372036854775808}'), /above the Int range/);
});

test('a second statement is refused by the skeleton, not compiled', () => {
  assert.match(reasonOf('main io{put 1 put 2}'), /only `put INT` or an empty body/);
});

test('a let statement is refused by the skeleton', () => {
  assert.match(reasonOf('main io{let a=1}'), /only `put INT` or an empty body/);
});

test('main with a parameter is refused', () => {
  assert.match(reasonOf('main(n Int)io{}'), /takes no parameters/);
});

test('main with a result is refused', () => {
  assert.match(reasonOf('main Int io{}'), /takes no parameters and has no result/);
});

test('a second declaration is refused by the skeleton', () => {
  assert.match(reasonOf('f{}main io{}'), /exactly one declaration/);
});

test('a declaration that is not main is refused', () => {
  assert.match(reasonOf('go io{put 1}'), /must be main, not go/);
});
