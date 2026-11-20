# RFC draft: Lexical structure and core syntax

Class: language
Slug: lexical-syntax-v2
Status: draft
Replaces: RFC 0003 (rejected). Token set is the one in the Lexical section of RFC 0005 (kernel). Diagnostic codes follow RFC 0004 §4.

## Summary

This RFC fixes how a Glyph source file becomes tokens: which bytes are allowed, how line ends, comments, identifiers and keywords work, the literal forms, and the complete token set. The token set is:

- Punctuation and operators: `( ) { } , : = -> ! + - * / % == != < <= > >=`
- Effect marker: `!io` (one token)
- Keywords: `fn let var if else while return true false and or not example`
- Literals: decimal integers, and double-quoted text with the escapes `\n`, `\"` and `\\`.

A line end outside `( )` emits one `NEWLINE` token. The lexer does not decide which `NEWLINE`s end a statement; the parser does. This RFC does not define expressions, bindings, functions or loops. Those belong to the kernel, RFC 0005.

## Motivation

Models writing Glyph need one tokenisation rule they can apply without guessing. RFC 0003 and RFC 0005 disagreed on the token set, tabs, the `\t` escape and the reserved words, so no implementer could build both. This RFC settles one set and one line-end rule. It adds no token that the kernel does not use.

No benchmark finding is cited. This is a conflict repair, not a new feature.

Changes from RFC 0003, each answering a recorded objection:

- The token set is RFC 0005's. `->`, `!` and `!io` are tokens. `:` is the result-type marker. `;` and `.` are not tokens, and `[ ]` is not a token, so the line-end bracket rule covers only `( )`.
- The reserved words are RFC 0005's thirteen, including `var` and `example`.
- A tab is an error everywhere, not whitespace.
- The escapes are `\n`, `\"` and `\\` only. `\t` is an error.
- Every line end outside `( )` emits one `NEWLINE`. Section 14 defines the exact rule. The statement meaning moves to the parser.
- Lexical errors use the codes that RFC 0004 §4 reserves for lexical errors (E0001 to E0099). They do not use RFC 0005's E0100 block.
- The kernel is cited as RFC 0005.

## Design

Normative. Terms: a *character* is a Unicode scalar value. A *byte* is an 8-bit value. An error is reported at the span given for it in the table at the end of this section.

1. **Encoding.** A source file is a byte sequence that must be valid UTF-8. Invalid UTF-8 is error E0001 at the first invalid byte. A byte order mark is error E0001 wherever it appears.

2. **Forbidden control characters.** The control characters U+0000 to U+001F and U+007F are errors wherever they appear, including in comments and text literals, except the LF and the CR that belongs to a CR LF pair (rule 3). Tab (U+0009) is one of these: a tab anywhere is error E0001.

3. **Line ends.** A line end is LF (U+000A), or CR LF (U+000D U+000A) taken as one line end. A CR that is not followed by LF is error E0001 at that CR. A line end's span is its bytes.

4. **Whitespace.** Space (U+0020) and line ends are whitespace. Whitespace separates tokens and produces no token, except where rule 14 emits a `NEWLINE`.

5. **Comments.** Outside a text literal, `//` starts a comment that runs up to, not including, the next line end. Comments have no block form. A comment produces no token. Its contents are any valid UTF-8 characters that rule 2 allows.

6. **Identifiers.** An identifier is one ASCII letter or `_`, followed by zero or more ASCII letters, digits or `_`. Identifiers are case-sensitive. A non-ASCII character outside a text literal or comment is error E0001 at that character.

7. **Keywords.** These thirteen words are keywords. They are lowercase only: `fn let var if else while return true false and or not example`. A keyword lexes as its own token kind, never as an identifier. A keyword in a position that needs a name is error E0003, reported by the parser at the keyword's span. `Int`, `Bool`, `Text` and `print` are not keywords. They lex as identifiers.

8. **Integer literals.** A decimal integer is `0`, or a digit `1` to `9` followed by zero or more digits `0` to `9`. A digit sequence with a leading zero, such as `007`, is error E0006 at the literal. Underscores are not allowed in literals. The lexer records the digits as written. The range rule of RFC 0005 applies to the value, not to the lexer.

