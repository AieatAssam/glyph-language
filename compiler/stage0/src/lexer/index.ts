// Lexer entry point (RFC 0014 rules 1 to 16). lex(buf) turns a source file into tokens.
//
// The whole-file byte check runs first (subtask 1). The scan then loops over skipTrivia, which
// passes the line ends, and over one scanner per token kind. Line ends and tokens go to the NEWLINE
// stage (subtask 8), which decides where NEWLINE and EOF go.
//
// Error choice. The byte check and the scanners run separately, and the scan stops at the first
// byte error, so no scanner step starts past it. When both report an error, the scanner error wins
// only if it ends before the byte error starts. Otherwise the byte error wins: a scanner error that
// reaches the byte error is caused by it (for example, a text literal that contains a tab). On any
// error the result has no tokens (rule 16).
import type { Buffer } from 'node:buffer';
import { lexInt } from './int.ts';
import { lexWord } from './ident.ts';
import { NewlineStage } from './newline.ts';
import { lexPunct } from './punct.ts';
import { checkBytes, type LexError } from './source.ts';
import { lexText } from './text.ts';
import { skipTrivia } from './trivia.ts';
import type { Token } from './token.ts';

export interface LexResult {
  tokens: Token[];
  error: LexError | null;
}

type Step = { token: Token } | { error: LexError };

const DOUBLE_QUOTE = 0x22;

function isDigit(b: number): boolean {
  return b >= 0x30 && b <= 0x39;
}

// A byte that starts a word: an ASCII letter, `_`, or a non-ASCII byte (lexWord reports it as E0001).
function startsWord(b: number): boolean {
  return (b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a) || b === 0x5f || b >= 0x80;
}

// Scans the one token that starts at pos. The caller has already skipped trivia.
function scanOne(buf: Buffer, pos: number): Step {
  const b = buf[pos];
  if (startsWord(b)) return lexWord(buf, pos);
  if (isDigit(b)) return lexInt(buf, pos);
  if (b === DOUBLE_QUOTE) return lexText(buf, pos);
  return lexPunct(buf, pos);
}

// Chooses between the first scanner error and the byte error (see the note at the top of this file).
function pickError(scan: LexError | null, bytes: LexError | null): LexError | null {
  if (scan === null) return bytes;
  if (bytes === null) return scan;
  return scan.end <= bytes.start ? scan : bytes;
}

// Lexes one whole source file. Returns the tokens, ending in NEWLINE if one is due and then EOF, or
// the first error and no tokens.
export function lex(buf: Buffer): LexResult {
  const byteError = checkBytes(buf);
  // The scan stops at the byte error, so no token starts past it.
  const limit = byteError === null ? buf.length : byteError.start;
  const newline = new NewlineStage();
  let scanError: LexError | null = null;
  let pos = 0;
  for (;;) {
    const trivia = skipTrivia(buf, pos);
    for (const span of trivia.lineEnds) newline.lineEnd(span);
    pos = trivia.pos;
    if (pos >= limit) break;
    const step = scanOne(buf, pos);
    if ('error' in step) {
      scanError = step.error;
      break;
    }
    newline.token(step.token);
    pos = step.token.end;
  }
  const error = pickError(scanError, byteError);
  if (error !== null) return { tokens: [], error };
  return { tokens: newline.finish(buf.length), error: null };
}
