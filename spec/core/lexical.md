# Lexical structure

Source: RFC 0014 (lexical-syntax-v3). Normative. "Must" and "is" are binding. A *character* is a Unicode scalar value. A *byte* is an 8-bit value.

## Rules

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

16. **Errors and lookahead.** The lexer uses at most one character of lookahead (rule 10). It reports the first lexical error (E0001, E0003 where the lexer sees it, E0005 or E0006) and emits no tokens after it. Records follow [diagnostic](diagnostic.md).

## Error table

Codes are assigned in `spec/errors.json` by the first PR that emits them.

| Code | Block | Meaning | Span | Rules |
| --- | --- | --- | --- | --- |
| E0001 | lexical | Invalid byte or character: invalid UTF-8, byte order mark, forbidden control character (including tab and lone CR), non-ASCII outside text and comments, or printable ASCII outside the token set (including `!` not followed by `=`) | The offending byte or character | 1, 2, 3, 6, 9, 11 |
| E0003 | lexical | Keyword where a name is required. Reported by the parser. | The keyword | 7 |
| E0005 | lexical | Malformed text literal: unknown escape, or a line end or end of file before the closing quote | See rule 9 | 9 |
| E0006 | lexical | Integer literal with a leading zero | The literal | 8 |
| E0100 | syntax | Unexpected token: the grammar does not accept this token at this position | The token | 10, 13, 14, 15 |
| E0500 | limits | Integer literal above 9223372036854775807. Reported by the checker. | The literal | 8 |

Codes not in this table are not used by the lexical rules.
