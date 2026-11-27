---
status: accepted
votes:
  designer-min: approve
  designer-safe: approve
  impl-1: approve
  tester: approve
  user-1: approve
  user-2: approve
---
# RFC draft: Lexical structure and core syntax

Class: language
Slug: lexical-syntax-v6
Status: draft (attempt 6)
Replaces: RFC 0048 (lexical-syntax-v4, superseded by the owner).
Revises: RFC 0102 (lexical-syntax-v5, rejected on attempt 5). It keeps what voters accepted there and changes only what Summary lists.
Amends: RFC 0004 (expected results of `diag/fix-present` and `diag/record-shape`, Design section "Expected results"); RFC 0014 (its rules 3, 5, 7, 8, 13 to 15, as restated here); RFC 0050 (its `diag/record-shape` line, E0100 at bytes 4 to 7, is replaced).
Meaning of every form here is given by `kernel-v46`. Diagnostic records follow `spec/core/diagnostic.md`. Codes are listed in `spec/errors.json`.

## Summary

This RFC fixes how a Glyph source file becomes tokens and how tokens form a program. Against RFC 0102 it changes four things, each answering a recorded objection:

- **Line feeds.** A line feed outside a text literal is E0002, as RFC 0102's diagnostic table and tests already said. RFC 0102 rule 2 said E0001. Tab, CR and other control characters stay E0001.
- **Keyword `fail`.** The declaration mark `fail` is a keyword, as `io` is.
- **One syntax.** RFC 0103's forms (`n:Int`, `):Int`, `main()`, a two-line sample) are not adopted. `kernel-v46` uses the forms in this RFC.
- **Text tests.** Tests that bind a text literal with `let` now use `put`. `kernel-v46` rule T3 makes a text literal valid only as the argument of `put`.

The rest is RFC 0102 as voters accepted it. `;` is removed. `ret` ends its block. `put` is a keyword and takes its argument without parentheses: `put x`. The top level holds only declarations. A parameter is `n Int`, a result follows the `)` as `)Int`, and a declaration with no parameters has no parentheses: `main io{...}`. Comments are removed. A raw LF inside a text literal is content, and the `\n` escape is removed.

## Motivation

Models write Glyph and need one way to write each construct. RFC 0048 left choices open: where line breaks counted, whether `;` was needed, and two parameter spellings. Each costs tokens, and each is a place for a model to err. The owner measured the base program at 94 tokens. Dropping `;` takes it to 90, and `put x` takes three calls to 88.

Objections to RFC 0102, and how this draft answers each:

- designer-safe and tester: rule 2 and the last sentence of rule 4 said a line feed in a gap is E0001, while the E0002 row and tests `v5-fmt-newline` and `v5-fmt-trailing-lf` expected E0002. Fixed by rule 2 (line feed excluded) and rules 3 and 4 (line feed is E0002). Control characters other than LF stay E0001 by rule 2.
- tester: the keyword list omitted `fail`, which the kernel grammar used as a terminal. Fixed by rule 7.
- tester and designer-min: the grammar and examples disagreed with the kernel. Settled here (Summary, "One syntax"). Kernel-v46 is revised to match.
- tester: `v5-text` and `v5-text-lf` bound a text value with `let`, which kernel-v46 rejects. Changed to `put`.
- user-1: no way to leave a note in a program. Comments stay out. The compiler ignores them, and the RFC and the tests carry the meaning (Alternatives).

## Design

Normative. "Must" and "is" bind implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value. A *word character* is an ASCII letter, an ASCII digit or `_`. A *word token* is a token whose last character is a word character.

### Lexical rules

1. **Source text.** A source file must be valid UTF-8. Invalid UTF-8 is E0001 at the first invalid byte. A byte order mark (U+FEFF) is E0001 wherever it appears.

2. **Control characters.** U+0000 to U+001F and U+007F are E0001 wherever they appear, except LF (U+000A), which rules 3, 4 and 9 govern. This includes the tab (U+0009) and the CR (U+000D).

3. **Line end.** LF is not a token. Outside a text literal it is part of a gap, and rule 4 makes it E0002. Inside a text literal it is content (rule 9). A CR is E0001 (rule 2).

