# Diagnostics

Every compiler diagnostic is one JSON object on one line of standard error (JSON Lines). No other output format exists.

## Record

A record has these fields, in this order:

- `code`: `E` followed by four digits, such as `E0001`.
- `severity`: `error` or `warning`. `warning` is reserved; no warnings are defined yet.
- `message`: one sentence, lowercase first word, no trailing full stop, no quoted source text longer than 20 bytes.
- `span`: `{file, start, end, line, column}`. `file` is the path as given on the command line. `start` and `end` are byte offsets, `end` exclusive. `line` and `column` are 1-based; column counts bytes.
- `fix`: optional `{span, replacement}`. Replacing the bytes at `span` with `replacement` (UTF-8, possibly empty) makes the code valid without changing meaning the author could not infer. Present only when one edit does that.

A program with no errors writes no diagnostic lines and exits with status 0.

## Order

Records are written in order of `span.start`, then `code`. Lexical errors stop compilation after the first one; later phases may report several records.

## Codes

Each code is listed once in `spec/errors.json` with a message template and a one-line meaning. Codes are never reused. A removed code stays in the file marked `retired`. A new code takes the next unused number in its block:

| Block | Codes |
| --- | --- |
| lexical | E0001 to E0099 |
| syntax | E0100 to E0199 |
| types | E0200 to E0299 |
| name resolution | E0300 to E0399 |
| effects and capabilities | E0400 to E0499 |
| limits and constants | E0500 to E0599 |

A message template may change wording in a later RFC without changing its code.

## Tests

A compile-error test states its expected records as JSON. The runner compares `code`, `span` and `fix`, not `message`.

## Runtime traps

A runtime trap is not a diagnostic. A trap ends the program with exit status 1 and writes one line `trap: <kind>` to standard error. Traps carry no code. The trap names are listed by the kernel RFC.
