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
Replaces RFC 0004 (superseded). Amends RFC 0005 and RFC 0020 (TR1) in one place: the output line for a runtime trap (Design section 5). Trap status and trap kinds are not changed by this RFC. They are those of RFC 0020 TR1: exit status 1, and the kinds `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`.

## Summary

The compiler writes every diagnostic as one JSON object per line on standard error. A record holds a stable code, an exact byte span and, when one mechanical edit fixes the code, that edit. Nothing else is written. There is no file name, no line or column, and no message text. A model reads the code and the bytes, and the span tells it where to look.

A runtime trap is not a diagnostic. It is one JSON line on standard error with the trap kind, and exit status 1.

## Motivation

Principle 4 of the constitution requires structured diagnostics with stable codes, exact spans and machine-applicable fixes. Principle 8 requires the fewest tokens to generate and parse. RFC 0004 met the first and missed the second: its record carried a prose message, a file name, and a line and a column. Each of these is either unread by a model or derivable from the byte offsets, so each costs tokens for nothing. The repair loop needs only the code, the span and the fix.

RFC 0004 also left a conflict with RFC 0005 and RFC 0020: a trap wrote plain text while stderr was defined as JSON Lines only. This RFC makes the trap a JSON line, so stderr has one format. The trap's status and kinds stay as RFC 0020 already sets them, and the code and `spec/card.md` already follow RFC 0020.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics and traps only as JSON Lines to standard error. Each line is one JSON object written compactly: no spaces, and keys in the order given here. No other output format exists. A program that compiles with no errors writes nothing to standard error and exits with status 0. A compile that writes one or more records exits with status 1.

2. **Diagnostic record.** A record has these keys, in this order:
   - `code`: string `E` followed by four digits, such as `"E0006"`. Required.
   - `severity`: optional. Absent means `error`. This RFC defines no warnings, so the compiler omits the key on every record it writes. The value `"warning"` is reserved for a later RFC.
   - `span`: object `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line; `end` is exclusive. Required.
   - `fix`: optional object `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes in `fix.span` with the UTF-8 string `S` (possibly empty) makes the code valid without changing a meaning the author could not infer. Present only when one edit does this.

   No other key is written. The keys `file`, `line` and `column` are removed. Line and column are derived from `span.start` by a tool when it needs them. `file` is the one file given on the command line; a build of several files needs a later RFC that adds one key. The key `message` is also removed, but only in rollout step B (section 8).

   `E0006` (an integer literal with a leading zero) always carries a fix: the literal's bytes are replaced by its digits without the leading zeros. `007` becomes `7`, and `00` becomes `0`. The edit changes no meaning.

   Example, a leading zero in `007` at bytes 0 to 3:
   `{"code":"E0006","span":{"start":0,"end":3},"fix":{"span":{"start":0,"end":3},"replacement":"7"}}`

3. **Order.** Records are written in order of `span.start`, then `code`. Lexical errors stop compilation after the first one (see the lexical RFC). Later phases may write several records.

4. **Codes.** Each code appears once in `spec/errors.json`. In its final form each entry is `{"code":"E0006","meaning":"..."}`, and `meaning` is a noun phrase of at most ten words, for a model reading the catalogue; it is not written into records. Codes are never reused. A removed code stays in the file with `"retired":true` and no other change. A new code takes the next unused number in its block:

   | Block | Codes |
   | --- | --- |
   | lexical | E0001 to E0099 |
   | syntax | E0100 to E0199 |
   | types | E0200 to E0299 |
   | name resolution | E0300 to E0399 |
   | effects and capabilities | E0400 to E0499 |
   | limits and constants | E0500 to E0599 |

5. **Runtime traps.** A trap ends the program with exit status 1 through WASI `proc_exit`, as RFC 0020 TR1 requires. Before exiting, the runtime writes exactly one line to standard error, followed by one LF:
   `{"trap":"<kind>"}`
   where `<kind>` is one of the kinds RFC 0020 TR1 lists, spelled exactly as RFC 0020 spells them: `overflow`, `divide-by-zero`, `stack-exhausted`, `step-exhausted`. This replaces RFC 0020's plain line `trap: <kind>`. A trap line has no `code`, `span` or `fix`. The runtime writes no other text to standard error. A reader tells a trap line from a diagnostic record by the key `trap`.

6. **What the record stays out of.** The compiler writes no human text anywhere in the output. Tests and tools match records on `code`, `span` and `fix`. Adding a key to a record needs an RFC that names this one.

7. **Tests.** A compile-error test states its expected records as JSON lines. The runner compares only the keys the expected record gives, so an exact key set and an exact stderr are checked by node tests (see Test plan). A run test states its expected stdout and exit status. A trap test states its expected exit status and stderr.

8. **Rollout.** The change ships in two steps, so the first step does not depend on the owner ruling.
   - **Step A (no owner ruling involved).** The compiler stops writing `file`, `line` and `column`. `span` and `fix.span` have only `start` and `end`. The compiler omits `severity`, and `E0010` (source file name) has span `{"start":0,"end":0}`. Records still carry `message` in its current place, between `severity` and `span`. `spec/errors.json` still has `message`. The message checker `compiler/stage0/src/message.ts` stays.
   - **Step B (needs the owner).** After the owner confirms in the RFC thread that the owner ruling of 2026-11-20 is superseded for record and catalogue text, the compiler stops writing `message`. The lexer's message table and the `E0010` message go. `spec/errors.json` drops `message` and gains `meaning` (section 4). `message.ts` and its test are then deleted, after a search shows nothing else imports them.

   Step B does not start until the owner confirms. Step A is the shipped state until then.

