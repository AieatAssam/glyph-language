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

Status: draft. Slug: diagnostic-style-v2. Class: language. Number assigned by the orchestrator.
Replaces RFC 0004 (superseded). Amends, in the places named here and nowhere else: RFC 0005 and RFC 0020 TR1 (the trap line form), and RFC 0011 section 5 (the E0010 record). The trap exit status and kind spelling are not decided here; see Open question 2.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict with RFC 0005 and RFC 0020 TR1: a trap wrote plain text while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, keys in the order given here, and strings in standard JSON escaping. No other output format exists. A compile that finishes with no records writes nothing to standard error and exits with status 0. A compile that writes one or more records exits with status 1. Usage errors are not compile errors and are outside this RFC.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: reserved. The compiler never writes it, because every record it writes is an error and an absent key means `error`. The value `"warning"` is reserved and never written. A later RFC that writes this key puts it between `code` and `span`.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key.

   Example, a leading zero in `007` at bytes 0 to 3:
   `{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

   Example, a path that does not end in `.gl` (this replaces the record in RFC 0011 section 5; the file is not read):
   `{"code":"E0010","span":{"start":0,"end":0}}`

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

5. **Runtime traps.** A trap ends the program through WASI `proc_exit`, with the exit status and kind spelling that Open question 2 settles. Before exiting, the runtime writes exactly one line to standard error: `{"trap":"<kind>"}` followed by one LF. This RFC changes only the line form, from the plain text `trap: <kind>` of RFC 0020 TR1 to this JSON form. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines. The runner compares the keys `code`, `span` and `fix`, and `severity` where a test gives it. A run test states its expected stderr exactly.

8. **Compiler records.** The record writer takes a code, a span and an optional fix. It has no input for a file, a line, a column or a message. Every record the compiler builds, including the lexical records and the E0010 record, is written by that writer and has only the keys in section 2.

## Alternatives

- **Keep `message`.** Rejected. The model that repairs code reads the code, the span and the source bytes. A sentence adds tokens to every record and the catalogue already gives each code a meaning.
- **Keep `line` and `column`.** Rejected. They are a function of `span.start` and the source bytes. Keeping them adds a second way to say the same thing and a way for the two to disagree.
- **Keep `file`.** Rejected for now. Each compile reads one file. A multi-file build needs one new key, and a later RFC can add it.
- **Required `severity`.** Rejected. Every record is an error, so the default covers all of them and costs no tokens.
- **Trap as plain text.** Rejected. It gives stderr two formats. A JSON trap line keeps one reader for everything on stderr.
- **Human text by default, JSON with a flag.** Rejected, as in RFC 0004: two formats means two ways to read one error.

## Cost

Adds to the spec core: the record and trap shapes (sections 1, 2 and 5) and the code table. Estimated at about 300 tokens. Not measured: the protected tokeniser is not available to this session, so the merge bot's count is the real figure.

Removes, compared with RFC 0004: the message rule (its one-sentence, lowercase-first, no-full-stop and 20-byte rules), the `file`, `line` and `column` fields, the required `severity`, and the trap's plain-text form. Estimated saving per record: about 40 to 60 tokens, and the message rule itself is gone. Net change to the spec core is negative (estimate).

Spec card: the record shape becomes one line of about 30 tokens (it was about 120). The trap line is one line. The block table stays (about 60 tokens). The card stays well under its 2,000-token cap.

Files the implementing PR changes, because they now disagree with this RFC:
- `compiler/stage0/src/diagnostic.ts`: the writer and its `Span` and `Diagnostic` types lose `file`, `line`, `column` and `message`.
- `compiler/stage0/src/cli.ts`: the E0010 record has no message, file or span position.
- `compiler/stage0/src/lexer/records.ts`: the message table goes; the record builder takes the code and the span.
- Node tests that assert the old keys, changed and not deleted: `diagnostic.test.ts`, `diagnostic-order.test.ts`, `cli.test.ts`, `lexer/records.test.ts`, `e0010.test.ts`, `catalogue.test.ts`, and `lexer/codes.test.ts`.
- `spec/core/diagnostic.md`, `spec/card.md` and `spec/errors.json` (drop `message`; `meaning` is at most ten words).

Not changed until the owner confirms Open question 1: `compiler/stage0/src/message.ts` and `message.test.ts`.

## Test plan

Each conformance test file has a `--- meta` block with `id`, `rfc` (this RFC's number) and `kind`.

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. No `fix`. Compares JSON.
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`.
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `diag/no-output-clean.test` (run): a valid program writes nothing to standard error and exits 0.
- `diag/trap-line.test` (run): a program that evaluates `1 / 0` writes exactly one trap line, `{"trap":"<kind>"}` with the kind Open question 2 gives, and a newline to standard error. The exit status is the one Open question 2 gives.
- `diag/trap-overflow.test` (run): `4611686018427387904 * 2` writes exactly one trap line with the overflow kind, and exits with the status Open question 2 gives.
- `diag/keys.test` (node test): every record in every compile-error test uses only the keys `code`, `span` and `fix`, and `span` and `fix.span` use only `start` and `end`.
- `diag/catalogue.test` (node test): every code in a test's expected records exists in `spec/errors.json`, no code is listed twice, and every code lies in its block.
- `diag/retired.test` (node test): a code with `"retired":true` cannot be emitted.

Writer tests (node, `compiler/stage0/src/diagnostic.test.ts`):
- A record with no fix writes exactly `{"code":"E0100","span":{"start":4,"end":7}}`.
- A record with a fix writes the keys `code`, `span`, `fix` in that order, and `fix` has the keys `span` and `replacement` in that order.
- A record never writes `severity`, `file`, `line`, `column` or `message`, whatever its input.
- The E0010 record writes exactly `{"code":"E0010","span":{"start":0,"end":0}}`.

Every conformance test in this list is new. None edits an existing conformance test. The node tests named in Cost are edited to the new shape, which is allowed because they are not conformance tests.

## Open questions

1. **Owner ruling of 2026-11-20.** That ruling, in RFC 0004 and RFC 0011, sets the message-sentence rule for records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so the rule has no target. The owner must confirm that this supersedes the ruling before the PR that deletes `message.ts` and its test is merged. Until then those files stay unchanged and still pass, and the record writer no longer calls them.
2. **Trap exit status and kind spelling.** RFC 0020 TR1 (accepted, and what the code implements) says status 1 and the kinds `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`. RFC 0005 and RFCs 0006, 0008, 0009 and 0010 say status 3 and the kinds `overflow`, `divide by zero` and `stack exhausted`. A later RFC must choose one set and name each RFC it changes. Until then the trap PRs wait, and the current code stays as it is.
3. **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
4. **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
