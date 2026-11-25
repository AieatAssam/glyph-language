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

Status: revised draft (revision of the accepted text so that the record writer, subtask 1 of the plan, can be built as written). Slug: diagnostic-style-v2. Class: language. Number assigned by the orchestrator.
Replaces RFC 0004 (superseded). Amends RFC 0020 TR1 in one place: the output line for a runtime trap (section 5). The trap status and kinds are RFC 0020's, as the code already implements them; this RFC changes only the line's format.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no message text, no file name, no line or column. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and exit status 1.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0020 TR1 defines a trap as plain text, `trap: <kind>`, while stderr is defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, and keys in the order given here. No other output format exists. Exit statuses:
   - `0`: compilation succeeds. Nothing is written to standard error.
   - `1`: compilation fails. One or more records are written, and each is a line on standard error.
   - `2`: usage error (unknown command, or the source file is missing or cannot be read). The record `E0010` (section 2) is written for an unreadable source file, and status 2 is used with it.
   - A runtime trap exits `1` (section 5).

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. The value `"warning"` is reserved; this RFC defines no warnings, so the compiler never writes it.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid and leaves the rest of the program's meaning as it was. Present only when the code's rule in section 8 gives one edit.

   No other key is written. The keys `file`, `message`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key.

   Example, a leading zero in `007` at bytes 0 to 3:
   `{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

3. **Order.** Records are written in order of `span.start`, then `code`. The lexer stops at its first error: it writes that one record, and no later phase runs. Later phases (parser, type checker, and so on) may write several records.

4. **Codes.** Each code appears once in `spec/errors.json`, as an object `{"code":"E0006","meaning":"..."}`. `meaning` is a noun phrase of at most ten words, for a model reading the catalogue; it is not written into records. Codes are never reused. A removed code stays in the file with `"retired":true` and no other change. A new code takes the next unused number in its block:

   | Block | Codes |
   | --- | --- |
   | lexical | E0001 to E0099 |
   | syntax | E0100 to E0199 |
   | types | E0200 to E0299 |
   | name resolution | E0300 to E0399 |
   | effects and capabilities | E0400 to E0499 |
   | limits and constants | E0500 to E0599 |

5. **Runtime traps.** A trap ends the program with exit status 1 through WASI `proc_exit`. Before exiting, the runtime writes exactly one line to standard error, followed by LF:
   `{"trap":"<kind>"}`
   where `<kind>` is one of the four kinds RFC 0020 lists, spelled exactly as the code spells them in `TRAP_LINE` (`kernel/types.ts`): `overflow`, `divide-by-zero`, `stack-exhausted`, `step-exhausted`. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`. The previous line format, `trap: <kind>`, is removed.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `severity`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines. The runner compares the keys `code`, `severity` (absent means `error`), `span` and `fix`. A trap test states its expected exit status and a substring of stderr. The exact bytes of stderr are checked by node tests, because the conformance runner does not compare whole stderr.

8. **Fixes.** This RFC defines one fix. A literal with a leading zero gives `E0006`. Its `fix.span` is the whole literal. Its `replacement` is the literal's digits with leading zeros removed, or `0` when every digit is zero. `007` gives `7`; `00` gives `0`. Every other code has no fix until the RFC that defines it says otherwise. The lexical RFCs must give `E0006` this fix; this RFC does not change any code number.

## Alternatives

- **Keep `message`.** Rejected. The model that repairs code reads the code, the span and the source bytes. A sentence adds tokens to every record and the catalogue already gives each code a meaning.
- **Keep `line` and `column`.** Rejected. They are a function of `span.start` and the source bytes. Keeping them adds a second way to say the same thing and a way for the two to disagree.
- **Keep `file`.** Rejected for now. Each compile reads one file. A multi-file build needs one new key, and a later RFC can add it.
- **Required `severity`.** Rejected. Every record is an error, so the default covers all of them and costs no tokens.
- **Trap as plain text.** Rejected. It gives stderr two formats. A JSON trap line keeps one reader for everything on stderr.
- **Human text by default, JSON with a flag.** Rejected, as in RFC 0004: two formats means two ways to read one error.
- **Change the trap status or kinds here.** Rejected. Status 1 and the four kinds are RFC 0020's, and the code and `spec/card.md` already use them. Changing them is a separate question for a separate RFC.

