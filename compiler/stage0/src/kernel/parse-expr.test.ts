// Tests for the expression parser (RFC 0020, precedence list, G6, T1, E6). Each case lexes a source
// text, parses one expression from its first token, and checks the tree shape or the error.
// Sources are in canonical layout (RFC 0104 rule 4): no space around an operator or a comma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { lex } from '../lexer/index.ts';
import { Kind, type Token } from '../lexer/token.ts';
import { parseExpr, type Expr, type ExprError } from './parse-expr.ts';

// Parses the whole text as one expression. Fails the test if the lexer fails or the expression
// does not run to the end of the file.
function parseText(text: string): Expr | ExprError {
  const { tokens, error } = lex(Buffer.from(text, 'utf8'));
  assert.equal(error, null);
  const r = parseExpr(tokens, 0);
  if ('error' in r) return r.error;
  // A text with no final line end ends in a NEWLINE before EOF (RFC 0014 rule 15). The expression
  // parser stops before NEWLINE, because the statement parser decides what a NEWLINE ends, so the
  // helper skips that one token and then requires EOF.
  let end = r.next;
  if (tokens[end].kind === Kind.NEWLINE) end += 1;
  assert.equal(tokens[end].kind, Kind.EOF, 'expression did not reach the end of the file');
  return r.expr;
}

// Renders a tree as text: binary and unary operators in prefix form, calls in infix form.
function shape(e: Expr): string {
  switch (e.kind) {
    case 'binary':
      return `(${e.op} ${shape(e.left)} ${shape(e.right)})`;
    case 'unary':
      return `(${e.op} ${shape(e.operand)})`;
    case 'call':
      return `${e.callee.text}(${e.args.map(shape).join(', ')})`;
    case 'name':
      return e.text;
    case 'int':
      return e.text;
    case 'bool':
      return e.value ? 'true' : 'false';
    case 'text':
      return 'str';
  }
}

// Expects a tree and returns its shape.
function treeOf(text: string): string {
  const r = parseText(text);
  if ('code' in r) assert.fail(`expected a tree, got ${r.code} at ${r.start}`);
  return shape(r);
}

// Expects an error and returns it.
function errorOf(text: string): ExprError {
  const r = parseText(text);
  if (!('code' in r)) assert.fail(`expected an error, got ${shape(r)}`);
  return r;
}

test('not a==b parses as (not a) == b', () => {
  assert.equal(treeOf('not a==b'), '(== (not a) b)');
});

test('-a*b parses as (-a) * b', () => {
  assert.equal(treeOf('-a*b'), '(* (- a) b)');
});

test('* binds tighter than +, and - and + are left-associative', () => {
  assert.equal(treeOf('1+2*3'), '(+ 1 (* 2 3))');
  assert.equal(treeOf('a-b-c'), '(- (- a b) c)');
  assert.equal(treeOf('a/b%c'), '(% (/ a b) c)');
});

test('and binds tighter than or, and parentheses override the order', () => {
  assert.equal(treeOf('a or b and c'), '(or a (and b c))');
  assert.equal(treeOf('(1+2)*3'), '(* (+ 1 2) 3)');
});

test('a single comparison parses, and a call with arguments is a call node', () => {
  assert.equal(treeOf('a>=b'), '(>= a b)');
  assert.equal(treeOf('f(1,g(2))+3'), '(+ f(1, g(2)) 3)');
  assert.equal(treeOf('f()'), 'f()');
});

test('a boolean literal, a name and nested unary operators parse', () => {
  assert.equal(treeOf('not not true'), '(not (not true))');
  assert.equal(treeOf('--x'), '(- (- x))');
});

test('a second comparison operator is E0100 at that operator (G6)', () => {
  const text = 'a<b<c';
  assert.deepEqual(errorOf(text), { code: 'E0100', start: text.lastIndexOf('<'), end: text.lastIndexOf('<') + 1 });
});

test('a==b>=c is E0100 at >= (G6)', () => {
  const text = 'a==b>=c';
  assert.deepEqual(errorOf(text), { code: 'E0100', start: text.indexOf('>='), end: text.indexOf('>=') + 2 });
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

test('a keyword that cannot start an expression is E0100 at that token', () => {
  const text = 'a+else';
  assert.deepEqual(errorOf(text), { code: 'E0100', start: text.indexOf('else'), end: text.indexOf('else') + 4 });
});

test('a text token parses to a text node with its span', () => {
  const tokens: Token[] = [
    { kind: Kind.TEXT, start: 0, end: 3, text: '"a"' },
    { kind: Kind.EOF, start: 3, end: 3 },
  ];
  const r = parseExpr(tokens, 0);
  assert.ok(!('error' in r));
  assert.deepEqual(r.expr, { kind: 'text', start: 0, end: 3 });
  assert.equal(r.next, 1);
});

test('the result has spans as byte offsets and no types', () => {
  const { tokens } = lex(Buffer.from('a*(b+1)', 'utf8'));
  const r = parseExpr(tokens, 0);
  assert.ok(!('error' in r));
  assert.deepEqual(r.expr, {
    kind: 'binary',
    op: '*',
    left: { kind: 'name', text: 'a', start: 0, end: 1 },
    right: {
      kind: 'binary',
      op: '+',
      left: { kind: 'name', text: 'b', start: 3, end: 4 },
      right: { kind: 'int', text: '1', start: 5, end: 6 },
      start: 3,
      end: 6,
    },
    start: 0,
    end: 7,
  });
});
