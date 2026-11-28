# RFC 0104: Lexical structure and core syntax

Class: language
Slug: lexical-syntax-v6
Replaces: RFC 0048.
Amends: RFC 0004 (expected results of `diag/fix-present` and `diag/record-shape`); RFC 0014 (its rules 3, 5, 7, 8, 13 to 15, as restated here); RFC 0050 (its `diag/record-shape` line).
Forms are given by RFC 0105 (`kernel-v46`). Diagnostic records follow `spec/core/diagnostic.md`. Codes are listed in `spec/errors.json`.

## Summary

This RFC fixes how a source file becomes tokens and how tokens form a program.

- **Keywords.** Fifteen words, including `fail`. `put` and `fail` are keywords.
- **One syntax.** No separator between statements; `ret` ends its block. `put x` takes its argument without parentheses. A parameter is `n Int`. A result follows the `)` as `)Int`. A declaration with no parameters has no parentheses: `main io{...}`.
- **Top level.** Only declarations. No comments.
- **Text.** A raw LF inside a text literal is content. The `\n` escape is removed.
- **Layout.** One canonical layout. A line feed outside a text literal is E0002. A file ends with exactly one LF.

## Motivation

Models write Glyph and need one way to write each construct. RFC 0048 left open where line breaks count, whether `;` is needed, and which parameter spelling to use. Each choice costs tokens, and each is a place for a model to err. The counter ignores whitespace, so layout choices cost nothing in counted tokens, but they multiply spellings. This RFC allows one.

## Design

Normative. "Must" and "is" bind implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value. A *word character* is an ASCII letter, an ASCII digit or `_`. A *word token* is a token whose last character is a word character.

### Lexical rules

1. **Source text.** A source file must be valid UTF-8. Invalid UTF-8 is E0001 at the first invalid byte. A byte order mark (U+FEFF) is E0001 wherever it appears.

2. **Control characters.** U+0000 to U+001F and U+007F are E0001 wherever they appear, except LF (U+000A), which rules 3, 4 and 9 govern. This includes TAB (U+0009) and CR (U+000D).

3. **Line end.** LF is not a token. Outside a text literal it is part of a gap, and rule 4 decides it. Inside a text literal it is content (rule 9). CR is E0001 (rule 2).

4. **Layout.** A *gap* is the text between two adjacent tokens, outside text literals, and also the text before the first token and the text after the last token. The *canonical gap* is:
   - between two tokens: one space (U+0020) if the last character of the earlier token and the first character of the later token are both word characters, and nothing otherwise;
   - before the first token: nothing;
   - after the last token: one LF (U+000A). A file with no token is one LF.

   Each gap is checked in this order:
   - (a) a control character in it (rule 2) is E0001 at the first such character;
   - (b) otherwise, a gap that is not the canonical gap is E0002, with the gap as span and the canonical gap as the fix replacement. Where a canonical space or LF is missing, the span is zero-length at the point where it belongs.

   So a canonical file is one line of tokens with no indentation, followed by one LF. Examples: `ret n` (one space); `if n<2{` (none); `put (1)` is E0002 at the space after `put`; `main io{`, LF, `put 1}` is E0002 at the LF; `main io{}` with no LF after it is E0002, zero-length, after the `}`.

5. **Comments.** There are none. `/` is always the division token. `//` is two `/` tokens, and the grammar rejects the second (E0100).

6. **Identifiers.** An identifier is one ASCII letter or `_`, followed by zero or more ASCII letters, digits or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal is E0001 at that character. `Int`, `Bool` and `fn` are identifiers.

7. **Keywords.** Exactly fifteen words are keywords, all lowercase:

   `let var if else wh ret true false and or not ex io put fail`

   Each keyword is its own token kind, never an identifier. No other word is reserved.

8. **Integer literals.** A decimal integer is `0`, or a digit from `1` to `9` followed by zero or more digits. It has no sign and no underscore. A literal with a leading zero (`007`, `00`) is E0006 at the literal. Its fix replaces the literal with its digits without leading zeros, keeping one digit: `007` becomes `7`, `00` becomes `0`. A literal above 9223372036854775807 is E0500, reported by the checker. The check applies to the literal alone, before any unary `-`.