## Alternatives

- **Keep `message`.** Rejected. The model that repairs code reads the code, the span and the source bytes. A sentence adds tokens to every record and the catalogue already gives each code a meaning. The removal waits for the owner (section 8).
- **Keep `line` and `column`.** Rejected. They are a function of `span.start` and the source bytes. Keeping them adds a second way to say the same thing and a way for the two to disagree.
- **Keep `file`.** Rejected for now. Each compile reads one file. A multi-file build needs one new key, and a later RFC can add it.
- **Always write `severity`.** Rejected. Every record is an error, so the default covers all of them and costs no tokens.
- **Trap as plain text.** Rejected. It gives stderr two formats. A JSON trap line keeps one reader for everything on stderr.
- **Human text by default, JSON with a flag.** Rejected, as in RFC 0004: two formats means two ways to read one error.
- **Change the trap status or kinds.** Rejected. Status 1 and the hyphenated kinds are what RFC 0020 TR1 sets, what the code uses, and what `spec/card.md` says. Changing them would touch the kernel, the card and several accepted RFCs for no token gain.

## Cost

Adds to the spec core: the record and trap shapes (sections 1, 2 and 5), the `E0006` fix rule and the code table. Estimated at about 300 tokens. Not measured: the protected tokeniser is not available to this session, so the merge bot's count is the real figure.

Removes, compared with RFC 0004: the message rule (its one-sentence, lowercase-first, no-full-stop and 20-byte rules, once step B lands), the `file`, `line` and `column` fields, the always-written `severity`, and the trap's plain-text form. Estimated saving per record: about 40 to 60 tokens, and the message rule itself goes in step B. Net change to the spec core is negative (estimate).

Spec card: the record shape becomes one line of about 30 tokens (it was about 120). The trap line is one line. The block table stays (about 60 tokens). The card stays well under its 2,000-token cap.

Files the implementing PRs change. Step A: `compiler/stage0/src/diagnostic.ts` (the `Span` type, `spanJson` and `toJsonLine`), `compiler/stage0/src/lexer/records.ts` (drop `file`, `bytes` and the line and column lookup, and the parameters they used), `compiler/stage0/src/cli.ts` (the `E0010` span), and the node tests for those files. Step B: `compiler/stage0/src/lexer/records.ts` (the message table), `cli.ts` (the `E0010` message), `spec/errors.json`, `catalogue.test.ts`, `lexer/codes.test.ts`, `message.ts` and `message.test.ts`. The trap change (section 5) is in `compiler/stage0/src/trap.ts`, `kernel/types.ts` and `kernel/rt-trap.ts`, which already emit the RFC 0020 kinds with status 1. Only the line shape changes.

## Test plan

Conformance tests go in `conformance/diag/`. Each has a `--- meta` block with `id`, `rfc: 0050` and `kind`. Only the kinds the runner accepts are used: `run`, `compile-error` and `trap`.

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record, `{"code":"E0100","span":{"start":4,"end":7}}`. The runner ignores keys the expected record does not give, so the key set is checked by a node test.
- `diag/fix-present.test` (compile-error): a literal `007` at bytes 0 to 3 gives `E0006` with `fix` `{"span":{"start":0,"end":3},"replacement":"7"}`.
- `diag/order.test` (compile-error): two leading-zero literals `007` at bytes 2 and 20. Only the record for bytes 2 is written, because lexical errors stop after the first.
- `diag/no-output-clean.test` (run): a valid program with empty expected stdout and exit status 0. The empty stderr is checked by a node test, because the runner does not check stderr for `run`.
- `diag/trap-line.test` (trap): a program that evaluates `1 / 0` exits with status 1 and writes `{"trap":"divide-by-zero"}` to standard error. The exact bytes are checked by a node test.
- `diag/trap-overflow.test` (trap): `4611686018427387904 * 2` exits with status 1 and writes `{"trap":"overflow"}` to standard error.

Node tests, in `compiler/stage0/src/`:
- `diagnostic-keys.test.ts`: every record the lexer and `cli.ts` produce has only the keys `code`, `severity`, `span` and `fix`, and `span` and `fix.span` have only `start` and `end`. In step A, `message` is also allowed. Step B removes it from the allowed set.
- `diagnostic-keys.test.ts`: every emitted code is in `spec/errors.json`, is listed once, and lies in its block. In step B each entry has a `meaning`.
- `diagnostic-keys.test.ts`: a code with `"retired":true` is reported when it is emitted (`checkCatalogue`).
- `trap.test.ts` and `kernel/rt-trap.test.ts`: the stderr of each trap kind is exactly `{"trap":"<kind>"}` followed by one LF, with status 1.
- `diagnostic-keys.test.ts`: a valid program's `compile` and `run` leave stderr empty.

Every conformance test in this list is new. No existing conformance test is edited. Existing node tests that assert the old record shape change with the step that changes the shape; their assertions are changed, not deleted.

## Open questions

- **Owner confirmation for step B.** The owner ruling of 2026-11-20 sets the message-sentence rule for records and requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. Step B supersedes it. The owner should confirm in the RFC thread before step B merges. Step A does not need this.
- **Multi-file builds.** One `file` key would return if a build needs several files. This RFC does not add it.
- **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If the benchmark shows models do not repair from codes alone, a later RFC can lengthen it. It is not a record field.
