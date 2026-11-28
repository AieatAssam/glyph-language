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
Replaces: RFC 0048 (lexical-syntax-v4).
Amends: RFC 0004 (expected results of `diag/fix-present` and `diag/record-shape`, Design section "Expected results"); RFC 0014 (its rules 3, 5, 7, 8, 13 to 15, as restated here); RFC 0050 (its `diag/record-shape` line, E0100 at bytes 4 to 7, is replaced).
Meaning of every form here is given by `kernel-v46` (RFC 0105). Diagnostic records follow `spec/core/diagnostic.md`. Codes are listed in `spec/errors.json`.

## Summary

This RFC fixes how a Glyph source file becomes tokens and how tokens form a program:

- A line feed is allowed in exactly one place: as the last character of the file. Any other layout that is not canonical is E0002.
- Declarations: a parameter is `n Int`; a result follows the `)` as `)Int`; a declaration with no parameters has no parentheses: `main io{...}`.
- No `;`, no comments. `ret` ends its block. `put` is a keyword and takes its argument without parentheses: `put x`.
- `fail` is a keyword, as `io` is.
- A raw LF inside a text literal is content. The `\n` escape is removed.

## Motivation

Models write Glyph and need one way to write each construct. The owner measured the base program at 94 tokens. Dropping `;` takes it to 90, and `put x` takes three calls to 88. Each optional spelling is a place for a model to err, so this RFC allows one.

## Design

Normative. "Must" and "is" bind implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value. A *word character* is an ASCII letter, an ASCII digit or `_`. A *word token* is a token whose last character is a word character.

### Lexical rules

1. **Source text.** A source file must be valid UTF-8. Invalid UTF-8 is E0001 at the first invalid byte. A byte order mark (U+FEFF) is E0001 wherever it appears.

2. **Control characters.** U+0000 to U+001F and U+007F are E0001 wherever they appear, except LF (U+000A), which rules 3 and 4 govern. This includes TAB (U+0009) and CR (U+000D).

3. **Line end.** LF is not a token. Outside a text literal it is part of a gap, and rule 4 allows it only as the last character of the file. Any other LF outside a text literal is E0002. Inside a text literal it is content (rule 9). CR is E0001 (rule 2).

4. **Layout.** A *gap* is the text between two adjacent tokens, outside text literals, and also the text before the first token and after the last token. The *canonical gap* is:
   - between two tokens: one space (U+0020) if the last character of the earlier token and the first character of the later token are both word characters, and nothing otherwise;
   - before the first token: nothing;
   - after the last token: exactly one LF (U+000A).

   A file with no tokens is one LF. Each gap is checked in this order:
   - (a) a control character other than LF in it (rule 2) is E0001 at the first such character;
   - (b) otherwise, a gap that is not the canonical gap is E0002, with the gap as span and the canonical gap as the fix replacement. A missing space between two word tokens, or a missing final LF, gives a zero-length span at that point.

   Examples: `ret n` (one space); `if n<2{` (no space); `put (1)` is E0002 at the space after `put`; `main io{` LF `put 1}` is E0002 at the LF; `main io{}` LF is canonical; `main io{}` LF LF is E0002 over both LFs, with fix replacement one LF.

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

