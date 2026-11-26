# Diagnostics

Every compiler diagnostic is one JSON object on one line of standard error (JSON Lines). No other output format exists. Records follow RFC 0050, which replaces RFC 0004's record.

## Record

A record has these keys, in this order:

- `code`: `E` followed by four digits, such as `E0006`. Required.
- `severity`: optional. Absent means `error`. `warning` is reserved; no warnings are defined, so the compiler never writes it.
- `span`: `{"start":N,"end":N}`. Byte offsets into the one source file named on the command line; `end` is exclusive. Required.
- `fix`: optional `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing meaning the author could not infer. Present only when one edit does that.

No other key is written. Line and column are derived from `span.start` by a tool when needed. Each record is written compactly, with no spaces.

Example, a leading zero in `007` at bytes 0 to 3:

`{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

A program with no errors writes no diagnostic lines and exits with status 0.

## Order

Records are written in order of `span.start`, then `code`. Lexical errors stop compilation after the first one; later phases may report several records.

## Codes

Each code is listed once in `spec/errors.json` as `{"code":"E0006","meaning":"..."}`. `meaning` is a noun phrase of at most ten words, for a reader of the catalogue. It is not written into records. Codes are never reused. A removed code stays in the file marked `"retired":true` with no other change. A new code takes the next unused number in its block:

| Block | Codes |
| --- | --- |
| lexical | E0001 to E0099 |
| syntax | E0100 to E0199 |
| types | E0200 to E0299 |
| name resolution | E0300 to E0399 |
| effects and capabilities | E0400 to E0499 |
| limits and constants | E0500 to E0599 |

## Tests

A compile-error test states its expected records as JSON lines. The runner compares `code`, `severity` (absent means `error`), `span` and `fix`. A run test states its expected standard error exactly.

## Runtime traps

A runtime trap is not a diagnostic. A trap ends the program with exit status 1 and writes one line `trap: <kind>` to standard error. Traps carry no code. The trap names are listed by the kernel RFC.
