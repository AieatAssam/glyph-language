---
status: rejected
votes:
  designer-min: approve
  designer-safe: reject
  impl-1: approve
  tester: reject
  user-1: reject
  user-2: approve
---
# RFC draft: Lexical structure and core syntax

Class: language
Slug: lexical-syntax-v5
Status: draft
Replaces: RFC 0048 (lexical-syntax-v4, superseded by the owner).
Amends: RFC 0004 (expected results of `diag/fix-present` and `diag/record-shape`, Design section "Expected results"); RFC 0014 (its rules 3, 5, 7, 8, 13 to 15, as restated here); RFC 0050 (its `diag/record-shape` line, E0100 at bytes 4 to 7, is replaced).
Meaning of every form here is given by `kernel-v9`. Diagnostic records follow RFC 0004 sections 2 to 7. Codes are listed in `spec/errors.json` (RFC 0004 section 4).

## Summary

This RFC fixes how a Glyph source file becomes tokens and how tokens form a program. It replaces RFC 0048 and answers each of the owner's seven measured findings on it (base program fib + main, 94 tokens):

- Layout is fixed. There is one canonical layout: one line, no indentation, no trailing line end, and a space only where two word characters would otherwise merge. The compiler rejects any other layout with a fix (E0002). This settles RFC 0048 open question 2.
- `;` is removed. Statements follow one another. `ret` must end its block, which removes the one ambiguity.
- `put` is a keyword and takes its argument without parentheses: `put x`.
- The top level holds only declarations, so `fn` is removed. A parameter is written `n Int`, and a result follows the `)` as `)Int`.
- A declaration with no parameters has no parentheses: `main io{...}`.
- Comments are removed.
- A raw LF inside a text literal is content. The `\n` escape is removed.

It also settles RFC 0048 open questions 4 (E0003 position) and 7 (leading zero), which the attempt-5 objections required.

## Motivation

Models write Glyph and need one way to write each construct. RFC 0048 still left choices open: where line breaks counted, whether `;` was needed, and two parameter spellings. Each costs tokens and each is a place for a model to err. The owner measured the cost: dropping `;` takes fib + main from 94 to 90 tokens, and `put x` takes three calls from 94 to 88. The other findings save one or two tokens each.

Two RFC 0048 questions could not stay open. The objections on attempt 5 named both. The leading-zero code conflicted with RFC 0004's `diag/fix-present`, and the E0003 position conflicted with RFC 0014's `lex/ident-keyword` and RFC 0004's `diag/record-shape`. Both are decided in the Design section below.

## Design

Normative. "Must" and "is" bind implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value. A *word character* is an ASCII letter, an ASCII digit or `_`. A *word token* is a token whose last character is a word character. `Int`, `Bool` and `put` are identifiers; `put` is a keyword (rule 7).

### Lexical rules

1. **Source text.** A source file must be valid UTF-8. Invalid UTF-8 is E0001 at the first invalid byte. A byte order mark (U+FEFF) is E0001 wherever it appears.

2. **Control characters.** U+0000 to U+001F and U+007F are E0001 wherever they appear, except LF inside a text literal (rule 9). This covers the tab (U+0009) and the CR (U+000D). Each is E0001 at that character.

3. **Line end.** LF (U+000A) is not a token. Outside a text literal it may appear only in a gap, and rule 4 rejects it there. There is no CR LF rule.

4. **Layout.** A *gap* is the text between two adjacent tokens, outside text literals; the text before the first token and after the last token is also a gap. The *canonical gap* is:
   - one space (U+0020), if the last character of the token before the gap and the first character of the token after it are both word characters;
   - otherwise, nothing.

   The canonical gap before the first token and after the last token is nothing. Any other gap is E0002, with the gap as span and the canonical gap as the fix replacement. Where a space is missing between two word tokens, the span is zero-length at the point between them. A control character in a gap is E0001 (rule 2), not E0002. The canonical form of a program is one line, with no indentation, no trailing LF, and no other whitespace. Examples: `ret n` (one space); `if n<2{` (no space); `put (1)` is E0002 at the space after `put`.

5. **Comments.** There are none. `/` is always the division token. `//` is two `/` tokens, and the grammar decides (E0100).

