# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one JSON object per line on standard error.

Fields in order: `code` (E + 4 digits), `severity` (error), `message` (one lowercase sentence, no final full stop), `span` {file, start, end, line, column} (byte offsets, end exclusive, 1-based line and byte column), optional `fix` {span, replacement}.

No errors: no diagnostic lines, exit 0. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E0001-E0099 lexical, E0100-E0199 syntax, E0200-E0299 types, E0300-E0399 names, E0400-E0499 effects, E0500-E0599 limits. Codes live in spec/errors.json and are never reused.

# Card: lexical

Source is UTF-8. Tab, other control characters, a lone CR, a byte order mark, and non-ASCII outside text and comments are E0001. Line ends: LF, or CR LF as one.

Keywords (14): fn let var if else while return true false and or not example io.

Punctuation (18): ( ) { } , : = == != < <= > >= + - * / %. Comments: `//` to end of line only.

Token kinds: IDENT INT TEXT NEWLINE EOF, plus one kind per keyword and per punctuation token.

NEWLINE: a line end outside ( ) emits one NEWLINE if a token came before it and the last token is not NEWLINE. Blank lines give one. The last line counts as ended. Inside ( ) a line end emits nothing.
