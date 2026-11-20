# RFC draft: Lexical structure and core syntax

Class: language
Slug: lexical-syntax-v3
Status: draft
Replaces: RFC 0012 (rejected). Kernel: RFC 0013 (kernel-v2). Diagnostic codes follow RFC 0004 §4.

## Summary

This RFC fixes how a Glyph source file becomes tokens. Every lexical rule the kernel needs is stated here, so an implementer can build the lexer from this text alone. In short:

- A source file is valid UTF-8. A tab, another control character, a byte order mark or a lone CR is an error.
- A line end is LF, or CR LF as one line end. Spaces and line ends separate tokens.
- A comment is `//` up to the end of the line. There are no block comments.
- An identifier is one ASCII letter or `_`, then ASCII letters, digits or `_`.
- There are fourteen keywords, all lowercase: `fn let var if else while return true false and or not example io`.
- An integer literal is `0`, or a digit from 1 to 9 followed by digits, with a value of at most 9223372036854775807. There is no sign and no underscore.
- A text literal is double-quoted, with the escapes `\n`, `\"` and `\\`.
- There are eighteen punctuation and operator tokens: `( ) { } , : = == != < <= > >= + - * / %`. There is no `->`, no bare `!`, and no `;`, `[`, `]` or `.`.
- A line end outside `( )` emits one `NEWLINE` token. The parser decides which `NEWLINE`s end a statement.

This RFC defines tokens and lexical errors, and the meaning of the syntax error E0100. It does not define expressions, bindings, functions or loops. Those belong to the kernel, RFC 0013.

## Motivation

Models writing Glyph need one tokenisation rule they can apply without guessing. RFC 0012 was rejected for four reasons, and this draft answers each one.

- `->` and bare `!` were tokens with no kernel production. Both are removed. RFC 0013 writes the result type with `:` and the effect with `io`, so neither token is needed.
- `!io` clashed with the `io` keyword in RFC 0013. `io` is now a keyword, and `!io` is no longer a token.
- RFC 0012 cited the rejected RFC 0005 for the kernel. It now cites RFC 0013 instead. The rules this RFC states (E0100, the integer range, the token set) are written here, so no rule depends on a rejected RFC.
- The test plan had no run test for a valid identifier, a valid integer or the keywords. It now has run tests for identifiers, integers, each of the fourteen keywords and each punctuation token.

Two other points from the review are answered here. The summary now states every lexical rule, including the comment form. The spec card was not in the reviewer's scratch copy, and it is not in this checkout either. The Cost section says what that means for the size check.

The following are kept from RFC 0012 without change. Tabs are an error everywhere, not whitespace. `[`, `]`, `.` and `;` are not tokens. The escapes are `\n`, `\"` and `\\` only. Every line end outside `( )` emits one `NEWLINE`, and the parser decides which ones end statements.

## Design

Normative. "Must" and "is" are binding on implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value.

1. **Source text.** A source file is a byte sequence that must be valid UTF-8. Invalid UTF-8 is error E0001 at the first invalid byte. A byte order mark (U+FEFF) is error E0001 wherever it appears.

2. **Forbidden control characters.** The control characters U+0000 to U+001F and U+007F are errors wherever they appear, including in comments and text literals. This covers the tab (U+0009) and the CR (U+000D), except for the CR of a CR LF pair (rule 3). Each such character is error E0001 at that character.

3. **Line ends.** A line end is LF (U+000A), or CR LF (U+000D U+000A) treated as one line end. A CR that is not followed by LF is error E0001 at that CR. The span of a line end is its bytes.

4. **Whitespace.** Space (U+0020) and line ends are whitespace. Whitespace separates tokens and produces no token, except that rule 14 emits `NEWLINE`.

5. **Comments.** Outside a text literal, `//` starts a comment that runs up to, but not including, the next line end. There are no block comments. A comment produces no token. Its characters must obey rule 2.

6. **Identifiers.** An identifier is one ASCII letter (`A`-`Z` or `a`-`z`) or `_`, followed by zero or more ASCII letters, digits (`0`-`9`) or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal or comment is error E0001 at that character. `Int`, `Bool`, `Text`, `print` and `main` are identifiers, not keywords.

