// Expressions (RFC 0104 grammar: expr, and_expr, cmp_expr, add_expr, mul_expr, unary, primary;
// G6, G8). parseExpr reads one expression that starts at tokens[at] and gives its tree, its span
// and the index of the token after it. Each grammar level is one function, so the precedence is
// the grammar's: `or` binds loosest, then `and`, then one comparison, then + and -, then * / %, then
// unary operators and primaries.
//
// A keyword in expression position is not a primary, so it is E0100 at that keyword (G8). So is any
// other token the grammar does not accept there: a binary operator, `)`, or end of file.
import { Kind, type Token } from '../lexer/token.ts';
import type { ParseError } from './decl.ts';

export type Expr =
  | { kind: 'int' | 'text' | 'bool' | 'name'; text: string; start: number; end: number }
  | { kind: 'call'; callee: string; args: Expr[]; start: number; end: number }
  | { kind: 'unary'; op: '-' | 'not'; operand: Expr; start: number; end: number }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; start: number; end: number }
  | { kind: 'group'; inner: Expr; start: number; end: number };

export type ExprResult = { span: { start: number; end: number }; next: number; expr: Expr } | ParseError;

type Toks = readonly Token[];
type Step = { expr: Expr; next: number } | ParseError;

const OR: ReadonlyMap<number, string> = new Map([[Kind.KW_OR, 'or']]);
const AND: ReadonlyMap<number, string> = new Map([[Kind.KW_AND, 'and']]);
const CMP: ReadonlyMap<number, string> = new Map([
  [Kind.EQ, '=='], [Kind.NE, '!='], [Kind.LT, '<'], [Kind.LE, '<='], [Kind.GT, '>'], [Kind.GE, '>='],
]);
const ADD: ReadonlyMap<number, string> = new Map([[Kind.PLUS, '+'], [Kind.MINUS, '-']]);
const MUL: ReadonlyMap<number, string> = new Map([[Kind.STAR, '*'], [Kind.SLASH, '/'], [Kind.PERCENT, '%']]);

function errAt(t: Token): ParseError {
  return { code: 'E0100', start: t.start, end: t.end };
}

function binary(op: string, left: Expr, right: Expr): Expr {
  return { kind: 'binary', op, left, right, start: left.start, end: right.end };
}

// Reads operand { op operand }, where op is one of the operators in ops. Each operator is
// left-associative.
function leftAssoc(tokens: Toks, at: number, ops: ReadonlyMap<number, string>, operand: (t: Toks, a: number) => Step): Step {
  const first = operand(tokens, at);
  if ('code' in first) return first;
  let left = first.expr;
  let i = first.next;
  for (;;) {
    const op = ops.get(tokens[i].kind);
    if (op === undefined) return { expr: left, next: i };
    const right = operand(tokens, i + 1);
    if ('code' in right) return right;
    left = binary(op, left, right.expr);
    i = right.next;
  }
}

// expr = and_expr { "or" and_expr }
function orExpr(tokens: Toks, at: number): Step {
  return leftAssoc(tokens, at, OR, andExpr);
}

// and_expr = cmp_expr { "and" cmp_expr }
function andExpr(tokens: Toks, at: number): Step {
  return leftAssoc(tokens, at, AND, cmpExpr);
}

// cmp_expr = add_expr [ cmp_op add_expr ]. Comparisons do not chain (G6).
function cmpExpr(tokens: Toks, at: number): Step {
  const left = addExpr(tokens, at);
  if ('code' in left) return left;
  const op = CMP.get(tokens[left.next].kind);
  if (op === undefined) return left;
  const right = addExpr(tokens, left.next + 1);
  if ('code' in right) return right;
  // G6: a second comparison operator is E0100 at that operator.
  if (CMP.has(tokens[right.next].kind)) return errAt(tokens[right.next]);
  return { expr: binary(op, left.expr, right.expr), next: right.next };
}

// add_expr = mul_expr { ( "+" | "-" ) mul_expr }
function addExpr(tokens: Toks, at: number): Step {
  return leftAssoc(tokens, at, ADD, mulExpr);
}

// mul_expr = unary { ( "*" | "/" | "%" ) unary }
function mulExpr(tokens: Toks, at: number): Step {
  return leftAssoc(tokens, at, MUL, unary);
}

// unary = ( "-" | "not" ) unary | primary
function unary(tokens: Toks, at: number): Step {
  const t = tokens[at];
  if (t.kind !== Kind.MINUS && t.kind !== Kind.KW_NOT) return primary(tokens, at);
  const operand = unary(tokens, at + 1);
  if ('code' in operand) return operand;
  const op = t.kind === Kind.MINUS ? '-' : 'not';
  const expr: Expr = { kind: 'unary', op, operand: operand.expr, start: t.start, end: operand.expr.end };
  return { expr, next: operand.next };
}

// primary = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
function primary(tokens: Toks, at: number): Step {
  const t = tokens[at];
  switch (t.kind) {
    case Kind.INT:
    case Kind.TEXT: {
      const kind = t.kind === Kind.INT ? 'int' : 'text';
      return { expr: { kind, text: t.text ?? '', start: t.start, end: t.end }, next: at + 1 };
    }
    case Kind.KW_TRUE:
    case Kind.KW_FALSE:
      return { expr: { kind: 'bool', text: t.kind === Kind.KW_TRUE ? 'true' : 'false', start: t.start, end: t.end }, next: at + 1 };
    case Kind.IDENT:
      return identOrCall(tokens, at);
    case Kind.LPAREN:
      return group(tokens, at);
    default:
      // G8: a keyword, an operator, `)` or end of file cannot start an expression.
      return errAt(t);
  }
}

// IDENT, or IDENT "(" [ args ] ")". args = expr { "," expr }.
function identOrCall(tokens: Toks, at: number): Step {
  const name = tokens[at];
  if (tokens[at + 1].kind !== Kind.LPAREN) {
    return { expr: { kind: 'name', text: name.text ?? '', start: name.start, end: name.end }, next: at + 1 };
  }
  const args: Expr[] = [];
  let i = at + 2;
  if (tokens[i].kind !== Kind.RPAREN) {
    for (;;) {
      const arg = orExpr(tokens, i);
      if ('code' in arg) return arg;
      args.push(arg.expr);
      i = arg.next;
      if (tokens[i].kind !== Kind.COMMA) break;
      i += 1;
    }
  }
  if (tokens[i].kind !== Kind.RPAREN) return errAt(tokens[i]);
  const expr: Expr = { kind: 'call', callee: name.text ?? '', args, start: name.start, end: tokens[i].end };
  return { expr, next: i + 1 };
}

// "(" expr ")". The group keeps the parentheses' span.
function group(tokens: Toks, at: number): Step {
  const open = tokens[at];
  const inner = orExpr(tokens, at + 1);
  if ('code' in inner) return inner;
  const close = tokens[inner.next];
  if (close.kind !== Kind.RPAREN) return errAt(close);
  const expr: Expr = { kind: 'group', inner: inner.expr, start: open.start, end: close.end };
  return { expr, next: inner.next + 1 };
}

// Reads one expression that starts at tokens[at]. Its span runs from its first byte to its last.
export function parseExpr(tokens: Toks, at: number): ExprResult {
  const r = orExpr(tokens, at);
  if ('code' in r) return r;
  return { span: { start: r.expr.start, end: r.expr.end }, next: r.next, expr: r.expr };
}
