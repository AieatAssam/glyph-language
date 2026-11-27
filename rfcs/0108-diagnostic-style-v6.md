---
status: rejected
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: approve
  impl-2: reject
  tester: approve
---
# RFC draft: Diagnostic style

Status: draft (attempt 6). Slug: diagnostic-style-v6. Class: language. Number assigned by the orchestrator.
Replaces RFC 0107 (diagnostic-style-v5, rejected). Keeps what voters accepted there: the record without a message, the trap line, exit status 1 for a trap, the catalogue's `message` field, and the `E` plus decimal spelling.
Depends on: RFC 0104 (lexical-syntax-v6, accepted; it assigns E0002 and E0003 and gives their tables); RFC 0105 (kernel-v46; kernel rules, trap kinds in TR1, examples in EX3); RFC 0093 (meanings of E200 to E403); RFC 0085 TR1 and RFC 0050 (accepted).
Amends: RFC 0050 section 2 (record keys: `severity` removed; `span` defined in D3), section 4 (catalogue fields: `message` kept, `meaning` one line), section 5 (trap line). Changes the spelling of every diagnostic code (S1). It changes no code's number, block or meaning, except that it adds E2 and E3 to the catalogue (D2).

## Summary

A diagnostic is one line of standard error: compact JSON with the keys `code`, `span` and, when one edit repairs the code, `fix`. A code is `E` and a decimal number with no leading zero: `"E6"` for an integer literal with a leading zero, `"E100"` for an unexpected token. `span` is the byte range in the source file named on the command line. A record has no message, file, line, column or severity. A model reads the code and the bytes; a tool computes line and column when it needs them.

The message and the meaning of each code are in the catalogue `spec/errors.json`. `glyphc explain E6` prints the entry. It is the only route from a code to its message. It works offline, because the compiler carries the catalogue.

A runtime trap is not a diagnostic. It is one plain line `trap: <kind>` on standard error, and the program exits with status 1. A compile with records also exits with status 1.

## Motivation

RFC 0107 was rejected by three voters. Each objection, and how this draft answers it:

- **designer-min: an absent `fix` is not checked.** `_matches` in `tools/check/conformance.py` (line 154) passes a record that carries a `fix` when the expected record has none, so a spurious fix passes every test. This draft makes an absent `fix` exact: R1 changes the runner, and `diag/v6-no-fix` fails on a record that carries a `fix`. Agents cannot write `tools/`, so R1 is applied by the owner (Open question 4). Until it is applied, `diag/v6-no-fix` runs with the old rule and proves nothing about `fix`.
- **designer-safe: the rewrite list was incomplete.** The draft-time search found E0-form codes in `spec/core/name.md` (line 9, E0010), in `spec/card.md`, `spec/core/diagnostic.md`, `spec/errors.json`, `CONTRACTS.md` (one occurrence), and in the compiler sources and their unit tests listed in S1. Each is named in S1 and in Cost. No file under `conformance/` contains an E0-form code, so the rename breaks no existing conformance test. The unit test `compiler/stage0/src/e0010.test.ts` asserts `E0010` and is named as changed.
- **user-2: the span format was undefined, and the code ranges and the message route were not stated.** D3 defines the span. D5 says which fields are not written and why. The code ranges (Design, D2) are ranges of the number, and removing the zero padding does not move any code, so they hold unchanged. D5 and D7 state that `glyphc explain` is the only route to a message.

Scope. This RFC covers the diagnostic record, the code spelling and catalogue fields, the `explain` command, the exit status of a compile and of a trap, the trap line, and the runner rule for `fix`. It does not change the grammar, the kernel's semantics or the limits in RFC 0085.

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

Each code is listed once in `spec/errors.json` as `{"code":"E6","message":"...","meaning":"..."}`. `message` is one sentence, checked by `message.ts` under RFC 0004 section 2 as the owner ruled. `meaning` is one line. Neither is written into records. Codes are never reused. A removed code stays in the file with `"retired":true`. A new code takes the next unused number in its block.

Two codes are new to the catalogue. RFC 0104 assigns them and says the first PR that emits each adds it. The implementing PR adds both:

