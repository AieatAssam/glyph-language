// Parser entry (RFC 0104 grammar: program = { decl } EOF). The parser reads the tokens that the
// lexer returns for a file that has no lexical error, and gives a tree or one E0100.
import { Kind, type Token } from '../lexer/token.ts';
import { type Decl, type ExprParser, type ParseError, parseDecl } from './decl.ts';

export type { Decl, ParseError, Param, Ident, Span } from './decl.ts';

export interface Program {
  decls: Decl[];
}

export type ParseResult = { tree: Program } | { error: ParseError };

// ponytail: expressions are subtask 9 (parser/expr.ts). Until that lands, an expression is E0100 at
// its first token, so `ret` with a value and `ex` clauses do not parse yet. Upgrade path: pass the
// expression parser from parser/expr.ts in place of this one.
const noExpr: ExprParser = (tokens, at) => ({
  code: 'E0100',
  start: tokens[at].start,
  end: tokens[at].end,
});

// Parses a whole program. The tokens are those of lex(), which always end in EOF.
export function parse(tokens: readonly Token[], expr: ExprParser = noExpr): ParseResult {
  // ponytail: NEWLINE tokens are dropped. The lexer ends a file with one, and LF is not a token
  // (RFC 0104 rule 3), so the grammar never sees it. Upgrade path: none needed.
  const toks = tokens.filter((t) => t.kind !== Kind.NEWLINE);
  if (toks.length === 0 || toks[toks.length - 1].kind !== Kind.EOF) {
    throw new Error('parse: tokens must be the output of lex() and end in EOF');
  }
  const decls: Decl[] = [];
  let i = 0;
  while (toks[i].kind !== Kind.EOF) {
    const step = parseDecl(toks, i, expr);
    if ('code' in step) return { error: step };
    decls.push(step.decl);
    i = step.next;
  }
  return { tree: { decls } };
}