6. **Identifiers.** An identifier is one ASCII letter or `_`, followed by zero or more ASCII letters, digits or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal is E0001 at that character. `fn` is an identifier.

7. **Keywords.** Exactly fourteen words are keywords, all lowercase:

   `let var if else wh ret true false and or not ex io put`

   Each keyword lexes as its own token kind, never as an identifier. No other word is reserved.

8. **Integer literals.** A decimal integer is `0`, or a digit from `1` to `9` followed by zero or more digits. It has no sign and no underscore. A literal with a leading zero (`007`, `00`) is E0006 at the literal. Its fix replaces the literal with its digits without leading zeros, keeping one digit: `007` becomes `7`, `00` becomes `0`. The value must be at most 9223372036854775807. A larger literal is E0500, reported by the checker. The check applies to the literal alone, before any unary `-`.

9. **Text literals.** A text literal starts with `"` and ends at the next `"`. Between the quotes are any valid UTF-8 characters except `"`, `\`, and the characters rule 2 forbids. A raw LF is content. The escapes are `\"` (quote) and `\\` (backslash). Any other `\` sequence is E0005 at the backslash and the character after it. If the file ends before the closing quote, the error is E0005 at the span from the opening quote to the end of the file. The value of the token is its UTF-8 bytes after escapes; a raw LF is byte 0x0A.

10. **Punctuation and operators.** The tokens are exactly these seventeen: `( ) { } , = == != < <= > >= + - * / %`. The lexer takes the longest listed token that starts at the current character, reading at most one character ahead. So `==`, `!=`, `<=` and `>=` are each one token. `=>` is `=` then `>`. `->` is `-` then `>`.

11. **Other characters.** Every printable ASCII character not covered by rules 5 to 10 is E0001 at that character. This includes `:`, `;`, `[`, `]`, `.`, `!` not followed by `=`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` ``, and `\` outside a text literal.

12. **Token kinds.** Each keyword and each punctuation token has its own kind. The other kinds are `IDENT`, `INT`, `TEXT` and `EOF`.

13. **Lexical errors stop compilation.** The lexer reports the first lexical error (E0001, E0002, E0005 or E0006) and emits no tokens after it. Lexical errors stop compilation after the first one (`spec/core/diagnostic.md`, Order).

### Grammar

Normative. `"x"` is a keyword or punctuation token. `IDENT`, `INT`, `TEXT` and `EOF` are token kinds. `[ a ]` is zero or one, `{ a }` is zero or more, `|` separates alternatives. `"Int"` and `"Bool"` mean an `IDENT` token with that text. A program is one `program`.

```
program  = { decl } EOF
decl     = IDENT [ "(" param { "," param } ")" ] [ rtype ] [ "io" ] block { "ex" expr }
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

The grammar needs one token of lookahead. No statement starts with `(`, a unary operator or a binary operator, and no expression continues with a statement's first token (a name, `let`, `var`, `put`, `if`, `wh` or `ret`). So statements and declarations follow one another with no separator, and each expression ends at the first token that cannot continue it.

Syntax rules. Each names the token that carries E0100 or E0003.

G1. Statements and declarations have no separator. The parser never sees a gap: rule 4 checks gaps first.

G2. `ret` ends its block. After `ret [expr]`, any token other than `}` is E0100 at that token. So `{ret put 1}` is E0100 at `put`, and `{ret x=1}` is E0100 at `=`.

G3. A keyword where the grammar needs an `IDENT` is E0003 at the keyword. An `IDENT` is needed for a declaration name, a parameter name, and the name after `let` or `var`. Any other keyword the grammar does not accept at a position is E0100 at it. At the start of a statement, a keyword other than `let`, `var`, `put`, `if`, `wh` or `ret` is E0100.

G4. `ptype` and `rtype` are the words `Int` and `Bool`. Any other token in those positions is E0100 at it. So `f(t Text)io{}` is E0100 at `Text`.

G5. `ex` is accepted only directly after a declaration's block, or after another `ex` of the same declaration. Any other `ex` is E0100 at it.

G6. Comparisons do not chain. After one `cmp_expr`, a second comparison operator is E0100 at it. So `1<2<3` is E0100 at the second `<`.

G7. `else` is followed by a block. `else if` is E0100 at `if`.

