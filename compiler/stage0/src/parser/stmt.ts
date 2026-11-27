// Blocks and statements (RFC 0104 grammar: block, stmt, args; G1, G2, G3, G7, G11).
//
//   block = "{" { stmt } [ "ret" [ expr ] ] "}"
//   stmt  = "let" IDENT "=" expr | "var" IDENT "=" expr | IDENT "=" expr | IDENT "(" [ args ] ")"
//         | "put" expr | "if" expr block [ "else" block ] | "wh" expr block
//
// Expressions come from the ExprParser that the caller passes in (parser/expr.ts, subtask 9).
// Statements have no separator (G1). Only `}` or `ret` may end the statement list, so `ret` is the
// last item (G2).
import { Kind, type Token } from '../lexer/token.ts';
import { errAt, type ParseError, nameErr } from './errors.ts';
import type { ExprParser, Span } from './decl.ts';

type Step = { next: number } | ParseError;

// The kinds that start a statement. Any other token before `}` or `ret` is E0100 at that token.
function startsStmt(kind: number): boolean {
  return kind === Kind.KW_LET || kind === Kind.KW_VAR || kind === Kind.IDENT || kind === Kind.KW_PUT
    || kind === Kind.KW_IF || kind === Kind.KW_WH;
}

// Reads "{" { stmt } [ "ret" [ expr ] ] "}" starting at the "{" at index at.
export function parseBlock(
  tokens: readonly Token[],
  at: number,
  expr: ExprParser,
): { span: Span; next: number } | ParseError {
  if (tokens[at].kind !== Kind.LBRACE) return errAt(tokens[at]);
  let i = at + 1;
  while (startsStmt(tokens[i].kind)) {
    const step = stmt(tokens, i, expr);
    if ('code' in step) return step;
    i = step.next;
  }
  if (tokens[i].kind === Kind.KW_RET) {
    i += 1;
    if (tokens[i].kind !== Kind.RBRACE) {
      const value = expr(tokens, i);
      if ('code' in value) return value;
      i = value.next;
    }
  }
  // G2: after the statements and an optional ret, only `}` may follow.
  if (tokens[i].kind !== Kind.RBRACE) return errAt(tokens[i]);
  return { span: { start: tokens[at].start, end: tokens[i].end }, next: i + 1 };
}

// Reads one statement that starts at tokens[at]. The caller has checked that it starts a statement.
function stmt(tokens: readonly Token[], at: number, expr: ExprParser): Step {
  const t = tokens[at];
  switch (t.kind) {
    case Kind.KW_LET:
    case Kind.KW_VAR: {
      // G3: a keyword where the name is required is E0003; any other non-identifier is E0100.
      const name = tokens[at + 1];
      if (name.kind !== Kind.IDENT) return nameErr(name);
      if (tokens[at + 2].kind !== Kind.ASSIGN) return errAt(tokens[at + 2]);
      return exprStep(tokens, at + 3, expr);
    }
    case Kind.KW_PUT:
      return exprStep(tokens, at + 1, expr);
    case Kind.KW_IF: {
      const cond = expr(tokens, at + 1);
      if ('code' in cond) return cond;
      const then = parseBlock(tokens, cond.next, expr);
      if ('code' in then) return then;
      // G7: else takes a block, so `else if` is E0100 at the if (parseBlock refuses it).
      if (tokens[then.next].kind !== Kind.KW_ELSE) return { next: then.next };
      const otherwise = parseBlock(tokens, then.next + 1, expr);
      if ('code' in otherwise) return otherwise;
      return { next: otherwise.next };
    }
    case Kind.KW_WH: {
      const cond = expr(tokens, at + 1);
      if ('code' in cond) return cond;
      const body = parseBlock(tokens, cond.next, expr);
      if ('code' in body) return body;
      return { next: body.next };
    }
    case Kind.IDENT: {
      const after = tokens[at + 1];
      if (after.kind === Kind.ASSIGN) return exprStep(tokens, at + 2, expr);
      if (after.kind === Kind.LPAREN) return callArgs(tokens, at + 1, expr);
      return errAt(after);
    }
    default:
      return errAt(t);
  }
}

// Reads one expression at tokens[at] and returns the index after it.
function exprStep(tokens: readonly Token[], at: number, expr: ExprParser): Step {
  const value = expr(tokens, at);
  if ('code' in value) return value;
  return { next: value.next };
}

// Reads "(" [ args ] ")" starting at the "(" at index at. args = expr { "," expr }.
function callArgs(tokens: readonly Token[], at: number, expr: ExprParser): Step {
  let i = at + 1;
  if (tokens[i].kind !== Kind.RPAREN) {
    for (;;) {
      const arg = expr(tokens, i);
      if ('code' in arg) return arg;
      i = arg.next;
      if (tokens[i].kind !== Kind.COMMA) break;
      i += 1;
    }
  }
  if (tokens[i].kind !== Kind.RPAREN) return errAt(tokens[i]);
  return { next: i + 1 };
}
