// Parser for the walking-skeleton program (RFC 0104 grammar, decl and put; E0100), and nothing wider:
//
//   NAME io { put INT }
//
// The tree is one function whose body is one put of one integer. The put is kept in the call shape
// that codegen.ts reads: its callee is `print`, spanning the `put` keyword. Names and integer
// spellings are kept as written; the checker, which does not exist yet, decides what they mean.
//
// ponytail: this shape is the only one accepted. Ceiling: any other program gets E0100 at its first
// unexpected token. Upgrade path: parser/index.ts (the RFC 0104 parser) replaces this file, and
// codegen.ts reads a put statement instead of the synthesized print call.
//
// ponytail: NEWLINE tokens are skipped here. The lexer ends a file with one, and LF is not a token
// (RFC 0104 rule 3), so the grammar never sees it. Upgrade path: none needed.
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

// NAME io BODY. Its span runs from the name to the closing brace. A BODY of `{}` has no call (null).
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

// put INT, read as the call print(INT) (see the header note).
function put(c: Cursor): Call {
  const kw = c.expect(Kind.KW_PUT);
  const argTok = c.expect(Kind.INT);
  return {
    callee: { text: 'print', start: kw.start, end: kw.end },
    arg: { text: argTok.text ?? '', start: argTok.start, end: argTok.end },
    start: kw.start,
    end: argTok.end,
  };
}

function fnDecl(c: Cursor): FnDecl {
  const name = ident(c);
  c.expect(Kind.KW_IO);
  c.expect(Kind.LBRACE);
  // ponytail: an empty block is `{` `}` (RFC 0104 block). Ceiling: no statement but the put.
  // Upgrade path: parser/index.ts reads the statement forms.
  const body = c.peek().kind === Kind.RBRACE ? null : put(c);
  const close = c.expect(Kind.RBRACE);
  return { name, body, start: name.start, end: close.end };
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
