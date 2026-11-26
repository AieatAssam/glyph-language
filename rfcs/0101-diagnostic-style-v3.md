---
status: rejected
votes:
  designer-prag: approve
  designer-safe: reject
  impl-1: approve
  tester: reject
  user-1: abstain
  user-2: approve
---
Status: draft. Slug: diagnostic-style-v3. Class: language. Number assigned by the orchestrator.
Replaces RFC 0050 (superseded by the owner). Amends RFC 0004 in its section 2 (record), section 5 (trap line) and section 7 (what a test compares). Restates RFC 0085 TR1 without change; RFC 0085 is not amended. The trap exit status stays 1.

## Summary

A diagnostic is one line of standard error: compact JSON with the keys `code`, `span` and, when one edit repairs the code, `fix`. `code` is `E` and a decimal number with no leading zeros, such as `"E6"`. `span` gives byte offsets into the source. There is no message, file name, line, column or severity key. A model reads the code and the bytes, and the span says where to look.

A runtime trap is not a diagnostic. It is one plain line `trap: <kind>` on standard error, and the program exits with status 1. A failed compile also exits with status 1.

## Motivation

RFC 0004 wrote a prose message, a file name, a line and a column on every record. A model that repairs code does not need them: the message repeats the catalogue, and the line and column follow from the byte offset. Each costs tokens on every record, which principle 8 of the constitution forbids. RFC 0050 removed them, but its trap rule did not match the accepted kernel.

This draft takes the trap rule from RFC 0085 TR1, which is accepted. The trap is a plain `trap: <kind>` line, the exit status is 1, and the kinds are spelled with hyphens. The reasons are these. RFC 0085 is accepted. `spec/core/diagnostic.md` and `spec/card.md` already give status 1. The compiler's trap table in `compiler/stage0/src/kernel/types.ts` uses the hyphenated kinds and status 1. RFC 0005 and RFC 0049 gave status 3 or spelled the kinds with spaces, but both are rejected, so neither is a baseline. Changing the trap to status 3 would amend RFC 0085 and three files, and it would save no tokens.

Owner findings on RFC 0050, and how this draft answers each:

1. Zero-padded codes. `"E0006"` becomes `"E6"`, one token less per record, and the numeric blocks stay (Design D2).
2. Gate keys. `span.start`, `span.end`, `fix.span` and `fix.replacement` keep their names and object shapes. A `[start,end]` array is not used (Design D3, D4).
3. One trap form and one exit code. The trap is `trap: <kind>` with status 1, the same in this RFC, RFC 0085 TR1, `spec/core/diagnostic.md` and `spec/card.md` (Design T1, T2).

Objections to RFC 0050:

- designer-safe asked for status 3. Declined: the accepted baseline is status 1 (see above), and the change would have had to amend RFC 0085.
- tester asked that the trap rule match TR1 and name the RFC it amends. Done: the rule restates RFC 0085 TR1 (kinds `overflow`, `divide-by-zero`, `stack-exhausted`, `step-exhausted`), and the RFC names RFC 0085 as the source.

Scope. This RFC covers the diagnostic record, the error catalogue, and the trap line. It does not change the grammar, the kernel's semantics, or the limits in RFC 0085.

## Design

Normative. "Must" and "is" bind implementers.

### Records

D1. A record is one line on standard error. It is compact JSON with no spaces, and its keys are, in this order: `code`, `span`, `fix`. `fix` is optional. No other key is written.

D2. `code` is a JSON string: `E`, then a decimal number with no leading zeros. Examples: `"E6"` (lexical), `"E100"` (syntax). The numeric blocks are: lexical 1 to 99, syntax 100 to 199, types 200 to 299, name resolution 300 to 399, effects and capabilities 400 to 499, limits and constants 500 to 599. Each code appears once in `spec/errors.json` as `{"code":"E6","meaning":"..."}`, where `meaning` is a noun phrase of at most ten words. Codes are never reused. A removed code stays in the file with `"retired":true`. A new code takes the next unused number in its block.