13. **Errors stop compilation.** The lexer reports its first error (E0001, E0002, E0005 or E0006) and emits no tokens after it. The parser reports its first error (E0003 or E0100) and stops. E0500 is reported only for a file with no lexical or syntax error. A file yields at most one error from this RFC.

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
| E0002 | lexical | Non-canonical layout: a gap that is not the canonical gap (extra space, LF where none belongs, missing space between word tokens, leading whitespace, missing or extra final LF) | The gap; zero-length where a space or the final LF is missing | Replace the gap with the canonical gap | 3, 4b |
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
- **`n:Int` and `):Int` (RFC 0048, RFC 0103).** Rejected. Each costs one more token than `n Int` and `)Int`. See Cost.
- **`main()` for a declaration with no parameters (RFC 0103).** Rejected. The parentheses carry no information, and G9 makes an empty list an error.
- **Two-line programs (RFC 0103).** Rejected. Rule 4 gives one canonical layout, and a second line is a second spelling of the same program.
- **`put(x)` as the spelling.** Rejected. It costs two more tokens per call. Open question 2 covers the form that still parses.
- **Free layout (RFC 0048).** Rejected. Two programs with the same tokens would differ in layout, which gives two spellings (principle 1).
- **Report non-canonical layout as E0100.** Rejected. The token sequence is valid, so E0100 would point at a valid token. A layout code with a fix gives the model the exact edit (principle 4).
- **Optional final LF.** Rejected. A file would have two spellings (principle 1). The conformance runner always writes one final LF, so no test could omit it.
- **Keep the `\n` escape and reject raw LF.** Rejected. The escape costs one token more than a raw LF inside text, and a raw LF is content there.
- **Keep `//` comments, or allow notes in programs.** Rejected. Comments cost tokens, the compiler ignores them, and no program needs a note.
- **`fail` as an identifier in declaration position.** Rejected. A word that is a name everywhere except after a declaration's parameters is one more rule to learn, and the keyword costs one token.
- **Leading zero as E0001 (RFC 0004 `diag/fix-present`).** Rejected. `007` is made of valid characters, so E0001 is the wrong code. E0006 is what RFC 0014 rule 8 gives and what RFC 0050 uses.

## Cost

Measured with `sbx python3 -m tools.check.tokens`. The counter ignores whitespace: a final LF costs 0 tokens (`main io{}` counts 3 with or without its LF). So the layout rule in rule 4 changes no count.