7. **Keywords.** Exactly fourteen words are keywords. They are lowercase only: `fn let var if else while return true false and or not example io`. Each keyword lexes as its own token kind, never as an identifier. A keyword where the grammar needs a name is error E0003, reported by the parser at the keyword's span. No other word is reserved.

8. **Integer literals.** A decimal integer is `0`, or a digit from `1` to `9` followed by zero or more digits from `0` to `9`. It has no sign and no underscore. A digit sequence with a leading zero, such as `007`, is error E0006 at the literal. The lexer records the digits as written.
   The value of a literal must be at most 9223372036854775807 (2^63 - 1). A larger literal is error E0500 at the literal's span. The checker reports it, not the lexer. The check applies to the literal alone, before any unary `-`, so `-9223372036854775808` is also E0500. The smallest `Int` is therefore written `-9223372036854775807 - 1`.

9. **Text literals.** A text literal starts with `"` and ends at the next `"`. Between the quotes are:
   - any valid UTF-8 character except `"`, `\`, and the characters that rule 2 forbids (each is error E0001); and
   - the escapes `\n` (LF), `\"` (quote) and `\\` (backslash).

   Any other `\` sequence is error E0005 at the backslash and the character after it. A line end or the end of the file before the closing quote is error E0005 at the span from the opening quote to the end of that line or of the file. The value of the token is the decoded bytes, in UTF-8.

10. **Punctuation and operators.** The tokens are exactly these eighteen: `( ) { } , : = == != < <= > >= + - * / %`. The lexer takes the longest listed token that starts at the current character, looking at most one character ahead. So `==`, `!=`, `<=` and `>=` are each one token. `=>` is two tokens, `=` then `>`. `->` is two tokens, `-` then `>`. The parser then reports E0100 at the `>` if the grammar does not accept it.

11. **Other characters.** Every printable ASCII character that rules 5 to 10 do not cover is error E0001 at that character. This includes `;`, `[`, `]`, `.`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` ``, `\` outside a text literal, and `!` not followed by `=`.

12. **Token kinds.** Each token has exactly one kind. Each keyword and each punctuation token has its own kind. The other kinds are `IDENT`, `INT`, `TEXT`, `NEWLINE` and `EOF`.

13. **Syntax error (E0100).** E0100 means: the parser has met a token that the grammar does not accept at that position. The parser reports E0100 at that token's span and stops at the first one. The lexer reports no syntax errors. The kernel RFC defines which tokens each position accepts. An unbalanced `)` is also E0100, as rule 14 says.

14. **NEWLINE.** A line end emits one `NEWLINE` token, with the line end's span, if all three of these hold:
    - the parenthesis depth is zero, where `(` adds one and `)` subtracts one, and a `)` at depth zero leaves the depth at zero;
    - at least one token has already been emitted in this file; and
    - the last token emitted is not `NEWLINE`.

    A line end inside `( )` emits nothing. Consecutive blank lines produce one `NEWLINE`. Blank lines at the start of the file produce none. The lexer does not decide which `NEWLINE`s end a statement. The parser does.

15. **End of file.** At the end of the file, the last line is ended as if a line end were there, under rule 14. The lexer then emits one `EOF` token. A file that ends inside `( )` gets no `NEWLINE` from that end, and the parser reports the unclosed group with E0100 at `EOF`.

16. **Errors and lookahead.** The lexer uses at most one character of lookahead (rule 10). It reports the first lexical error (E0001, E0003 where the lexer sees it, E0005 or E0006) and emits no tokens after it. Records follow RFC 0004 §2 and §3.

Error table. Codes are assigned in `spec/errors.json` by the first PR that emits them (RFC 0004 §4).

| Code | Block | Meaning | Span | Rules |
| --- | --- | --- | --- | --- |
| E0001 | lexical | Invalid byte or character: invalid UTF-8, byte order mark, forbidden control character (including tab and lone CR), non-ASCII outside text and comments, or printable ASCII outside the token set (including `!` not followed by `=`) | The offending byte or character | 1, 2, 3, 6, 9, 11 |
| E0003 | lexical | Keyword where a name is required. Reported by the parser. | The keyword | 7 |
| E0005 | lexical | Malformed text literal: unknown escape, or a line end or end of file before the closing quote | See rule 9 | 9 |
| E0006 | lexical | Integer literal with a leading zero | The literal | 8 |
| E0100 | syntax | Unexpected token: the grammar does not accept this token at this position | The token | 10, 13, 14, 15 |
| E0500 | limits | Integer literal above 9223372036854775807. Reported by the checker. | The literal | 8 |

Codes not in this table are not used by this RFC.

## Alternatives

- **Tabs as whitespace, and a `\t` escape (RFC 0003).** Rejected. Two ways to write indentation and a tab escape add a choice that the formatter would have to remove.
- **`->` for the result type and `!` for effects (RFC 0012).** Rejected. Both are tokens with no kernel production. `:` and the keyword `io` cover the same cases.
- **`!io` as one token (RFC 0012).** Rejected. It clashes with the keyword `io` in RFC 0013, and a keyword is the simpler form.
- **Range check in the lexer.** Not chosen. The range check is one comparison on the literal, and the checker already reports every value error with the same record shape. Putting it in the checker keeps the lexer to character rules.
- **Brackets `[ ]` suppress NEWLINE (RFC 0003).** Rejected. `[` and `]` have no kernel production. Adding them as tokens would break the rule that every token has a use.
- **Semicolons as statement terminators.** Rejected. They add a second way to end a statement. The NEWLINE rule gives one way.
- **Block comments and doc comments.** Rejected for the kernel. A doc form can come in its own RFC if a benchmark shows a need.
- **Unicode identifiers with normalisation.** Rejected. It needs a normalisation table in the spec and creates lookalike names.
- **Raw strings and string interpolation.** Deferred. Interpolation would add an implicit conversion.

## Cost

Core spec: Design rules 1 to 16 and the error table add about 1,100 tokens by estimate. The tokeniser script gives the real figure, and the merge bot checks the 12,000-token limit. The checkout used for this draft has no `spec/` directory, so the script could not be run here.

Removes, measured against RFC 0003 section 10: the tokens `[`, `]` and `.`, and the tab-as-whitespace rule. Removes, measured against RFC 0012: the tokens `->` and `!`, and the `!io` rule (its rule 11).

Adds, measured against RFC 0012: the keyword `io` (one more reserved word).

Spec card: one line for the fourteen keywords, one line for the eighteen punctuation tokens, one line for the token kinds, and two lines for the NEWLINE rule. About 150 tokens. This is an estimate. `spec/card.md` is not in this checkout, so its current size and the 2,000-token card limit are not checked here.

## Test plan

Conformance tests live in `conformance/lex/`. Each run test holds one program and its expected stdout, stderr and exit status. Each compile-error test states its expected records as JSON, comparing `code`, `span` and `fix` (RFC 0004 §7). Each test program is a complete program, so the kernel's `fn main` wrapper is used where needed.

Run tests:

- `lex/ident-run.test`: `let _a = 1`, `let Count2 = 2` and `let x_9 = 3`, each printed. Expected output `1`, `2`, `3`. Covers IDENT, including a leading uppercase letter and an underscore.
- `lex/int-run.test`: literals `0`, `12` and `9223372036854775807`, each printed. Expected output `0`, `12`, `9223372036854775807`. Covers INT, including the largest value.
- `lex/kw-<word>.test`: one run test for each of the fourteen keywords. Each program uses the keyword in its only valid position, runs with exit status 0 and prints nothing.

  | Keyword | Program body (inside `fn main()` unless shown) |
  | --- | --- |
  | `fn` | `fn main() { }` |
  | `let` | `let a = 1` |
  | `var` | `var a = 1` |
  | `if` | `if true { }` |
  | `else` | `if false { } else { }` |
  | `while` | `while false { }` |
  | `return` | `return` |
  | `true` | `let a = true` |
  | `false` | `let a = false` |
  | `and` | `let a = true and false` |
  | `or` | `let a = true or false` |
  | `not` | `let a = not true` |
  | `example` | `fn f() { }` followed at file level by `example true` |
  | `io` | `fn f() io { }`, called from nowhere |

- `lex/tok-<token>.test`: one run test for each of the eighteen punctuation tokens in rule 10, named for the token (`lparen`, `rparen`, `lbrace`, `rbrace`, `comma`, `colon`, `assign`, `eq`, `ne`, `lt`, `le`, `gt`, `ge`, `plus`, `minus`, `star`, `slash`, `percent`). Each program uses the token in a valid position under the kernel grammar.
- `lex/comment-line.test` (run): a `//` comment is ignored to the end of its line, and a `//` inside a text literal is text.
- `lex/ws-crlf.test` (run): a program with CRLF line ends prints the same output as its LF form.
- `lex/newline-in-group.test` (run): a line end inside `( )` produces no `NEWLINE`, so the expression continues.
- `lex/newline-blank.test` (run): several blank lines, and blank lines at the start of the file, produce no extra `NEWLINE`.
- `lex/text-escape.test` (run): `\n`, `\"` and `\\` produce the expected bytes.