G8. `if`, `wh`, `ret`, `let`, `var`, `put`, `ex` and `io` are not expressions. In an expression position each is E0100 at the keyword.

G9. A parameter list is not empty. `f()Int{}` is E0100 at `)`. A declaration with no parameters has no parentheses, so its name is followed by its result type, `io` or `{`.

G10. The result type comes before `io`. `f io Int{}` is E0100 at `Int`.

G11. A binding has no type annotation. `let a Int=1` is E0100 at `Int`.

G12. `fn` is an identifier, so `fn main()io{}` is E0100 at `main`. A declaration name must be followed by `(`, a type, `io` or `{`.

G13. At end of file, if the grammar needs more tokens, the error is E0100 at `EOF`.

### Diagnostics

| Code | Block | Meaning | Span | Fix | Rules |
| --- | --- | --- | --- | --- | --- |
| E0001 | lexical | Invalid byte or character: invalid UTF-8, byte order mark, control character (tab, CR, or any control character outside a text literal), non-ASCII outside text and comments, or printable ASCII outside the token set (including `:` and `;`) | The character | none | 1, 2, 6, 11 |
| E0002 | lexical | Non-canonical layout: a gap that is not the canonical gap (extra space, space or line end where none belongs, missing space between word tokens, leading or trailing whitespace) | The gap; zero-length where a space is missing | Replace the gap with the canonical gap | 3, 4 |
| E0003 | lexical | Keyword where an `IDENT` is required. Reported by the parser | The keyword | none | 7, G3 |
| E0005 | lexical | Malformed text literal | See rule 9 | none | 9 |
| E0006 | lexical | Integer literal with a leading zero | The literal | Replace the literal with its digits without leading zeros | 8 |
| E0100 | syntax | Unexpected token: the grammar does not accept this token at this position | The token; at end of file, the `EOF` token | none | 10, G1 to G13 |
| E0500 | limits | Integer literal above 9223372036854775807. Reported by the checker | The literal | none | 8 |

Codes not in this table are not used by this RFC. E0002 and E0003 are not yet in `spec/errors.json`. The PR that first emits each adds it there, with a message and a meaning.

Expected results. Per RFC 0004's test format, the following replace the expectations named in the Amends line. `007` gives E0006 at bytes 0 to 3, with fix `{"span":{"start":0,"end":3},"replacement":"7"}`. This amends RFC 0004's `diag/fix-present` (E0001). For `let let=1` as a whole program, the first `let` is in the declaration-name position, so E0003 is at bytes 0 to 3. This matches RFC 0014's `lex/ident-keyword` and RFC 0004's `diag/record-shape` (E0003 over `let`). It replaces the E0100 at bytes 4 to 7 in RFC 0050's `diag/record-shape` line, which this grammar does not produce.

## Alternatives

- **Keep `;` between statements (RFC 0048).** Rejected. It costs one token per statement boundary (finding 2). The one ambiguity it solved, `ret` followed by a statement, is solved by rule G2.
- **Keep `fn` at the top level (RFC 0048).** Rejected. Every top-level item is a declaration, so `fn` adds a token and no information.
- **Parameter `n: Int` and result `): Int` (RFC 0048).** Rejected. Each costs one more token than `n Int` and `)Int`. Measured below: `(n: Int): Int` is 7 tokens, `(n Int)Int` is 5.
- **Keep `put(x)`.** Rejected. It costs two more tokens per call (finding 3). Open question 2 covers the spelling that still parses.
- **Free layout (RFC 0048).** Rejected. Two programs with the same tokens would differ in layout, which gives two spellings (principle 1). Accepting any layout would also leave the formatter with nothing to enforce.
- **Report non-canonical layout as E0100.** Rejected. The token sequence is valid, so E0100 would point at a valid token. A layout code with a fix gives the model the exact edit (principle 4).
- **Keep the `\n` escape and reject raw LF.** Rejected. The escape costs one token more than a raw LF inside text (finding 7), and a raw LF is content, not layout, inside a text literal.
- **Keep `:` in the token set.** Rejected. Nothing in the grammar uses `:` once `n Int` is the parameter form. An unused token is a second way to fail.
- **Keep `//` comments.** Rejected. Comments cost tokens, the compiler ignores them, and models do not need them (finding 6).
- **Place E0003 at the second `let` for every program (RFC 0048, open question 4).** Rejected. Rule G3 is positional: E0003 is at the first keyword that stands where an `IDENT` is required. For the bare program `let let=1` that is the first `let`. Inside a block, `main io{let let=1}`, the second `let` is the keyword in that position.
- **Leading zero as E0001 (RFC 0004 `diag/fix-present`).** Rejected. `007` is made of valid characters, so E0001 (invalid character) is the wrong code. E0006 is what RFC 0014 rule 8 gives and what RFC 0050 uses.

