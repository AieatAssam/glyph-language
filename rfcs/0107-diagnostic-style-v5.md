---
status: rejected
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: approve
  tester: approve
  user-1: approve
  user-2: reject
---
# RFC draft: Diagnostic style

Status: draft (attempt 5). Slug: diagnostic-style-v5. Class: language. Number assigned by the orchestrator.
Replaces RFC 0106 (diagnostic-style-v4, rejected). Keeps what voters accepted there: the record without a message, the trap line, exit status 1 for a trap, and the catalogue's `message` field.
Depends on: RFC 0104 (lexical-syntax-v6, accepted; syntax, tokens and the lexical codes); RFC 0105 (kernel-v46; kernel rules, trap kinds in TR1, examples in EX3); RFC 0093 (meanings of E200 to E403); RFC 0085 TR1 and RFC 0050 (accepted).
Amends: RFC 0050 section 2 (record keys: `severity` removed), section 4 (catalogue fields: `message` kept, `meaning` one line), section 5 (trap line). Changes the spelling of every diagnostic code (S1); it does not change any code's number, block or meaning.

## Summary

A diagnostic is one line of standard error: compact JSON with the keys `code`, `span` and, when one edit repairs the code, `fix`. A code is `E` and a decimal number with no leading zero: `"E6"` for an integer literal with a leading zero, `"E100"` for an unexpected token. A record has no message, file, line, column or severity. A model reads the code and the bytes; the span says where to look.

The catalogue `spec/errors.json` keeps a message and a meaning for each code. `glyphc explain E6` prints the entry, so a user who has only the command line and the card can reach what a code means.

A runtime trap is not a diagnostic. It is one plain line `trap: <kind>` on standard error, and the program exits with status 1. A compile with records also exits with status 1.

## Motivation

RFC 0106 was rejected by four voters. Each objection, and how this draft answers it:

- **designer-min: test programs in the superseded syntax.** Every test program here is in RFC 0104's canonical form (`main io{put 1}`, no `;`, no `put(...)`, no `fn`, no parentheses on a declaration with no parameters). Each span is recomputed from the program's bytes. The spans are listed in Test plan.
- **designer-prag: principle 8 and the code spelling.** Principle 8 says a longer form is allowed only when measurement shows models make fewer errors with it. The bench has no finding on code spelling, and this RFC cannot produce one. So the spelling is the one principle 8 makes the default: the shorter form. This draft switches D2, the examples and the tests to `E6`. The switch changes every code (S1), so the catalogue, the card and the records use one spelling (principle 1). Measured: one record with a fix is 64 tokens in the new form and 65 in the old.
- **impl-1: tests and dependencies.** Tests are written in RFC 0104's syntax, and the dependencies are named above. The tests depend on RFC 0104 and RFC 0105. They do not call `print`, so they do not depend on RFC 0105's gate G-c (retirement of `print-one`). They do depend on the owner's reading of the 2026-11-20 ruling, which Open question 1 states.
- **tester: syntax and dependency.** Same answer as impl-1. The test that RFC 0106 wrote as `fn main() io { let let = 1 }` is now `main io{let let=1}`, with the span at bytes 12 to 15, since RFC 0104 gives E100 for `fn` and E3 for a keyword in a name position.
- **user-1: the catalogue is not reachable from the command line.** D7 adds `glyphc explain CODE`. K1 gives the new card text in full, so a reader can check the card against this RFC. The card no longer describes the message-bearing record.

Scope. This RFC covers the diagnostic record, the code spelling and catalogue fields, the `explain` command, the exit status of a compile and of a trap, and the trap line. It does not change the grammar, the kernel's semantics or the limits in RFC 0085.

## Design

Normative. "Must" and "is" bind implementers.

### Records

D1. A record is one line on standard error. It is compact JSON with no spaces. Its keys are, in this order: `code`, `span`, `fix`. `fix` is optional. No other key is written. `severity` is removed (RFC 0050 section 2 listed it as optional; no warning is defined, and an absent key already means error).

D2. `code` is a JSON string: `E` followed by a decimal number with no leading zero. The numbers in each block are:

- lexical: E1 to E99;
- syntax: E100 to E199;
- types: E200 to E299;
- name resolution: E300 to E399;
- effects and capabilities: E400 to E499;
- limits and constants: E500 to E599.

Each code is listed once in `spec/errors.json` as `{"code":"E6","message":"...","meaning":"..."}`. `message` is one sentence, checked by `message.ts` under RFC 0004 section 2 as the owner ruled. `meaning` is one line. Neither is written into records. Codes are never reused. A removed code stays in the file with `"retired":true`. A new code takes the next unused number in its block. E3 is new: the PR that first emits it adds it, with message `keyword used where a name is required` and meaning `a reserved word stands where the grammar needs a name`. Its block is lexical, as RFC 0104's table gives it.

