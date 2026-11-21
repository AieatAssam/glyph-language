// Expression parser (RFC 0020: expr, or_expr, and_expr, cmp_expr, add_expr, mul_expr, unary, primary).
// It reads the token list from lex() and returns a tree. Nodes carry byte-offset spans and no types;
// the checker, which comes later, gives them types.
//
// Precedence, loosest first: or, and, the comparisons, + and -, * / and %, unary - and not, then
// primaries. Binary operators are left-associative. Comparisons do not chain (G6): a second
// comparison operator is E0100 at that operator. An integer literal above INT_MAX is E0500 at the
// literal, even after a unary minus (T1). + is not unary, so it is E0100 (E6).
//
// Spans: a binary, unary or call node runs from its first token to its last, parentheses included.
// A parenthesised expression is not a node of its own; it returns the inner node with the inner span.
import { Kind, type Token } from '../lexer/token.ts';
import { INT_MAX } from './types.ts';

export interface ExprError {
  code: 'E0100' | 'E0500';
  start: number;
  end: number;
}

export interface NameExpr {
  kind: 'name';
  text: string;
  start: number;
  end: number;
}

export type Expr =
  | { kind: 'binary'; op: string; left: Expr; right: Expr; start: number; end: number }
  | { kind: 'unary'; op: '-' | 'not'; operand: Expr; start: number; end: number }
  | { kind: 'call'; callee: NameExpr; args: Expr[]; start: number; end: number }
  | NameExpr
  | { kind: 'int'; text: string; start: number; end: number }
  | { kind: 'bool'; value: boolean; start: number; end: number }
  | { kind: 'text'; start: number; end: number };

// The parsed expression, and the index of the first token after it. Or the first error.
export type ExprResult = { expr: Expr; next: number } | { error: ExprError };

// Thrown inside the parser to stop at the first error; parseExpr turns it into the result.
class Stop {
  readonly error: ExprError;

  constructor(error: ExprError) {
    this.error = error;
  }
}

// Reads the token list from index pos. Taking the end of file never moves past it.
class Cursor {
  readonly tokens: readonly Token[];
  pos: number;

  constructor(tokens: readonly Token[], pos: number) {
    this.tokens = tokens;
    this.pos = pos;
  }

  peek(): Token {
    const t = this.tokens[this.pos];
    if (t !== undefined) return t;
    const last = this.tokens[this.tokens.length - 1];
    return last ?? { kind: Kind.EOF, start: 0, end: 0 };
  }

  next(): Token {
    const t = this.peek();
    if (t.kind !== Kind.EOF) this.pos += 1;
    return t;
  }

  // Byte offset where the last token taken ends. Zero before any token is taken.
  prevEnd(): number {
    return this.tokens[this.pos - 1]?.end ?? 0;
  }
}

function fail(t: Token): never {
  throw new Stop({ code: 'E0100', start: t.start, end: t.end });
}

// Takes the next token if it has the kind, or stops with E0100 at it.
function expect(c: Cursor, kind: number): Token {
  const t = c.peek();
  if (t.kind !== kind) fail(t);
  return c.next();
}

const OR = new Map<number, string>([[Kind.KW_OR, 'or']]);
const AND = new Map<number, string>([[Kind.KW_AND, 'and']]);
const CMP = new Map<number, string>([
  [Kind.EQ, '=='],
  [Kind.NE, '!='],
  [Kind.LT, '<'],
  [Kind.LE, '<='],
  [Kind.GT, '>'],
  [Kind.GE, '>='],
]);
const ADD = new Map<number, string>([
  [Kind.PLUS, '+'],
  [Kind.MINUS, '-'],
]);
const MUL = new Map<number, string>([
  [Kind.STAR, '*'],
  [Kind.SLASH, '/'],
  [Kind.PERCENT, '%'],
]);