| Snippet | RFC 0103 form | This RFC |
| --- | --- | --- |
| fib with `fail`, and `main` | 45 | 41 |
| kernel sample (RFC 0103's sample is two lines) | 51 | 47 |
| parameter `n` with type | `n:Int` 3 | `n Int` 2 |
| parameter list and result | `(n:Int):Int` 7 | `(n Int)Int` 5 |

The base program's counts (94, 90, 88) are the owner's and are carried over from RFC 0102. They were not re-measured.

Counter facts from `tools/check/tokens.py`: `wh`, `ret`, `ex`, `put` and `fail` cost 1; `while`, `return`, `example` and `print` cost 2; `false` costs 2 and `true` costs 1. Each punctuation character costs 1, so `==`, `!=`, `<=` and `>=` cost 2 each.

Removed relative to RFC 0048: the `;` token, the `fn` keyword, the `:` token, the `//` comments, the `\n` escape, the `()` of zero-parameter declarations, and the annotation syntax on `let` and `var`. Added: the `put` and `fail` keywords, rule 4, the codes E0002 and E0003, and rules G2 to G13.

Spec card. The lexical section of the card adds about 224 tokens, well under the 2,000-token card cap. The core cap of 12,000 is checked by the merge bot.

## Test plan

Files. Each test is `conformance/lex/<name>.test`, with id `lex/<name>`. All tests of this RFC are in `conformance/lex/`, lexical and syntax alike. The meta block has `id`, `rfc: 0104` and `kind` (`run`, `compile-error` or `fmt`).

Sources. The conformance runner adds one LF to every `--- source` section, so every program ends in the canonical final LF. A program with a CR writes `\x0D` and sets `source-escapes: hex`. No other test sets it, since in that mode `\\` is one backslash. Byte offsets count from the first byte of the program, and `bytes a to b` means start a, end b, exclusive.

Compile-error records. Each line of `expect-errors` is a JSON object with `code` and `span` as `{"start":a,"end":b}`, and `fix` as `{"span":{...},"replacement":"..."}` where the table gives one. A `fix none` row gives no `fix` key. Example: `{"code":"E0002","span":{"start":8,"end":9},"fix":{"span":{"start":8,"end":9},"replacement":""}}`.

Kernel rules. Each run program follows `kernel-v46` rule F7: a body that is trapping (contains `+ - * / %`, unary `-`, `wh`, or a call to a function in the file) carries `fail`, and no other body does.

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
| `v6-unary` | `main io fail{put-((4))}` | `-4` | unary, nested parentheses |
| `v6-logic` | `main io{if not false and true or false{put 1}}` | `1` | `not`, `and`, `or`, `true`, `false` |
| `v6-cmp-all` | `main io{if 1<=1 and 2>=2 and 1!=2 and 1==1 and 2>1 and 1<2{put 1}}` | `1` | all six `cmp_op` |
| `v6-text` | `main io{put"x"}` | `x` | `TEXT` as the argument of `put` |
| `v6-text-lf` | `main io{put"a` LF `b"}` (LF is raw inside the text) | `a` LF `b` | raw LF is content (rule 9) |
| `v6-text-escape` | `main io{put"a\"b\\c"}` | `a"b\c` | `\"` and `\\` escapes |
| `v6-fail-mark` | `main io fail{put 1+1}` | `2` | `fail` after `io` |

Compile-error tests (one record each unless stated):

| Test | Program | Record span | Code | Fix |
| --- | --- | --- | --- | --- |
| `v6-err-cr` | `main io{\x0Dput 1}` (hex) | 8 to 9 (the CR) | E0001 | none |
| `v6-err-semi` | `main io{put 1;put 2}` | 13 to 14 (the `;`) | E0001 | none |
| `v6-err-colon` | `main io{let a:Int=1}` | 13 to 14 (the `:`) | E0001 | none |
| `v6-err-comment` | `main io{put 1//2}` | 14 to 15 (the second `/`) | E0100 | none |
| `v6-fmt-two-spaces` | `main io{put  1}` | 11 to 13 | E0002 | replacement ` ` |
| `v6-fmt-missing-space` | `main io{put 1put 2}` | 13 to 13 | E0002 | replacement ` ` |
| `v6-fmt-space-punct` | `main io{put (1)}` | 11 to 12 | E0002 | replacement empty |
| `v6-fmt-newline` | `main io{` LF `put 1}` | 8 to 9 | E0002 | replacement empty |
| `v6-fmt-extra-lf` | `main io{}` LF LF | 9 to 11 | E0002 | replacement LF |
| `v6-fmt-leading-space` | ` main io{}` | 0 to 1 | E0002 | replacement empty |
| `v6-err-zero-fix` | `main io{put 007}` | 12 to 15 | E0006 | `{"span":{"start":12,"end":15},"replacement":"7"}` |
| `v6-err-zero-00` | `main io{put 00}` | 12 to 14 | E0006 | `{"span":{"start":12,"end":14},"replacement":"0"}` |
| `v6-err-int-big` | `main io{put 9223372036854775808}` | 12 to 31 | E0500 | none |
| `v6-err-escape` | `main io{put"\n"}` | 12 to 14 | E0005 | none |
| `v6-err-unterminated` | `main io{put"ab` (file ends after LF; the LF is text) | 11 to 15 | E0005 | none |
| `v6-err-keyword-let` | `let let=1` | 0 to 3 | E0003 | none |
| `v6-err-keyword-let-block` | `main io{let let=1}` | 12 to 15 | E0003 | none |
| `v6-err-keyword-io-name` | `io io{}` | 0 to 2 | E0003 | none |
| `v6-err-keyword-fail-name` | `fail io{}` | 0 to 4 | E0003 | none |
| `v6-err-keyword-param` | `f(ret Int)io{}` | 2 to 5 | E0003 | none |
| `v6-err-ptype` | `f(t Text)io{}` | 4 to 8 | E0100 | none |
| `v6-err-empty-params` | `f()Int{}` | 2 to 3 | E0100 | none |
| `v6-err-result-order` | `f io Int{}` | 5 to 8 | E0100 | none |
| `v6-err-fail-order` | `f fail io{}` | 7 to 9 | E0100 | none |
| `v6-err-let-type` | `main io{let a Int=1}` | 14 to 17 | E0100 | none |
| `v6-err-fn-old` | `fn main io{}` | 3 to 7 | E0100 | none |
| `v6-err-ret-mid` | `main io{ret put 1}` | 12 to 15 | E0100 | none |
| `v6-err-expr-stmt` | `main io{1+2}` | 8 to 9 | E0100 | none |
| `v6-err-ex-block` | `main io{ex 1}` | 8 to 10 | E0100 | none |
| `v6-err-cmp-chain` | `main io{put 1<2<3}` | 15 to 16 | E0100 | none |
| `v6-err-else-if` | `main io{if true{}else if true{}}` | 22 to 24 | E0100 | none |
| `v6-err-if-expr` | `main io{let x=if true{}}` | 14 to 16 | E0100 | none |
| `v6-err-eof` | `main io{put 1` (file ends after LF) | 14 to 14 (EOF) | E0100 | none |

Format test: `lex/v6-fmt-canon` (kind `fmt`): `fib(n Int)Int fail{if n<2{ret n}ret fib(n-1)+fib(n-2)}main io fail{put fib(10)}`; the formatter prints it unchanged, including its final LF.

Coverage. Every grammar production is reached by a `v6-` test, except `ptype` and `rtype`, which are reached by `v6-err-ptype` and `v6-params`.

Retained tests. The RFC 0014 lexical tests `lex/ident-run`, `lex/int-run`, `lex/ident-keyword` (`let let=1`, E0003 at bytes 0 to 3), `lex/ident-ascii`, `lex/ident-io`, `lex/bad-utf8`, `lex/bom`, `lex/cr-alone`, `lex/tab`, `lex/punct-bracket`, `lex/bang-alone`, `lex/int-too-big`, and `lex/kw-<word>` for `let var if else true false and or not io`, keep their names and expected results. `lex/kw-fail` is added.

Retirement. Agents may not edit or delete an existing conformance test. These fail under this RFC; the owner removes each file or lists it as retired:
- `lex/v4-lf-only`: its line feed is E0002 (rule 4). Replaced by `v6-fmt-newline`.
- `lex/punct-semicolon`: `;` is E0001.
- `lex/comment-line`: comments are removed.
- `lex/kw-fn`, `lex/kw-while`, `lex/kw-return`, `lex/kw-example`: these words are identifiers. Replaced by the `v6-` tests.
- `lex/text-escape`: if it tests `\n`, that escape is removed. Replaced by `v6-text-escape`.
- `lex/text-unterminated`: the span runs to the end of the file, since a line feed inside text is content.
- `lex/int-leading-zero`: rule 8 adds a fix. Without a fix in its expected record it fails; replaced by `v6-err-zero-fix`.
- `lex/newline-in-group`, `lex/newline-blank`: line feeds outside text are E0002.
- `lex/ws-crlf`: CR is E0001.

`kernel/print-one` uses `print` and `fn`. It is not changed by this RFC; its retirement is gated by `kernel-v46` (G-c).

## Open questions

1. **`false` is two tokens.** Under the counter `false` costs 2 and `true` costs 1. Principle 8 needs a measurement before a longer form is kept.
2. **`put(e)` still parses.** It reads as `put` followed by the grouped expression `(e)`, so `put(e)` and `put e` are two spellings of one statement. Options: (a) accept the grouping (this draft); (b) reject a `put` argument that is one parenthesised group, with a new code; (c) leave it to the formatter. The owner should choose. `kernel-v46` does not depend on the choice.
3. **Retirement of the tests above.** The owner decides the mechanism. This RFC does not edit or delete them.
4. **References in kernel RFCs.** RFCs 0052, 0053, 0056, 0059, 0067, 0079 and 0081 cite RFC 0048 for tokens and syntax errors. Their references move to this RFC, and the owner should check them.
5. **E0003 block.** E0003 is in the lexical range (E0001 to E0099) but the parser reports it. Moving it to a syntax code would need a new code, chosen before any PR emits it.
6. **New codes.** E0002 and E0003, and the kernel codes E0200 to E0202, E0300 to E0303, E0400 and E0403, are not in `spec/errors.json`. The first PR that emits each adds it there.
