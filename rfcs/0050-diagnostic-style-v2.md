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
Replaces RFC 0004 (superseded). Amends RFC 0005 in one place: the output line for a runtime trap (section "Runtime traps"). Amends RFC 0011 section 5 and its planned example record: the E0010 record loses `message`, `file`, `line` and `column`, and its planned test `conformance/name/bad-extension.test` expects the new record. Section 5 of this RFC gives trap status 3 and the RFC 0005 kind spellings; RFC 0020 TR1 gives status 1 and hyphenated kinds. This RFC does not decide that conflict; see Open questions.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and exit status 3.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict with RFC 0005: a trap wrote plain text while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, and keys in the order given here. No other output format exists. A program that compiles with no errors writes nothing to standard error and exits with status 0. A compile that writes one or more diagnostic records exits with status 1. A usage error (an unknown command or wrong arguments) writes the usage line to standard error and exits with status 2. These are the statuses the CLI already uses.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. The value `"warning"` is reserved. This RFC defines no warnings, so the compiler never writes the key `severity` while every record is an error. A record written today has no `severity` key.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required. A diagnostic about the whole file, such as E0010, uses `{"start":0,"end":0}`.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key.

   Example, a leading zero in `007` at bytes 0 to 3:
   `{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

   Example, a path that does not end in `.gl`, with the file not read (RFC 0011 section 5):
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

5. **Runtime traps.** A trap ends the program with exit status 3 through WASI `proc_exit`. Before exiting, the runtime writes exactly one line to standard error:
   `{"trap":"<kind>"}`
   where `<kind>` is one of the kinds RFC 0005 lists, spelled exactly as RFC 0005 spells them: `overflow`, `divide by zero`, `stack exhausted`. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines. The runner compares the keys `code`, `severity` (absent means `error`), `span` and `fix`. A run test states its expected stderr exactly.

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

Files the implementing change touches, because they now disagree with this RFC. Grouped by the PR that changes them; the groups are the subtasks of the plan in `rfcs/0050.plan.md`.

- Record writer PR (plan subtask 1):
  - `compiler/stage0/src/diagnostic.ts`: `Span` and `Diagnostic` lose `file`, `line`, `column` and `message`. `severity` becomes optional and is not written. `toJsonLine` writes `code`, `span` and, when present, `fix`, in that order. `Span` keeps `start` and `end` only.
  - `compiler/stage0/src/diagnostic.test.ts` and `compiler/stage0/src/diagnostic-order.test.ts`: these build records with `message`, `file`, `line` and `column`. Their tests are rewritten to the new shape. The tests for key order, the absent and present `fix` key, the single line, and the sort order keep their substance. Sort-order tests that used `message` to tell two records apart use `code` or input order instead.
  - `compiler/stage0/src/cli.ts`: `notSourceFile` returns `{code:"E0010", span:{start:0,end:0}}`. Its exit status (1) and the rule that the file is not read do not change.
  - `compiler/stage0/src/cli.test.ts`: `E0010_LINE` changes to `{"code":"E0010","span":{"start":0,"end":0}}` followed by a line feed, with the `file` argument dropped. The argument-error and usage tests do not change.
  - `compiler/stage0/src/lexer/records.ts`: the `MESSAGES` table and the `message`, `file`, `line` and `column` fields go. `lexErrorRecord` keeps refusing a code outside the three lexer codes E0001, E0005 and E0006, with a thrown error. `positionOf` is not called on this path; `span.ts` itself is unchanged.
  - `compiler/stage0/src/lexer/records.test.ts`: the field-order, line and column tests change to the new shape. The message-rule test (`checkMessage` over each lexer code) is removed. The catalogue test that a code is listed once stays.
  - `compiler/stage0/src/e0010.test.ts`: only the message-rule assertion (the one that calls `checkMessage`) is removed. The assertions about the catalogue entry stay until the catalogue PR.
- Catalogue and spec PR (plan subtasks 2 and 3):
  - `spec/errors.json`: the `message` key is removed from each entry. `meaning` is shortened to ten words where it is longer. No code is added, removed or renumbered.
  - `compiler/stage0/src/catalogue-check.ts`, `catalogue.test.ts` and `lexer/codes.test.ts`: the message checks are replaced by a `meaning` check (a string of at most ten words) and a block check (a code lies in its block).
  - `spec/core/diagnostic.md` and `spec/card.md`: rewritten to sections 1 to 4 and 6 to 7 of this RFC. The trap sentence stays as it is until Open question 2 is settled.
- Owner-gated PR (plan subtask 5): `compiler/stage0/src/message.ts` and `message.test.ts` are deleted. This happens only after the owner confirms Open question 1. Until then both files stay and their tests keep passing.

## Test plan

Each conformance test file has a `--- meta` block with `id`, `rfc` (this RFC's number) and `kind`.

Conformance tests (the runner's kinds are `run`, `compile-error`, `trap`, `fmt` and `fix`):

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. No `fix`. Compares JSON.
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`.
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `diag/no-output-clean.test` (run): a valid program writes nothing to standard error and exits 0.
- `diag/trap-line.test` (trap): a program that evaluates `1 / 0` exits with the status Open question 2 settles, and its stderr contains `{"trap":"divide by zero"}`. The runner checks the exit status and a stderr substring only.
- `diag/trap-overflow.test` (trap): `4611686018427387904 * 2` gives stderr containing `{"trap":"overflow"}` and the status Open question 2 settles.

Node tests (not conformance tests). The runner has no `check` kind, so the rules below are checked in `compiler/stage0/src/**/*.test.ts`, which the gate runs:

- `diagnostic.test.ts`: a record has no key `file`, `line`, `column` or `message`; a record with no fix has no `severity` key and no `fix` key; a record with a fix has keys `code`, `span`, `fix`; `span` and `fix.span` have only `start` and `end`.
- `diagnostic-keys.test.ts` (plan subtask 4): every record the lexer and `cli.ts` produce uses only the keys `code`, `severity`, `span` and `fix`; every emitted code is in `spec/errors.json`, listed once, and in its block; a catalogue entry with `"retired":true` is reported when its code is emitted.
- `rt-trap.test.ts` (plan subtask 7): the trap line is exactly `{"trap":"<kind>"}` and a line feed, and the status Open question 2 settles.

Every conformance test in this list is new. The node tests that assert the old record shape (listed under Cost) are rewritten in the same PR as the writer change. No conformance test is edited.

## Open questions

1. **Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so the rule has no target. Writing the record-writer PR and its tests is not blocked by this. The PR may not merge until the owner confirms that this RFC supersedes the ruling for records and the catalogue. Until then `message.ts` and its test stay, and they keep passing.
2. **Trap status and spelling.** Section 5 gives exit status 3 and the RFC 0005 kind spellings. Accepted RFC 0020 TR1 gives exit status 1 and the kinds `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`. RFC 0005 does not list `step-exhausted`. This RFC does not decide between them. The trap subtasks (plan subtasks 6 to 8) wait for a decision, which the owner or a later RFC must make. That RFC names this one and RFC 0020 as amended.
3. **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
4. **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