9. **Text literals.** A text literal starts with `"` and ends at the next `"`. Between the quotes are:
   - any valid UTF-8 character except `"`, `\`, and the characters that rule 2 forbids (each of which is error E0001); and
   - the escapes `\n` (LF), `\"` (quote) and `\\` (backslash).

   Any other `\` sequence is error E0005 at the backslash and the character after it. A line end before the closing quote, or the end of file before it, is error E0005 at the span from the opening quote to the end of that line. The token's value is the decoded bytes, in UTF-8. Text literals have no other form.

10. **Punctuation and operators.** The tokens are exactly: `( ) { } , : = -> ! + - * / % == != < <= > >=`. The lexer takes the longest listed token that starts at the current character. So `->` is one token, `==` is one token and `<=` is one token. `=>` is two tokens (`=` then `>`).

11. **Effect marker.** When `!` is followed by `io`, and the character after `io` is not an ASCII letter, digit or `_` (or the file ends there), the lexer emits the single token `!io`. Otherwise `!` alone is the token `!`, or `!=` if the next character is `=`. `!ion` lexes as `!` then the identifier `ion`.

12. **Other characters.** Any printable ASCII character that rules 5 to 11 do not cover is error E0001 at that character. This includes `;`, `[`, `]`, `.`, `#`, `'`, `?`, `@`, `$`, `^`, `&`, `|`, `~`, `` ` `` and `\` outside a text literal.

13. **Token kinds.** Each token has exactly one kind. Each keyword, each punctuation token and `!io` has its own kind. The other kinds are IDENT, INT, TEXT, NEWLINE and EOF. A token that the grammar does not accept is a syntax error. The parser reports it with E0100, as RFC 0005 defines it. This RFC adds no syntax code.

14. **NEWLINE.** A line end emits one `NEWLINE` token, with the line end's span, if all three of the following hold:
    - the parenthesis depth is zero, where `(` adds one and `)` subtracts one, and a `)` at depth zero leaves the depth at zero (the parser reports it);
    - at least one token has already been emitted in this file; and
    - the last token emitted is not `NEWLINE`.

    A line end inside `( )` emits nothing. Consecutive blank lines produce one `NEWLINE`, and blank lines at the start of the file produce none.

15. **End of file.** At end of file, the last line is ended as if a line end were there, under the rule in 14. The lexer then emits one `EOF` token. A file that ends inside `( )` gets no `NEWLINE` from that end, and the parser reports the unclosed group.

16. **Lookahead and errors.** The lexer uses at most four characters of lookahead, for the `!io` check. It reports the first lexical error and stops. It emits no tokens after that error. Diagnostic records follow RFC 0004 §2 and §3.

Error table. Codes are new unless marked. Codes are assigned in `spec/errors.json` by the PR that first emits them (RFC 0004 §4).

| Code | Meaning | Span | Rules |
| --- | --- | --- | --- |
| E0001 | Invalid byte or character: invalid UTF-8, byte order mark, forbidden control character including tab, lone CR, non-ASCII outside text and comments, printable ASCII outside the token set. Same meaning as in RFC 0001 (superseded). | The offending byte or character | 1, 2, 3, 6, 9, 12 |
| E0003 | Keyword where a name is required. Reported by the parser. | The keyword | 7 |
| E0005 | Malformed text literal: unknown escape, or a line end or end of file before the closing quote. | See rule 9 | 9 |
| E0006 | Integer literal with a leading zero. | The literal | 8 |

Codes not in this table are not used by this RFC. In particular, E0002 and E0004 are not used. RFC 0001 used them for syntax cases, and it is superseded.

## Alternatives

- **Tabs as whitespace, and a `\t` escape (RFC 0003).** Rejected. RFC 0005 bans tabs. Two ways to write indentation and a tab escape add choice that the formatter would have to remove.
- **Lexical errors in the syntax block, E0100 (RFC 0005).** Rejected. RFC 0004 §4 reserves E0001 to E0099 for lexical errors. RFC 0004.plan already notes that RFC 0005's codes must be re-blocked.
- **Keyword as a name is a plain syntax error (E0100).** Rejected for now. It would be simpler, but it would make RFC 0004's record test (`let let = 1` gives E0003) wrong. The test is in RFC 0004's plan and is kept.
- **Brackets `[ ]` also suppress NEWLINE (RFC 0003).** Rejected. `[` and `]` are not in the kernel's token set. Adding them without a grammar production would break the rule that every token has a use.
- **Semicolons as statement terminators.** Rejected. They add a second way to end a statement. The NEWLINE rule gives one way.
- **Block comments and doc comments.** Rejected for the kernel. A doc form can come in its own RFC if the benchmark shows a need.
- **Unicode identifiers with normalisation.** Rejected. It needs a normalisation table in the spec and creates lookalike names.
- **Raw strings and string interpolation.** Deferred. Interpolation would add an implicit conversion.
- **LF only (no CR LF).** Not chosen here. See Open questions.

