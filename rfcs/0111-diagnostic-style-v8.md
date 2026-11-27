# RFC draft: Diagnostic style

Status: draft. Slug: diagnostic-style-v8. Class: language. Number assigned by the orchestrator.
Depends on: RFC 0050 (accepted; record in section 2, catalogue in section 4); RFC 0104 (accepted; assigns E0003 and its catalogue entry).
Amends: RFC 0050 section 4 (catalogue entries also carry `message`); RFC 0020 TR1 (trap exit status and line form, as RFC 0050 section 5 gives them).
Changes: `spec/core/diagnostic.md` (Record, Codes, Tests and Runtime traps sections) and `spec/card.md`. Adds one command, `glyphc explain`.

## Summary

A diagnostic record carries `code`, `span` and, when one edit repairs the code, `fix`. A code's words (`message` and `meaning`) stay in the catalogue `spec/errors.json`. A reader gets them with `glyphc explain CODE`. A runtime trap writes one JSON line and exits with status 3.

This RFC decides where a code's words are kept, how a reader reaches them, and the trap line form. It does not decide the spelling of codes, the exit status of a failed compile, or the kind names of traps.

## Motivation

RFC 0050 is accepted. It removed `message`, `file`, `line` and `column` from records. The spec core and the card still describe the earlier record, so a model reading them expects keys that no record has. The card's form costs 60 tokens for a record with a fix and 44 without one. Under this RFC they cost 34 and 17 (Cost).

A model that repairs code needs the code, the span and the source bytes. The words are needed only to explain a code.

## Design

Normative. "Must" and "is" bind implementers.

D1. A record is one line on standard error, in compact JSON with no spaces. Its keys are `code`, `span` and `fix`, in that order. `fix` is optional. No other key is written. `severity`, `message`, `file`, `line` and `column` are never written.

D2. `code` is `E` and four digits, as `spec/errors.json` spells it. No code is changed here.

D3. `span` is `{"start":N,"end":N}`: byte offsets into the one file named on the command line. `end` is exclusive. Required.

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. Present only when one edit does that.

D5. Records are written in order of `span.start`, then `code` (RFC 0050 section 3).

D6. Each entry in `spec/errors.json` has `code`, `message` and `meaning`. `message` is one sentence. `meaning` is one line. A retired entry also carries `"retired":true`. This amends RFC 0050 section 4, which lists only `code` and `meaning`. The checking rule for `message` is open question 1.

D7. `glyphc explain CODE` writes the entry for `CODE` to standard output as one line of compact JSON with the keys `code`, `message` and `meaning`, then `retired` when the entry has it. It exits with status 0. For a code with no entry it writes nothing to standard output and exits with status 1. It works outside the repository.

D8. A trap ends the program with exit status 3 through WASI `proc_exit`. Before exiting, it writes exactly one line to standard error, `{"trap":"<kind>"}` followed by a newline, as RFC 0050 section 5 states. `<kind>` is a kind that RFC 0020 TR1 lists, spelled as RFC 0020 TR1 spells it. A trap line has no `code`, `span` or `fix`, and the runtime writes no other text to standard error. This amends RFC 0020 TR1, which gives status 1 and the text `trap: <kind>`.

D9. `spec/core/diagnostic.md` is rewritten to D1 to D8. Its Order section keeps its meaning. `spec/card.md` is replaced by the text in K1.

K1. The card text, in full:

```
# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one line on stderr, compact JSON: `{"code":"E0006","span":{"start":N,"end":N}}`. `code` is `E` + 4 digits. `span` gives byte offsets into the file named on the command line, end exclusive. Optional `"fix":{"span":{"start":N,"end":N},"replacement":S}` when one edit repairs the code.

Message of a code: `glyphc explain E0006` prints its catalogue entry (`spec/errors.json`). Nothing else on stderr says what a code means.

No errors: no diagnostic lines, exit 0. Trap: exit 3 and one line on stderr `{"trap":"<kind>"}`, no code.

Codes: E0001-E0099 lexical, E0100-E0199 syntax, E0200-E0299 types, E0300-E0399 names, E0400-E0499 effects, E0500-E0599 limits. Codes live in spec/errors.json and are never reused.
```

## Alternatives

- **Keep `message` in records.** Rejected. A repair needs the code and the bytes; the catalogue gives the words once.
- **Keep `file`, `line` and `column`.** Rejected. Line and column follow from `span.start` and the bytes.
- **Keep `trap: <kind>` with status 1 (RFC 0020 TR1).** Rejected. Stderr would have two formats.

## Cost

Counted with `sbx python3 -m tools.check.tokens` on files with a trailing newline.

- `spec/card.md`: 190 now; 226 under K1. Change +36. Cap 2,000.
- `spec/core/diagnostic.md`: 502 now; 566 for the rewrite under D1 to D9. Change +64. Cap 12,000.
- Growth in the spec: +100 tokens.
- Record with a fix, `E0006`: 60 in the card's form now; 34 under D1. Saving 26.
- Record without a fix, `E0003`: 44 now; 17 under D1. Saving 27.
- Trap line `{"trap":"overflow"}`: 5 tokens.

## Test plan

Test ids are `diag/v8-<name>`. Each `.test` file has a `--- meta` block with `id`, `rfc` (set by the orchestrator) and `kind`. Offsets count bytes from the first byte of the program. Programs are in canonical layout (RFC 0104 rule 4).

Compile-error tests (expected records only, in JSON form):

- `diag/v8-fix-present`: program `main io{put 007}`. Expected `{"code":"E0006","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}`.
- `diag/v8-no-fix`: program `main io{let let=1}`. Expected `{"code":"E0003","span":{"start":12,"end":15}}`. - `diag/v8-order`: program `main io{put 007 put 007}`. Expected only the `E0006` record for bytes 12 to 15. Lexical errors stop compilation, so the literal at bytes 20 to 23 gets no record.

Run tests:

- `diag/v8-clean`: program `main io{put 7}`. Stdout `7` and LF; stderr empty.
- `diag/v8-trap` (kind `trap`): the program of kernel test `trap-overflow` (RFC 0020). Exit status 3; stderr `{"trap":"overflow"}`.

Gate checks (not `.test` files; the implementing PR adds them):

- `diag/v8-keys`: every record in the compile-error tests above has only the keys `code`, `span` and `fix`; `span` and `fix.span` have only `start` and `end`; no line has `severity`, `message`, `file`, `line` or `column`. This check covers an absent `fix` (open question 2).
- `diag/v8-trap-line`: the trap's stderr is exactly `{"trap":"overflow"}` and LF.
- `diag/v8-catalogue`: `E0003` and `E0006` each appear once in `spec/errors.json`, carry `message` and `meaning`, lie in their blocks, and are not retired.
- `diag/v8-explain`: run outside the repository, `glyphc explain E0006` writes the D7 line for `E0006` and exits 0. `glyphc explain E0999` writes nothing to standard output and exits 1.

## Open questions

1. **Owner ruling of 2026-11-20.** The ruling requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC keeps `message` in the catalogue, so the checker's target is the catalogue entry. If the ruling binds record messages, this RFC conflicts with it.
2. **Runner, owner work.** `_matches` in `tools/check/conformance.py` accepts a record with a `fix` when the expected record has none. `diag/v8-keys` covers it until that changes.
3. **Not decided here.** Kind spellings: D8 keeps RFC 0020 TR1's, and RFC 0005 and RFC 0050 section 5 spell two kinds differently. The exit status of a failed compile. Each needs its own RFC.
