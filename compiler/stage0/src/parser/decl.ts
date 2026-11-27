// Declarations (RFC 0104 grammar: decl, param, ptype, rtype, block; G2, G4, G5, G9, G10, G12, G13).
// parseDecl reads one declaration that starts at tokens[at]. Its block is read by parseBlock in
// stmt.ts, and each expression is handed to the ExprParser that the caller passes in.
//
//   decl = IDENT [ "(" param { "," param } ")" ] [ rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
//
// The marks come in that order (G10).
import { Kind, type Token } from '../lexer/token.ts';
import { errAt, type ParseError, nameErr } from './errors.ts';
import { parseBlock } from './stmt.ts';

export type { ParseError, SyntaxCode } from './errors.ts';

export interface Span {
  start: number;
  end: number;
}

export interface Ident extends Span {
  text: string;
}

export interface Param extends Span {
  name: Ident;
  type: Ident;
}

// params is null for a declaration with no parentheses (G9). result, io and fail are null when
// absent. ex has one span per `ex` clause, from the keyword to the end of its expression.
export interface Decl extends Span {
  name: Ident;
  params: Param[] | null;
  result: Ident | null;
  io: Span | null;
  fail: Span | null;
  body: Span;
  ex: Span[];
}

export type ExprStep = { span: Span; next: number } | ParseError;

// Reads the expression that starts at tokens[at]. Returns its span and the index of the token
// after it, or an error.
export type ExprParser = (tokens: readonly Token[], at: number) => ExprStep;

export type DeclStep = { decl: Decl; next: number } | ParseError;

function spanOf(t: Token): Span {
  return { start: t.start, end: t.end };
}

function identOf(t: Token): Ident {
  return { text: t.text ?? '', start: t.start, end: t.end };
}

// `Int` and `Bool` are IDENT tokens with that text (RFC 0104 grammar: "Int" and "Bool").
function isType(t: Token): boolean {
  return t.kind === Kind.IDENT && (t.text === 'Int' || t.text === 'Bool');
}

export function parseDecl(tokens: readonly Token[], at: number, expr: ExprParser): DeclStep {
  const nameTok = tokens[at];
  if (nameTok.kind !== Kind.IDENT) return nameErr(nameTok);
  let i = at + 1;

  let params: Param[] | null = null;
  if (tokens[i].kind === Kind.LPAREN) {
    const list = parseParams(tokens, i);
    if ('code' in list) return list;
    params = list.params;
    i = list.next;
  }

  let result: Ident | null = null;
  if (isType(tokens[i])) {
    result = identOf(tokens[i]);
    i += 1;
  }

  let io: Span | null = null;
  if (tokens[i].kind === Kind.KW_IO) {
    io = spanOf(tokens[i]);
    i += 1;
  }

  let fail: Span | null = null;
  if (tokens[i].kind === Kind.KW_FAIL) {
    fail = spanOf(tokens[i]);
    i += 1;
  }

  const block = parseBlock(tokens, i, expr);
  if ('code' in block) return block;
  i = block.next;

  const ex: Span[] = [];
  while (tokens[i].kind === Kind.KW_EX) {
    const clause = expr(tokens, i + 1);
    if ('code' in clause) return clause;
    ex.push({ start: tokens[i].start, end: clause.span.end });
    i = clause.next;
  }

  const decl: Decl = {
    name: identOf(nameTok),
    params,
    result,
    io,
    fail,
    body: block.span,
    ex,
    start: nameTok.start,
    end: tokens[i - 1].end,
  };
  return { decl, next: i };
}

// Reads "(" param { "," param } ")" starting at the "(" at index at.
function parseParams(tokens: readonly Token[], at: number): { params: Param[]; next: number } | ParseError {
  let i = at + 1;
  // G9: a parameter list that is present is not empty.
  if (tokens[i].kind === Kind.RPAREN) return errAt(tokens[i]);
  const params: Param[] = [];
  for (;;) {
    const p = parseParam(tokens, i);
    if ('code' in p) return p;
    params.push(p.param);
    i = p.next;
    if (tokens[i].kind === Kind.COMMA) {
      i += 1;
      continue;
    }
    if (tokens[i].kind === Kind.RPAREN) return { params, next: i + 1 };
    return errAt(tokens[i]);
  }
}

// Reads one param, `IDENT ptype`. A keyword as the name is E0003 (G3); any other non-IDENT is E0100.
function parseParam(tokens: readonly Token[], at: number): { param: Param; next: number } | ParseError {
  const nameTok = tokens[at];
  if (nameTok.kind !== Kind.IDENT) return nameErr(nameTok);
  const typeTok = tokens[at + 1];
  // G4: the type is Int or Bool, and any other token is E0100 at that token.
  if (!isType(typeTok)) return errAt(typeTok);
  const param: Param = {
    name: identOf(nameTok),
    type: identOf(typeTok),
    start: nameTok.start,
    end: typeTok.end,
  };
  return { param, next: at + 2 };
}
