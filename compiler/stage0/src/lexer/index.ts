// Lexer entry point (RFC 0014 rules 1 to 12 and 16). lex(buf) turns a source file into tokens.
//
// Walking-skeleton stage. It runs the whole-file byte check first, then scans words, integers and
// punctuation, and ends with EOF. It does not yet emit NEWLINE (subtask 8), so line ends are passed
// over, and it does not yet lex text literals (subtask 6).
//
// ponytail: a text literal starting with `"` makes lex throw, since no text lexer is wired in yet.
// Ceiling: any program with a text literal crashes instead of lexing. Upgrade path: subtask 6 adds
// text.ts and one branch in lex for it.
//
// Error order: the byte check and the scanner both run, and the first error by start offset wins.
// The scan stops at the byte check's error offset, so a scanner error is always before it. On any
// error the result has no tokens (rule 16).
import type { Buffer } from 'node:buffer';
import { lexInt } from './int.ts';
import { lexWord } from './ident.ts';
import { lexPunct } from './punct.ts';
import { checkBytes, type LexError } from './source.ts';
import { skipTrivia } from './trivia.ts';
import { Kind, type Token } from './token.ts';

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

// Lexes one whole source file. Returns the tokens and EOF, or the first error and no tokens.
export function lex(buf: Buffer): LexResult {
  const byteError = checkBytes(buf);
  // Scanning stops where the byte error starts, so the scanner never reads past it.
  const limit = byteError === null ? buf.length : byteError.start;
  const tokens: Token[] = [];
  let pos = 0;
  for (;;) {
    pos = skipTrivia(buf, pos).pos;
    if (pos >= limit) break;
    const b = buf[pos];
    let step: Step;
    if (startsWord(b)) {
      step = lexWord(buf, pos);
    } else if (isDigit(b)) {
      step = lexInt(buf, pos);
    } else if (b === DOUBLE_QUOTE) {
      throw new Error(`lex: text literal at byte ${pos} is not lexed yet (RFC 0014 subtask 6)`);
    } else {
      step = lexPunct(buf, pos);
    }
    if ('error' in step) return { tokens: [], error: step.error };
    tokens.push(step.token);
    pos = step.token.end;
  }
  if (byteError !== null) return { tokens: [], error: byteError };
  tokens.push({ kind: Kind.EOF, start: buf.length, end: buf.length });
  return { tokens, error: null };
}