D3. `span` is `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line, and `end` is exclusive. `span` is required.

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. `fix` is present only when one edit does that. When `fix` is present, `fix.span` is written in full, even when it equals `span`, because the gate reads it.

D5. Every record is an error. No `severity` key is written, and a record without one is an error. No warnings are defined. A later RFC that adds warnings adds the key.

D6. Nothing that can be derived is written. There is no `file`, `message`, `line` or `column`. A tool computes line and column from `span.start` and the source bytes. The file is the one named on the command line.

D7. Records are written in order of `span.start`, then `code`. A lexical error stops compilation after the first one. Later phases may write several records.

Example, a leading zero in `007` at bytes 19 to 22 of `fn main() io { put(007) }`:
`{"code":"E6","span":{"start":19,"end":22},"fix":{"span":{"start":19,"end":22},"replacement":"7"}}`

### Traps

T1. A trap ends the run with exit status 1 through WASI `proc_exit`. Before it exits, the runtime writes one line to standard error: the text `trap: ` followed by the kind, then LF. The line is plain text, not JSON. Output written before the trap stays written.

T2. The kinds are `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`, spelled as RFC 0085 TR1 spells them. A trap line has no code, span or fix. The runtime writes nothing else to standard error.

### Exit status and streams

X1. A program that compiles with no records and does not trap writes nothing to standard error and exits with status 0.

X2. A compile that writes one or more records exits with status 1.

X3. A trap exits with status 1 (T1).

X4. A process writes records or one trap line, never both. A line that starts with `{"code"` is a record. A line that starts with `trap: ` is a trap line. `run` executes only a program that compiled with no records. Examples are evaluated at compile time (RFC 0085 EX3), so an example that fails is a record (E0202), not a trap.

## Alternatives

- **Trap with status 3** (RFC 0005, RFC 0050). Rejected. RFC 0085 TR1 is accepted and says 1, and the card and core spec say 1. Status 3 would amend RFC 0085, `spec/core/diagnostic.md`, `spec/card.md` and the compiler's trap table, and it saves no tokens.
- **JSON trap line** `{"trap":"divide-by-zero"}` (RFC 0050). Rejected. It costs 14 tokens against 8 for the plain line, and it is not the accepted spelling.
- **Numeric code** `"code":6`. Rejected. `code` is a string today, and the gate reads it as one. The saving is about one token per record.
- **Span as an array** `[start,end]`. Rejected. The gate reads `start` and `end` keys (RFC 0050 finding 2).
- **Omit `fix.span` when it equals `span`.** Rejected. The gate reads `fix.span`. Writing it costs the same whether or not it matches.
- **Exit status 2 for a failed compile.** Rejected. The stream already tells a record from a trap line, and one failure status keeps the rule short.
- **Keep `severity`.** Rejected. No warning is defined, and an absent key already means error.

## Cost

Measured with `sbx python3 -m tools.check.tokens`, on the current files and on scratch copies of the revised text.

- `spec/core/diagnostic.md`: 677 tokens before, 615 after. Down 62.
- `spec/card.md`: 244 tokens before, 252 after. Up 8. The cap is 2,000.
- One record with a fix: the RFC 0050 form (`E0006`) is 65 tokens; this form (`E6`) is 64. Down 1.
- One record without a fix, `{"code":"E100","span":{"start":4,"end":7}}`: 29 tokens.
- Trap line: `trap: divide-by-zero` is 8 tokens; the JSON form is 14.

Removed compared with RFC 0004: the message rule (one sentence, lowercase first word, no final full stop, quoted text of at most 20 bytes), the `file`, `line` and `column` keys, and the required `severity` key. RFC 0004's record was not measured, so its saving per record is not given as a number. The core spec net change is negative (measured above).

The card grows by 8 tokens because it states the failed-compile exit status and the record keys in full.

Files the implementing PR changes: `spec/core/diagnostic.md` (text as measured above), `spec/card.md`, `spec/errors.json` (codes respelled, `message` removed, `meaning` kept), the compiler's record and trap writers, and the message checker (see Open questions 1). No existing conformance test names these codes or the trap line; this was checked by searching `conformance/`, so no test is edited.

## Test plan

Each test file has a `--- meta` block with `id`, `rfc` (this RFC's number, set by the orchestrator) and `kind`. Every test below is new. None edits an existing test.

- `diag/v3-record-code.test` (compile-error): program `fn main() io { let let = 1 }`. Expected: one record `{"code":"E100","span":{"start":19,"end":22}}`, no `fix`, exit status 1.
- `diag/v3-record-fix.test` (compile-error): program `fn main() io { put(007) }`. Expected: one record `{"code":"E6","span":{"start":19,"end":22},"fix":{"span":{"start":19,"end":22},"replacement":"7"}}`, exit status 1.
- `diag/v3-record-order.test` (compile-error): program `fn main() io { put(007); put(007) }`. Expected: one record, for the literal at bytes 19 to 22, code `E6`. The second literal, at bytes 29 to 32, gets no record, because a lexical error stops compilation. Exit status 1.
- `diag/v3-clean.test` (run): program `fn main() io { put(7) }`. Expected: stdout `7` and LF, stderr empty, exit status 0.
- `diag/v3-trap-line.test` (run): program `fn main() io fail { put(1 / 0) }`. Expected: stdout empty, stderr exactly `trap: divide-by-zero` and LF, exit status 1. The `fail` mark is required by RFC 0085 F7, because the body divides.
- `diag/v3-trap-after-output.test` (run): program `fn main() io fail { put(1); put(1 / 0) }`. Expected: stdout `1` and LF, stderr exactly `trap: divide-by-zero` and LF, exit status 1.

The compile-error runner compares `code`, `span` and `fix`, and checks exit status 1. The run runner compares stdout, stderr and exit status exactly. This draft did not read `tools/check/conformance.py`, so whether the runner does this today is not verified (Open questions 3).

## Open questions

1. **Owner ruling of 2026-11-20.** That ruling requires `compiler/stage0/src/message.ts` to accept the message `source file does not end in .gl`. This draft removes message text from records and from the catalogue, so the rule has no target, and the implementing PR would remove the checker. That reverses an owner ruling, so the owner should confirm before the PR merges. Until then the checker stays.
2. **Exit status for a failed compile** (X2) is a new decision. RFC 0005 and RFC 0085 leave it open. The owner should confirm status 1.
3. **Runner behaviour.** The comparison rules in the test plan are what this RFC requires of the runner. They are not verified against the current runner.
4. **Meaning text.** `meaning` in `spec/errors.json` is for models reading the catalogue. If a benchmark shows that models repair poorly from codes alone, a later RFC may lengthen it. It is not a record field.