D3. `span` is `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line. `end` is exclusive. `span` is required.

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. `fix` is present only when one edit does that. When `fix` is present, `fix.span` is written in full, even when it equals `span`, because the gate reads it.

D5. Nothing that can be derived is written. A tool computes line and column from `span.start` and the source bytes.

D6. Records are written in order of `span.start`, then `code`. A lexical error stops compilation after the first one. Later phases may write several records.

D7. `glyphc explain CODE` writes the catalogue entry for `CODE` to standard output as one line of compact JSON, with the keys `code`, `message`, `meaning` in that order, and `retired` when the entry has it. It exits with status 0. For a code that is not in the catalogue, it writes nothing to standard output and exits with status 1. The command must work without the repository on the path: the compiler carries the catalogue in its build.

Example, a leading zero in `007` at bytes 12 to 15 of `main io{put 007}`:
`{"code":"E6","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}`

Example, `let` where a name is required, at bytes 12 to 15 of `main io{let let=1}`:
`{"code":"E3","span":{"start":12,"end":15}}`

### Exit status

X1. A compile with no records writes nothing to standard error and exits with status 0.

X2. A compile with one or more records exits with status 1. RFC 0050 left this open. Open question 2 asks the owner to confirm it.

### Traps

T1. A trap ends the run with exit status 1 through WASI `proc_exit`. Before it exits, the runtime writes one line to standard error: the text `trap: ` followed by the kind, then LF. The line is plain text, not JSON. Output written before the trap stays written. This amends RFC 0050 section 5 and restates RFC 0085 TR1 and RFC 0105 TR1.

T2. The kinds are `overflow`, `divide-by-zero`, `stack-exhausted` and `step-exhausted`, spelled as RFC 0085 TR1 and RFC 0105 TR1 spell them and as `TRAP_KINDS` in the compiler spells them. A trap line has no code, span or fix. The run writes nothing else to standard error.

T3. A process writes records (a compile) or one trap line (a run), never both. A line that starts with `{"code"` is a record. A line that starts with `trap: ` is a trap line.

T4. `run` executes only a program that compiled with no records. Examples are evaluated at compile time (RFC 0105 EX3), so a failing example is a record (E202), not a trap.

### Card

K1. The implementing PR replaces `spec/card.md` with the following text. It is the whole card, measured at 261 tokens.

```
# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one compact JSON line on stderr: `{"code":"E6","span":{"start":N,"end":N}}`. `code` is `E` and a decimal number with no leading zero. `span` gives byte offsets, end exclusive. Optional `"fix":{"span":{...},"replacement":S}` when one edit repairs the code.

Meaning of a code: `glyphc explain E6` prints its catalogue entry (`spec/errors.json`).

No errors: no stderr, exit 0. Compile with records: exit 1. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E1-E99 lexical, E100-E199 syntax, E200-E299 types, E300-E399 names, E400-E499 effects, E500-E599 limits. Never reused.
```

### Spelling and core text

S1. Every diagnostic code is spelled as D2 gives it. An `E` code in an accepted RFC, in RFC 0093's table, in the tables of RFCs 0104 and 0105, or in `spec/errors.json` is read in this spelling: `E` and the number with the leading zeros removed. So E0006 is `E6`, E0100 is `E100` and E0003 is `E3`. The number, block and meaning do not change. No accepted RFC file is edited. The implementing PR rewrites `spec/errors.json`, `spec/core/diagnostic.md`, `spec/card.md`, and every code string the compiler emits or the conformance runner compares.

S2. `spec/core/diagnostic.md` states D1 to D7, X1, X2 and T1 to T4 in the words of this RFC, with the "Codes" and "Runtime traps" headings. Measured in a scratch copy, it is 631 tokens.

## Alternatives

- **Keep `E0006` and the four-digit form (RFC 0106 D2).** Rejected. Principle 8 makes the shorter form the default, and no measurement supports the longer one. Keeping it in records while the catalogue used the other form would be two spellings (principle 1), so the switch covers every code at once (S1).
- **Keep the four-digit form and measure repair errors first.** Rejected for this attempt. No bench finding covers code spelling, and the measurement needs the record shape fixed first. Open question 3 offers it as a later RFC, which would have to show fewer repair errors with the longer form before it could win.
- **Put the message in records.** Rejected. A model that repairs code reads the code and the bytes. The catalogue gives the sentence for each code without spending tokens on each record.
- **Explain through a file the user opens.** Rejected. A user with only the command line and the card has no path to a file. `glyphc explain` is one command, and D7 requires it to work without the repository.
- **Trap as one JSON line with status 3 (RFC 0050 section 5, RFC 0103).** Rejected. RFC 0085 TR1 and RFC 0105 TR1 say status 1 and a plain line. The card and core text say the same, and the JSON form costs more tokens.

## Cost

Measured with `sbx python3 -m tools.check.tokens` on scratch files in `out/scratch/` (not repo files):

- `spec/core/diagnostic.md`: 677 now; 631 under this draft (S2). Down 46. The cap is 12,000.
- `spec/card.md`, whole card: 244 now; 261 with K1's text. Up 17. The cap is 2,000. The growth is the `glyphc explain` pointer on the card. It is paid for by the core, which goes down 46, so the total spec text shrinks by 29.
- One record with a fix, code `E6`: 64 tokens. The same record with `E0006`: 65.
- One record without a fix, code `E3`: 29 tokens. With `E0003`: 30.

Removed compared with RFC 0050 as it stands: the `severity` key and its rule; the file, line and column rules; the message rule in the spec core (the message stays in the catalogue, which is not in the spec core or the card). Added: D7, the `explain` command, and the spelling rule S1 (which changes no count, since each code is one token shorter).

Files the implementing PR changes: `spec/core/diagnostic.md`, `spec/card.md`, `spec/errors.json` (rename every code; add E3; keep `message` on every entry), the compiler's record and trap writers (drop `severity`, write the plain trap line, write the new code spelling), the compiler's `explain` command, and `tools/check/conformance.py` (see Open question 4). No accepted RFC file is edited.

## Test plan

Each test file has a `--- meta` block with `id`, `rfc` (this RFC's number, set by the orchestrator) and `kind`. Every test below is new, under `conformance/diag/`. Test ids are `diag/v5-<name>`. Byte offsets count from the first byte of the program; "bytes a to b" means start a, end b, exclusive. Every program is in canonical layout (RFC 0104 rule 4). Run programs pass the kernel's checks (RFC 0105), so a program with a binary `+ - * / %` in its body carries `fail`.

Compile-error tests (exit status 1; one record each):

- `diag/v5-record-code`: program `main io{let let=1}`. Expected record `{"code":"E3","span":{"start":12,"end":15}}`, no `fix`. The second `let`, at bytes 12 to 15, is the keyword where a name is required (RFC 0104 G3).
- `diag/v5-record-fix`: program `main io{put 007}`. Expected record `{"code":"E6","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}`.
- `diag/v5-record-order`: program `main io{put 007 put 007}`. Expected: one record, the `E6` above for bytes 12 to 15. The second literal, at bytes 20 to 23, gets no record, because a lexical error stops compilation.

Run tests (stdout and stderr as stated):

- `diag/v5-clean`: program `main io{put 7}`. Stdout `7` and LF; stderr empty; exit status 0.
- `diag/v5-trap-line`: program `main io fail{put 1/0}`. Stdout empty; stderr exactly `trap: divide-by-zero` and LF; exit status 1.
- `diag/v5-trap-after-output`: program `main io fail{put 1 put 1/0}`. Stdout `1` and LF; stderr exactly `trap: divide-by-zero` and LF; exit status 1.
- `diag/v5-trap-overflow`: program `main io fail{put 9223372036854775807+1}`. Stdout empty; stderr exactly `trap: overflow` and LF; exit status 1.

Check tests:

- `diag/v5-keys`: every record in every compile-error test above has only the keys `code`, `span` and `fix`; `span` and `fix.span` have only `start` and `end`; no record has `severity`, `message`, `file`, `line` or `column`.
- `diag/v5-catalogue`: every code in an expected record (`E3`, `E6`) appears exactly once in `spec/errors.json`, carries `message` and `meaning`, lies in its block, and is not `retired`.
- `diag/v5-trap-kinds`: the four kinds in T2 are the set of the compiler's `TRAP_KINDS`, and each trap line matches `trap: <kind>` with nothing else on stderr.
- `diag/v5-explain`: `glyphc explain E6` writes exactly `{"code":"E6","message":"integer literal has a leading zero","meaning":"an integer literal starts with 0 and has more digits"}` and LF to stdout, and exits with status 0. `glyphc explain E7` (no catalogue entry) writes nothing to stdout and exits with status 1.

## Open questions

1. **Owner ruling of 2026-11-20.** The ruling requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This draft keeps the checker and the catalogue `message` field, so the ruling still has a target (E10 in the new spelling). It reads the ruling as binding catalogue messages, not record messages; records lose only what RFC 0050 already removed. This RFC depends on that reading. If the owner reads the ruling as binding records, this RFC cannot be voted, because it would have to keep the record message.
2. **Exit status for a failed compile** (X2). RFC 0050 and RFC 0085 leave it open. This draft uses 1. The owner should confirm.
3. **Repair measurement.** A later RFC could restore the four-digit form if a measured repair comparison shows models make fewer errors with it. It would have to change S1 back for every code, and name this RFC as the one it amends.
4. **Runner behaviour.** `tools/check/conformance.py` matches `code`, `span` and `fix` as subsets: an expected record with no `fix` passes even if the actual record has one. Trap stderr is matched as a substring. The `diag/v5-keys` check covers the absent keys, and the trap tests state the full line. This draft did not run the runner.
5. **RFC 0105's gates.** RFC 0105's front matter says accepted, but its body lists gates G-a to G-d as open. The tests here need RFC 0105's kernel rules, not its gates. The owner should confirm which status governs.
