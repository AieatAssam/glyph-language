---
status: rejected
votes:
  designer-min: reject
  designer-prag: reject
  impl-1: reject
  tester: reject
  user-1: abstain
  user-2: approve
---
Status: draft. Slug: diagnostic-style-v4. Class: language. Number assigned by the orchestrator.
Amends RFC 0050 (accepted; not replaced): section 1 (one format on standard error), section 2 (record keys), section 4 (catalogue fields) and section 5 (trap line). Restates RFC 0085 TR1 without change (accepted; trap status 1, plain trap line, kinds hyphenated). Does not change RFC 0014 or RFC 0004. Answers every objection to RFC 0101 (designer-safe, tester, user-1); see Motivation.

## Summary

A diagnostic is one line of standard error: compact JSON with the keys `code`, `span` and, when one edit repairs the code, `fix`. `code` is `E` and four digits, such as `"E0006"`, as RFC 0050 and RFC 0085 write it and as `spec/errors.json` lists it. `span` gives byte offsets into the source. A record has no message, file name, line, column or severity key. A model reads the code and the bytes, and the span says where to look. The catalogue in `spec/errors.json` keeps a message and a meaning for each code, so a person or a model can read what a code means.

A runtime trap is not a diagnostic. It is one plain line `trap: <kind>` on standard error, and the program exits with status 1. A compile with records also exits with status 1.

## Motivation

RFC 0050 is accepted. It removed the message, file, line and column from records, and it made the trap a JSON line with exit status 3. RFC 0085 TR1 is also accepted, and it says the trap is a plain line with exit status 1. `spec/core/diagnostic.md`, `spec/card.md` and the compiler's trap table (`TRAP_LINE` in `compiler/stage0/src/kernel/types.ts`) follow RFC 0085. RFC 0050 section 5 is the one part of the accepted set that disagrees with the rest, so this RFC amends it. RFC 0103 (rejected) gives a JSON trap with status 3; it is not a baseline.

Each objection to RFC 0101, and how this draft answers it:

- **designer-safe: codes respelled (`E6`), and `let let` expected as E100.** Codes are back to `E` and four digits (D2). For `let let` in a block, the expected code is E0003 at the second `let`, the keyword where an identifier is required. That is RFC 0014's rule (`lex/ident-keyword`) and the position rule of RFC 0102 G3 (rejected; cited only for the position). Test `diag/v4-record-code` uses it.
- **designer-safe and tester: the owner ruling of 2026-11-20 and the message checker.** RFC 0101 would have removed `compiler/stage0/src/message.ts`. This draft does not. The catalogue keeps a `message` for each code (D2), so the ruling's example, `source file does not end in .gl` (E0010), still has a target and the checker keeps its tests. Only records lose the message, which RFC 0050 section 2 already removed. Open question 1 asks the owner to confirm that reading.
- **tester and designer-safe: RFC 0050's status.** RFC 0050 is accepted. This draft does not supersede it. It amends the four sections named in the header. Open question 3 covers the rest.
- **tester: the test expectations.** `diag/v4-record-code` expects E0003, not E100. The record tests use the `E0xxx` form. No test edits an existing file (none exists under `conformance/diag/`; see Test plan).
- **user-1: trap form conflicts with RFC 0103.** RFC 0103 is rejected. This draft uses the form of RFC 0085 TR1, which matches the repo. The trap form is the same in T1 here, in the core spec and in the card.
- **user-1: a person loses the message text.** The message stays in the catalogue, next to the meaning. Records do not carry it, because the code and the span are enough for a model to repair the code, and the purpose clause puts no human reader ahead of tokens.

Scope. This RFC covers the diagnostic record, the catalogue fields, the exit status of a compile and of a trap, and the trap line. It does not change the grammar, the kernel's semantics or the limits in RFC 0085.

## Design

Normative. "Must" and "is" bind implementers.

### Records

D1. A record is one line on standard error. It is compact JSON with no spaces. Its keys are, in this order: `code`, `span`, `fix`. `fix` is optional. No other key is written. This amends RFC 0050 section 2, which listed `severity` as optional; no warning is defined, so the key goes.

D2. `code` is a JSON string: `E`, then four decimal digits, such as `"E0006"` (lexical) or `"E0100"` (syntax). The blocks are: lexical E0001 to E0099; syntax E0100 to E0199; types E0200 to E0299; name resolution E0300 to E0399; effects and capabilities E0400 to E0499; limits and constants E0500 to E0599. Each code appears once in `spec/errors.json` as `{"code":"E0006","message":"...","meaning":"..."}`. `message` is the catalogue sentence and is checked by `message.ts` under RFC 0004 section 2 as the owner ruled. `meaning` is a noun phrase of at most ten words. Neither is written into records. This amends RFC 0050 section 4, which listed `meaning` only. Codes are never reused. A removed code stays in the file with `"retired":true`. A new code takes the next unused number in its block.

