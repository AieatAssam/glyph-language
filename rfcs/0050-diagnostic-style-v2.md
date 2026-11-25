---
status: accepted
votes:
  designer-prag: approve
  designer-safe: reject
  impl-1: approve
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Diagnostic style

Status: accepted. Slug: diagnostic-style-v2. Class: language. Number: 0050.
Replaces RFC 0004 (superseded). Amends RFC 0020 TR1 in one place: the stderr line for a runtime trap. The trap exit status and the trap kind spellings are those of RFC 0020 TR1, and this RFC does not change them.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and the exit status that RFC 0020 TR1 gives.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict: a trap wrote plain text (`trap: <kind>`, RFC 0020 TR1) while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, and keys in the order given here. No other output format exists. A program that compiles with no errors writes nothing to standard error and exits with status 0. A compile that writes one or more records exits with status 1. Usage errors keep the statuses RFC 0011 gives them.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. The value `"warning"` is reserved; this RFC defines no warnings, so the compiler never writes it.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required. A record that names no source position, such as E0010 for a path that is not a source file (RFC 0011 section 5), has span `{"start":0,"end":0}`.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid. Present only when one edit does this.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key.

   Example, a leading zero in `007` at bytes 0 to 3, if the lexical RFC gives E0006 a fix (see Open questions):
   `{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

3. **Order.** Records are written in order of `span.start`, then `code`. Lexical errors stop compilation after the first one (see the lexical RFC). Later phases may write several records.

4. **Codes.** Each code appears once in `spec/errors.json`, as an object `{"code":"E0006","meaning":"..."}`. `meaning` is a noun phrase of at most ten words, for a model reading the catalogue; it is not written into records. Codes are never reused. A removed code stays in the file with `"retired":true` and no other change. A new code takes the next unused number in its block:

   | Block | Codes |
   | --- | --- |
   | lexical | E0001 to E0099 |
   | syntax | E0100 to E0199 |
   | types | E0200 to E0299 |
   | name resolution | E0300 to E0399 |
   | effects and capabilities | E0400 to E0499 |
   | limits and constants | E0500 to E0599 |

5. **Runtime traps.** A trap ends the program with the exit status and the kind spelling that RFC 0020 TR1 gives: status 1 through WASI `proc_exit`, and kinds `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`. Before exiting, the runtime writes exactly one line to standard error:
   `{"trap":"<kind>"}`
   followed by one LF, in one write call. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `severity`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines, and the runner compares the keys `code`, `severity` (absent means `error`), `span` and `fix`. The runner checks stdout and exit for a `run` test, and exit and a stderr substring for a `trap` test. Neither checks the whole of standard error, so the exact-stderr and no-extra-key rules are tested by node tests (see Test plan).

## Alternatives

- **Keep `message`.** Rejected. The model that repairs code reads the code, the span and the source bytes. A sentence adds tokens to every record and the catalogue already gives each code a meaning.
- **Keep `line` and `column`.** Rejected. They are a function of `span.start` and the source bytes. Keeping them adds a second way to say the same thing and a way for the two to disagree.
- **Keep `file`.** Rejected for now. Each compile reads one file. A multi-file build needs one new key, and a later RFC can add it.
- **Required `severity`.** Rejected. Every record is an error, so the default covers all of them and costs no tokens.
- **Trap as plain text.** Rejected. It gives stderr two formats. A JSON trap line keeps one reader for everything on stderr.
- **Human text by default, JSON with a flag.** Rejected, as in RFC 0004: two formats means two ways to read one error.
- **Change the trap status to 3 (RFC 0005).** Not taken here. RFC 0020 TR1 is accepted and the code follows it. A change to status or spelling needs its own RFC that names RFC 0020 TR1 as amended.

## Cost

Adds to the spec core: the record and trap shapes (sections 1, 2 and 5) and the code table. Estimated at about 300 tokens. Not measured: the protected tokeniser is not available to this session, so the merge bot's count is the real figure.

Removes, compared with RFC 0004: the message rule (its one-sentence, lowercase-first, no-full-stop and 20-byte rules), the `file`, `line` and `column` fields, the required `severity`, and the trap's plain-text form. Estimated saving per record: about 40 to 60 tokens, and the message rule itself is gone. Net change to the spec core is negative (estimate).

Spec card: the record shape becomes one line of about 30 tokens (it was about 120). The trap line is one line, with status 1 as RFC 0020 TR1 gives it. The block table stays (about 60 tokens). The card stays well under its 2,000-token cap.

Files the implementing PR changes, because they now disagree with this RFC: `spec/core/diagnostic.md` (its record shape and trap rule), `spec/card.md` (its record shape and trap line), `spec/errors.json` (drop `message`, add `meaning`), and the compiler's record writer, its two callers (`cli.ts` and `lexer/records.ts`), and the message checker's tests.

## Test plan

Each conformance test file has a `--- meta` block with `id`, `rfc` (0050) and `kind`. The runner does not support a `check` kind, so the rules that a `check` would have covered are node tests.

Node tests. These run in `compiler/stage0/src/**/*.test.ts` and do not need the front end:

- `diagnostic.test.ts`: a `Diagnostic` built by hand for `let let = 1`, with code `E0100` and span 4 to 7, writes exactly `{"code":"E0100","span":{"start":4,"end":7}}`. It has no `fix` key.
- `diagnostic.test.ts`: a record with a fix writes `fix` after `span`, with `fix.span` and `replacement`. E0006 at bytes 0 to 3 with replacement `7` writes the example in Design section 2.
- `diagnostic.test.ts`: a record never writes `file`, `line`, `column` or `message`, even when the object given to the writer has them.
- `diagnostic-order.test.ts`: two leading-zero records at bytes 2 and 20; `firstLexicalOnly` keeps only the record at byte 2.
- `diagnostic-keys.test.ts`: every record the compiler writes has only the keys `code`, `severity`, `span` and `fix`, and `span` and `fix.span` have only `start` and `end`. The E0010 record for a non-source path is exactly `{"code":"E0010","span":{"start":0,"end":0}}`.
- `diagnostic-keys.test.ts`: every code in `spec/errors.json` appears once, lies in its block, and a code with `"retired":true` is not written by the compiler.
- `trap.test.ts` and `kernel/rt-trap.test.ts`: the trap line is exactly `{"trap":"<kind>"}` and one LF, in one write call, for each kind in Design section 5. It has no `code`, `span` or `fix`.
- `diagnostic-stderr.test.ts`: a valid program writes nothing to standard error and exits 0, using `compile()` and the toolkit's `run()`. It runs when the front end exists (see the conformance list below).

Conformance tests. These go in `conformance/diag/`. Each is written when `check` writes records (the front end), and until then the node tests above stand:

- `diag/record-shape.test` (compile-error): `let let = 1` expects the record `{"code":"E0100","span":{"start":4,"end":7}}`, in JSON form.
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 expects the E0006 record with its fix, if E0006 carries a fix (see Open questions).
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20 expect only the record for byte 2.
- `diag/no-output-clean.test` (run): a valid program with empty expected stdout and exit 0.
- `diag/trap-line.test` (trap): `print(1 / 0)` expects exit 1 and stderr containing `{"trap":"divide-by-zero"}`.
- `diag/trap-overflow.test` (trap): `print(4611686018427387904 * 2)` expects exit 1 and stderr containing `{"trap":"overflow"}`.

Existing node tests that assert the removed keys (`diagnostic.test.ts`, `diagnostic-order.test.ts`, `lexer/records.test.ts`, `e0010.test.ts`) are updated to the new shape in the same PR. No conformance test is edited, and no conformance test is deleted.

## Open questions

- **Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so that rule has no target. Removing the checker and its test needs the owner to confirm the supersession before that PR is merged. Until then the checker stays. The record writer and the catalogue change do not depend on this.
- **Trap status and kind spelling.** This RFC keeps RFC 0020 TR1. RFC 0005 gave status 3 and different spellings for two kinds, and RFC 0006, 0008, 0009 and 0010 follow RFC 0005. Which is right is for a later RFC that names RFC 0020 TR1 as amended.
- **E0006 fix.** Whether the leading-zero error E0006 carries a fix is for the lexical RFC. This RFC defines the shape of a fix only. Until the lexical RFC rules, the `fix` examples here are not expected output.
- **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