- `{"code":"E2","message":"layout is not canonical","meaning":"a gap between tokens is not the canonical gap, or a line feed stands outside a text literal"}` (RFC 0104 rule 4);
- `{"code":"E3","message":"keyword used where a name is required","meaning":"a reserved word stands where the grammar needs a name"}` (RFC 0104 G3).

D3. `span` is `{"start":N,"end":N}`. `start` and `end` are byte offsets into the one source file named on the command line. `end` is exclusive. `span` is required. The file name is not written: it is the argument the compiler was given. Line and column are not written (D5).

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. `fix` is present only when one edit does that. When `fix` is present, `fix.span` is written in full, even when it equals `span`, because the gate reads it. When `fix` is absent, no `fix` key is written (R1 checks this).

D5. Nothing that can be derived is written. A record has no message, file, line or column. A tool computes line and column from `span.start` and the source bytes. A reader who needs the message of a code runs `glyphc explain CODE` (D7). No other route to a message exists.

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

K1. The implementing PR replaces `spec/card.md` with the following text. It is the whole card.

```
# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one compact JSON line on stderr: `{"code":"E6","span":{"start":N,"end":N}}`. `code` is `E` and a decimal number with no leading zero. `span` gives byte offsets into the file named on the command line, end exclusive. Optional `"fix":{"span":{...},"replacement":S}` when one edit repairs the code.

Meaning and message of a code: `glyphc explain E6` prints its catalogue entry (`spec/errors.json`). Nothing else on stderr says what a code means.

No errors: no stderr, exit 0. Compile with records: exit 1. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E1-E99 lexical, E100-E199 syntax, E200-E299 types, E300-E399 names, E400-E499 effects, E500-E599 limits. Never reused.
```

### Runner rule (R1)

R1. `tools/check/conformance.py` `_matches` (line 147 onward) is changed so that the JSON form of an expected record requires `fix` to be exact. The replacement for its last two statements is:

```python
    if "fix" in exp:
        return "fix" in act and _subset(exp["fix"], act["fix"])
    return "fix" not in act
```

The `CODE LINE` form is unchanged. No test in this RFC uses it. Agents cannot write `tools/`, so the owner applies R1.

### Spelling and core text

S1. Every diagnostic code is spelled as D2 gives it. An `E` code in an accepted RFC, in RFC 0093's table, in the tables of RFCs 0104 and 0105, or in `spec/errors.json` is read in this spelling: `E` and the number with the leading zeros removed. So E0006 is `E6`, E0100 is `E100`, E0002 is `E2` and E0003 is `E3`. The number, block and meaning do not change. No accepted RFC file is edited.

The implementing PR rewrites every E0-form code in these files:

- `spec/errors.json`: every code; adds E2 and E3 (D2).
- `spec/core/diagnostic.md`: replaced by S2.
- `spec/card.md`: replaced by K1.
- `spec/core/name.md`: line 9, `E0010` becomes `E10`.
- `CONTRACTS.md`: its one occurrence.
- `compiler/stage0/src/`: every code string the compiler emits, and every comment that names a code, in `diagnostic.ts`, `cli.ts`, `codegen.ts`, `kernel/parse-expr.ts`, `lexer/index.ts`, `lexer/ident.ts`, `lexer/int.ts`, `lexer/punct.ts`, `lexer/records.ts`, `lexer/source.ts`, `lexer/text.ts`, and `parser/parse.ts`. The record writer drops `severity`, writes no message, and writes the plain trap line.
- Unit tests that assert E0-form strings, all under `compiler/stage0/src/`: `parser/parse.test.ts`, `lexer/ident.test.ts`, `lexer/int.test.ts`, `lexer/lex.test.ts`, `lexer/punct.test.ts`, `lexer/records.test.ts`, `lexer/source.test.ts`, `lexer/text.test.ts`, `lexer/codes.test.ts`, `main.test.ts`, `kernel/parse-expr.test.ts`, `catalogue.test.ts`, `catalogue-check.test.ts`, `cli.test.ts`, `codegen.test.ts`, `diagnostic.test.ts`, `diagnostic-order.test.ts`. `e0010.test.ts` is renamed `e10.test.ts` and asserts `E10`.