D3. `span` is `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line, and `end` is exclusive. `span` is required.

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. `fix` is present only when one edit does that. When `fix` is present, `fix.span` is written in full, even when it equals `span`, because the gate reads it.

D5. Nothing that can be derived is written. There is no `file`, `message`, `line`, `column` or `severity`. A tool computes line and column from `span.start` and the source bytes.

D6. Records are written in order of `span.start`, then `code`. A lexical error stops compilation after the first one. Later phases may write several records.

Example, a leading zero in `007` at bytes 19 to 22 of `fn main() io { put(007) }`:
`{"code":"E0006","span":{"start":19,"end":22},"fix":{"span":{"start":19,"end":22},"replacement":"7"}}`

Example, `let` where a name is required, at bytes 19 to 22 of `fn main() io { let let = 1 }`:
`{"code":"E0003","span":{"start":19,"end":22}}`

E0003 is new. The PR that first emits it adds it to `spec/errors.json` (RFC 0014 rule: a code is added by the PR that first emits it).

### Exit status

X1. A compile with no records writes nothing to standard error and exits with status 0.

X2. A compile with one or more records exits with status 1. RFC 0050 left this open. Open question 2 asks the owner to confirm it.

### Traps

T1. A trap ends the run with exit status 1 through WASI `proc_exit`. Before it exits, the runtime writes one line to standard error: the text `trap: ` followed by the kind, then LF. The line is plain text, not JSON. Output written before the trap stays written. This amends RFC 0050 section 5 and restates RFC 0085 TR1.

T2. The kinds are `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`, spelled as RFC 0085 TR1 spells them and as `TRAP_KINDS` in the compiler spells them. A trap line has no code, span or fix. The runtime writes nothing else to standard error.

T3. A process writes records or one trap line, never both. A line that starts with `{"code"` is a record. A line that starts with `trap: ` is a trap line. Stderr therefore has two forms. RFC 0050 section 1 forbade that. The reason for the change is that RFC 0085 TR1 and the repo already use the plain line, and this rule says how a reader tells the two apart.

T4. `run` executes only a program that compiled with no records. Examples are evaluated at compile time (RFC 0085 EX3), so an example that fails is a record (E0202), not a trap.

## Alternatives

- **Respell codes as `E6`.** Rejected for this RFC. It saves one token per record (65 to 64 measured below). It changes every code, the card, the catalogue and the tests, and it contradicts the form of RFC 0050, RFC 0085 and RFC 0103 and of the existing catalogue. Principle 8 favours the shorter form, so the owner may want it. It needs its own RFC, which renames all codes in one change.
- **Trap with status 3 and a JSON line** (RFC 0050 section 5, RFC 0103). Rejected. RFC 0085 TR1 is accepted and says 1; the card and core spec say 1; and the form costs more tokens.
- **JSON trap line** `{"trap":"divide-by-zero"}`. Rejected. It costs more tokens than the plain line, and it is not the accepted spelling.
- **Keep the message in records.** Rejected. A record is read by models, and the catalogue gives the sentence for each code without spending tokens on every record.
- **Keep `severity`.** Rejected. No warning is defined, and an absent key already means error.
- **Span as an array `[start,end]`.** Rejected. The gate reads `start` and `end` keys (RFC 0050 finding 2).
- **Exit status 2 for a failed compile.** Rejected. The stream already tells a record from a trap line, and one failure status keeps the rule short.

## Cost

Measured with `sbx python3 -m tools.check.tokens`. The revised core text and card text were measured as scratch copies in the session; they are not repo files.

- `spec/core/diagnostic.md`: 677 tokens now; 648 under this draft. Down 29. The cap is 12,000.
- `spec/card.md`, whole card: 244 tokens now; 231 with this draft's diagnostics section in place of the old one (header and kernel text unchanged). Down 13. The cap is 2,000.
- One record with a fix, code `E0006`: 65 tokens. The `E6` form in RFC 0101 was 64. The difference is the price of keeping the code family.
- One record without a fix, code `E0003`: 30 tokens.
- Trap line `trap: divide-by-zero`: 8 tokens.

Removed compared with RFC 0050 as it stands: the `severity` key and its rule. The catalogue's `message` field stays in `spec/errors.json`, which is not in the spec core or the card, so it adds nothing to the budget. Net change to the spec core is negative.

Files the implementing PR changes: `spec/core/diagnostic.md` and the diagnostics section of `spec/card.md` (text as Design states); `spec/errors.json` (add E0003; keep `message` on every entry); the compiler's record and trap writers, which drop `severity` and write the plain trap line; `tools/check/conformance.py`, which matches `span` and `fix` on a subset basis and tests trap stderr by substring (see Open question 4). No existing conformance test names these lines; `conformance/` has only `kernel/` and `lex/`, and the `diag/` tests named in RFC 0050 were never written. No existing test is edited.

## Test plan

Each test file has a `--- meta` block with `id`, `rfc` (this RFC's number, set by the orchestrator) and `kind`. Every test below is new, under `conformance/diag/`. None edits an existing test.

- `diag/v4-record-code` (compile-error): program `fn main() io { let let = 1 }`. Expected record `{"code":"E0003","span":{"start":19,"end":22}}`, no `fix`, exit status 1.
- `diag/v4-record-fix` (compile-error): program `fn main() io { put(007) }`. Expected record `{"code":"E0006","span":{"start":19,"end":22},"fix":{"span":{"start":19,"end":22},"replacement":"7"}}`, exit status 1.
- `diag/v4-record-order` (compile-error): program `fn main() io { put(007); put(007) }`. Expected: one record, the `E0006` above for bytes 19 to 22. The second literal, at bytes 29 to 32, gets no record, because a lexical error stops compilation. Exit status 1.
- `diag/v4-clean` (run): program `fn main() io { put(7) }`. Expected: stdout `7` and LF, stderr empty, exit status 0.
- `diag/v4-trap-line` (run): program `fn main() io fail { put(1 / 0) }`. Expected: stdout empty, stderr exactly `trap: divide-by-zero` and LF, exit status 1. The `fail` mark is required by RFC 0085 F7.
- `diag/v4-trap-after-output` (run): program `fn main() io fail { put(1); put(1 / 0) }`. Expected: stdout `1` and LF, stderr exactly `trap: divide-by-zero` and LF, exit status 1.
- `diag/v4-trap-overflow` (run): program `fn main() io fail { put(9223372036854775807 + 1) }`. Expected: stderr exactly `trap: overflow` and LF, exit status 1.
- `diag/v4-keys` (check): every record in every compile-error test has only the keys `code`, `span` and `fix`; `span` and `fix.span` have only `start` and `end`; no record has `severity`, `message`, `file`, `line` or `column`.
- `diag/v4-catalogue` (check): every code in an expected record appears exactly once in `spec/errors.json`, carries `message` and `meaning`, lies in its block, and is not `retired`.
- `diag/v4-trap-kinds` (check): the four kinds in T2 are the set of the compiler's `TRAP_KINDS`, and each trap line matches `trap: <kind>` with nothing else on stderr.

## Open questions

1. **Owner ruling of 2026-11-20.** The ruling requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This draft keeps the checker and the catalogue `message` field, so the ruling still has a target. It reads the ruling as binding catalogue messages, not record messages, and records lose only what RFC 0050 already removed. The owner should confirm that reading. If the owner reads the ruling as binding records, this RFC cannot be voted, because it would have to keep the record message.
2. **Exit status for a failed compile** (X2). RFC 0050 and RFC 0085 leave it open. This draft uses 1. The owner should confirm.
3. **RFC 0050.** It is accepted and is amended here, not replaced. If the owner wants RFC 0050 superseded in full, the owner must say so, and the superseding RFC names it.
4. **Runner behaviour.** `tools/check/conformance.py` matches `code`, `span` and `fix` as subsets: an expected record with no `fix` passes even if the actual record has one. Trap stderr is a substring match. The tests above need exact comparison, so the PR changes the runner, or the `diag/v4-keys` check covers the absent keys and the trap test states the full line. This draft did not verify the runner's behaviour on a live run.
5. **Whole-program `let let = 1`.** RFC 0050's `diag/record-shape` expects E0100 at bytes 4 to 7; RFC 0014's `lex/ident-keyword` expects E0003 at bytes 0 to 3. The two accepted RFCs disagree on the whole-program form. This draft uses only the block form, where both agree on the keyword rule. The owner should settle the whole-program form.
6. **Code spelling.** `E6` against `E0006` is open (Alternatives). Principle 8 favours `E6`. A separate RFC could make the change for every code at once.