9. **Text literals.** A text literal starts with `"` and ends at the next `"`. Between the quotes are any valid UTF-8 characters except `"`, `\`, and the characters rule 2 forbids; a raw LF is allowed. The escapes are `\"` (quote) and `\\` (backslash). Any other `\` sequence is E0005 at the backslash and the character after it. If the file ends before the closing quote, the error is E0005 at the span from the opening quote to the end of the file, and that span includes any LF. The value of the token is its UTF-8 bytes after escapes; a raw LF is byte 0x0A.

10. **Punctuation and operators.** The tokens are exactly these seventeen: `( ) { } , = == != < <= > >= + - * / %`. The lexer takes the longest listed token that starts at the current character, reading at most one character ahead. So `==`, `!=`, `<=` and `>=` are each one token. `=>` is `=` then `>`. `->` is `-` then `>`.

11. **Other characters.** Every printable ASCII character not covered by rules 5 to 10 is E0001 at that character. This includes `:`, `;`, `[`, `]`, `.`, `!` not followed by `=`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` ``, and `\` outside a text literal.

12. **Token kinds.** Each keyword and each punctuation token has its own kind. The other kinds are `IDENT`, `INT`, `TEXT` and `EOF`. The `EOF` token is at the end of the file, after its final LF.

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

G13. At end of file, if the grammar needs more tokens, the error is E0100 at the `EOF` token.

G14. The parser reports one syntax error per file: after the first E0003 or E0100, it reports nothing more, and the checker does not run. So each compile-error test below has exactly one expected record.

### Diagnostics

| Code | Block | Meaning | Span | Fix | Rules |
| --- | --- | --- | --- | --- | --- |
| E0001 | lexical | Invalid byte or character: invalid UTF-8, byte order mark, control character outside text other than LF, non-ASCII outside text, or printable ASCII outside the token set | The character | none | 1, 2, 4a, 6, 11 |
| E0002 | lexical | Non-canonical layout: a gap that is not the canonical gap (extra space, line end where none belongs, missing space between word tokens, leading or trailing whitespace, missing or extra final LF) | The gap; zero-length where a space or the final LF is missing | Replace the gap with the canonical gap | 3, 4b |
| E0003 | lexical | Keyword where an `IDENT` is required. Reported by the parser | The keyword | none | 7, G3, G14 |
| E0005 | lexical | Malformed text literal | See rule 9 | none | 9 |
| E0006 | lexical | Integer literal with a leading zero | The literal | Replace the literal with its digits without leading zeros | 8 |
| E0100 | syntax | Unexpected token: the grammar does not accept this token at this position | The token; at end of file, the `EOF` token | none | 5, 10, G1 to G14 |
| E0500 | limits | Integer literal above 9223372036854775807. Reported by the checker | The literal | none | 8 |

Codes not in this table are not used by this RFC. E0002 and E0003 are not yet in `spec/errors.json`; the first PR that emits each adds it.

Expected results. These replace the expectations named in the Amends line. `007` gives E0006 at bytes 0 to 3, with fix replacement `7` (RFC 0004 `diag/fix-present`). `let let=1` gives E0003 at bytes 0 to 3 with no fix (RFC 0004 `diag/record-shape`; RFC 0050 `diag/record-shape` is replaced by this).

## Alternatives

- **Keep `;` between statements (RFC 0048).** Rejected. It costs one token per statement boundary. G2 solves the one ambiguity it covered, `ret` followed by a statement.
- **Keep `fn` at the top level (RFC 0048).** Rejected. Every top-level item is a declaration, so `fn` adds a token and no information.
- **Parameter `n:Int` and result `):Int` (RFC 0103).** Rejected. Each costs one more token than `n Int` and `)Int`. Measured in Cost.
- **`main()` for a declaration with no parameters (RFC 0103).** Rejected. The parentheses carry no information, and G9 makes an empty list an error.
- **Two-line programs (RFC 0103).** Rejected. Rule 4 gives one canonical layout, and a second line is a second spelling.
- **Keep `put(x)`.** Rejected. It costs two more tokens per call. Open question 2 covers the spelling that still parses.
- **Free layout (RFC 0048).** Rejected. Two programs with the same tokens would differ in layout (principle 1).
- **Non-canonical layout as E0100.** Rejected. The token sequence is valid, so E0100 would point at a valid token. A layout code with a fix gives the exact edit (principle 4).
- **Keep the `\n` escape and reject raw LF.** Rejected. A raw LF inside text is content, and the escape costs one more token.
- **Keep `//` comments.** Rejected. Comments cost tokens, the compiler ignores them, and no program needs a note.
- **`fail` as an identifier in declaration position.** Rejected. It is one more rule to learn, and the keyword costs one token.
- **Leading zero as E0001.** Rejected. `007` is made of valid characters, so E0006 is the right code (RFC 0014 rule 8).

