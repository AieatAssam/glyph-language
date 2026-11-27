// Tests for expressions (RFC 0104 grammar: expr, cmp_expr, add_expr, mul_expr, unary, primary; G6,
// G8). Each case lexes a source text, drops the NEWLINE token, and parses one expression from its
// first token. `shape` prints the tree in one line. Offsets are bytes from 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { Kind } from '../lexer/token.ts';
import { parseExpr, type Expr } from './expr.ts';
import { parse } from './index.ts';

function parsed(text: string) {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  return parseExpr(tokens.filter((t) => t.kind !== Kind.NEWLINE), 0);
}

// One-line form of a tree: binary and unary nodes in parentheses, calls with their arguments.
function sexp(e: Expr): string {
  switch (e.kind) {
    case 'int':
    case 'bool':
    case 'name':
      return e.text;
    case 'text':
      return `"${e.text}"`;
    case 'call':
      return `${e.callee}(${e.args.map(sexp).join(', ')})`;
    case 'unary':
      return `(${e.op} ${sexp(e.operand)})`;
    case 'binary':
      return `(${e.op} ${sexp(e.left)} ${sexp(e.right)})`;
    case 'group':
      return `(group ${sexp(e.inner)})`;
  }
}

// The tree of a whole expression: the parse must succeed and stop at the end of the text.
function shape(text: string): string {
  const r = parsed(text);
  assert.ok(!('code' in r), text);
  assert.equal(r.span.end, text.length, text);
  return sexp(r.expr);
}

const e0100 = (start: number, end: number) => ({ error: { code: 'E0100', start, end } });

test('* binds tighter than + and -, and - and + are left-associative (precedence)', () => {
  assert.equal(shape('1+2*3'), '(+ 1 (* 2 3))');
  assert.equal(shape('a-b-c'), '(- (- a b) c)');
  assert.equal(shape('a/b%c'), '(% (/ a b) c)');
});

test('and binds tighter than or: not false and true or false', () => {
  assert.equal(shape('not false and true or false'), '(or (and (not false) true) false)');
});

test('unary - and not bind tighter than the binary operators', () => {
  assert.equal(shape('-a*b'), '(* (- a) b)');
  assert.equal(shape('not a==b'), '(== (not a) b)');
  assert.equal(shape('--x'), '(- (- x))');
});

test('a single comparison of each kind parses', () => {
  assert.equal(shape('a==b'), '(== a b)');
  assert.equal(shape('a!=b'), '(!= a b)');
  assert.equal(shape('a<=b'), '(<= a b)');
  assert.equal(shape('a>=b'), '(>= a b)');
  assert.equal(shape('a<b'), '(< a b)');
  assert.equal(shape('a>b'), '(> a b)');
});

test('parentheses group, and the group keeps its span', () => {
  assert.equal(shape('(1+2)*3'), '(* (group (+ 1 2)) 3)');
  assert.equal(shape('-((4))'), '(- (group (group 4)))');
  assert.deepEqual(parsed('a*(b+1)').span, { start: 0, end: 7 });
});

test('a call with arguments, a nested call and a call with none are primaries', () => {
  assert.equal(shape('f(1,g(2))+3'), '(+ f(1, g(2)) 3)');
  assert.equal(shape('f()'), 'f()');
  assert.equal(shape('true'), 'true');
  assert.equal(shape('"x"'), '"x"');
});

test('a second comparison operator is E0100 at that operator (G6)', () => {
  assert.deepEqual(parsed('1<2<3'), { code: 'E0100', start: 3, end: 4 });
});

test('1<2<3 as a statement is E0100 at the second < (byte 15 of the program)', () => {
  assert.deepEqual(parse(lex(Buffer.from('main io{put 1<2<3}')).tokens), e0100(15, 16));
});

test('if as an expression is E0100 at if (G8)', () => {
  assert.deepEqual(parse(lex(Buffer.from('main io{let x=if true{}}')).tokens), e0100(14, 16));
});

test('each keyword that cannot start an expression is E0100 at that keyword (G8)', () => {
  for (const word of ['if', 'wh', 'ret', 'let', 'var', 'put', 'ex', 'io', 'fail', 'else', 'and', 'or']) {
    const text = `main io{put ${word}}`;
    assert.deepEqual(parse(lex(Buffer.from(text)).tokens), e0100(12, 12 + word.length), text);
  }
});

test('an expression statement is E0100 at its first token (main io{1+2} at byte 8)', () => {
  assert.deepEqual(parse(lex(Buffer.from('main io{1+2}')).tokens), e0100(8, 9));
});

test('a leading + is not unary: main io{put+1} is E0100 at the plus (E6)', () => {
  // Canonical layout (rule 4): no space before a punctuation token, so put+1 has no gap to check.
  assert.deepEqual(parse(lex(Buffer.from('main io{put+1}')).tokens), e0100(11, 12));
});

test('a binary operator with no right operand is E0100 at the token after it', () => {
  assert.deepEqual(parse(lex(Buffer.from('main io{put 1+}')).tokens), e0100(14, 15));
});

test('empty parentheses are E0100 at the closing parenthesis', () => {
  assert.deepEqual(parsed('()'), { code: 'E0100', start: 1, end: 2 });
});

test('cmp_op: each of the six comparison operators parses as one comparison in an expression', () => {
  for (const op of ['==', '!=', '<', '<=', '>', '>=']) {
    assert.ok('tree' in parse(lex(Buffer.from(`main io{put 1${op}2}`)).tokens), op);
  }
});

test('put-((4)) parses as a whole program (unary minus over a grouped expression)', () => {
  assert.ok('tree' in parse(lex(Buffer.from('main io fail{put-((4))}')).tokens));
});
