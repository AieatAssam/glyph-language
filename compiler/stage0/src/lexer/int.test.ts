// Tests for lexInt (RFC 0014 rule 8). Each case is one byte string; no file is read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lexInt } from './int.ts';
import { Kind } from './token.ts';

const at = (text: string, pos = 0) => lexInt(Buffer.from(text, 'utf8'), pos);

const int = (text: string, start = 0) => ({
  token: { kind: Kind.INT, start, end: start + Buffer.byteLength(text), text },
});

test('0 is an integer literal with no error', () => {
  assert.deepEqual(at('0'), int('0'));
});

test('12 is an integer literal with no error', () => {
  assert.deepEqual(at('12'), int('12'));
});

test('9223372036854775807 is an integer literal; the range is the checker\'s job', () => {
  assert.deepEqual(at('9223372036854775807'), int('9223372036854775807'));
});

test('9223372036854775808 is still an integer literal; the lexer does no range check', () => {
  assert.deepEqual(at('9223372036854775808'), int('9223372036854775808'));
});

test('the digits are recorded as written', () => {
  const r = at('1200');
  assert.ok('token' in r);
  assert.equal(r.token.text, '1200');
});

test('007 is E0006 over all three digits', () => {
  assert.deepEqual(at('007'), { error: { code: 'E0006', start: 0, end: 3 } });
});

test('00 is E0006 over both digits', () => {
  assert.deepEqual(at('00'), { error: { code: 'E0006', start: 0, end: 2 } });
});

test('a leading zero then more digits and a letter is E0006 over the digits only', () => {
  assert.deepEqual(at('0012x'), { error: { code: 'E0006', start: 0, end: 4 } });
});

test('a literal ends at the first character that is not a digit', () => {
  assert.deepEqual(at('12+3'), int('12'));
});

test('a single 0 followed by a letter is the integer 0 and the letter is left for the next token', () => {
  assert.deepEqual(at('0x'), int('0'));
});

test('a literal read at a later position gives offsets from the start of the file', () => {
  assert.deepEqual(at('let 007', 4), { error: { code: 'E0006', start: 4, end: 7 } });
  assert.deepEqual(at('let 42', 4), int('42', 4));
});

test('a position at or past the end of the file is a caller error', () => {
  assert.throws(() => at('1', 1), RangeError);
});

test('a byte that is not an ASCII digit cannot start an integer', () => {
  assert.throws(() => at('a'), RangeError);
  assert.throws(() => at(' 1'), RangeError);
  assert.throws(() => at('-1'), RangeError);
});