## Cost

Measured with `sbx python3 -m tools.check.tokens` on scratch snippets in `out/scratch/` (not repo files):

| Snippet | RFC 0048 form | This RFC |
| --- | --- | --- |
| fib and main (scratch files `v4-fib.txt` and `v5-fib.txt`, same algorithm) | 48 | 39 |
| parameter `n` with type | `n: Int` 3 | `n Int` 2 |
| parameter list and result | `(n: Int): Int` 7 | `(n Int)Int` 5 |

The owner's base program (fib + main, 94 tokens) is a different text from my snippet, so its counts are the owner's: 90 after dropping `;`, 88 for three `put` calls, and the parameter, result and parenthesis changes on top. My fib snippet is shown only for the relative saving, 9 of 48 tokens.

Counter facts that bear on the design, from `tools/check/tokens.py`: `wh`, `ret`, `ex` and `put` cost 1; `while`, `return`, `example` and `print` cost 2. Each punctuation character costs 1, so `==`, `!=`, `<=` and `>=` cost 2 each under the counter. No one-character form has the same meaning, so they stay. The counter ignores whitespace, so layout does not change the counted cost; its effect is fewer model errors, not fewer counted tokens.

Removed: the `;` token, the `fn` keyword, the `:` token, the `//` comments, the `\n` escape, the `()` of zero-parameter declarations, and the annotation syntax on `let` and `var`. Added: the `put` keyword, the layout rule (rule 4), the codes E0002 and E0003, and rules G2 to G13 in place of the RFC 0048 rules.

Spec card: `spec/card.md` is 244 tokens today and has no lexical section. The lexical section this RFC needs, drafted in `out/scratch/card-v5-add.md`, counts 285 tokens. Added to the current card it comes to about 530 tokens, under the 2,000 cap. The core spec cap is checked by the merge bot; this RFC's diagnostic table adds two rows and removes the rules of RFC 0048 that are replaced, and the total was not measured here.

## Test plan

Conformance tests live in `conformance/lex/`. Test ids are `lex/<name>`. A run test states stdout and exit status. A compile-error test holds one program with one error and states the expected record as JSON; the runner compares `code`, `span` and `fix` (RFC 0004 section 7). Byte offsets count from the first byte of the program. "bytes a to b" means start a, end b, exclusive. Every compile-error program is written in canonical layout except where the test is about layout. A program with no `main` is used only where the test is about a top-level token or a declaration.

Run tests (stdout and exit 0 unless stated):

| Test | Program | Output | Covers |
| --- | --- | --- | --- |
| `v5-min` | `main io{}` | none | declaration with no parentheses, empty block |
| `v5-put` | `main io{put 1 put 2}` | `1`, `2` | `put`, `INT`, statements with no separator |
| `v5-ret-last` | `f(n Int)Int{ret n+1}main io{put f(1)}` | `2` | parameter, result type, `ret expr` |
| `v5-ret-bare` | `g(n Int)io{if n==0{ret}put n}main io{g(0)g(1)}` | `1` | bare `ret`, `if` without `else`, `args` |
| `v5-if-else` | `main io{if false{put 1}else{put 2}}` | `2` | `else` |
| `v5-wh` | `main io{var i=0 wh i<2{i=i+1}put i}` | `2` | `var`, `wh`, assignment |
| `v5-params` | `two(a Int,b Int)io{put a put b}main io{two(1,2)}` | `1`, `2` | two parameters, call statement |
| `v5-rtype-ex` | `h Int{ret 1}ex h()==1 main io{put h()}` | `1` | declaration with a result and no parentheses, `ex`, call primary |
| `v5-unary` | `main io{put-((4))}` | `-4` | `unary`, nested parentheses |
| `v5-logic` | `main io{if not false and true or false{put 1}}` | `1` | `not`, `and`, `or`, `true`, `false` |
| `v5-cmp-all` | `main io{if 1<=1 and 2>=2 and 1!=2 and 1==1 and 2>1 and 1<2{put 1}}` | `1` | all six `cmp_op` |
| `v5-text` | `main io{let t="x"put t}` | `x` | `TEXT`, `let` |
| `v5-text-lf` | `main io{let t="a`LF`b"put t}` (LF is a raw line end inside the text) | `a`LF`b` | raw LF is content (rule 9) |
| `v5-text-escape` | `main io{put"a\"b\\c"}` | `a"b\c` | `\"` and `\\` escapes |

