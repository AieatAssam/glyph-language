# Lexical rules

Normative. "Must" and "is" bind implementers. A *character* is a Unicode scalar value. A *byte* is an 8-bit value. A *word character* is an ASCII letter, an ASCII digit or `_`. A *word token* is a token whose last character is a word character.

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
