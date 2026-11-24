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

Status: draft, revision 2 (revised after implementers could not build subtask 1). Slug: diagnostic-style-v2. Class: language. Number assigned by the orchestrator.
Replaces RFC 0004 (superseded). Amends RFC 0020 TR1, and the trap line of RFC 0005, in one place: the form of the runtime trap line. Trap status (1) and trap kinds are those of RFC 0020 TR1, which the compiler already follows. Revision 1 said they were unchanged from RFC 0005; that was wrong, and this revision corrects it.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written: no message text, no file name, no line or column, no severity. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error that names the trap kind. Its exit status is 1, as RFC 0020 TR1 sets.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, a line, a column and a severity. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0020 TR1 writes the trap as plain text, `trap: <kind>`, while stderr is otherwise JSON Lines. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly (no spaces), with keys in the order given here, and ends with one LF. No other output format exists. A program that compiles with no errors writes nothing to standard error and exits with status 0.

2. **Exit status of a compile.** A compile that writes one or more diagnostic records exits with status 1. A usage error (wrong arguments, unknown command) or any other failure of `glyphc` itself exits with status 2. A compile that writes no record exits with status 0.

3. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file the compiler was given; `end` is exclusive. Required.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No record written under this RFC has a `severity` key. A later RFC that adds warnings adds the key with them. No other key is written. The keys `file`, `message`, `line`, `column` and `severity` are removed from records. Line and column are derived from `span.start` by a tool when it needs them. A build of several files needs a later RFC that adds a `file` key.

   Example, a leading zero in `007` at bytes 0 to 3:
   `{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

4. **Fix for a leading zero.** Every E0006 record carries a fix. Its `fix.span` is the whole integer literal, and its `replacement` is the literal's digits with leading zeros removed. So `007` gives `7`, and `00` gives `0`.

5. **Record for a path that is not a source file.** The code E0010 has no fix. The file is not read, so its span is `{"start":0,"end":0}`.

6. **Order.** Records are written in order of `span.start`, then `code`. A lexical error stops compilation: the compiler writes only the first lexical record in that order, and no record from a later phase. The lexical RFC says which codes are lexical (E0001 to E0099). Later phases may write several records.

7. **Codes.** Each code appears once in `spec/errors.json`, as an object `{"code":"E0006","meaning":"..."}`. `meaning` is a noun phrase of at most ten words. It is for a model reading the catalogue and is never written into records. Entries that break the ten-word limit are shortened in the PR that removes `message` (subtask 2 of the plan). Codes are never reused. A removed code stays in the file with `"retired":true` and no other change, and the compiler never emits a retired code. A new code takes the next unused number in its block:

   | Block | Codes |
   | --- | --- |
   | lexical | E0001 to E0099 |
   | syntax | E0100 to E0199 |
   | types | E0200 to E0299 |
   | name resolution | E0300 to E0399 |
   | effects and capabilities | E0400 to E0499 |
   | limits and constants | E0500 to E0599 |

8. **Runtime traps.** A trap ends the program with exit status 1 through WASI `proc_exit`, as RFC 0020 TR1 sets. Before exiting, the runtime writes exactly one line to standard error:
   `{"trap":"<kind>"}`
   followed by one LF, where `<kind>` is one of the four kinds RFC 0020 TR1 lists, spelled exactly as there: `overflow`, `divide-by-zero`, `stack-exhausted`, `step-exhausted`. Output written before the trap stays written (RFC 0020 TR1). A trap line has no `code`, `span` or `fix`, and the runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`.

   This replaces the form `trap: <kind>` of RFC 0020 TR1 and of the trap line in RFC 0005. Nothing else in RFC 0020 TR1 changes.

9. **What the record stays out of.** The compiler writes no human text anywhere in its output. Tests and tools match records on `code`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

10. **Tests.** A compile-error test states its expected records as JSON lines, and the runner compares `code`, `span` and `fix`. A `trap` test states its expected exit status and a substring of stderr. Checks that the runner cannot make (exact stderr, absent keys, the catalogue, retired codes) are node tests, listed in the test plan.

## Alternatives