4. **Layout.** A *gap* is the text between two adjacent tokens, outside text literals. The text before the first token and after the last token is also a gap. The *canonical gap* is one space (U+0020) if the last character of the token before the gap and the first character of the token after it are both word characters, and nothing otherwise. The canonical gap before the first token and after the last token is nothing. Each gap is checked in this order:
   - (a) a control character in it (rule 2) is E0001 at the first such character;
   - (b) otherwise, a gap that is not the canonical gap is E0002, with the gap as span and the canonical gap as the fix replacement. Where a space is missing between two word tokens, the span is zero-length at the point between them.

   The canonical form of a program is one line, with no indentation, no trailing LF and no other whitespace. Examples: `ret n` (one space); `if n<2{` (none); `put (1)` is E0002 at the space after `put`; `main io{`, LF, `put 1}` is E0002 at the LF.

5. **Comments.** There are none. `/` is always the division token. `//` is two `/` tokens, and the grammar rejects it (E0100).

6. **Identifiers.** An identifier is one ASCII letter or `_`, followed by zero or more ASCII letters, digits or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal is E0001 at that character. `Int`, `Bool` and `fn` are identifiers.

7. **Keywords.** Exactly fifteen words are keywords, all lowercase:

   `let var if else wh ret true false and or not ex io put fail`

   Each keyword lexes as its own token kind, never as an identifier. No other word is reserved.

8. **Integer literals.** A decimal integer is `0`, or a digit from `1` to `9` followed by zero or more digits. It has no sign and no underscore. A literal with a leading zero (`007`, `00`) is E0006 at the literal. Its fix replaces the literal with its digits without leading zeros, keeping one digit: `007` becomes `7`, `00` becomes `0`. The value must be at most 9223372036854775807. A larger literal is E0500, reported by the checker. The check applies to the literal alone, before any unary `-`.

9. **Text literals.** A text literal starts with `"` and ends at the next `"`. Between the quotes are any valid UTF-8 characters except `"`, `\`, and the characters rule 2 forbids; a raw LF is allowed. The escapes are `\"` (quote) and `\\` (backslash). Any other `\` sequence is E0005 at the backslash and the character after it. If the file ends before the closing quote, the error is E0005 at the span from the opening quote to the end of the file. The value of the token is its UTF-8 bytes after escapes; a raw LF is byte 0x0A.

10. **Punctuation and operators.** The tokens are exactly these seventeen: `( ) { } , = == != < <= > >= + - * / %`. The lexer takes the longest listed token that starts at the current character, reading at most one character ahead. So `==`, `!=`, `<=` and `>=` are each one token. `=>` is `=` then `>`. `->` is `-` then `>`.

11. **Other characters.** Every printable ASCII character not covered by rules 5 to 10 is E0001 at that character. This includes `:`, `;`, `[`, `]`, `.`, `!` not followed by `=`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` ``, and `\` outside a text literal.

12. **Token kinds.** Each keyword and each punctuation token has its own kind. The other kinds are `IDENT`, `INT`, `TEXT` and `EOF`.

13. **Lexical errors stop compilation.** The lexer reports the first lexical error (E0001, E0002, E0005 or E0006) and emits no tokens after it.

### Grammar

Normative. `"x"` is a keyword or punctuation token. `IDENT`, `INT`, `TEXT` and `EOF` are token kinds. `[ a ]` is zero or one, `{ a }` is zero or more, `|` separates alternatives. `"Int"` and `"Bool"` mean an `IDENT` token with that text. A program is one `program`.

```
program  = { decl } EOF
decl     = IDENT [ "(" param { "," param } ")" ] [ rtype ] [ "io" ] [ "fail" ] block { "ex" expr }
param    = IDENT ptype
ptype    = "Int" | "Bool"
rtype    = "Int" | "Bool"
block    = "{" { stmt } [ "ret" [ expr ] ] "}"
stmt     = "let" IDENT "=" expr
         | "var" IDENT "=" expr
         | IDENT "=" expr
         | IDENT "(" [ args ] ")"
         | "put" expr
         | "if" expr block [ "else" block ]
         | "wh" expr block
