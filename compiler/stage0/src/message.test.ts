// Tests for the message rules (RFC 0004 section 2), one passing and one failing case per rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMessage, type Rule } from './message.ts';

const rules = (message: string): Rule[] => checkMessage(message).map((p) => p.rule);

test('one-sentence: a message with no internal full stop passes', () => {
  assert.deepEqual(rules('keyword cannot be used as a name'), []);
});

test('one-sentence: a full stop before the end fails only that rule', () => {
  assert.deepEqual(rules('keyword is reserved. try another name'), ['one-sentence']);
});

test('lowercase-first: a message starting with a lowercase letter passes', () => {
  assert.deepEqual(rules('leading zero in integer literal'), []);
});

test('lowercase-first: a capital first letter fails only that rule', () => {
  assert.deepEqual(rules('Keyword cannot be used as a name'), ['lowercase-first']);
});

test('no-trailing-stop: a message without a final full stop passes', () => {
  assert.deepEqual(rules('unexpected end of file'), []);
});

test('no-trailing-stop: a final full stop fails only that rule', () => {
  assert.deepEqual(rules('unexpected end of file.'), ['no-trailing-stop']);
});

test('quoted-run-length: a quoted run of exactly 20 bytes passes', () => {
  assert.deepEqual(rules('unknown name "abcdefghijklmnopqrst"'), []);
});

test('quoted-run-length: a quoted run of 21 bytes fails only that rule', () => {
  assert.deepEqual(rules('unknown name "abcdefghijklmnopqrstu"'), ['quoted-run-length']);
});

test('quoted-run-length: the limit counts UTF-8 bytes, not characters', () => {
  // Eleven "é" are 11 characters but 22 bytes, so they fail.
  const problems = checkMessage('unknown name "ééééééééééé"');
  assert.deepEqual(problems.map((p) => p.rule), ['quoted-run-length']);
  assert.match(problems[0].detail, /22 bytes/);
});

test('a full stop inside a quoted run is not a sentence break', () => {
  assert.deepEqual(rules('unknown name "a.b" here'), []);
});

test('an empty message breaks only the lowercase-first rule', () => {
  assert.deepEqual(rules(''), ['lowercase-first']);
});