- **Keep `message`.** Rejected. The model that repairs code reads the code, the span and the source bytes. A sentence adds tokens to every record, and the catalogue already gives each code a meaning.
- **Keep `line` and `column`.** Rejected. They are a function of `span.start` and the source bytes. Keeping them adds a second way to say the same thing, and a way for the two to disagree.
- **Keep `file`.** Rejected for now. Each compile reads one file. A multi-file build needs one new key, and a later RFC can add it.
- **Keep `severity`, required or optional.** Rejected. No code in this RFC produces a warning, so the key would appear on every record or on none. A later RFC adds it with warnings.
- **Trap as plain text (RFC 0020 TR1 as written).** Rejected. It gives stderr two formats. A JSON trap line keeps one reader for everything on stderr.
- **Trap status 3 (RFC 0005's value).** Rejected. RFC 0020 TR1 and the compiler both use status 1. Changing it would touch the kernel and no reader needs it.
- **Human text by default, JSON with a flag.** Rejected: two formats means two ways to read one error.

## Cost

Adds to the spec core: the record shape (section 3), the E0006 fix rule (section 4), the trap line (section 8), the exit status rule (section 2) and the code table. Estimated at about 250 tokens. Not measured: the protected tokeniser is not available to this session, so the merge bot's count is the real figure.

Removes, compared with RFC 0004: the message rule (its one-sentence, lowercase-first, no-trailing-stop and 20-byte rules), the `file`, `line`, `column` and `severity` keys, and the trap's plain-text form. Estimated saving per record: about 50 to 70 tokens, and the message rule itself is gone. Net change to the spec core is negative (estimate).

Spec card: the record shape becomes one line of about 20 tokens (it was about 120). The trap line is one line, and its status stays 1. The block table stays (about 60 tokens). The card stays well under its 2,000-token cap.

Files the implementing PRs change, because they now disagree with this RFC: `spec/core/diagnostic.md` (record shape and trap rule), `spec/card.md` (the trap line now reads `{"trap":"<kind>"}`, and the record shape), `spec/errors.json` (drop `message`, shorten long `meaning` entries), the compiler's record writer (`compiler/stage0/src/diagnostic.ts`), the callers that build records (`cli.ts`, `lexer/records.ts`), and the trap writer (`kernel/types.ts`, `kernel/rt-trap.ts`). Those trap changes are subtasks 6 and 7 of the plan, after the trap form is settled here.

## Test plan

Each test file has a `--- meta` block with `id`, `rfc` (this RFC's number, `0050`) and `kind`. The kinds used are those the runner accepts: `run`, `compile-error`, `trap`, `fmt` and `fix`. Every test in this list is new. None edits an existing conformance test.

Conformance tests (run by `tools.check.run`):

- `conformance/diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`, with no `fix`.
- `conformance/diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`.
- `conformance/diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `conformance/diag/no-output-clean.test` (run): a valid program with an empty expected stdout and exit status 0. Its empty stderr is checked by a node test.
- `conformance/diag/trap-line.test` (trap): `print(1 / 0)`, expect-exit 1, expect-stderr `{"trap":"divide-by-zero"}`.
- `conformance/diag/trap-overflow.test` (trap): `print(4611686018427387904 * 2)`, expect-exit 1, expect-stderr `{"trap":"overflow"}`.

The compile-error tests pass only when `check` writes records. Until the front end does (see Open questions), they fail, and the PR that adds them says so.

Node tests (in `compiler/stage0/src/**/*.test.ts`, run by the gate):

- `compiler/stage0/src/diagnostic-keys.test.ts`: every record the lexer and `cli.ts` produce has only the keys `code`, `span` and `fix`, and `span` and `fix.span` have only `start` and `end`. No record has `severity`.
- The same file: every code a record carries is in `spec/errors.json`, listed once, and in its block. A catalogue entry with `"retired":true` is reported when its code is emitted.
- `compiler/stage0/src/diagnostic.test.ts`: a record with a fix writes its keys in the order given in section 3; a record never carries `file`, `line`, `column`, `message` or `severity`.
- `compiler/stage0/src/rt-trap.test.ts`: the trap writer writes exactly `{"trap":"<kind>"}` and one LF to standard error, for each of the four kinds, and exits with status 1.
- `compiler/stage0/src/lexer/records.test.ts`: `007` gives the E0006 fix with replacement `7`, and `00` gives replacement `0`.
- The empty stderr of `no-output-clean.test` is checked by calling `compile()` on the same program and asserting that stderr is empty.

## Open questions

- **Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so the rule has no target. Removing the checker needs the owner to confirm that this supersedes the ruling, and that confirmation goes in the PR thread before the checker is deleted. Until then the checker and its test stay. Nothing else in this RFC depends on the checker.
- **Leading-zero code.** RFC 0048 names E0001 in one rule and E0006 in another for the same literal. This RFC uses E0006, the code `spec/errors.json` already gives that meaning. The lexical RFC must make the same choice.
- **The front end.** `cli.ts` prints `no front end yet` and exits 2, so no source file produces records yet. The compile-error tests in section 10 wait for the lexer and parser to be wired into `check`. That wiring belongs to the lexical and kernel plans.
- **Multi-file builds.** A `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