// One left-associative level: operand { op operand }, where each operator is in ops.
function leftAssoc(c: Cursor, ops: ReadonlyMap<number, string>, operand: (c: Cursor) => Expr): Expr {
  const start = c.peek().start;
  let left = operand(c);
  for (;;) {
    const op = ops.get(c.peek().kind);
    if (op === undefined) return left;
    c.next();
    const right = operand(c);
    left = { kind: 'binary', op, left, right, start, end: c.prevEnd() };
  }
}

function orExpr(c: Cursor): Expr {
  return leftAssoc(c, OR, andExpr);
}

function andExpr(c: Cursor): Expr {
  return leftAssoc(c, AND, cmpExpr);
}

// cmp_expr = add_expr [ cmp_op add_expr ]. A second comparison operator is not allowed (G6).
function cmpExpr(c: Cursor): Expr {
  const start = c.peek().start;
  const left = addExpr(c);
  const op = CMP.get(c.peek().kind);
  if (op === undefined) return left;
  c.next();
  const right = addExpr(c);
  const after = c.peek();
  if (CMP.has(after.kind)) fail(after);
  return { kind: 'binary', op, left, right, start, end: c.prevEnd() };
}

function addExpr(c: Cursor): Expr {
  return leftAssoc(c, ADD, mulExpr);
}

function mulExpr(c: Cursor): Expr {
  return leftAssoc(c, MUL, unaryExpr);
}

// unary = ( "-" | "not" ) unary | primary
function unaryExpr(c: Cursor): Expr {
  const t = c.peek();
  if (t.kind !== Kind.MINUS && t.kind !== Kind.KW_NOT) return primary(c);
  c.next();
  const operand = unaryExpr(c);
  return { kind: 'unary', op: t.kind === Kind.MINUS ? '-' : 'not', operand, start: t.start, end: c.prevEnd() };
}

// primary = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
function primary(c: Cursor): Expr {
  const t = c.peek();
  switch (t.kind) {
    case Kind.INT: {
      c.next();
      if (t.text === undefined) throw new Error('parse-expr: INT token has no text');
      if (BigInt(t.text) > INT_MAX) throw new Stop({ code: 'E0500', start: t.start, end: t.end });
      return { kind: 'int', text: t.text, start: t.start, end: t.end };
    }
    case Kind.TEXT:
      c.next();
      return { kind: 'text', start: t.start, end: t.end };
    case Kind.KW_TRUE:
    case Kind.KW_FALSE:
      c.next();
      return { kind: 'bool', value: t.kind === Kind.KW_TRUE, start: t.start, end: t.end };
    case Kind.IDENT: {
      c.next();
      const name: NameExpr = { kind: 'name', text: t.text ?? '', start: t.start, end: t.end };
      if (c.peek().kind !== Kind.LPAREN) return name;
      c.next();
      const args = c.peek().kind === Kind.RPAREN ? [] : argList(c);
      expect(c, Kind.RPAREN);
      return { kind: 'call', callee: name, args, start: t.start, end: c.prevEnd() };
    }
    case Kind.LPAREN: {
      c.next();
      const inner = expr(c);
      expect(c, Kind.RPAREN);
      return inner;
    }
    default:
      return fail(t);
  }
}

// args = expr { "," expr }
function argList(c: Cursor): Expr[] {
  const args = [expr(c)];
  while (c.peek().kind === Kind.COMMA) {
    c.next();
    args.push(expr(c));
  }
  return args;
}

function expr(c: Cursor): Expr {
  return orExpr(c);
}

// Parses one expression that starts at tokens[at]. The result says where it ends, so a caller can
// check what follows it. Stops at the first error.
export function parseExpr(tokens: readonly Token[], at: number): ExprResult {
  const c = new Cursor(tokens, at);
  try {
    const parsed = expr(c);
    return { expr: parsed, next: c.pos };
  } catch (e) {
    if (e instanceof Stop) return { error: e.error };
    throw e;
  }
}
