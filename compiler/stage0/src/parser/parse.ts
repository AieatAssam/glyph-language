// Parser for the walking-skeleton program (RFC 0014 rule 13, E0100), and nothing wider:
//
//   fn NAME ( ) io { NAME ( INT ) }
//
// The tree is one function whose body is one call with one integer argument. Names and integer
// spellings are kept as written; the checker, which does not exist yet, decides what they mean.
//
// ponytail: this shape is the only one accepted. Ceiling: any other program gets E0100 at its first
// unexpected token. Upgrade path: the kernel RFC's grammar replaces this file, one production at a
// time, and each production gets its own spec/grammar.peg entry and conformance test.
//
// ponytail: NEWLINE tokens are skipped here. The lexer does not emit them yet (RFC 0014 subtask 8),
// and once it does, skipping them is wrong for any program with statements on separate lines.
// Upgrade path: the parser reads NEWLINE as a statement end when the grammar needs one.
import { Kind, type Token } from '../lexer/token.ts';

export interface Ident {
  text: string;
  start: number;
  end: number;
}

export interface IntLit {
  text: string;
  start: number;
  end: number;
}

// NAME ( INT ). Its span runs from the callee to the closing parenthesis.
export interface Call {
  callee: Ident;
  arg: IntLit;
  start: number;
  end: number;
}

// fn NAME ( ) io BODY. Its span runs from `fn` to the closing brace. A BODY of `{ }` has no call (null).
export interface FnDecl {
  name: Ident;
  body: Call | null;
  start: number;
  end: number;
}

export interface Program {
  fn: FnDecl;
}

// A syntax error: the first token the grammar does not accept (RFC 0014 rule 13). Its span is that
// token's span, or the end of the file when no token is left to read.
export interface ParseError {
  code: 'E0100';
  start: number;
  end: number;
}

export type ParseResult = { tree: Program } | { error: ParseError };

// Thrown inside the parser to stop at the first error; parse() turns it into the result.
class Stop {
  readonly error: ParseError;

  constructor(error: ParseError) {
    this.error = error;
  }
}

// Reads the token stream as the grammar sees it. NEWLINE tokens are skipped (see the ponytail note).
class Cursor {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens.filter((t) => t.kind !== Kind.NEWLINE);
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

  // Takes the next token if it has the kind, or stops with E0100 at it.
  expect(kind: number): Token {
    const t = this.peek();
    if (t.kind !== kind) throw new Stop({ code: 'E0100', start: t.start, end: t.end });
    return this.next();
  }
}

function ident(c: Cursor): Ident {
  const t = c.expect(Kind.IDENT);
  return { text: t.text ?? '', start: t.start, end: t.end };
}

function call(c: Cursor): Call {
  const callee = ident(c);
  c.expect(Kind.LPAREN);
  const argTok = c.expect(Kind.INT);
  const close = c.expect(Kind.RPAREN);
  return {
    callee,
    arg: { text: argTok.text ?? '', start: argTok.start, end: argTok.end },
    start: callee.start,
    end: close.end,
  };
}

function fnDecl(c: Cursor): FnDecl {
  const fnTok = c.expect(Kind.KW_FN);
  const name = ident(c);
  c.expect(Kind.LPAREN);
  c.expect(Kind.RPAREN);
  c.expect(Kind.KW_IO);
  c.expect(Kind.LBRACE);
  // ponytail: an empty block `{ }` (RFC 0048 `block = "{" [ stmt ] "}"`, with spacing not kept) is
  // accepted, and so is the one-call body. Ceiling: no statement but the call. Upgrade path: the
  // kernel parser subtasks add the statement forms.
  const body = c.peek().kind === Kind.RBRACE ? null : call(c);
  const close = c.expect(Kind.RBRACE);
  return { name, body, start: fnTok.start, end: close.end };
}

// Parses a token list from lex(). Nothing may follow the function but EOF.
export function parse(tokens: readonly Token[]): ParseResult {
  const c = new Cursor(tokens);
  try {
    const fn = fnDecl(c);
    const extra = c.peek();
    if (extra.kind !== Kind.EOF) {
      return { error: { code: 'E0100', start: extra.start, end: extra.end } };
    }
    return { tree: { fn } };
  } catch (e) {
    if (e instanceof Stop) return { error: e.error };
    throw e;
  }
}
