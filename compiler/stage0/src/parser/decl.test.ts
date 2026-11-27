// Tests for the parser skeleton and declarations (RFC 0104 grammar, G2, G4, G5, G9, G10, G12, G13).
// Each case lexes a source text, checks that lexing succeeded, and parses the tokens. Offsets are
// bytes from 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { parse } from './index.ts';

const parseText = (text: string) => {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  return parse(tokens);
};

const e0100 = (start: number, end: number) => ({ error: { code: 'E0100', start, end } });

test('main io{} parses to one declaration with no parameters, an io mark and an empty block', () => {
  assert.deepEqual(parseText('main io{}'), {
    tree: {
      decls: [{
        name: { text: 'main', start: 0, end: 4 },
        params: null,
        result: null,
        io: { start: 5, end: 7 },
        fail: null,
        body: { start: 7, end: 9 },
        ex: [],
        start: 0,
        end: 9,
      }],
    },
  });
});

test('a block whose only item is a bare ret parses (G2: ret is last)', () => {
  assert.deepEqual(parseText('g io{ret}').tree?.decls[0].body, { start: 4, end: 9 });
});

test('f(n Int)Int fail{} parses the parameter, the result type and the fail mark', () => {
  // f0 (1 n2 sp3 Int4-6 )7 Int8-10 sp11 fail12-15 {16 }17
  assert.deepEqual(parseText('f(n Int)Int fail{}'), {
    tree: {
      decls: [{
        name: { text: 'f', start: 0, end: 1 },
        params: [{
          name: { text: 'n', start: 2, end: 3 },
          type: { text: 'Int', start: 4, end: 7 },
          start: 2,
          end: 7,
        }],
        result: { text: 'Int', start: 8, end: 11 },
        io: null,
        fail: { start: 12, end: 16 },
        body: { start: 16, end: 18 },
        ex: [],
        start: 0,
        end: 18,
      }],
    },
  });
});

test('f(n Int)Int fail{ret n+1} parses, and its block holds the ret value', () => {
  // The body runs from the { at 16 to the } at 24, which ends the text (length 25).
  const r = parseText('f(n Int)Int fail{ret n+1}');
  assert.ok('tree' in r);
  assert.deepEqual(r.tree.decls[0].body, { start: 16, end: 25 });
});

test('two declarations in a row need no separator, and the second starts at its own name', () => {
  const r = parseText('main io{}f io{}');
  assert.ok('tree' in r);
  assert.deepEqual(r.tree.decls.map((d) => d.name.text), ['main', 'f']);
  assert.deepEqual(r.tree.decls[1].io, { start: 11, end: 13 });
});

test('an empty program, with no tokens but EOF, is accepted', () => {
  assert.deepEqual(parseText(''), { tree: { decls: [] } });
});

test('f io Int{} gives E0100 at Int: the result type comes before io (G10)', () => {
  assert.deepEqual(parseText('f io Int{}'), e0100(5, 8));
});

test('f fail io{} gives E0100 at io: io comes before fail (G10)', () => {
  assert.deepEqual(parseText('f fail io{}'), e0100(7, 9));
});

test('f()Int{} gives E0100 at the closing parenthesis: a parameter list is not empty (G9)', () => {
  assert.deepEqual(parseText('f()Int{}'), e0100(2, 3));
});

test('a parameter with no type gives E0100 at the token after its name (G4)', () => {
  assert.deepEqual(parseText('f(n)io{}'), e0100(3, 4));
});

test('main io{ex 1} gives E0100 at ex: ex is not a statement (G5)', () => {
  assert.deepEqual(parseText('main io{ex 1}'), e0100(8, 10));
});

test('fn main io{} gives E0100 at main: fn is an identifier, so main is unexpected (G12)', () => {
  assert.deepEqual(parseText('fn main io{}'), e0100(3, 7));
});

test('a file that ends before the block gives E0100 at EOF (G13)', () => {
  assert.deepEqual(parseText('main io'), e0100(7, 7));
});