## Cost

Adds to the spec core: the record and trap shapes (sections 1, 2, 5 and 8) and the code table. Estimated at about 300 tokens. Not measured: the protected tokeniser is not available to this session, so the merge bot's count is the real figure.

Removes, compared with RFC 0004: the message rule (its one-sentence, lowercase-first, no-full-stop and 20-byte rules), the `file`, `line` and `column` fields, the required `severity`, and the trap's plain-text form. Estimated saving per record: about 40 to 60 tokens, and the message rule itself is gone from the record path. Net change to the spec core is negative (estimate).

Spec card: the record shape becomes one line of about 30 tokens (it was about 120). The trap line is one line, `{"trap":"<kind>"}`. The block table stays (about 60 tokens). The card stays well under its 2,000-token cap.

Files the implementing work changes, because they now disagree with this RFC: `spec/core/diagnostic.md` (record shape, trap rule, exit statuses), `spec/card.md` (record shape and trap line), `spec/errors.json` (drop `message`, add `meaning` where missing), the compiler's record writer (`diagnostic.ts`), the lexer's record table (`lexer/records.ts`), and `cli.ts` for the exit statuses in section 1.

**Rollout.** The change has three parts that land separately:
- (a) Record shape and the catalogue, sections 1 to 4 and 8. This needs no decision outside this RFC.
- (b) Trap line, section 5. This amends RFC 0020 TR1 and lands with the kernel runtime.
- (c) Removal of the message checker (`compiler/stage0/src/message.ts` and its test). This waits for the owner's confirmation (see Open questions). Until then `message.ts` and its test stay as they are, and nothing in the record path imports them.

Part (a) does not depend on (b) or (c).

## Test plan

Each conformance test file has a `--- meta` block with `id`, `rfc` (this RFC's number, `0050`) and `kind`. Kinds are the ones the runner accepts: `run`, `compile-error`, `trap`, `fmt`, `fix`. Conformance tests go in `conformance/diag/`.

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. No `fix`.
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`.
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because the lexer stops at its first error.
- `diag/no-output-clean.test` (run): a valid program exits 0 and writes nothing to standard output. A node test checks that it writes nothing to standard error.
- `diag/trap-line.test` (trap): a program that evaluates `1 / 0` exits 1, and stderr contains `{"trap":"divide-by-zero"}`.
- `diag/trap-overflow.test` (trap): `4611686018427387904 * 2` exits 1, and stderr contains `{"trap":"overflow"}`.

Node tests, in `compiler/stage0/src/`, because the conformance runner has no kind for them:
- `diagnostic-keys.test.ts`: every record the lexer and `cli.ts` produce has only the keys `code`, `severity`, `span` and `fix`, and `span` and `fix.span` have only `start` and `end`. Every emitted code is in `spec/errors.json`, listed once, and in its block.
- `diagnostic-retired.test.ts` (or the same file): a catalogue entry with `"retired":true` is reported when its code is emitted.
- `trap.test.ts` and `kernel/rt-trap.test.ts`: stderr is exactly `{"trap":"<kind>"}` followed by LF, for each of the four kinds, and the status is 1.
- `diagnostic.test.ts`: `toJsonLine` writes keys in the order of section 2, omits `severity` when it is `error`, and never writes `file`, `line`, `column` or `message`.

Every test in this list is new. None edits an existing conformance test.

## Open questions

- **Owner ruling of 2026-11-20.** That ruling sets the message-sentence rule for RFC 0004 records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC removes message text from records and from the catalogue, so the rule has no target. Removing the checker supersedes an owner ruling, so part (c) of the Rollout waits for the owner's confirmation. Parts (a) and (b) do not need it.
- **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
- **Lexical RFCs.** RFCs 0014 and 0048 must agree with section 8 on `E0006`. If either gives a different code for a leading zero, that RFC is corrected to match this one; this RFC does not renumber codes.