## Cost

Core spec: Design sections 1 to 16 and the error table add about 1,200 tokens. This is an estimate. The tokeniser script gives the real figure, and the merge bot checks the 12,000-token limit.

Removes: if RFC 0005 is revived, its Lexical section (its items 1 to 6, about 200 tokens) becomes a pointer to this RFC. That is the simplification that pays for this text. Until then, the spec would hold the lexical rules twice. The merge bot must not accept both copies.

Spec card: adds the thirteen keywords (one line), the token set (one line per group, about 150 tokens in all), and the NEWLINE rule in one line. The card stays far under its 2,000-token limit. Note: `spec/card.md` is not present in this checkout, so the current card size cannot be checked here.

## Test plan

Conformance tests live in `conformance/lex/`. Each test file holds one program and its expected result, either stdout with exit status or the expected diagnostic record (code, span and fix, as RFC 0004 §7 states).

Run tests:

- `lex/ws-crlf.test` (run): a program with CRLF line ends runs and prints the same output as its LF form.
- `lex/comment-line.test` (run): a `//` comment is ignored to the end of its line, and a `//` inside a text literal is text.
- `lex/newline-in-group.test` (run): a line end inside `( )` produces no `NEWLINE`.
- `lex/newline-blank.test` (run): several blank lines, and blank lines at the start of the file, produce at most one `NEWLINE`.
- `lex/text-escape.test` (run): `\n`, `\"` and `\\` produce the expected bytes.
- `lex/effect-token.test` (run): `fn main() !io {` lexes `!io` as one token and the program runs.
- `lex/punct-<name>.test` (run): one test for each of the twenty punctuation tokens, in `lex/punct-*.test`, so the coverage script finds one per token. A test for `!io` is in `lex/effect-token.test`.

Compile-error tests:

- `lex/bad-utf8.test` (E0001): an invalid UTF-8 byte.
- `lex/bom.test` (E0001): a byte order mark at the start of the file.
- `lex/cr-alone.test` (E0001): a CR not followed by LF.
- `lex/tab.test` (E0001): a tab in code, in a comment, and in a text literal, one per test file.
- `lex/ident-ascii.test` (E0001): a non-ASCII letter in an identifier.
- `lex/punct-semicolon.test` (E0001): `;` gives E0001.
- `lex/ident-keyword.test` (E0003): `let let = 1` gives E0003 at the first `let`.
- `lex/text-bad-escape.test` (E0005): `\t` and `\q` each give E0005.
- `lex/text-unterminated.test` (E0005): a text literal that ends at a line end.
- `lex/int-leading-zero.test` (E0006): `007` gives E0006.
- `lex/bang-alone.test` (E0100): a `!` that is not part of `!io` or `!=`, in a position where the grammar does not accept it, gives E0100 from the parser.

## Open questions

1. **CR LF.** This RFC keeps CR LF as one line end, as RFC 0003 did and as `lex/ws-crlf.test` expects. RFC 0005 says "Line endings are LF". If the group prefers one line-end form, it should choose LF only before acceptance. That change deletes rule 3's CR LF clause and `lex/ws-crlf.test`.
2. **RFC 0005.** RFC 0005 is rejected in its own right. Its token set matches this RFC. If it is revived, its Lexical section should become a pointer here, and its tab and escape codes should move from E0100 to E0001 and E0005, as RFC 0004 §4 requires.
3. **E0001 and E0003 history.** RFC 0001 used E0001 for an invalid character, which this RFC uses in the same sense. It used E0003 for a syntax case, which this RFC does not use. RFC 0001 is superseded and no catalogue entry exists, so no code has been assigned to it. The orchestrator should confirm that this is not a reuse.
4. **E0003 phase.** E0003 is reported by the parser, not the lexer, but it sits in the lexical block because RFC 0004's record test expects that code. If RFC 0004 wants lexical codes to come only from the lexer, this one should move to a syntax code.