## Cost

Measured with `sbx python3 -m tools.check.tokens`. These figures are carried from the prior draft, where the scratch files were measured; they are not repo files.

| Snippet | RFC 0103 form | This RFC |
| --- | --- | --- |
| fib with `fail`, and `main` | 45 | 41 |
| kernel sample (RFC 0103's sample is two lines) | 51 | 47 |
| parameter `n` with type | `n:Int` 3 | `n Int` 2 |
| parameter list and result | `(n:Int):Int` 7 | `(n Int)Int` 5 |

Final LF. Measured in this revision: `main io{}` counts 3 tokens with or without a trailing LF. The final LF therefore adds nothing to the counted cost.

Removed relative to RFC 0048: the `;` token, the `fn` keyword, the `:` token, the `//` comments, the `\n` escape, the `()` of zero-parameter declarations, and the annotation syntax on `let` and `var`. Added: the `put` and `fail` keywords, rule 4, the codes E0002 and E0003, and rules G2 to G14.

Spec card. The lexical section of the card is about 224 tokens, under the 2,000-token card cap. The core cap (12,000) is checked by the merge bot.

## Test plan

Conformance tests are in `conformance/lex/`, with ids `lex/v6-<name>` and `rfc: 0104` in the meta block. Each file's `--- source` section is the program. The runner writes the source followed by one LF, which is canonical (rule 4). Offsets count from the first byte of the written file, and "bytes a to b" means start a, end b, exclusive. A program that ends with `}` therefore has its LF at the byte after the `}`.

Conventions:
- A control character in a source uses `source-escapes: hex` in the meta block and `\x0D` for CR. In hex mode `\\` is one backslash, so only hex-mode tests may contain no other backslash.
- Run tests: `expect-stdout` holds the output lines (each `put` is one line, and the runner strips one trailing LF), and `expect-exit` is `0`. Each run program passes RFC 0105's checks, including the `fail` marks of F7.
- Compile-error tests: `expect-errors` holds one JSON object per record: `{"code":C,"span":{"start":a,"end":b}}`. A row with a fix also gives `"fix":{"span":{"start":a,"end":b},"replacement":R}`. A row marked "none" gives no fix key. The runner does not compare a fix that is not given.

Run tests:

| Test | Program | Output | Covers |
| --- | --- | --- | --- |
| `v6-min` | `main io{}` | none | declaration with no parentheses, empty block |
| `v6-put` | `main io{put 1 put 2}` | `1`, `2` | `put`, `INT`, no separator |
| `v6-ret-last` | `f(n Int)Int fail{ret n+1}main io fail{put f(1)}` | `2` | parameter, result type, `ret expr` |
| `v6-ret-bare` | `g(n Int)io{if n==0{ret}put n}main io fail{g(0)g(1)}` | `1` | bare `ret`, `if` without `else`, `args` |
| `v6-if-else` | `main io{if false{put 1}else{put 2}}` | `2` | `else` |
| `v6-wh` | `main io fail{var i=0 wh i<2{i=i+1}put i}` | `2` | `var`, `wh`, assignment |
| `v6-params` | `two(a Int,b Int)io{put a put b}main io fail{two(1,2)}` | `1`, `2` | two parameters, call statement |
| `v6-rtype-ex` | `h Int{ret 1}ex h()==1 main io fail{put h()}` | `1` | result, `ex`, call primary |
| `v6-unary` | `main io fail{put-((4))}` | `-4` | unary, nested parentheses |
| `v6-logic` | `main io{if not false and true or false{put 1}}` | `1` | `not`, `and`, `or`, `true`, `false` |
| `v6-cmp-all` | `main io{if 1<=1 and 2>=2 and 1!=2 and 1==1 and 2>1 and 1<2{put 1}}` | `1` | all six `cmp_op` |
| `v6-text` | `main io{put"x"}` | `x` | `TEXT` as the argument of `put` |
| `v6-text-lf` | `main io{put"a`, LF, `b"}` (LF raw inside text) | `a`, `b` | raw LF is content (rule 9) |
| `v6-text-escape` | `main io{put"a\"b\\c"}` | `a"b\c` | `\"` and `\\` escapes |
| `v6-fail-mark` | `main io fail{put 1+1}` | `2` | `fail` after `io` |

Compile-error tests (one record each unless stated; "bytes" are offsets in the written file):

| Test | Source | Record | Code |
| --- | --- | --- | --- |
| `v6-err-cr` (hex mode) | `main io{` CR `put 1}` | bytes 8 to 9 | E0001 |
| `v6-err-semi` | `main io{put 1;put 2}` | bytes 13 to 14 | E0001 |
| `v6-err-colon` | `main io{let a:Int=1}` | bytes 13 to 14 | E0001 |
| `v6-err-comment` | `main io{put 1//2}` | bytes 14 to 15 | E0100 |
| `v6-fmt-two-spaces` | `main io{put  1}` | bytes 11 to 13, fix ` ` | E0002 |
| `v6-fmt-missing-space` | `main io{put 1put 2}` | bytes 13 to 13, fix ` ` | E0002 |
| `v6-fmt-space-punct` | `main io{put (1)}` | bytes 11 to 12, fix empty | E0002 |
| `v6-fmt-newline` | `main io{` LF `put 1}` | bytes 8 to 9, fix empty | E0002 |
| `v6-fmt-trailing-lf` | `main io{}` then an empty line (file ends `}` LF LF) | bytes 9 to 11, fix LF | E0002 |
| `v6-fmt-leading-space` | ` main io{}` | bytes 0 to 1, fix empty | E0002 |
| `v6-err-zero-fix` | `main io{put 007}` | bytes 12 to 15, fix `7` | E0006 |
| `v6-err-zero-00` | `main io{put 00}` | bytes 12 to 14, fix `0` | E0006 |
| `v6-err-int-big` | `main io{put 9223372036854775808}` | bytes 12 to 31 | E0500 |
| `v6-err-escape` | `main io{put"\n"}` | bytes 12 to 14 | E0005 |
| `v6-err-unterminated` | `main io{put"ab` (end of file) | bytes 11 to 15 | E0005 |
| `v6-err-keyword-let` | `let let=1` | bytes 0 to 3 | E0003 |
| `v6-err-keyword-let-block` | `main io{let let=1}` | bytes 12 to 15 | E0003 |
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
| `v6-err-eof` | `main io{put 1` (end of file) | bytes 14 to 14 (EOF) | E0100 |

Format: `lex/v6-fmt-canon` (kind `fmt`): `fib(n Int)Int fail{if n<2{ret n}ret fib(n-1)+fib(n-2)}main io fail{put fib(10)}`. The formatter prints it unchanged.

Retirement. Agents may not edit or delete an existing conformance test. These fail under this RFC, and the owner retires them: `lex/v4-lf-only` (its line feed is E0002; replaced by `v6-fmt-newline`), `lex/punct-semicolon`, `lex/comment-line`, `lex/kw-fn`, `lex/kw-while`, `lex/kw-return`, `lex/kw-example`, `lex/text-escape` (if it tests `\n`), `lex/text-unterminated`, `lex/int-leading-zero` (no fix in its record), `lex/newline-in-group`, `lex/newline-blank`, `lex/ws-crlf`. `kernel/print-one` uses `print` and `fn`; its retirement is gated by RFC 0105 (G-c).

Retained tests. RFC 0014's `lex/ident-*`, `lex/int-run`, `lex/bad-utf8`, `lex/bom`, `lex/cr-alone`, `lex/tab`, `lex/punct-bracket`, `lex/bang-alone`, `lex/int-too-big` and `lex/kw-*` keep their names. `lex/kw-fail` is added.

## Open questions

1. **`false` costs two tokens and `true` one.** Principle 8 needs a measurement before a longer form is kept.
2. **`put(e)` still parses,** as `put` followed by the group `(e)`. Options: accept it (this draft); reject a single parenthesised `put` argument with a new code; or leave it to the formatter. The owner chooses. RFC 0105 does not depend on the choice.
3. **E0003 block.** E0003 is in the lexical range (E0001 to E0099) but the parser reports it. Moving it to a syntax code needs a new code, chosen before any PR emits it.
4. **`fail` as a keyword.** If voters prefer a contextual word, RFC 0105 changes with it.
