// Expression parser (RFC 0020 precedence list). Reads lex() tokens and returns a tree whose nodes
// carry byte-offset spans and no types. Binary operators are left-associative. Comparisons do not
// chain (G6). An Int literal above INT_MAX is E0500 at the literal, even after unary minus (T1).
// + is not unary, so it is E0100 (E6). Binary, unary and call nodes span from their first token to
// their last, parentheses included; a parenthesised expression returns its inner node.
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

// The parsed expression and the index after it, or the first error.
export type ExprResult = { expr: Expr; next: number } | { error: ExprError };

// Thrown to stop at the first error. parseExpr turns it into a result.
class Stop {
  readonly error: ExprError;

  constructor(error: ExprError) {
    this.error = error;
  }
}

const EOF_TOKEN: Token = { kind: Kind.EOF, start: 0, end: 0 };

// Reads tokens from index pos. It never moves past end of file.
class Cursor {
  readonly tokens: readonly Token[];
  pos: number;

  constructor(tokens: readonly Token[], pos: number) {
    this.tokens = tokens;
    this.pos = pos;
  }

  peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1] ?? EOF_TOKEN;
  }

  next(): Token {
    const t = this.peek();
    if (t.kind !== Kind.EOF) this.pos += 1;
    return t;
  }

  // Byte offset where the last token taken ends; zero before any token is taken.
  prevEnd(): number {
    return this.tokens[this.pos - 1]?.end ?? 0;
  }
}

function fail(t: Token): never {
  throw new Stop({ code: 'E0100', start: t.start, end: t.end });
}

function closeParen(c: Cursor): void {
  if (c.peek().kind !== Kind.RPAREN) fail(c.peek());
  c.next();
}

const OR = new Map<number, string>([[Kind.KW_OR, 'or']]);
const AND = new Map<number, string>([[Kind.KW_AND, 'and']]);
const CMP = new Map<number, string>([[Kind.EQ, '=='], [Kind.NE, '!='], [Kind.LT, '<'], [Kind.LE, '<='], [Kind.GT, '>'], [Kind.GE, '>=']]);
const ADD = new Map<number, string>([[Kind.PLUS, '+'], [Kind.MINUS, '-']]);
const MUL = new Map<number, string>([[Kind.STAR, '*'], [Kind.SLASH, '/'], [Kind.PERCENT, '%']]);

// One left-associative level: operand { op operand }.
function leftAssoc(c: Cursor, ops: ReadonlyMap<number, string>, operand: (c: Cursor) => Expr): Expr {
  const start = c.peek().start;
  let left = operand(c);
  for (let op = ops.get(c.peek().kind); op !== undefined; op = ops.get(c.peek().kind)) {
    c.next();
    const right = operand(c);
    left = { kind: 'binary', op, left, right, start, end: c.prevEnd() };
  }
  return left;
}

// unary = ( "-" | "not" ) unary | primary
function unaryExpr(c: Cursor): Expr {
  const t = c.peek();
  if (t.kind !== Kind.MINUS && t.kind !== Kind.KW_NOT) return primary(c);
  c.next();
  const operand = unaryExpr(c);
  return { kind: 'unary', op: t.kind === Kind.MINUS ? '-' : 'not', operand, start: t.start, end: c.prevEnd() };
}

// cmp_expr = add_expr [ cmp_op add_expr ]. A second comparison operator is E0100 (G6).
function cmpExpr(c: Cursor): Expr {
  const start = c.peek().start;
  const left = leftAssoc(c, ADD, (c2) => leftAssoc(c2, MUL, unaryExpr));
  const op = CMP.get(c.peek().kind);
  if (op === undefined) return left;
  c.next();
  const right = leftAssoc(c, ADD, (c2) => leftAssoc(c2, MUL, unaryExpr));
  if (CMP.has(c.peek().kind)) fail(c.peek());
  return { kind: 'binary', op, left, right, start, end: c.prevEnd() };
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
      const callee: NameExpr = { kind: 'name', text: t.text ?? '', start: t.start, end: t.end };
      if (c.peek().kind !== Kind.LPAREN) return callee;
      c.next();
      const args: Expr[] = [];
      if (c.peek().kind !== Kind.RPAREN) {
        args.push(expr(c));
        while (c.peek().kind === Kind.COMMA) {
          c.next();
          args.push(expr(c));
        }
      }
      closeParen(c);
      return { kind: 'call', callee, args, start: t.start, end: c.prevEnd() };
    }
    case Kind.LPAREN: {
      c.next();
      const inner = expr(c);
      closeParen(c);
      return inner;
    }
    default:
      return fail(t);
  }
}

// expr = or_expr = and_expr { "or" and_expr }, with and_expr over cmp_expr.
function expr(c: Cursor): Expr {
  return leftAssoc(c, OR, (c2) => leftAssoc(c2, AND, cmpExpr));
}

// Parses one expression that starts at tokens[at]. The result gives the index after it, so the
// caller can check what follows. Stops at the first error.
export function parseExpr(tokens: readonly Token[], at: number): ExprResult {
  const c = new Cursor(tokens, at);
  try {
    return { expr: expr(c), next: c.pos };
  } catch (e) {
    if (e instanceof Stop) return { error: e.error };
    throw e;
  }
}