The implementing PR also adds `glyphc explain` (D7), and runs the check in Test plan `diag/v6-spelling`.

Not changed by the implementing PR, because agents cannot write these paths: `docs/SPEC.md`, `site/README.md`, `governance/premise/0050.md`, `governance/premise/0085.md`, `governance/premise/0093.md`, and `tools/check/conformance.py` (R1, owner-applied). They keep the E0-form spelling. S1 is the rule for reading them. The owner updates them.

S2. `spec/core/diagnostic.md` states D1 to D7, X1, X2 and T1 to T4 in the words of this RFC, under the headings "Records", "Exit status" and "Runtime traps". It replaces the current file, which has a "Codes" table and a "Tests" section. The block table moves into D2 as a line per block, and the "Tests" section is dropped because the Test plan is the place for test lists.

## Alternatives

- **Keep `E0006` and the four-digit form (RFC 0107 D2).** Rejected. Principle 8 makes the shorter form the default, and no measurement supports the longer one. Keeping it in records while the catalogue used the other form would be two spellings (principle 1), so the switch covers every code at once (S1).
- **Keep the four-digit form and measure repair errors first.** Rejected for this attempt. No bench finding covers code spelling. Open question 3 offers it as a later RFC.
- **Put the message in records.** Rejected. A model that repairs code reads the code and the bytes. The catalogue gives the sentence for each code without spending tokens on each record. Measured below: a record with the message and the old keys costs 115 tokens; the v6 record with the same fix costs 64.
- **Keep line and column in records.** Rejected. Both are derivable from `span.start` and the source bytes (principle 1; D5). Each costs tokens in every record.
- **Re-split the code ranges.** Rejected. The ranges are of the number. `E1` to `E99` contain the same numbers as `E0001` to `E0099`, so the blocks are unchanged.
- **Explain through a file the user opens.** Rejected. A user with only the command line and the card has no path to a file. `glyphc explain` is one command and D7 requires it to work without the repository.
- **Trap as one JSON line with status 3 (RFC 0050 section 5, RFC 0103).** Rejected. RFC 0085 TR1 and RFC 0105 TR1 say status 1 and a plain line. The card and core text say the same, and the JSON form costs more tokens.

## Cost

Measured with `sbx python3 -m tools.check.tokens` on scratch files in `out/scratch/` (not repo files), counted on the texts in this draft:

- `spec/core/diagnostic.md`: 677 now; 746 under S2. Up 69. The cap is 12,000.
- `spec/card.md`: 244 now; 287 under K1. Up 43. The cap is 2,000.
- Growth in the spec: 112 tokens, for the `explain` pointer, the span definition (D3), the exit-status and trap rules written out, and the message route (D5, D7).
- One record with a fix, code `E6`: 64 tokens. The same record in the current format (`E0006`, `severity`, `message`, `file`, `line`, `column`): 115. Saving: 51 per record.
- One record without a fix, code `E3`: 29 tokens.

The saving pays for the growth after three records. Removed by this draft: the `severity` key and its rule; the file, line and column rules; the message rule in the spec core (the message stays in the catalogue, which is not in the spec core or the card); the four-digit form. Added: D7, the `explain` command, the span definition, and the spelling rule S1 (which changes no count, since each code is one token shorter).

Files the implementing PR changes are listed in S1. Agents cannot write `tools/`, `docs/`, `site/` or `governance/`, so R1 and the four files in S1 under "Not changed" are owner work.

## Test plan

