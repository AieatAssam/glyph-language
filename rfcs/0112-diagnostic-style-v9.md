# RFC draft: Diagnostic style

Status: draft. Slug: diagnostic-style-v9. Class: language. Number assigned by the orchestrator.
Depends on: RFC 0104 (accepted; the lexical codes E0001, E0002, E0005, E0006, the keyword code E0003, and rule 13, which stops at the first lexical error). RFC 0109 (accepted; trap line TR1, kept unchanged here).
Amends: `spec/core/diagnostic.md` (Record, Order, Codes, Tests and Runtime traps); `spec/card.md` (its `# Card: diagnostics` section); the entry shape in `spec/errors.json`.
Adds: the command `glyphc explain`.

## Summary

One decision: a diagnostic record carries `code`, `span` and, when one edit repairs the code, `fix`, and nothing else. The words of a code (`message` and `meaning`) stay in `spec/errors.json`. A reader gets them with `glyphc explain CODE`.

This RFC does not change the trap line. The card's trap line is copied unchanged from RFC 0109 TR1.

## Motivation

A model that repairs code reads the code, the span and the source bytes. The current record also writes `severity`, `message`, `file`, `line` and `column`. `severity` is always `error`. `line` and `column` follow from `span.start` and the bytes. `message` repeats the catalogue entry for the code. None of these is needed for the repair, and each costs tokens on every record. Counts are in Cost.

## Design

Normative. "Must" and "is" bind implementers.

D1. A record is one line on standard error, in compact JSON with no spaces. Its keys are `code`, `span` and `fix`, in that order. `fix` is optional. No other key is written: `severity`, `message`, `file`, `line` and `column` are never written. Every record is an error.

D2. `code` is `E` and four digits, as `spec/errors.json` spells it. No code is added, changed or retired here.

D3. `span` is `{"start":N,"end":N}`: byte offsets into the one file named on the command line. `end` is exclusive. Required.

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. Present only when one edit does that.

D5. Records are written in order of `span.start`, then `code`. A lexical error stops compilation after the first one (RFC 0104 rule 13).

D6. Each entry in `spec/errors.json` is an object with the keys `code`, `message` and `meaning`, in that order. `message` is one line whose first character is an ASCII lowercase letter and whose last character is not `.`. `meaning` is one line. A retired entry also has `"retired":true`. Every entry in the file now meets this rule.

D7. `glyphc explain CODE` writes to standard output one line of compact JSON with the keys `code`, `message` and `meaning`, then `retired` if the entry has it, and exits with status 0. For a code with no entry it writes nothing to standard output and exits with status 1. It reads the catalogue built into the binary, so it works outside the repository.

D8. `spec/core/diagnostic.md` is rewritten to D1 to D7. Its Runtime traps section is unchanged. `spec/card.md` gets the section in K1 in place of its `# Card: diagnostics` section.

K1. The diagnostics card section, in full:

```
# Card: diagnostics

Diagnostic: one line on stderr, compact JSON: `{"code":"E0006","span":{"start":12,"end":15}}`. `code` is `E` + 4 digits. `span` is byte offsets into the file named on the command line, end exclusive. Optional `"fix":{"span":{"start":N,"end":N},"replacement":S}` when one edit repairs the code. No other key.

Meaning of a code: `glyphc explain E0006` prints its catalogue entry. Nothing else on stderr says what a code means.

No errors: no diagnostic lines, exit 0. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E0001-E0099 lexical, E0100-E0199 syntax, E0200-E0299 types, E0300-E0399 names, E0400-E0499 effects, E0500-E0599 limits. Codes live in spec/errors.json and are never reused.
```

## Alternatives

- **Keep `message` in records.** Rejected. A repair needs the code, the span and the bytes. The catalogue gives each code its words once.
- **Keep `file`, `line` and `column`.** Rejected. `file` is the one file on the command line. Line and column follow from `span.start` and the bytes.
- **Keep `severity`.** Rejected. Every record is an error, so the key carries one value and tells a reader nothing.

## Cost

Counted with `sbx python3 -m tools.check.tokens`. Files are counted with their trailing newline. Records are counted without one.

- `spec/card.md`: 190 now; 223 under K1. Change +33. Cap 2,000.
- `spec/core/diagnostic.md`: 502 now; 509 under D8. Change +7. Cap 12,000 for the whole core spec.
- Record with a fix (`E0006`, bytes 12 to 15, as in Test plan): 33 under D1. In the current core's shape, with `severity`, `message`, and `file`, `line` and `column` in the span and the fix span: 72 (a sample built to that shape). Saving 39.
- Record without a fix, `E0003`: 17 under D1. In the current core's shape: 43. Saving 26.
- The `glyphc explain E0006` line is 30 tokens. It is read by a model on demand and is not in any record stream.

## Test plan

Test ids are `diag/v9-<name>`. Each `.test` file has a `--- meta` block with `id`, `rfc` (set by the orchestrator) and `kind`. Offsets count bytes from the first byte of the program. Programs are in canonical layout (RFC 0104 rule 4).

Compile-error tests (expected records, in JSON):

- `diag/v9-fix-present`: program `main io{put 007}`. Expected `{"code":"E0006","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}`.
- `diag/v9-no-fix`: program `main io{let let=1}`. Expected `{"code":"E0003","span":{"start":12,"end":15}}`.
- `diag/v9-order`: program `main io{put 007 put 007}`. Expected only the `E0006` record for bytes 12 to 15. The literal at bytes 20 to 23 gets no record, because a lexical error stops compilation (RFC 0104 rule 13).

Run test:

- `diag/v9-clean`: program `main io{put 7}`. Stdout `7` and LF; stderr empty; exit 0.

Gate checks (not `.test` files; the implementing PR adds them):

- `diag/v9-keys`: every record in the compile-error tests above has only the keys `code`, `span` and `fix`; `span` and `fix.span` have only `start` and `end`; no line has `severity`, `message`, `file`, `line` or `column`. This also checks that `fix` is absent when the expected record has none.
- `diag/v9-catalogue`: every entry in `spec/errors.json` has the keys in D6, its `message` meets D6, and no code appears twice. The entry for `E0003` is added by the implementing PR, as RFC 0104's table requires, and `E0006` already exists.
- `diag/v9-explain`: run outside the repository, `glyphc explain E0006` writes `{"code":"E0006","message":"integer literal has a leading zero","meaning":"an integer literal starts with 0 and has more digits"}` and exits 0. `glyphc explain E0999` writes nothing to standard output and exits 1.

## Open questions

1. **Owner ruling of 2026-11-20.** The ruling requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. A search of `governance/` did not find its text, so this RFC cannot check it against the ruling. The entry for `E0010` meets D6, and this RFC keeps `message` only in the catalogue, so the checker's target is the catalogue entry.
2. **Multi-file builds.** There is no `file` key, so a build of several files would need one. Not decided here.
3. **Runner.** D8 says the runner compares `code`, `span` and `fix` exactly. Gate `diag/v9-keys` checks it.
