---
status: accepted
votes:
  designer-min: approve
  designer-safe: reject
  impl-1: approve
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Lexical structure and core syntax

Class: language
Slug: lexical-syntax-v4
Status: draft
Replaces: RFC 0014 (lexical-syntax-v3, superseded by the owner) and the statement and layout rules of RFC 0020 (kernel-v8, superseded). Meaning of every form here is given by `kernel-v9`. Diagnostic records follow RFC 0004 sections 2 to 7. Codes are listed in `spec/errors.json` (RFC 0004 section 4).

## Summary

This RFC fixes how a Glyph source file becomes tokens and how tokens form a program. It states the complete grammar of the kernel, so an implementer can build the lexer and parser from this text alone.

Changes from RFC 0014 and RFC 0020:

- Line ends are whitespace. There is no `NEWLINE` token, and no statement or block depends on a line break.
- `;` is the one statement separator, and it is a token. It sits only between statements.
- `let` and `var` take no type annotation. The type of a binding is the type of its expression.
- `->` is two tokens, `-` then `>`. The parser reports E0100 at the `-`, the first token the grammar rejects.
- Only LF ends a line. CR is error E0001 wherever it appears.
- Three keywords and one builtin name are shortened (see the Design, rule 7). Each saves one token per use under the protected counter.

The kernel's test programs in this RFC use `put`, the builtin defined by `kernel-v9`.

## Motivation

Models write Glyph and need one way to write each construct. RFC 0014 and RFC 0020 had three problems that this draft fixes.

- Statement endings depended on line breaks, through `NEWLINE` and parenthesis depth. A model that loses a line break gets a different program, and the lexer had two rules (rules 14 and 15 of RFC 0014) plus the parser's rules G2 and G3 to explain it. `;` between statements replaces both.
- `let x: T = e` and `let x = e` were two spellings of the same binding. The checker infers the type, so the annotation is removed.
- The E0100 position for `->` was disputed (designer-min and designer-safe rejected RFC 0014 on it). Rule 10 now states the position, and rule 13 agrees with it.

On the counter: `tools/check/tokens.py` charges ceil(n/4) for an alphabetic run of n letters. So `while`, `return`, `example` and `print` cost 2 each, and `wh`, `ret`, `ex` and `put` cost 1. Words of four letters or fewer already cost 1, so `else`, `true`, `and` and the others stay. Each `;` costs 1. Whitespace and line ends are not counted.

## Design

Normative. "Must" and "is" bind implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value. A *span* is a byte range from `start` to `end`, with `end` exclusive (RFC 0004 section 2).

### Lexical rules

1. **Source text.** A source file is a byte sequence that must be valid UTF-8. An invalid byte is E0001, with the span of that one byte. A byte order mark (U+FEFF, bytes EF BB BF) is E0001 wherever it appears, with the span of its three bytes.

2. **Forbidden control characters.** The control characters U+0000 to U+001F and U+007F are errors wherever they appear, including in comments and text literals, except LF (rule 3). This covers the tab (U+0009) and the CR (U+000D). Each is E0001 at that character.

3. **Line end.** LF (U+000A) is a line end. It is whitespace and produces no token. There is no CR LF rule.

4. **Whitespace.** Space (U+0020) and LF are whitespace. Whitespace separates tokens and produces no token. Spacing and line breaks do not change the program: two source texts with the same token sequence are the same program (G12).

5. **Comments.** Outside a text literal, `//` starts a comment that runs up to, but not including, the next LF or the end of the file. There are no block comments. A comment produces no token.

6. **Identifiers.** An identifier is one ASCII letter (`A`-`Z`, `a`-`z`) or `_`, followed by zero or more ASCII letters, digits or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal or comment is E0001 at that character. `Int`, `Bool`, `Text`, `put` and `main` are identifiers, not keywords.

