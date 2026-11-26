// Parser for the walking-skeleton program (RFC 0014 rule 13, E0100), and nothing wider:
//
//   fn NAME ( ) io { [ NAME ( INT ) ] }
//
// The body is either empty or one call with one integer argument. Names and integer spellings are
// kept as written; the checker, which does not exist yet, decides what they mean.
//
// A keyword in the function name position is E0003 at the keyword (RFC 0048 rule 7 and G3). Every
// other position the grammar rejects is E0100.
//
// ponytail: these two body shapes are the only ones accepted. Ceiling: any other program gets E0100
// at its first unexpected token. Upgrade path: the kernel RFC's grammar replaces this file, one
// production at a time, and each production gets its own spec/grammar.peg entry and conformance test.
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

// fn NAME ( ) io BODY. Its span runs from `fn` to the closing brace. The body is null when the
// braces are empty.
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
// token's span, or the end of the file when no token is left to read. E0003 is a keyword where a
// name is required (RFC 0048 G3).
export interface ParseError {
  code: 'E0003' | 'E0100';
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

// The token kinds of the keywords, read from the token table so no second list exists.
const KEYWORD_KINDS: ReadonlySet<number> = new Set(
  Object.entries(Kind)
    .filter(([name]) => name.startsWith('KW_'))
    .map(([, kind]) => kind),
);

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

// The name after `fn`. A keyword there is E0003 at the keyword, not E0100.
function fnName(c: Cursor): Ident {
  const t = c.peek();
  if (KEYWORD_KINDS.has(t.kind)) throw new Stop({ code: 'E0003', start: t.start, end: t.end });
  return ident(c);
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

// The first token of a body. A `let` or `var` starts a statement the skeleton does not accept yet.
// The name after it is checked (G3), so a keyword there is E0003 at that keyword. Any other `let`
// or `var` is E0100 at it.
//
// ponytail: no statement is accepted, so `let x = 1` is E0100 at `let`. Ceiling: this check runs
// before any statement is read. Upgrade path: the statement parser (RFC 0048 subtask 9) replaces it.
function body(c: Cursor): Call | null {
  const t = c.peek();
  if (t.kind === Kind.RBRACE) return null;
  if (t.kind === Kind.KW_LET || t.kind === Kind.KW_VAR) {
    c.next();
    const name = c.peek();
    if (KEYWORD_KINDS.has(name.kind)) {
      throw new Stop({ code: 'E0003', start: name.start, end: name.end });
    }
    throw new Stop({ code: 'E0100', start: t.start, end: t.end });
  }
  return call(c);
}

function fnDecl(c: Cursor): FnDecl {
  const fnTok = c.expect(Kind.KW_FN);
  const name = fnName(c);
  c.expect(Kind.LPAREN);
  c.expect(Kind.RPAREN);
  c.expect(Kind.KW_IO);
  c.expect(Kind.LBRACE);
  const stmt = body(c);
  const close = c.expect(Kind.RBRACE);
  return { name, body: stmt, start: fnTok.start, end: close.end };
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