Compile-error tests (one record each; fix `none` unless stated):

| Test | Program | Record at | Code |
| --- | --- | --- | --- |
| `v5-err-cr` | `main io{` CR `put 1}` | bytes 8 to 9 (the CR) | E0001 |
| `v5-err-semi` | `main io{put 1;put 2}` | bytes 13 to 14 (the `;`) | E0001 |
| `v5-err-colon` | `main io{let a:Int=1}` | bytes 13 to 14 (the `:`) | E0001 |
| `v5-err-comment` | `main io{put 1//2}` | bytes 14 to 15 (the second `/`) | E0100 |
| `v5-fmt-two-spaces` | `main io{put  1}` | bytes 11 to 13, fix replacement ` ` | E0002 |
| `v5-fmt-missing-space` | `main io{put 1put 2}` | bytes 13 to 13, fix replacement ` ` | E0002 |
| `v5-fmt-space-punct` | `main io{put (1)}` | bytes 11 to 12, fix replacement empty | E0002 |
| `v5-fmt-newline` | `main io{` LF `put 1}` | bytes 8 to 9, fix replacement empty | E0002 |
| `v5-fmt-trailing-lf` | `main io{}` LF | bytes 9 to 10, fix replacement empty | E0002 |
| `v5-fmt-leading-space` | ` main io{}` | bytes 0 to 1, fix replacement empty | E0002 |
| `v5-err-zero-fix` | `main io{put 007}` | bytes 12 to 15, fix `{12..15, "7"}` | E0006 |
| `v5-err-zero-00` | `main io{put 00}` | bytes 12 to 14, fix `{12..14, "0"}` | E0006 |
| `v5-err-int-big` | `main io{put 9223372036854775808}` | bytes 12 to 31 | E0500 |
| `v5-err-escape` | `main io{put"\n"}` | bytes 12 to 14 | E0005 |
| `v5-err-unterminated` | `main io{put"ab` (file ends) | bytes 11 to 14 | E0005 |
| `v5-err-keyword-let` | `let let=1` | bytes 0 to 3 (first `let`) | E0003 |
| `v5-err-keyword-let-block` | `main io{let let=1}` | bytes 12 to 15 (second `let`) | E0003 |
| `v5-err-keyword-io-name` | `io io{}` | bytes 0 to 2 | E0003 |
| `v5-err-keyword-param` | `f(ret Int)io{}` | bytes 2 to 5 | E0003 |
| `v5-err-ptype` | `f(t Text)io{}` | bytes 4 to 8 | E0100 |
| `v5-err-empty-params` | `f()Int{}` | bytes 2 to 3 | E0100 |
| `v5-err-result-order` | `f io Int{}` | bytes 5 to 8 | E0100 |
| `v5-err-let-type` | `main io{let a Int=1}` | bytes 14 to 17 | E0100 |
| `v5-err-fn-old` | `fn main()io{}` | bytes 3 to 7 | E0100 |
| `v5-err-ret-mid` | `main io{ret put 1}` | bytes 12 to 15 | E0100 |
| `v5-err-expr-stmt` | `main io{1+2}` | bytes 8 to 9 | E0100 |
| `v5-err-ex-block` | `main io{ex 1}` | bytes 8 to 10 | E0100 |
| `v5-err-cmp-chain` | `main io{put 1<2<3}` | bytes 15 to 16 | E0100 |
| `v5-err-else-if` | `main io{if true{}else if true{}}` | bytes 22 to 24 | E0100 |
| `v5-err-if-expr` | `main io{let x=if true{}}` | bytes 14 to 16 | E0100 |
| `v5-err-eof` | `main io{put 1` (file ends) | bytes 13 to 13 (EOF) | E0100 |

