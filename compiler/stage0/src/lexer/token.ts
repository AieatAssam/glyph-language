// Token kinds, keyword and punctuation spellings, and the token record (RFC 0014 rules 7, 10, 12).
// Erasable TypeScript only (Node 24 type stripping), so the kinds are a const object, not an enum.
// Kind values are plain numbers, each used once; token.test.ts checks that they stay unique.

// The fifteen keywords, in RFC 0104 rule 7 order. Keywords are lowercase only.
export const KEYWORDS = [
  'let', 'var', 'if', 'else', 'wh', 'ret', 'true', 'false', 'and', 'or', 'not', 'ex', 'io', 'put', 'fail',
] as const;

export type Keyword = (typeof KEYWORDS)[number];

// The eighteen punctuation and operator tokens, in RFC 0014 rule 10 order.
export const PUNCTUATION = [
  '(', ')', '{', '}', ',', ':', '=', '==', '!=', '<', '<=', '>', '>=', '+', '-', '*', '/', '%',
] as const;

export type Punctuation = (typeof PUNCTUATION)[number];

// Every token kind (RFC 0104 rule 12). Each keyword and each punctuation token has its own kind.
// IDENT, INT, TEXT, NEWLINE and EOF are the other five. Values are unique: the values freed by the
// removed keywords (fn, while, return, example) are reused, and KW_FAIL takes the next free value.
export const Kind = {
  KW_PUT: 0,
  KW_LET: 1,
  KW_VAR: 2,
  KW_IF: 3,
  KW_ELSE: 4,
  KW_WH: 5,
  KW_RET: 6,
  KW_TRUE: 7,
  KW_FALSE: 8,
  KW_AND: 9,
  KW_OR: 10,
  KW_NOT: 11,
  KW_EX: 12,
  KW_IO: 13,
  KW_FAIL: 37,
  LPAREN: 14,
  RPAREN: 15,
  LBRACE: 16,
  RBRACE: 17,
  COMMA: 18,
  COLON: 19,
  ASSIGN: 20,
  EQ: 21,
  NE: 22,
  LT: 23,
  LE: 24,
  GT: 25,
  GE: 26,
  PLUS: 27,
  MINUS: 28,
  STAR: 29,
  SLASH: 30,
  PERCENT: 31,
  IDENT: 32,
  INT: 33,
  TEXT: 34,
  NEWLINE: 35,
  EOF: 36,
} as const;

export type Kind = (typeof Kind)[keyof typeof Kind];

// Keyword spelling to kind. The key order matches KEYWORDS.
export const KEYWORD_KIND: Readonly<Record<Keyword, Kind>> = {
  let: Kind.KW_LET,
  var: Kind.KW_VAR,
  if: Kind.KW_IF,
  else: Kind.KW_ELSE,
  wh: Kind.KW_WH,
  ret: Kind.KW_RET,
  true: Kind.KW_TRUE,
  false: Kind.KW_FALSE,
  and: Kind.KW_AND,
  or: Kind.KW_OR,
  not: Kind.KW_NOT,
  ex: Kind.KW_EX,
  io: Kind.KW_IO,
  put: Kind.KW_PUT,
  fail: Kind.KW_FAIL,
};

// Punctuation spelling to kind. The key order matches PUNCTUATION.
export const PUNCTUATION_KIND: Readonly<Record<Punctuation, Kind>> = {
  '(': Kind.LPAREN,
  ')': Kind.RPAREN,
  '{': Kind.LBRACE,
  '}': Kind.RBRACE,
  ',': Kind.COMMA,
  ':': Kind.COLON,
  '=': Kind.ASSIGN,
  '==': Kind.EQ,
  '!=': Kind.NE,
  '<': Kind.LT,
  '<=': Kind.LE,
  '>': Kind.GT,
  '>=': Kind.GE,
  '+': Kind.PLUS,
  '-': Kind.MINUS,
  '*': Kind.STAR,
  '/': Kind.SLASH,
  '%': Kind.PERCENT,
};

// One token. start and end are byte offsets, end exclusive. text is set only where the lexer keeps it.
export interface Token {
  kind: Kind;
  start: number;
  end: number;
  text?: string;
}

// The kind of a keyword spelling, or null when the word is not one of the fifteen keywords.
// Only lowercase spellings match (rule 7).
export function keywordKind(word: string): Kind | null {
  return Object.hasOwn(KEYWORD_KIND, word) ? KEYWORD_KIND[word as Keyword] : null;
}