Each test file has a `--- meta` block with `id`, `rfc` (this RFC's number, set by the orchestrator) and `kind`. Every test below is new, under `conformance/diag/`. Test ids are `diag/v6-<name>`. Byte offsets count from the first byte of the program; "bytes a to b" means start a, end b, exclusive. Every program is in canonical layout (RFC 0104 rule 4). Run programs pass the kernel's checks (RFC 0105), so a program with a binary `+ - * / %` in its body carries `fail`. Every expected record in a compile-error test is written in JSON form (not the `CODE LINE` form), so R1 applies.

Compile-error tests (exit status 1; one record each unless stated):

- `diag/v6-no-fix`: program `main io{let let=1}`. Expected record `{"code":"E3","span":{"start":12,"end":15}}`. No `fix` is expected. This test fails on a record that carries a `fix`, once R1 is applied. The second `let`, at bytes 12 to 15, is the keyword where a name is required (RFC 0104 G3).
- `diag/v6-record-fix`: program `main io{put 007}`. Expected record `{"code":"E6","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}`.
- `diag/v6-record-order`: program `main io{put 007 put 007}`. Expected: one record, the `E6` above for bytes 12 to 15. The second literal, at bytes 20 to 23, gets no record, because a lexical error stops compilation.

Run tests (stdout and stderr as stated):

- `diag/v6-clean`: program `main io{put 7}`. Stdout `7` and LF; stderr empty; exit status 0.
- `diag/v6-trap-line`: program `main io fail{put 1/0}`. Stdout empty; stderr exactly `trap: divide-by-zero` and LF; exit status 1.
- `diag/v6-trap-after-output`: program `main io fail{put 1 put 1/0}`. Stdout `1` and LF; stderr exactly `trap: divide-by-zero` and LF; exit status 1.
- `diag/v6-trap-overflow`: program `main io fail{put 9223372036854775807+1}`. Stdout empty; stderr exactly `trap: overflow` and LF; exit status 1.

Check tests (run by the gate rules the implementing PR adds; they are not `.test` kinds):

- `diag/v6-keys`: every record in every compile-error test above has only the keys `code`, `span` and `fix`; `span` and `fix.span` have only `start` and `end`; no record has `severity`, `message`, `file`, `line` or `column`.
- `diag/v6-catalogue`: every code in an expected record (`E3`, `E6`) and the two new codes `E2` and `E3` appear exactly once in `spec/errors.json`, carry `message` and `meaning`, lie in their block, and are not `retired`.
- `diag/v6-trap-kinds`: the four kinds in T2 are the set of the compiler's `TRAP_KINDS`, and each trap line matches `trap: <kind>` with nothing else on stderr.
- `diag/v6-explain`: `glyphc explain E6` writes exactly `{"code":"E6","message":"integer literal has a leading zero","meaning":"an integer literal starts with 0 and has more digits"}` and LF to stdout, and exits with status 0. `glyphc explain E7` (no catalogue entry) writes nothing to stdout and exits with status 1.
- `diag/v6-spelling`: no string matching `E0[0-9]{3}` occurs in `spec/`, `conformance/` or `compiler/stage0/src/`; every code in `spec/errors.json` matches `E[1-9][0-9]*`. The check excludes `rfcs/`, `governance/`, `docs/` and `site/`, which keep the old spelling (S1).
- `diag/v6-no-fix-runner`: R1's `_matches` is applied and `diag/v6-no-fix` fails on a stub compiler that writes a `fix` for `E3`. Run by the owner when R1 lands.

## Open questions

1. **Owner ruling of 2026-11-20.** The ruling requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This draft keeps the checker and the catalogue `message` field, so the ruling still has a target (E10 in the new spelling). It reads the ruling as binding catalogue messages, not record messages; records lose only what RFC 0050 already removed. This RFC depends on that reading. If the owner reads the ruling as binding records, this RFC cannot be voted, because it would have to keep the record message.
2. **Exit status for a failed compile** (X2). RFC 0050 and RFC 0085 leave it open. This draft uses 1. The owner should confirm.
3. **Repair measurement.** A later RFC could restore the four-digit form if a measured repair comparison shows models make fewer errors with it. It would have to change S1 back for every code, and name this RFC as the one it amends.
4. **Runner changes, owner-applied.** R1 makes an absent `fix` exact. Until it is applied, `diag/v6-no-fix` does not test what it is written to test. The runner also matches trap stderr as a substring, so a line `trap: divide-by-zero x` would pass `diag/v6-trap-line`. The owner can make `expect-stderr` an exact match for trap tests in the same change. This draft did not run the runner.
5. **RFC 0105's gates.** RFC 0105's front matter says accepted, but its body lists gates G-a to G-d as open. The tests here need RFC 0105's kernel rules, not its gates. The owner should confirm which status governs.
