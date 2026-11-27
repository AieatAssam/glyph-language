# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one JSON object per line on standard error.

Fields in order: `code` (E + 4 digits), `severity` (error), `message` (one lowercase sentence, no final full stop), `span` {file, start, end, line, column} (byte offsets, end exclusive, 1-based line and byte column), optional `fix` {span, replacement}.

No errors: no diagnostic lines, exit 0. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E0001-E0099 lexical, E0100-E0199 syntax, E0200-E0299 types, E0300-E0399 names, E0400-E0499 effects, E0500-E0599 limits. Codes live in spec/errors.json and are never reused.

# Card: lexical

UTF-8. E0001: BOM, control char (TAB, CR) except LF, non-ASCII outside text, `: ; [ ] . # ! ?` etc. LF outside text: E0002.

Gap between tokens: one space if both sides are word chars (letter, digit, _), else none. Else E0002, fix = canonical gap. No comments: `//` is two `/`.

Word: [A-Za-z_][A-Za-z0-9_]*. Keywords (only these): let var if else wh ret true false and or not ex io put fail. `fn`, `while`, `return`, `print` are words.

Int: 0 or [1-9][0-9]*. Max 9223372036854775807 (E0500). Leading zero E0006, fix drops zeros (`007` to `7`).

Text: "..."; raw LF is content; escapes \" and \\ only; else E0005. Unclosed: E0005 to EOF.

Tokens: ( ) { } , = == != < <= > >= + - * / %.

# Card: syntax

Decl: NAME [ "(" NAME Type {, NAME Type} ")" ] [Type] [io] [fail] { stmts [ret [e]] } { ex e }. No parameters, no parens. Types: Int, Bool. Mark order: result, io, fail.

Stmt, no separator: let x=e | var x=e | x=e | f(args) | put e | if e {..} [else {..}] | wh e {..}.

ret is last in its block. ex only after a declaration block. Comparisons do not chain.

Expr: or, and, cmp (== != < <= > >=), + -, * / %, unary (- not), primary (INT TEXT true false NAME [(args)] (e)).

Keyword where a name is required: E0003. Other unexpected token or EOF: E0100.
