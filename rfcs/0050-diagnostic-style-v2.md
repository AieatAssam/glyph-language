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
Replaces RFC 0004 (superseded). Amends RFC 0005 in its trap line (section "Traps (runtime)"). The trap line's status and kind spellings also differ from RFC 0020 TR1; that conflict is open (see Open questions, B1). This RFC does not settle it.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and a nonzero exit status.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict with RFC 0005: a trap wrote plain text while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, keys in the order given here, and strings escaped by the JSON rules and nothing else. No other output format exists.
   Exit status for a compile: a compile that writes one or more records exits with status 1. A compile that writes no records exits with status 0 and writes nothing to standard error. Command-line misuse exits with status 2 and writes no record, because no code applies to it.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. The value `"warning"` is reserved; this RFC defines no warnings, so the compiler never writes a `severity` key.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the source bytes that the compile read; `end` is exclusive. Required. When no source bytes are read, as for E0010 (a path that is not a source file), the span is `{"start":0,"end":0}`.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. The record does not name the file: the caller knows which file it compiled. Line and column are derived from `span.start` and the source bytes by a tool when it needs them. A build of several files needs a later RFC that adds one key.

   Example, a leading zero in `007` at bytes 0 to 3:
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

5. **Runtime traps.** A trap ends the program through WASI `proc_exit`. Before exiting, the runtime writes exactly one line to standard error:
   `{"trap":"<kind>"}` followed by a line feed,
   where `<kind>` is one of the trap kinds, spelled as in Open questions B1 settles. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`. Until B1 is settled, the exit status of a trap is also open.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `severity`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines. The runner compares the keys `code`, `severity` (absent means `error`), `span` and `fix`. A run test states its expected stdout and exit status. Checks that the runner cannot express are node tests, named in the Test plan.

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
- `spec/core/diagnostic.md`: its record shape and trap rule.
- `spec/card.md`: its record shape and its trap rule.
- `spec/errors.json`: drop `message`, shorten any `meaning` longer than ten words.
- `compiler/stage0/src/diagnostic.ts`: the record writer and its types. `Span` keeps `start` and `end` only. The record builder takes a code, a span and an optional fix, and nothing else.
- `compiler/stage0/src/lexer/records.ts` and `cli.ts`: the callers that build records. The `file` argument of the lexer's record builder is removed with the key.
- The message checker (`compiler/stage0/src/message.ts`) stays until Open questions B2 is settled.

## Test plan

Each conformance test file has a `--- meta` block with `id`, `rfc` (this RFC's number) and `kind`. The runner's kinds are `run`, `compile-error`, `trap` and `fmt` and `fix`. Every test below is new. None edits an existing test.

Conformance tests, in `conformance/diag/`:
- `record-shape.test` (kind `compile-error`): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. No `fix`. Compares JSON.
- `fix-present.test` (kind `compile-error`): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`. Waits on B3.
- `order.test` (kind `compile-error`): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `no-output-clean.test` (kind `run`): a valid program writes nothing to standard error and exits 0. The exact empty stderr is checked by a node test that runs the same program.
- `trap-line.test` (kind `trap`): `1 / 0` ends with the trap kind `divide by zero` on standard error. The exact line is checked by a node test. Waits on B1.
- `trap-overflow.test` (kind `trap`): `4611686018427387904 * 2` ends with the trap kind `overflow`. Waits on B1.

Node tests, in `compiler/stage0/src/`:
- `diagnostic-keys.test.ts`: every record the lexer and `cli.ts` produce has only the keys `code`, `severity`, `span` and `fix`, and `span` and `fix.span` have only `start` and `end`. Every record in every `diag/` compile-error test uses only those keys.
- `diagnostic-keys.test.ts`: every code in a `diag/` expected record exists in `spec/errors.json`, is listed once, and lies in its block. A catalogue entry with `"retired":true` is reported when its code is emitted.
- `kernel/rt-trap.test.ts`: the trap writes exactly `{"trap":"<kind>"}` and a line feed to standard error, for each kind, with the exit status B1 sets. Waits on B1.

## Open questions

- **B1. Trap status and spelling (open).** RFC 0005 gives trap exit status 3 and kinds `overflow`, `divide by zero`, `stack exhausted`. Accepted RFC 0020 TR1 gives exit status 1 and kinds `overflow`, `divide-by-zero`, `stack-exhausted`, `step-exhausted`, and the current code does that. This RFC does not decide between them. Recommendation: keep RFC 0020's status and spellings, and name RFC 0020 TR1 as amended in the line shape only. Until this question is settled here, trap status and kind spellings are not set, and the trap subtasks wait.
- **B2. Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so the rule has no target. The implementing PR would remove the checker and its test. That supersedes an owner ruling, so the owner should confirm it before the PR is merged. Until then the checker stays.
- **B3. Fix for E0006.** `fix-present.test` needs the lexical RFC to say that E0006 carries the fix that drops leading zeros. Until it does, the test waits and the record writer is still built and tested without it.
- **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