7. **Keywords.** Exactly fourteen words are keywords, all lowercase:

   `fn let var if else wh ret true false and or not ex io`

   Each keyword lexes as its own token kind, never as an identifier. The three shortened keywords replace `while`, `return` and `example`. A keyword where a name is required is E0003 at the keyword (G3). No other word is reserved. The builtin `put` (kernel-v9) is an identifier, so `put` is not a keyword.

8. **Integer literals.** A decimal integer is `0`, or a digit from `1` to `9` followed by zero or more digits. It has no sign and no underscore. The lexer reads the maximal run of ASCII digits. If that run has more than one digit and starts with `0`, it is E0006 at the run. The fix replaces the run with the same digits without leading zeros, keeping one digit (`007` becomes `7`, `00` becomes `0`). The value must be at most 9223372036854775807. A larger literal is E0500 at the literal, reported by the checker. The check applies to the literal alone, before any unary `-`, so `-9223372036854775808` is also E0500. The lexer and the parser never emit E0500.

9. **Text literals.** A text literal starts with `"` and ends at the next `"`. Between the quotes are any valid UTF-8 characters except `"`, `\`, and the characters rule 2 forbids, and the escapes `\n` (LF), `\"` (quote) and `\\` (backslash). Any other `\` sequence is E0005, with the span from the backslash to the end of the character after it. An LF or the end of the file before the closing quote is E0005, with the span from the opening quote up to, not including, that LF or end of file. The value of the token is the decoded UTF-8 bytes.

10. **Punctuation and operators.** The tokens are exactly these nineteen: `( ) { } , : ; = == != < <= > >= + - * / %`. The lexer takes the longest listed token that starts at the current character, reading at most one character ahead. So `==`, `!=`, `<=` and `>=` are each one token. `=>` is two tokens, `=` then `>`. `->` is two tokens, `-` then `>`. The parser reports E0100 at the first token the grammar rejects. For `fn f() -> Int { }` that is the `-`, because after the `)` of a function header the grammar accepts only `:`, `io` or `{`.

11. **Other characters.** Every printable ASCII character not covered by rules 5 to 10 is E0001 at that character. This includes `[`, `]`, `.`, `!` not followed by `=`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` ``, and `\` outside a text literal.

12. **Token kinds.** Each token has exactly one kind. Each keyword and each punctuation token has its own kind. The other kinds are `IDENT`, `INT`, `TEXT` and `EOF`. There is no `NEWLINE` kind.

13. **Lexical errors come first.** Lexing finishes before parsing. The lexer makes one left-to-right pass over the bytes, applying rules 1, 2, 6, 9 and 11 as it reads each byte. At the first error it stops, reports that one error, and emits no tokens. The parser runs only after a successful lex. So a lexical error anywhere in the file is reported, and no syntax error is, even one that comes earlier. Records follow RFC 0004 section 3.

### Grammar

Normative. Notation: `"x"` is a keyword or punctuation token. `IDENT`, `INT`, `TEXT` and `EOF` are token kinds. `[ a ]` is zero or one, `{ a }` is zero or more, `|` separates alternatives. `"Int"` and `"Bool"` in the grammar mean an `IDENT` token with that text. A program is one `program`.

```
program   = { fn_decl } EOF
fn_decl   = "fn" IDENT "(" [ param { "," param } ] ")" [ ":" rtype ] [ "io" ] block { "ex" expr }
param     = IDENT ":" ptype
ptype     = "Int" | "Bool"
rtype     = "Int" | "Bool"
block     = "{" [ stmt { ";" stmt } ] "}"
stmt      = "let" IDENT "=" expr
          | "var" IDENT "=" expr
          | IDENT "=" expr
          | IDENT "(" [ args ] ")"
          | "if" expr block [ "else" block ]
          | "wh" expr block
          | "ret" [ expr ]