Format and layout: `lex/v5-fmt-canon` (kind `fmt`): `fib(n Int)Int{if n<2{ret n}ret fib(n-1)+fib(n-2)}main io{put fib(10)}`; the formatter prints it unchanged.

Retained tests. These RFC 0014 lexical tests keep their names and expected results, since their rules are unchanged: `lex/ident-run`, `lex/int-run`, `lex/ident-keyword` (`let let=1`, E0003 at bytes 0 to 3, as above), `lex/ident-ascii`, `lex/ident-io`, `lex/bad-utf8`, `lex/bom`, `lex/cr-alone`, `lex/tab`, `lex/punct-bracket`, `lex/bang-alone`, `lex/int-too-big`, and the `lex/kw-<word>` tests for `let var if else true false and or not io`.

Every grammar production is reached by a `v5-` run test or compile-error test: `program`, `decl` (with and without parameters, with and without `rtype`, with and without `io`, with `ex`), `param`, `ptype`, `rtype`, `block` (with and without trailing `ret`), all seven statement forms plus `put` and bare `ret`, `args`, each `expr` level, and every `primary` form.

Retirement. Agents may not edit or delete an existing conformance test. The tests below fail under this RFC. The owner removes each file, or lists it as retired, in a `rules_changed` commit, and the implementing PR reports them red until then. The names come from RFC 0014 and RFC 0048. In this checkout only `lex/v4-lf-only` and `kernel/print-one` exist.

- `lex/v4-lf-only` (present): its program is `fn main() io {` with a line end. Replaced by `lex/v5-min`.
- `lex/punct-semicolon`: `;` is E0001 now.
- `lex/comment-line`: comments are removed.
- `lex/kw-fn`, `lex/kw-while`, `lex/kw-return`, `lex/kw-example`: `fn` is an identifier; `while`, `return` and `example` are identifiers, and `wh`, `ret`, `ex` are the keywords. Replaced by the `v5-` tests above.
- `lex/text-escape`: if it tests the `\n` escape, that escape is removed. Replaced by `v5-text-escape`.
- `lex/text-unterminated`: the span now runs to the end of the file, since a line end inside text is content.
- `lex/int-leading-zero`: rule 8 adds a fix. If its expected record has no fix, it fails and is replaced by `v5-err-zero-fix`.
- `lex/newline-in-group`, `lex/newline-blank`: line ends outside text are E0002 (rule 4), not whitespace.
- `lex/ws-crlf`: CR is E0001 (rule 2); under RFC 0048 it already fails if it expects CR LF to be accepted.

`kernel/print-one` uses `print`, which RFC 0048 already made E0301. It is not changed by this RFC, and its retirement stays with the owner as in RFC 0052.

## Open questions

1. **`false` is two tokens.** Under the counter `false` costs 2 and `true` costs 1. RFC 0048 open question 1 stands. Principle 8 needs a measurement before a longer form is kept. The owner should decide whether to measure it or accept the cost.
2. **`put(e)` still parses.** It reads as `put` followed by the grouped expression `(e)`, so `put(e)` and `put e` are two spellings of one statement. Principle 1 asks for one. Options: (a) accept the grouping (this draft); (b) add a rule that rejects a `put` argument consisting of one parenthesised group, with a new code; (c) leave it to the formatter, which then prints `put e` but gives no compile error. The owner should choose.
3. **Retirement of the tests listed above.** The owner decides the mechanism. The RFC does not edit or delete them.
4. **References in kernel RFCs.** RFCs 0052, 0053, 0056, 0059, 0067, 0079 and 0081 cite RFC 0048 for tokens and syntax errors. Their references move to this RFC, and the owner should check them against this text.
5. **E0003 block.** E0003 is in the lexical range (E0001 to E0099) but the parser reports it. Moving it to a syntax code would need a new code, chosen before any PR emits it.
6. **New codes.** E0002 and E0003, and the kernel codes E0200 to E0202, E0300 to E0303 and E0400, are not in `spec/errors.json`. The first PR that emits each adds it there.
