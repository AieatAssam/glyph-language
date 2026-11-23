// Tests for the expression parser (RFC 0020: precedence, G6, T1, E6). Each case lexes a text,
// parses one expression from its first token, and checks the tree shape or the error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { Kind } from '../lexer/token.ts';
import { parseExpr, type Expr, type ExprError } from './parse-expr.ts';

// Parses the whole text as one expression. A final NEWLINE before EOF is skipped (RFC 0014 rule 15),
// since the statement parser decides what ends a line.
function parseText(text: string): Expr | ExprError {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  const r = parseExpr(tokens, 0);
  if ('error' in r) return r.error;
  let end = r.next;
  if (tokens[end].kind === Kind.NEWLINE) end += 1;
  assert.equal(tokens[end].kind, Kind.EOF, 'expression did not reach the end of the file');
  return r.expr;
}

// Renders a tree: binary and unary operators in prefix form, calls in infix form.
function shape(e: Expr): string {
  switch (e.kind) {
    case 'binary':
      return `(${e.op} ${shape(e.left)} ${shape(e.right)})`;
    case 'unary':
      return `(${e.op} ${shape(e.operand)})`;
    case 'call':
      return `${e.callee.text}(${e.args.map(shape).join(', ')})`;
    case 'name':
    case 'int':
      return e.text ?? '';
    case 'bool':
      return e.value ? 'true' : 'false';
    case 'text':
      return 'str';
  }
}

function treeOf(text: string): string {
  const r = parseText(text);
  if ('code' in r) assert.fail(`expected a tree, got ${r.code} at ${r.start}`);
  return shape(r);
}

function errorOf(text: string): ExprError {
  const r = parseText(text);
  if (!('code' in r)) assert.fail(`expected an error, got ${shape(r)}`);
  return r;
}

test('not a == b parses as (not a) == b', () => {
  assert.equal(treeOf('not a == b'), '(== (not a) b)');
});

test('-a * b parses as (-a) * b', () => {
  assert.equal(treeOf('-a * b'), '(* (- a) b)');
});

test('* binds tighter than +, - and + are left-associative, and and binds tighter than or', () => {
  assert.equal(treeOf('1 + 2 * 3'), '(+ 1 (* 2 3))');
  assert.equal(treeOf('a - b - c'), '(- (- a b) c)');
  assert.equal(treeOf('a or b and c'), '(or a (and b c))');
  assert.equal(treeOf('(1 + 2) * 3'), '(* (+ 1 2) 3)');
});

test('a single comparison, calls with arguments, and nested unary operators parse', () => {
  assert.equal(treeOf('a >= b'), '(>= a b)');
  assert.equal(treeOf('f(1, g(2)) + 3'), '(+ f(1, g(2)) 3)');
  assert.equal(treeOf('f()'), 'f()');
  assert.equal(treeOf('not not true'), '(not (not true))');
});

test('a second comparison operator is E0100 at that operator (G6)', () => {
  const text = 'a < b < c';
  assert.deepEqual(errorOf(text), { code: 'E0100', start: text.lastIndexOf('<'), end: text.lastIndexOf('<') + 1 });
  const text2 = 'a == b >= c';
  assert.deepEqual(errorOf(text2), { code: 'E0100', start: text2.indexOf('>='), end: text2.indexOf('>=') + 2 });
});

test('the largest Int is accepted, and one above it is E0500 at the literal (T1)', () => {
  assert.equal(treeOf('9223372036854775807'), '9223372036854775807');
  const text = '9223372036854775808';
  assert.deepEqual(errorOf(text), { code: 'E0500', start: 0, end: text.length });
});

test('-9223372036854775808 is E0500 at the literal, not at the minus (T1)', () => {
  const text = '-9223372036854775808';
  assert.deepEqual(errorOf(text), { code: 'E0500', start: 1, end: text.length });
});

test('+1 is E0100 at the plus, since + is not unary (E6)', () => {
  assert.deepEqual(errorOf('+1'), { code: 'E0100', start: 0, end: 1 });
});

test('the result has spans as byte offsets and no types', () => {
  const { tokens } = lex(Buffer.from('a * (b + 1)', 'utf8'));
  const r = parseExpr(tokens, 0);
  assert.ok(!('error' in r));
  assert.deepEqual(r.expr, {
    kind: 'binary',
    op: '*',
    left: { kind: 'name', text: 'a', start: 0, end: 1 },
    right: {
      kind: 'binary',
      op: '+',
      left: { kind: 'name', text: 'b', start: 5, end: 6 },
      right: { kind: 'int', text: '1', start: 9, end: 10 },
      start: 5,
      end: 10,
    },
    start: 0,
    end: 11,
  });
});
