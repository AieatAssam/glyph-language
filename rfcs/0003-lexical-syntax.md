# RFC draft: Lexical structure and core syntax

Status: draft. Slug: lexical-syntax. Class: language. Founding RFC 0002 (number assigned by the orchestrator).

## Summary

This RFC fixes how a Glyph source file is split into tokens, which characters are allowed, how comments and whitespace work, and the small set of punctuation that the kernel grammar will use. It does not define expressions, bindings, functions or loops. Those belong to the kernel RFC (0003), which will add grammar productions on top of the token set defined here.

## Motivation

Models writing Glyph need one tokenisation rule they can apply without guessing. Ambiguous lexing (optional semicolons, several comment forms, Unicode identifiers with normalisation rules) is a common source of repair loops. The benchmark has no finding yet that is specific to Glyph, so this RFC takes the smallest set that the kernel needs and nothing more.

## Design

Normative. All terms are as defined here.

1. **Source text.** A source file is a sequence of bytes that must be valid UTF-8. A file that is not valid UTF-8 is an error (E0001). A byte order mark at the start of the file is an error (E0001).

2. **Line endings.** A line ends at LF (U+000A). A CR immediately before an LF is part of the line ending. A lone CR is an error (E0001). Tabs are allowed only as whitespace inside a line.

3. **Whitespace.** Spaces (U+0020), tabs (U+0009) and line endings are whitespace. Whitespace separates tokens and is otherwise ignored, except that a line ending is a token (see 6).

4. **Comments.** A comment starts with `//` and runs to the end of the line. There are no block comments. A comment is discarded by the lexer and carries no meaning.

5. **Identifiers.** An identifier is a letter or underscore followed by zero or more letters, digits or underscores. Letters are ASCII `A`-`Z` and `a`-`z` only. Identifiers are case-sensitive. An identifier may not be one of the keywords in (7).

6. **Line end token.** Where a line ends and the previous token could end a statement, the lexer emits one `NEWLINE` token. Consecutive blank lines produce one `NEWLINE`. A line ending inside a bracketed group `( )` or `[ ]` produces no `NEWLINE`. The rule for which tokens end a statement is defined by the kernel RFC; this RFC defines only the token. There are no semicolons.

7. **Keywords.** The reserved words are: `let`, `fn`, `if`, `else`, `while`, `return`, `true`, `false`, `and`, `or`, `not`. No other word is reserved. Keywords are lowercase only.

8. **Integer literals.** A decimal integer is one or more digits `0`-`9`. Leading zeros are an error (E0001). Underscores are not allowed in literals. Literal range is checked by the kernel RFC, not here. The lexer produces the digits as written.

9. **Text literals.** A text literal is `"` followed by any characters except `"`, LF and `\`, then `"`. The escapes are `\n`, `\t`, `\"`, `\\`. Any other backslash sequence is an error (E0001). Text is UTF-8.

10. **Punctuation.** The complete set is: `( ) [ ] { } , : . = == != < <= > >= + - * / %`. Any other printable ASCII character outside a comment or text literal is an error (E0001). There is no `;`, no `->` and no `=>`; function result types use `:` as defined by the kernel RFC.

11. **Token budget rule.** Each token has exactly one kind. The lexer never backtracks more than one character.

12. **Error recovery.** The lexer reports the first lexical error and stops. Recovery is not defined in this RFC.

## Alternatives

- **Semicolons as statement terminators.** Rejected: they add a second way to end a line for the same meaning. Newline with the bracket rule gives one way.
- **Block comments and doc comments.** Rejected for the kernel. A doc form can be added later with its own RFC if the benchmark shows models need it.
- **Unicode identifiers with normalisation.** Rejected: it needs a normalisation table in the spec, which costs tokens and creates lookalike errors.
- **Raw strings and string interpolation.** Deferred. Interpolation would add an implicit conversion, which the constitution forbids in its current form.

## Cost

Adds to the spec core: about 600 tokens for sections 1 to 12. Removes nothing; this is the first lexical text.

Spec card: adds one table of 22 keywords and punctuation, about 150 tokens. It leaves room under the 2,000-token card cap.

## Test plan

Each rule above maps to at least one conformance test. Names are fixed now so the coverage script can match them.

- `lex/ws-crlf.test` (run): CRLF line endings compile and print nothing.
- `lex/comment-line.test` (run): a `//` comment is ignored to end of line.
- `lex/ident-keyword.test` (compile-error): `let let = 1` gives E0003.
- `lex/ident-ascii.test` (compile-error): a non-ASCII letter in an identifier gives E0001.
- `lex/bom.test` (compile-error): a BOM at file start gives E0001.
- `lex/cr-alone.test` (compile-error): a lone CR gives E0001.
- `lex/int-leading-zero.test` (compile-error): `007` gives E0001.
- `lex/text-escape.test` (run): `\n`, `\t`, `\"`, `\\` produce the expected bytes.
- `lex/text-bad-escape.test` (compile-error): `\q` gives E0001.
- `lex/punct-semicolon.test` (compile-error): `;` gives E0001.
- `lex/newline-in-group.test` (run): a line break inside `( )` produces no `NEWLINE`.
- `lex/newline-blank.test` (run): several blank lines produce one `NEWLINE`.

Every punctuation token has one test in `lex/punct-*.test`, checked by the coverage script.

## Open questions

- Whether `NEWLINE` should also end a statement after a closing `}`. The kernel RFC decides; this RFC only defines the token.
- Whether the error codes E0001 and E0003 are right for every case above. They depend on the diagnostic-style RFC (0004) and may be renamed there before either is accepted.