Compile-error tests:

- `lex/bad-utf8.test` (E0001): an invalid UTF-8 byte.
- `lex/bom.test` (E0001): a byte order mark at the start of the file.
- `lex/cr-alone.test` (E0001): a CR not followed by LF.
- `lex/tab.test` (E0001): three files, with a tab in code, in a comment and in a text literal.
- `lex/ident-ascii.test` (E0001): a non-ASCII letter in an identifier.
- `lex/punct-semicolon.test` (E0001): `;`.
- `lex/punct-bracket.test` (E0001): `[`, `]` and `.`, one per file.
- `lex/bang-alone.test` (E0001): `let a = !true`.
- `lex/arrow.test` (E0100): `fn f() -> Int { }`. The `-` after `)` is not accepted by the grammar, so E0100 is at the `-`.
- `lex/ident-keyword.test` (E0003): `let let = 1` gives E0003 at the first `let`.
- `lex/ident-io.test` (E0003): `let io = 1` gives E0003 at `io`.
- `lex/text-bad-escape.test` (E0005): `\t` and `\q`, one per file.
- `lex/text-unterminated.test` (E0005): a text literal that ends at a line end.
- `lex/int-leading-zero.test` (E0006): `007` gives E0006.
- `lex/int-too-big.test` (E0500): `let a = 9223372036854775808`, and `let a = -9223372036854775808`, one per file.

