// Tests for statements and blocks (RFC 0104 grammar: block, stmt, args; G1, G2, G7, G11). Each case
// lexes a source text and parses the whole program through parse(), with a stub expression parser
// in place of parser/expr.ts (subtask 9): an expression is one primary token. Offsets are bytes
// from 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { Kind } from '../lexer/token.ts';
import { parse } from './index.ts';
import type { ExprParser } from './decl.ts';

const PRIMARY = new Set<number>([Kind.INT, Kind.TEXT, Kind.IDENT, Kind.KW_TRUE, Kind.KW_FALSE]);

const stub: ExprParser = (tokens, at) => {
  const t = tokens[at];
  if (!PRIMARY.has(t.kind)) return { code: 'E0100', start: t.start, end: t.end };
  return { span: { start: t.start, end: t.end }, next: at + 1 };
};

const parseText = (text: string) => {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  return parse(tokens, stub);
};

// Each accepted form is one declaration whose block ends at the closing brace of the text.
const accepts = (text: string) => {
  const r = parseText(text);
  assert.ok('tree' in r, text);
  assert.equal(r.tree.decls[0].body.end, text.length, text);
};

const e0100 = (start: number, end: number) => ({ error: { code: 'E0100', start, end } });

test('each assignment and binding form parses: let, var and IDENT = expr', () => {
  accepts('main io{let a=1}');
  accepts('main io{var a=1}');
  accepts('main io{a=1}');
  accepts('main io{let a=b var c=true a=c}');
});

test('a call statement parses with no arguments and with several (IDENT ( [args] ))', () => {
  accepts('main io{f()}');
  accepts('main io{f(1,b,"x")}');
});

test('put, if, if with else, and wh each parse, with no separator between statements (G1)', () => {
  accepts('main io{put 1}');
  accepts('main io{put 1 put 2}');
  accepts('main io{f()put 1}');
  accepts('main io{if true{}}');
  accepts('main io{if true{put 1}else{put 2}}');
  accepts('main io{wh false{}put 1}');
});

test('a bare ret and a ret with a value are the last item of a block (G2)', () => {
  accepts('main io{put 1 ret}');
  accepts('main io{put 1 ret 2}');
  accepts('main io{if true{ret}ret}');
});

test('ret followed by a statement is E0100 at the statement (v6-err-ret-mid; G2)', () => {
  assert.deepEqual(parseText('main io{ret put 1}'), e0100(12, 15));
});

test('ret followed by an assignment is E0100 at the equals sign (G2)', () => {
  assert.deepEqual(parseText('main io{ret x=1}'), e0100(13, 14));
});

test('else if is E0100 at the if: else takes a block (v6-err-else-if; G7)', () => {
  assert.deepEqual(parseText('main io{if true{}else if true{}}'), e0100(22, 24));
});

test('let with a type annotation is E0100 at the type (v6-err-let-type; G11)', () => {
  assert.deepEqual(parseText('main io{let a Int=1}'), e0100(14, 17));
});

test('a statement that starts with an integer is E0100 at the integer (no expression statements)', () => {
  assert.deepEqual(parseText('main io{1}'), e0100(8, 9));
});

test('a bare identifier with no = or ( after it is E0100 at the token after it', () => {
  assert.deepEqual(parseText('main io{x}'), e0100(9, 10));
});

test('ex inside a block is E0100 at ex, which is not a statement (G5)', () => {
  assert.deepEqual(parseText('main io{ex 1}'), e0100(8, 10));
});

test('a trailing comma in call arguments is E0100 at the closing parenthesis', () => {
  assert.deepEqual(parseText('main io{f(1,)}'), e0100(12, 13));
});

test('put with no expression is E0100 at the closing brace', () => {
  assert.deepEqual(parseText('main io{put}'), e0100(11, 12));
});

test('a let with no equals sign is E0100 at the token after the name', () => {
  assert.deepEqual(parseText('main io{let a 1}'), e0100(14, 15));
});

test('a block that is not closed is E0100 at EOF', () => {
  assert.deepEqual(parseText('main io{if true{}'), e0100(17, 17));
});

// The cases below use the real expression parser (parser/expr.ts), since put(1,2) and put-7 need
// its grouping and unary rules. parse() with no second argument uses it.
const parseReal = (text: string) => {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  return parse(tokens);
};

const acceptsReal = (text: string) => {
  const r = parseReal(text);
  assert.ok('tree' in r, text);
  assert.equal(r.tree.decls[0].body.end, text.length, text);
};

test('two puts with no separator are two statements (G1, P1)', () => {
  acceptsReal('main io{put a put b}');
});

test('put-7 is put with a unary minus, not a binary minus with no left operand (P1)', () => {
  acceptsReal('main io{put-7}');
});

test('put 1 2 is E0100 at the second 2: put takes one expression (P1)', () => {
  assert.deepEqual(parseReal('main io{put 1 2}'), e0100(14, 15));
});

test('put(1,2) is E0100 at the comma: put takes one expression (P1)', () => {
  assert.deepEqual(parseReal('main io{put(1,2)}'), e0100(13, 14));
});

test('a statement that starts with an operator is E0100 at that operator (L2)', () => {
  assert.deepEqual(parseReal('main io{+1}'), e0100(8, 9));
  assert.deepEqual(parseReal('main io{-1}'), e0100(8, 9));
});

test('a statement that starts with ( or a text literal is E0100 at that token (L2)', () => {
  assert.deepEqual(parseReal('main io{(1)}'), e0100(8, 9));
  assert.deepEqual(parseReal('main io{"a"}'), e0100(8, 11));
});

test('ret that is not last in its block is E0100 at the statement after it (G2)', () => {
  assert.deepEqual(parseReal('main io{ret put 1}'), e0100(12, 15));
});
