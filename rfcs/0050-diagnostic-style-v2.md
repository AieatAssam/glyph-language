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
Replaces RFC 0004 (superseded). Amends RFC 0005 in one place: the output line for a runtime trap (section "Traps (runtime)"). The trap status and kinds in section 5 conflict with accepted RFC 0020 and are not settled; see Open questions. Record shape, order and codes do not depend on that decision.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and exit status 3.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict with RFC 0005: a trap wrote plain text while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, and keys in the order given here. No other output format exists. A program that compiles with no errors writes nothing to standard error and exits with status 0. A compile that writes one or more diagnostic records exits with status 1.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. The value `"warning"` is reserved. This RFC defines no warnings, so the compiler never writes the key: the writer writes `severity` only when its value is `warning`, and no record produced under this RFC has that value.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required. The span object has no other key.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key.

   A record about the whole file, not a byte range, has span `{"start":0,"end":0}`. E0010 (a path that does not end in `.gl`; the file is not read) is such a record.

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

5. **Runtime traps.** A trap ends the program with exit status 3 through WASI `proc_exit`. Before exiting, the runtime writes exactly one line to standard error:
   `{"trap":"<kind>"}`
   where `<kind>` is one of the kinds RFC 0005 lists, spelled exactly as RFC 0005 spells them: `overflow`, `divide by zero`, `stack exhausted`. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`. The status and the kind spellings here are open; see Open questions.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `severity`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines. The runner compares the keys `code`, `severity` (absent means `error`), `span` and `fix`. A run test states its expected stderr exactly.

8. **Writer contract.** `toJsonLine` takes a record with the fields `code`, `span` (`start` and `end` only) and an optional `fix`, and returns the JSON of section 2 with no line feed. A caller that builds a record supplies those fields and no others. No caller looks up message text. The internal types used by tools may still hold `file`, `line` and `column`, but a record type passed to the writer does not, and the writer never writes them. Removing message text from records does not remove the message checker in `message.ts`; that is settled by the owner ruling (see Open questions), not by this section.

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

Files the implementing PR changes, because they now disagree with this RFC: `spec/core/diagnostic.md` (its record shape and trap rule), `spec/card.md` (it says trap exits 1, and the record shape), `spec/errors.json` (drop `message`, add `meaning`), and the compiler's record writer and message checker.

## Test plan

Each conformance test file has a `--- meta` block with `id`, `rfc` (this RFC's number) and `kind`.

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. No `fix`. Compares JSON.
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`.
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `diag/no-output-clean.test` (run): a valid program writes nothing to standard error and exits 0.
- `diag/trap-line.test` (run): a program that evaluates `1 / 0` writes exactly `{"trap":"divide by zero"}` and a newline to standard error, and exits with status 3.
- `diag/trap-overflow.test` (run): `4611686018427387904 * 2` writes exactly `{"trap":"overflow"}` and exits with status 3.
- `diag/keys.test` (check): every record in every compile-error test uses only the keys `code`, `severity`, `span` and `fix`, and `span` and `fix.span` use only `start` and `end`.
- `diag/catalogue.test` (check): every code in a test's expected records exists in `spec/errors.json`, no code is listed twice, and every code lies in its block.
- `diag/retired.test` (check): a code with `"retired":true` cannot be emitted.

Node tests for the writer (not conformance tests; the runner cannot check their output). `diagnostic.test.ts` checks that `toJsonLine` writes the keys of section 2 in that order, writes no `severity` for an error, writes `span` with only `start` and `end`, writes `fix` only when given, and never writes `file`, `line`, `column` or `message`. `diagnostic-order.test.ts` checks the order of section 3. A whole-file record (E0010) has span `{"start":0,"end":0}` and no `fix`.

Every test in this list is new. None edits an existing test.

## Open questions

- **Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so the rule has no target. The implementing PR would remove the checker and its test. That supersedes an owner ruling, so the owner should confirm it before the PR is merged. Until then the checker stays, and the record writer does not depend on it.
- **Trap status and kind spellings.** Section 5 says status 3 and the RFC 0005 spellings. Accepted RFC 0020 (TR1, TR3) says status 1, the spellings `divide-by-zero` and `stack-exhausted`, and a fourth kind, `step-exhausted`, that RFC 0005 does not list. These conflict. A revision of this RFC must either name RFC 0020 TR1 as amended here, with the status and every spelling stated, or keep RFC 0020's values. Until then the trap part of this RFC is not implemented. Sections 1, 2, 3, 4 and 8 do not depend on this.
- **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