Every rule that produces a token or error has at least one test above.

## Open questions

1. **RFC 0013 disagrees with this RFC in three places.** RFC 0013 is the kernel this draft cites, and it is itself rejected. (a) Its rule 3 says the tokens `[ ] .` are lexed and that any use is E0100. This draft makes them E0001 (rule 11). Designer-min's objection to `->` and `!` applies to `[ ] .` too, since none has a kernel production. (b) Its escapes and its print test include `\t`. This draft has no `\t` escape, as RFC 0012 did. (c) Its Lexical section takes RFC 0003 sections 1 to 12, which allow tabs as whitespace and suppress NEWLINE inside `[ ]`. If RFC 0013 is revived, its Lexical section should become a pointer to this RFC, and points (a) to (c) should be edited to match. Whether to restore the `\t` escape is for the group to decide.
2. **CR LF.** This RFC keeps CR LF as one line end, as RFC 0003 and RFC 0012 did. If the group prefers LF only, rule 3 loses its CR LF clause and `lex/ws-crlf.test` is removed.
3. **E0003 block.** E0003 is reported by the parser, but it sits in the lexical block because RFC 0004's record test expects that code. If RFC 0004 wants lexical codes to come only from the lexer, E0003 should move to a new syntax code. That is a new code, since codes are never reused, and it must be chosen before any PR emits E0003.
