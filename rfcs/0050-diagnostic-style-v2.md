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
Replaces RFC 0004 (superseded). Amends RFC 0020 (TR1) in one place: the stderr line for a runtime trap (Design 5). RFC 0005's trap status and kind spellings were already replaced by RFC 0020 TR1 and TR3, and the code follows RFC 0020; this RFC keeps those and changes only the line format.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and exit status 1.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict with RFC 0005: a trap wrote plain text while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, and keys in the order given here. No other output format exists. A program that compiles with no errors writes nothing to standard error and exits with status 0.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. The value `"warning"` is reserved; this RFC defines no warnings, so the compiler never writes it.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key.

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

5. **Runtime traps.** A trap ends the program with exit status 1 through WASI `proc_exit`, as RFC 0020 TR1 states. Before exiting, the runtime writes exactly one line to standard error, followed by one LF byte:
   `{"trap":"<kind>"}`
   where `<kind>` is one of these four spellings, exactly as RFC 0020 TR1 and TR3 spell them: `overflow`, `divide-by-zero`, `stack-exhausted`, `step-exhausted`. No other kind exists. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `severity`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Failed compile.** A compile that writes one or more records exits with status 1. This is the status the test runner requires for a compile-error test.

8. **Transition (implementation scope).** This item says which files the PR that first ships section 2 changes. It is normative for that PR. Anything not listed here is not changed by that PR.
   - `compiler/stage0/src/diagnostic.ts`: `Span` becomes `{start, end}`. `Diagnostic` becomes `{code, severity?, span, fix?}`, where `fix` is `{span, replacement}`. `toJsonLine` writes the keys in section 2 order and writes `severity` only when its value is not `error`. It writes no other key.
   - `compiler/stage0/src/span.ts`: `positionOf` stays unchanged. The record path does not call it.
   - `compiler/stage0/src/lexer/records.ts`: a lexical record is `{code, span:{start,end}}`. The `MESSAGES` table and the `message` field are removed. A lexical code with no catalogue entry still throws, as it does now.
   - `compiler/stage0/src/cli.ts`: the E0010 record is `{"code":"E0010","span":{"start":0,"end":0}}`. This is the change the owner ruling in the Open questions covers. The PR merges only after the owner confirms it.
   - Node tests: assertions that a record has `message`, `file`, `line` or `column` are rewritten to the section 2 shape. This covers `diagnostic.test.ts`, `diagnostic-order.test.ts`, `cli.test.ts` (the E0010 expected line), `e0010.test.ts` (the message assertions) and `lexer/records.test.ts`. Message-rule checks are removed from record tests only.
   - Not changed by that PR: `spec/errors.json`, `spec/core/diagnostic.md`, `spec/card.md`, and `compiler/stage0/src/message.ts` with its test. The catalogue and the checker are handled in the later steps of the plan.

## Alternatives

- **Keep `message`.** Rejected. The model that repairs code reads the code, the span and the source bytes. A sentence adds tokens to every record and the catalogue already gives each code a meaning.
- **Keep `line` and `column`.** Rejected. They are a function of `span.start` and the source bytes. Keeping them adds a second way to say the same thing and a way for the two to disagree.
- **Keep `file`.** Rejected for now. Each compile reads one file. A multi-file build needs one new key, and a later RFC can add it.
- **Required `severity`.** Rejected. Every record is an error, so the default covers all of them and costs no tokens.
- **Trap as plain text.** Rejected. It gives stderr two formats. A JSON trap line keeps one reader for everything on stderr.
- **Human text by default, JSON with a flag.** Rejected, as in RFC 0004: two formats means two ways to read one error.
- **Change the trap status to 3 and the spellings to RFC 0005's.** Rejected. The code, `spec/card.md` and RFC 0013 to 0020 all use status 1 and hyphenated kinds. Changing them would widen this RFC's change for no gain in tokens or clarity.

## Cost

Adds to the spec core: the record and trap shapes (sections 1, 2 and 5) and the code table. Estimated at about 300 tokens. Not measured: the protected tokeniser is not available to this session, so the merge bot's count is the real figure.

Removes, compared with RFC 0004: the message rule (its one-sentence, lowercase-first, no-full-stop and 20-byte rules), the `file`, `line` and `column` fields, the required `severity`, and the trap's plain-text form. Estimated saving per record: about 40 to 60 tokens, and the message rule itself is gone. Net change to the spec core is negative (estimate).

Spec card: the record shape becomes one line of about 30 tokens (it was about 120). The trap line is one line. The trap exit status stays 1, so the card's trap sentence changes only in its line format. The block table stays (about 60 tokens). The card stays well under its 2,000-token cap.

Files the implementing PRs change, because they now disagree with this RFC: `spec/core/diagnostic.md` (its record shape and trap rule), `spec/card.md` (the record shape and the trap line), `spec/errors.json` (drop `message`, add `meaning`), and the compiler's record writer, its lexical record builder, the E0010 record and the message checker's callers. Section 8 lists the code files for the first PR.

## Test plan

Each test file has a `--- meta` block with `id`, `rfc` (this RFC's number) and `kind`. Only the kinds `run`, `compile-error`, `trap`, `fmt` and `fix` are used. A test of any other kind is refused by the publisher, so checks on records and the catalogue are node tests, not conformance tests.

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. No `fix`. Compares JSON. Needs the `check` path from the front end (see the plan).
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`. Needs the lexical RFC to emit `E0006` with a fix for this case.
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `diag/no-output-clean.test` (run): a valid program with empty stdout and exit 0. The runner does not check stderr for `run`, so the empty-stderr check is the node test `diagnostic-keys.test.ts`.
- `diag/trap-line.test` (trap): a program that evaluates `1 / 0` exits with status 1 and its stderr contains `{"trap":"divide-by-zero"}`. The exact bytes are checked by a node test on the runtime.
- `diag/trap-overflow.test` (trap): `4611686018427387904 * 2` exits with status 1 and its stderr contains `{"trap":"overflow"}`.
- Node test `compiler/stage0/src/diagnostic-keys.test.ts`: every record the lexer and `cli.ts` produce uses only the keys `code`, `severity`, `span` and `fix`, and `span` and `fix.span` use only `start` and `end`. Every emitted code is in `spec/errors.json`, listed once, and in its block. A code with `"retired":true` is not emitted. The runtime writes exactly the trap line and one LF, with no other stderr text, for each of the four kinds.

Every test in this list is new. None edits an existing conformance test.

## Open questions

- **Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records, including the E0010 record, and from the catalogue. The checker stays until the owner confirms its removal in a later step. The owner should confirm the E0010 record change before the first PR merges.
- **Trap kinds and status (decided here).** Section 5 follows RFC 0020 TR1 and TR3. A reviewer who prefers RFC 0005's spellings must name the RFC that changes them.
- **E0006 for a leading zero.** The fix in `diag/fix-present` assumes the lexical RFC emits `E0006` for that literal. RFC 0048 gives the same case a different code in one place. The lexical group decides which code is right. Until then the fix tests wait.
- **`CODE LINE` form of `expect-errors`.** Removing `line` from records breaks that form in other RFCs' tests (RFC 0037 uses it). Those tests need their owner to switch to the JSON form. This RFC does not edit them.
- **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