args      = expr { "," expr }
expr      = or_expr
or_expr   = and_expr { "or" and_expr }
and_expr  = cmp_expr { "and" cmp_expr }
cmp_expr  = add_expr [ cmp_op add_expr ]
cmp_op    = "==" | "!=" | "<" | "<=" | ">" | ">="
add_expr  = mul_expr { ( "+" | "-" ) mul_expr }
mul_expr  = unary { ( "*" | "/" | "%" ) unary }
unary     = ( "-" | "not" ) unary | primary
primary   = INT | TEXT | "true" | "false" | IDENT [ "(" [ args ] ")" ] | "(" expr ")"
```

Choices the grammar leaves to the parser. After `ret`, an expression follows exactly when the next token is `INT`, `TEXT`, `true`, `false`, `IDENT`, `(`, `-` or `not`. In a `stmt` that starts with `IDENT`, the next token `=` makes an assignment and `(` makes a call.

Syntax rules. Each is a consequence of the grammar and the token rules. Each names the token that carries E0100 or E0003.

G1. `;` is a separator, not a terminator. A `;` with no statement before or after it is E0100 at that `;`, or at the `}` that follows a trailing `;`. So `{ ; put(1) }` is E0100 at the first `;`, and `{ put(1); }` is E0100 at the `}`.

G2. Two statements with no `;` between them are E0100 at the first token of the second statement. `put(1) put(2)` is E0100 at the second `put`.

G3. A keyword where a name is required is E0003 at the keyword. A name is required after `fn`, after `let` or `var`, and as a parameter name. Any other keyword the grammar does not accept at a position is E0100 at that keyword.

G4. A statement is one of the seven forms of `stmt`. An expression statement such as `1 + 2` is E0100 at its first token.

G5. `fn` is accepted only at top level, so a `fn` inside a block is E0100 at `fn`. `ex` is accepted only directly after a function's closing `}`, or after another `ex` of that function. Any other `ex` is E0100 at `ex`.

G6. Comparisons do not chain. After one `cmp_expr`, a second comparison operator is E0100 at that operator. So `1 < 2 < 3` is E0100 at the second `<`.

G7. `else` is followed by a block. `else if` is E0100 at `if`.

G8. `if`, `wh`, `ret`, `let`, `var`, `fn` and `ex` are not expressions. In an expression position each is E0100 at the keyword.

G9. The result type comes before `io`. `fn f() io : Int { }` is E0100 at `:`.

G10. A binding has no type annotation. `let a: Int = 1` is E0100 at `:`.

G11. At end of file, if the grammar needs more tokens, the error is E0100 at `EOF`. Example: a block not closed by `}`.

G12. The parser ignores spacing and line ends. It reports E0100 at the first token the grammar rejects, and it stops there.

### Diagnostics

| Code | Block | Meaning | Span | Rules |
| --- | --- | --- | --- | --- |
| E0001 | lexical | Invalid byte or character: invalid UTF-8, byte order mark, control character (including tab and CR), non-ASCII outside text and comments, or printable ASCII outside the token set | The byte or character | 1, 2, 3, 6, 9, 11 |
| E0003 | lexical | Keyword where a name is required. Reported by the parser | The keyword | 7, G3 |
| E0005 | lexical | Malformed text literal | See rule 9 | 9 |
| E0006 | lexical | Integer literal with a leading zero. Has a fix | The digit run | 8 |
| E0100 | syntax | Unexpected token: the grammar does not accept this token at this position | The token. At end of file, the `EOF` token, an empty span at the end of the file | 10, G1 to G12 |
| E0500 | limits | Integer literal above 9223372036854775807. Reported by the checker | The literal | 8 |

Codes not in this table are not used by this RFC. E0003 keeps its number in the lexical range of RFC 0004 section 4. The parser reports it, and it cannot share a file with a lexical error, because the parser runs only after a successful lex (rule 13). E0003 is not yet in `spec/errors.json`. The PR that first emits it adds it there.

### Layout

The compiler accepts any spacing and any line breaks (rule 4). The single layout the formatter prints is defined by a later RFC. Until then no layout is checked. Open question 2 covers this.

## Alternatives

- **Keep `NEWLINE` as the statement separator (RFC 0014, RFC 0020).** Rejected. Statements depend on line breaks, and the lexer needs a parenthesis depth counter to decide which line ends count.
- **Newline as separator, with `;` also allowed.** Rejected. Two ways to end a statement.
- **Allow `;` after the last statement of a block.** Rejected. It is an optional form. The one canonical form has `;` only between statements.
- **Juxtaposition with no separator.** Rejected. `ret` takes an optional expression, so `ret` followed by a statement `put(1)` reads as `ret put(1)`. Only `;` removes that ambiguity without a second rule.
- **Keep `let x: T = e`.** Rejected. It is a second spelling of a binding, and the checker infers the type.
- **Keep CR LF as one line end (RFC 0014 rule 3).** Rejected. With line ends as whitespace, CR is a second spelling of a line end. Only LF remains.
- **Keep `while`, `return`, `example`, `print`.** Rejected under principle 8. Each costs 2 tokens under the protected counter, and the shorter form costs 1. Shorter spellings of `false` and `else` do not save a token under the counter, so they are unchanged. Open question 1 is the `false` case.
- **Block comments.** Rejected, as in RFC 0014.

## Cost

Measured by reading `tools/check/tokens.py`, not by running it. Its rule is ceil(n/4) per alphabetic run, so the figures in Motivation hold.

- Shortened words: `wh` for `while`, `ret` for `return`, `ex` for `example` and `put` for `print`. Each use saves one token. The spec text uses each as a word, so this is a saving in the spec's text too.
- `;` costs one token per statement separator in programs. The counter cannot see line breaks, so the saving from removing `NEWLINE` is only in the rules text.
- Removed: rules 14 and 15 of RFC 0014, the CR LF clause, the `NEWLINE` token kind, parenthesis-depth rules, the `type` production, the annotation syntax on `let` and `var`, and rules G2 and G3 of RFC 0020.
- Added: the `;` token, and the grammar block above.

Core spec: the merge bot checks the 12,000-token cap with the protected counter. This RFC is expected to be roughly neutral against RFC 0014 and RFC 0020 together, but the figure is not measured here.

Spec card: one line for the fourteen keywords, one for the nineteen punctuation tokens, one for the token kinds, one for `;` between statements, and two for the grammar's shape. The current size of `spec/card.md` is not known to this draft. The card limit is 2,000 tokens.

## Test plan

Conformance tests live in `conformance/lex/`. A run test states stdout, stderr and exit status. A compile-error test holds one whole program with one error and states the expected records as JSON. The runner compares `code`, `span` and `fix` (RFC 0004 section 7). Spans are byte offsets. In this RFC, "at X" means the span of the token X. For an expression the span runs from its first token to its last. The `EOF` span is empty, at the end of the file. Every fix is `none`, except E0006 (rule 8), whose fix is given in rule 8.

Each compile-error program is one whole program. If the error is not in `main`, the program ends with `fn main() io { }`, which comes after the error, so the expected span does not move.

Run tests use `put` from kernel-v9 (RFC 0049). They are not to be written until an accepted kernel defines `put`. Compile-error tests need only the lexer and parser.

The tests from RFC 0014 that do not depend on a changed rule keep their names and their expected results. The tests in the list below with the `v4-` prefix are new. Tests from RFC 0014 that this RFC changes are listed under Open questions 3.

Run tests (each a complete program):

- `v4-kw-wh`: `fn main() io { wh false { } }`. Prints nothing, status 0. Covers `wh`.
- `v4-kw-ret`: `fn main() io { ret }`. Prints nothing, status 0. Covers `ret` with no expression.
- `v4-kw-ex`: `fn f() { } ex true fn main() io { }`. Prints nothing, status 0. Covers `ex` after a function.
- `v4-semi`: `fn main() io { put(1); put(2) }`. Output `1`, `2`. Covers `;` between statements and the `;` token.
- `v4-lf-ws`: the bytes `fn main() io {`, LF, LF, two spaces, `put(1)`, LF, `}`. Output `1`. Covers LF as whitespace.
- `v4-grammar-ex`: `fn h(): Int { ret 1 } ex h() == 1 fn main() io { put(h()) }`. Output `1`. Covers `rtype`, `ret expr` and `ex`.
- `v4-grammar-call`: `fn two(a: Int, b: Int) io { put(a); put(b) }`, `fn main() io { two(1, 2) }`. Output `1`, `2`. Covers `param`, `args`, and the call statement.
- `v4-grammar-assign`: `fn main() io { var i = 0; wh i < 2 { i = i + 1 }; put(i) }`. Output `2`. Covers `var`, `wh`, assignment.
- `v4-grammar-ret`: `fn g(n: Int) io { if n == 0 { ret }; put(n) }`, `fn main() io { g(0); g(1) }`. Output `1`. Covers `if` without `else` and bare `ret`.
- `v4-grammar-else`: `fn main() io { if false { put(1) } else { put(2) } }`. Output `2`. Covers `else`.
- `v4-grammar-unary`: `fn main() io { put(-((4))) }`. Output `-4`. Covers `unary`, `primary`, and nested parentheses.
- `v4-grammar-logic`: `fn main() io { if not false and true or false { put(1) } }`. Output `1`. Covers `not`, `and`, `or`.
- `v4-grammar-text`: `fn main() io { let t = "x"; put(t) }`. Output `x`. Covers `TEXT` and `let`.
- `v4-grammar-bool`: `fn main() io { let b = 1 < 2; if b { put(1) } }`. Output `1`. Covers `let` with no annotation and a comparison.
- `v4-grammar-ops`: `fn z() io { put(0) } fn main() io { z(); put(2 * 3 - 1); put(8 / 2); put(7 % 4); if 1 != 2 and 2 <= 2 and 3 > 2 and 3 >= 3 { put(5) } }`. Output `0`, `5`, `4`, `3`, `5`. Covers the zero-argument call statement, binary `-`, `*`, `/`, `%`, and every `cmp_op`.
- `v4-grammar-bool-type`: `fn f(b: Bool): Bool { ret b } ex f(true) fn main() io { if f(false) { put(0) } else { put(1) } }`. Output `1`. Covers `ptype` and `rtype` as `Bool`.
- `v4-comment`: the bytes `fn main() io { // put(9)`, LF, `put("a//b") }`. Output `a//b`. Covers rule 5 and a `//` inside text.
- Token tests from RFC 0014 (`lex/tok-<token>`) are unchanged.

Compile-error tests (code and span):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `v4-err-cr` | `fn main() io {` CR LF ` put(1) }` | the CR | E0001 |
| `v4-err-lex-first` | `fn main() io { put(1) put(2) }`, then CR LF | the CR, byte 30. No E0100 is reported | E0001 |
| `v4-err-semi-lead` | `fn main() io { ; put(1) }` | the first `;` | E0100 |
| `v4-err-semi-trail` | `fn main() io { put(1); }` | the `}` | E0100 |
| `v4-err-semi-top` | `fn main() io { } ;` | the top-level `;` | E0100 |
| `v4-err-stmt-sep` | `fn main() io { put(1) put(2) }` | the second `put` | E0100 |
| `v4-err-expr-stmt` | `fn main() io { 1 + 2 }` | the `1` | E0100 |
| `v4-err-else-if` | `fn main() io { if true { } else if true { } }` | the second `if` | E0100 |
| `v4-err-if-expr` | `fn main() io { let x = if true { } }` | the `if` | E0100 |
| `v4-err-fn-nested` | `fn main() io { fn f() { } }` | the `fn` | E0100 |
| `v4-err-ex-top` | `ex 1 fn main() io { }` | the `ex` | E0100 |
| `v4-err-ex-block` | `fn main() io { ex 1 }` | the `ex` | E0100 |
| `v4-err-cmp-chain` | `fn main() io { put(1 < 2 < 3) }` | the second `<` | E0100 |
| `v4-err-cmp-chain-ge` | `fn main() io { if 1 == 1 >= 0 { } }` | the `>=` | E0100 |
| `v4-err-arrow` | `fn f() -> Int { } fn main() io { }` | the `-` | E0100 |
| `v4-err-result-order` | `fn f() io : Int { } fn main() io { }` | the `:` | E0100 |
| `v4-err-let-type` | `fn main() io { let a: Int = 1 }` | the `:` | E0100 |
| `v4-err-text-param` | `fn f(t: Text) io { } fn main() io { }` | the `Text` | E0100 |
| `v4-err-text-result` | `fn f(): Text io { } fn main() io { }` | the `Text` | E0100 |
| `v4-err-keyword-let` | `fn main() io { let let = 1 }` | the second `let` | E0003 |
| `v4-err-keyword-fn` | `fn io() io { } fn main() io { }` | the `io` | E0003 |
| `v4-err-keyword-param` | `fn f(ret: Int) io { } fn main() io { }` | the `ret` | E0003 |
| `v4-err-eof` | `fn main() io { put(1)` | the `EOF` | E0100 |

Lexical tests from RFC 0014 that remain valid and are unchanged: `lex/ident-run`, `lex/int-run`, `lex/kw-<word>` for the eleven keywords that keep their spelling, `lex/bad-utf8`, `lex/bom`, `lex/cr-alone`, `lex/tab`, `lex/ident-ascii`, `lex/punct-bracket`, `lex/bang-alone`, `lex/text-bad-escape`, `lex/text-unterminated`, `lex/int-leading-zero` (expects E0006 with the fix of rule 8), `lex/int-too-big`, `lex/text-escape`, `lex/comment-line`, `lex/newline-in-group`, `lex/newline-blank`.

Every grammar production is reached by a `v4-` run or compile-error test above, or by an RFC 0014 test: `program`, `fn_decl`, `param`, `ptype`, `rtype`, `block`, all seven `stmt` forms, `args`, each level of `expr` through `primary`, and `cmp_op`.

## Open questions

1. **`false` is two tokens.** Under the counter, `false` costs 2 and `true` costs 1. The only spellings of four letters or fewer are non-words, such as `fals` and `no`, and `no` collides with `not`. This draft keeps `false`. Principle 8 says a longer form needs a measurement that shows fewer errors. The owner should decide whether that measurement is needed or the saving is worth a non-word.
2. **Layout.** Principle 1 asks for a canonical layout that is the only valid one. This draft accepts all spacing and all line breaks, and no RFC yet defines the formatter. A later RFC should define the layout and whether the compiler rejects other layouts (with a new code and a fix).
3. **Existing tests this RFC breaks.** `conformance/kernel/print-one.test` (RFC 0020) uses `print`, which this RFC does not define, so it cannot pass under this RFC. It is not edited here, because existing conformance tests are never edited. The owner decides its retirement. RFC 0014's tests `lex/punct-semicolon`, `lex/ws-crlf`, `lex/kw-while`, `lex/kw-return` and `lex/kw-example` are not written, and they are retired by this RFC. RFC 0020's tests that rely on a newline or on `let x: T`, `var x: T` or `print` are retired the same way.
4. **Decided: E0003 for `let let` is at the second `let`.** Rule G3 defines the position. This supersedes RFC 0014's test `lex/ident-keyword`, which is not yet written and puts E0003 at the first `let`. RFC 0004's `diag/record-shape` example does not say which `let`, so it is consistent with this decision.
5. **Decided: E0003 keeps its lexical number.** RFC 0004 section 4 numbers codes by block. E0003 is in the lexical range, the parser reports it, and it cannot share a file with a lexical error (rule 13). So the number does no harm, and no code moves.
6. **New codes.** E0003 and the codes of `kernel-v9` (E0200 to E0202, E0300 to E0303, E0400) are not in `spec/errors.json`. The first PR that emits each must add it there.
7. **Decided: leading zero is E0006 with a fix.** Rule 8 gives E0006, which is in `spec/errors.json`, and a fix, because removing leading zeros is a change the author can infer (RFC 0004 section 2). This amends the code of RFC 0004's `diag/fix-present` example from E0001 to E0006. The fix `7` stays. A later RFC must record that amendment, and until then the example is not written with E0001.
