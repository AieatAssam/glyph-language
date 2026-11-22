// Tests for the token kinds and spelling tables (RFC 0014 rules 7, 10 and 12).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Kind,
  KEYWORDS,
  KEYWORD_KIND,
  PUNCTUATION,
  PUNCTUATION_KIND,
  keywordKind,
} from './token.ts';

const RFC_KEYWORDS = [
  'fn', 'let', 'var', 'if', 'else', 'while', 'return',
  'true', 'false', 'and', 'or', 'not', 'example', 'io',
];

const RFC_PUNCTUATION = [
  '(', ')', '{', '}', ',', ':', '=', '==', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%',
];

test('the keywords equal the RFC 0014 list, in order', () => {
  assert.deepEqual([...KEYWORDS], RFC_KEYWORDS);
  assert.deepEqual(Object.keys(KEYWORD_KIND), RFC_KEYWORDS);
});

test('there are fourteen keyword kinds, one per keyword', () => {
  const kinds = RFC_KEYWORDS.map((word) => KEYWORD_KIND[word as keyof typeof KEYWORD_KIND]);
  assert.equal(kinds.length, 14);
  assert.equal(new Set(kinds).size, 14);
});

test('the punctuation spellings equal the eighteen RFC 0014 tokens, in order', () => {
  assert.deepEqual([...PUNCTUATION], RFC_PUNCTUATION);
  assert.deepEqual(Object.keys(PUNCTUATION_KIND), RFC_PUNCTUATION);
});

test('there are eighteen punctuation kinds, one per token', () => {
  const kinds = RFC_PUNCTUATION.map((p) => PUNCTUATION_KIND[p as keyof typeof PUNCTUATION_KIND]);
  assert.equal(kinds.length, 18);
  assert.equal(new Set(kinds).size, 18);
});

test('every kind value is unique (rule 12): 37 kinds, no two equal', () => {
  const values = Object.values(Kind);
  assert.equal(values.length, 37);
  assert.equal(new Set(values).size, 37);
});

test('the keyword and punctuation kinds are all members of Kind', () => {
  const all = new Set<number>(Object.values(Kind));
  for (const kind of [...Object.values(KEYWORD_KIND), ...Object.values(PUNCTUATION_KIND)]) {
    assert.ok(all.has(kind), `kind ${kind} is not in Kind`);
  }
});

test('the five other kinds are IDENT, INT, TEXT, NEWLINE and EOF', () => {
  const others = [Kind.IDENT, Kind.INT, Kind.TEXT, Kind.NEWLINE, Kind.EOF];
  assert.equal(new Set(others).size, 5);
  const keywordAndPunct = new Set<number>([
    ...Object.values(KEYWORD_KIND),
    ...Object.values(PUNCTUATION_KIND),
  ]);
  for (const kind of others) {
    assert.equal(keywordAndPunct.has(kind), false);
  }
});

test('keywordKind maps each lowercase keyword to its own kind', () => {
  for (const word of RFC_KEYWORDS) {
    assert.equal(keywordKind(word), KEYWORD_KIND[word as keyof typeof KEYWORD_KIND], word);
  }
});

test('keywordKind is null for a non-keyword, a capitalised keyword and an inherited name', () => {
  assert.equal(keywordKind('print'), null);
  assert.equal(keywordKind('main'), null);
  assert.equal(keywordKind('Fn'), null);
  assert.equal(keywordKind('IO'), null);
  assert.equal(keywordKind('constructor'), null);
  assert.equal(keywordKind('toString'), null);
});