args     = expr { "," expr }
expr     = and_expr { "or" and_expr }
and_expr = cmp_expr { "and" cmp_expr }
cmp_expr = add_expr [ cmp_op add_expr ]
cmp_op   = "==" | "!=" | "<" | "<=" | ">" | ">="
add_expr = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr = unary { ( "*" | "/" | "%" ) unary }
unary    = ( "-" | "not" ) unary | primary
primary  = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
```

The grammar needs one token of lookahead. No statement starts with `(`, a unary operator or a binary operator, and no expression continues with a statement's first token (a name, `let`, `var`, `put`, `if` or `wh`). So statements and declarations follow one another with no separator. `ret` ends a block: it is the last item, so no statement can follow it.

Syntax rules. Each names the token that carries E0100 or E0003.

G1. Statements and declarations have no separator. The parser never sees a gap: rule 4 checks gaps first.

G2. `ret` ends its block. After `ret [expr]`, any token other than `}` is E0100 at that token. So `{ret put 1}` is E0100 at `put`, and `{ret x=1}` is E0100 at `=`.

G3. A keyword where the grammar needs an `IDENT` is E0003 at the keyword. An `IDENT` is needed for a declaration name, a parameter name, and the name after `let` or `var`. Any other keyword the grammar does not accept at a position is E0100 at it. At the start of a statement, a keyword other than `let`, `var`, `put`, `if`, `wh` or `ret` is E0100.

G4. `ptype` and `rtype` are the words `Int` and `Bool`. Any other token in those positions is E0100 at it. So `f(t Text)io{}` is E0100 at `Text`.

G5. `ex` is accepted only directly after a declaration's block, or after another `ex` of the same declaration. Any other `ex` is E0100 at it.

G6. Comparisons do not chain. After one `cmp_expr`, a second comparison operator is E0100 at it. So `1<2<3` is E0100 at the second `<`.

G7. `else` is followed by a block. `else if` is E0100 at `if`.

G8. `if`, `wh`, `ret`, `let`, `var`, `put`, `ex`, `io` and `fail` are not expressions. In an expression position each is E0100 at the keyword.

G9. A parameter list is not empty. `f()Int{}` is E0100 at `)`. A declaration with no parameters has no parentheses, so its name is followed by its result type, `io`, `fail` or `{`.

G10. The marks come in this order: result type, then `io`, then `fail`. `f io Int{}` is E0100 at `Int`, and `f fail io{}` is E0100 at `io`.

G11. A binding has no type annotation. `let a Int=1` is E0100 at `Int`.

G12. `fn` is an identifier, so `fn main io{}` is E0100 at `main`. A declaration name must be followed by `(`, a type, `io`, `fail` or `{`.

G13. At end of file, if the grammar needs more tokens, the error is E0100 at `EOF`.

### Diagnostics

| Code | Block | Meaning | Span | Fix | Rules |
| --- | --- | --- | --- | --- | --- |
| E0001 | lexical | Invalid byte or character: invalid UTF-8, byte order mark, control character other than LF outside a text literal, non-ASCII outside text, or printable ASCII outside the token set | The character | none | 1, 2, 4a, 6, 11 |
| E0002 | lexical | Non-canonical layout: a gap that is not the canonical gap (extra space, line end where none belongs, missing space between word tokens, leading or trailing whitespace) | The gap; zero-length where a space is missing | Replace the gap with the canonical gap | 3, 4b |
| E0003 | lexical | Keyword where an `IDENT` is required. Reported by the parser | The keyword | none | 7, G3 |
| E0005 | lexical | Malformed text literal | See rule 9 | none | 9 |
| E0006 | lexical | Integer literal with a leading zero | The literal | Replace the literal with its digits without leading zeros | 8 |
| E0100 | syntax | Unexpected token: the grammar does not accept this token at this position | The token; at end of file, the `EOF` token | none | 5, 10, G1 to G13 |
| E0500 | limits | Integer literal above 9223372036854775807. Reported by the checker | The literal | none | 8 |

Codes not in this table are not used by this RFC. E0002 and E0003 are not yet in `spec/errors.json`. The PR that first emits each adds it there, with a message and a meaning.

Expected results. Per RFC 0004's test format, the following replace the expectations named in the Amends line. `007` gives E0006 at bytes 0 to 3, with fix `{"span":{"start":0,"end":3},"replacement":"7"}`. This amends RFC 0004's `diag/fix-present` (E0001). For `let let=1` as a whole program, the first `let` is in the declaration-name position, so E0003 is at bytes 0 to 3. This matches RFC 0014's `lex/ident-keyword` and RFC 0004's `diag/record-shape`. It replaces the E0100 at bytes 4 to 7 in RFC 0050's `diag/record-shape` line, which this grammar does not produce.

## Alternatives

- **Keep `;` between statements (RFC 0048).** Rejected. It costs one token per statement boundary. The one ambiguity it solved, `ret` followed by a statement, is solved by G2.
- **Keep `fn` at the top level (RFC 0048).** Rejected. Every top-level item is a declaration, so `fn` adds a token and no information.
- **Parameter `n:Int` and result `):Int` (RFC 0048 and RFC 0103).** Rejected. Each costs one more token than `n Int` and `)Int`. Measured in Cost.
- **`main()` for a declaration with no parameters (RFC 0103).** Rejected. The two parentheses carry no information, and G9 makes an empty list an error.
- **Two-line programs (RFC 0103).** Rejected. Rule 4 gives one canonical layout, and a second line is a second spelling of the same program.
- **Keep `put(x)`.** Rejected. It costs two more tokens per call. Open question 2 covers the spelling that still parses.
- **Free layout (RFC 0048).** Rejected. Two programs with the same tokens would differ in layout, which gives two spellings (principle 1).
- **Report non-canonical layout as E0100.** Rejected. The token sequence is valid, so E0100 would point at a valid token. A layout code with a fix gives the model the exact edit (principle 4).
- **Keep the `\n` escape and reject raw LF.** Rejected. The escape costs one token more than a raw LF inside text, and a raw LF is content, not layout, inside a text literal.
- **Keep `//` comments, or allow notes in programs.** Rejected. Comments cost tokens, the compiler ignores them, and no program needs a note.
- **`fail` read as an identifier in declaration position.** Rejected. A word that is a name everywhere except after a declaration's parameters is one more rule to learn, and the keyword costs one token.
- **Leading zero as E0001 (RFC 0004 `diag/fix-present`).** Rejected. `007` is made of valid characters, so E0001 is the wrong code. E0006 is what RFC 0014 rule 8 gives and what RFC 0050 uses.

## Cost

Measured with `sbx python3 -m tools.check.tokens` on scratch files in `out/scratch/` (not repo files):

| Snippet | RFC 0103 form | This RFC |
| --- | --- | --- |
| fib with `fail`, and `main` (`fib-colon.txt`, `fib-v6.txt`) | 45 | 41 |
| kernel sample (`k-0103.txt`, `k-v6.txt`; RFC 0103's sample is two lines) | 51 | 47 |
| parameter `n` with type | `n:Int` 3 | `n Int` 2 |
| parameter list and result | `(n:Int):Int` 7 | `(n Int)Int` 5 |

The base program's counts (94, 90, 88) are the owner's and are carried over from RFC 0102. They were not re-measured.

Counter facts from `tools/check/tokens.py`: `wh`, `ret`, `ex`, `put` and `fail` cost 1; `while`, `return`, `example` and `print` cost 2; `false` costs 2 and `true` costs 1. Each punctuation character costs 1, so `==`, `!=`, `<=` and `>=` cost 2 each. The counter ignores whitespace, so layout does not change the counted cost.

Removed relative to RFC 0048: the `;` token, the `fn` keyword, the `:` token, the `//` comments, the `\n` escape, the `()` of zero-parameter declarations, and the annotation syntax on `let` and `var`. Added: the `put` and `fail` keywords, rule 4, the codes E0002 and E0003, and rules G2 to G13.

Spec card. The lexical section of the card, measured in `out/scratch/card-v6-add.txt`, is 224 tokens, well under the 2,000-token card cap. The core cap of 12,000 is checked by the merge bot; the total was not measured here.

## Test plan

Conformance tests live in `conformance/lex/`. Test ids are `lex/<name>`. A run test states stdout and exit status. A compile-error test holds one program with one error and states the expected record as JSON; the runner compares `code`, `span` and `fix` (RFC 0004 section 7). Byte offsets count from the first byte of the program. "bytes a to b" means start a, end b, exclusive. Every program is in canonical layout except where the test is about layout. Run programs must also pass the kernel's checks (`kernel-v46`), so a program that calls a function declared in the file carries `fail` on its caller.

Run tests (stdout and exit 0 unless stated):

| Test | Program | Output | Covers |
| --- | --- | --- | --- |
| `v6-min` | `main io{}` | none | declaration with no parentheses, empty block |
| `v6-put` | `main io{put 1 put 2}` | `1`, `2` | `put`, `INT`, statements with no separator |
| `v6-ret-last` | `f(n Int)Int fail{ret n+1}main io fail{put f(1)}` | `2` | parameter, result type, `ret expr` |
| `v6-ret-bare` | `g(n Int)io{if n==0{ret}put n}main io fail{g(0)g(1)}` | `1` | bare `ret`, `if` without `else`, `args` |
| `v6-if-else` | `main io{if false{put 1}else{put 2}}` | `2` | `else` |
| `v6-wh` | `main io fail{var i=0 wh i<2{i=i+1}put i}` | `2` | `var`, `wh`, assignment |
| `v6-params` | `two(a Int,b Int)io{put a put b}main io fail{two(1,2)}` | `1`, `2` | two parameters, call statement |
| `v6-rtype-ex` | `h Int{ret 1}ex h()==1 main io fail{put h()}` | `1` | declaration with a result and no parentheses, `ex`, call primary |
| `v6-unary` | `main io fail{put-((4))}` | `-4` | `unary`, nested parentheses |
| `v6-logic` | `main io{if not false and true or false{put 1}}` | `1` | `not`, `and`, `or`, `true`, `false` |
| `v6-cmp-all` | `main io{if 1<=1 and 2>=2 and 1!=2 and 1==1 and 2>1 and 1<2{put 1}}` | `1` | all six `cmp_op` |
| `v6-text` | `main io{put"x"}` | `x` | `TEXT` as the argument of `put` |
| `v6-text-lf` | `main io{put"a` LF `b"}` (LF is raw inside the text) | `a` LF `b` | raw LF is content (rule 9) |
| `v6-text-escape` | `main io{put"a\"b\\c"}` | `a"b\c` | `\"` and `\\` escapes |
| `v6-fail-mark` | `main io fail{put 1+1}` | `2` | `fail` after `io` |

Compile-error tests (one record each; fix `none` unless stated):

| Test | Program | Record at | Code |
| --- | --- | --- | --- |
| `v6-err-cr` | `main io{` CR `put 1}` | bytes 8 to 9 (the CR) | E0001 |
| `v6-err-semi` | `main io{put 1;put 2}` | bytes 13 to 14 (the `;`) | E0001 |
| `v6-err-colon` | `main io{let a:Int=1}` | bytes 13 to 14 (the `:`) | E0001 |
| `v6-err-comment` | `main io{put 1//2}` | bytes 14 to 15 (the second `/`) | E0100 |
| `v6-fmt-two-spaces` | `main io{put  1}` | bytes 11 to 13, fix replacement ` ` | E0002 |
| `v6-fmt-missing-space` | `main io{put 1put 2}` | bytes 13 to 13, fix replacement ` ` | E0002 |
| `v6-fmt-space-punct` | `main io{put (1)}` | bytes 11 to 12, fix replacement empty | E0002 |
| `v6-fmt-newline` | `main io{` LF `put 1}` | bytes 8 to 9, fix replacement empty | E0002 |
| `v6-fmt-trailing-lf` | `main io{}` LF | bytes 9 to 10, fix replacement empty | E0002 |
| `v6-fmt-leading-space` | ` main io{}` | bytes 0 to 1, fix replacement empty | E0002 |
| `v6-err-zero-fix` | `main io{put 007}` | bytes 12 to 15, fix `{12..15, "7"}` | E0006 |
| `v6-err-zero-00` | `main io{put 00}` | bytes 12 to 14, fix `{12..14, "0"}` | E0006 |
| `v6-err-int-big` | `main io{put 9223372036854775808}` | bytes 12 to 31 | E0500 |
| `v6-err-escape` | `main io{put"\n"}` | bytes 12 to 14 | E0005 |
| `v6-err-unterminated` | `main io{put"ab` (file ends) | bytes 11 to 14 | E0005 |
| `v6-err-keyword-let` | `let let=1` | bytes 0 to 3 (first `let`) | E0003 |
| `v6-err-keyword-let-block` | `main io{let let=1}` | bytes 12 to 15 (second `let`) | E0003 |
| `v6-err-keyword-io-name` | `io io{}` | bytes 0 to 2 | E0003 |
| `v6-err-keyword-fail-name` | `fail io{}` | bytes 0 to 4 | E0003 |
| `v6-err-keyword-param` | `f(ret Int)io{}` | bytes 2 to 5 | E0003 |
| `v6-err-ptype` | `f(t Text)io{}` | bytes 4 to 8 | E0100 |
| `v6-err-empty-params` | `f()Int{}` | bytes 2 to 3 | E0100 |
| `v6-err-result-order` | `f io Int{}` | bytes 5 to 8 | E0100 |
| `v6-err-fail-order` | `f fail io{}` | bytes 7 to 9 | E0100 |
| `v6-err-let-type` | `main io{let a Int=1}` | bytes 14 to 17 | E0100 |
| `v6-err-fn-old` | `fn main io{}` | bytes 3 to 7 | E0100 |
| `v6-err-ret-mid` | `main io{ret put 1}` | bytes 12 to 15 | E0100 |
| `v6-err-expr-stmt` | `main io{1+2}` | bytes 8 to 9 | E0100 |
| `v6-err-ex-block` | `main io{ex 1}` | bytes 8 to 10 | E0100 |
| `v6-err-cmp-chain` | `main io{put 1<2<3}` | bytes 15 to 16 | E0100 |
| `v6-err-else-if` | `main io{if true{}else if true{}}` | bytes 22 to 24 | E0100 |
| `v6-err-if-expr` | `main io{let x=if true{}}` | bytes 14 to 16 | E0100 |
| `v6-err-eof` | `main io{put 1` (file ends) | bytes 13 to 13 (EOF) | E0100 |

Format: `lex/v6-fmt-canon` (kind `fmt`): `fib(n Int)Int fail{if n<2{ret n}ret fib(n-1)+fib(n-2)}main io fail{put fib(10)}`; the formatter prints it unchanged.

Retained tests. These RFC 0014 lexical tests keep their names and expected results, since their rules are unchanged: `lex/ident-run`, `lex/int-run`, `lex/ident-keyword` (`let let=1`, E0003 at bytes 0 to 3, as above), `lex/ident-ascii`, `lex/ident-io`, `lex/bad-utf8`, `lex/bom`, `lex/cr-alone`, `lex/tab`, `lex/punct-bracket`, `lex/bang-alone`, `lex/int-too-big`, and the `lex/kw-<word>` tests for `let var if else true false and or not io`, with `lex/kw-fail` added for `fail`.

Every grammar production is reached by a `v6-` run test or compile-error test, except `ptype` and `rtype`, which are reached by `v6-err-ptype` and `v6-params`.

Retirement. Agents may not edit or delete an existing conformance test. The tests below fail under this RFC. The owner removes each file, or lists it as retired, in a `rules_changed` commit, and the implementing PR reports them red until then. In this checkout only `lex/v4-lf-only` and `kernel/print-one` exist.

- `lex/v4-lf-only` (present): its program is `fn main() io {`, a line feed, and `}`. A line feed is E0002 (rule 4). Replaced by `v6-fmt-newline`.
- `lex/punct-semicolon`: `;` is E0001 now.
- `lex/comment-line`: comments are removed.
- `lex/kw-fn`, `lex/kw-while`, `lex/kw-return`, `lex/kw-example`: `fn` is an identifier; `while`, `return` and `example` are identifiers; `wh`, `ret` and `ex` are the keywords. Replaced by the `v6-` tests above.
- `lex/text-escape`: if it tests the `\n` escape, that escape is removed. Replaced by `v6-text-escape`.
- `lex/text-unterminated`: the span now runs to the end of the file, since a line feed inside text is content.
- `lex/int-leading-zero`: rule 8 adds a fix. If its expected record has no fix, it fails and is replaced by `v6-err-zero-fix`.
- `lex/newline-in-group`, `lex/newline-blank`: line feeds outside text are E0002 (rule 4), not whitespace.
- `lex/ws-crlf`: CR is E0001 (rule 2).

`kernel/print-one` uses `print` and `fn`. It is not changed by this RFC. Its retirement is gated by `kernel-v46` (G-c).

## Open questions

1. **`false` is two tokens.** Under the counter `false` costs 2 and `true` costs 1. Principle 8 needs a measurement before a longer form is kept. The owner should decide whether to measure it or accept the cost.
2. **`put(e)` still parses.** It reads as `put` followed by the grouped expression `(e)`, so `put(e)` and `put e` are two spellings of one statement. Options: (a) accept the grouping (this draft); (b) reject a `put` argument that is one parenthesised group, with a new code; (c) leave it to the formatter, which then prints `put e` but gives no compile error. The owner should choose. `kernel-v46` does not depend on the choice.
3. **Retirement of the tests listed above.** The owner decides the mechanism. The RFC does not edit or delete them.
4. **References in kernel RFCs.** RFCs 0052, 0053, 0056, 0059, 0067, 0079 and 0081 cite RFC 0048 for tokens and syntax errors. Their references move to this RFC, and the owner should check them.
5. **E0003 block.** E0003 is in the lexical range (E0001 to E0099) but the parser reports it. Moving it to a syntax code would need a new code, chosen before any PR emits it.
6. **`fail` as a keyword.** This draft makes `fail` a keyword so the kernel's mark needs no position rule. If voters prefer a contextual word, `kernel-v46` must change with it.
7. **New codes.** E0002 and E0003, and the kernel codes E0200 to E0202, E0300 to E0303, E0400 and E0403, are not in `spec/errors.json`. The first PR that emits each adds it there.
