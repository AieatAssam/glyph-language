# RFC draft: Diagnostic style

Status: draft. Slug: diagnostic-style-v7. Class: language. Number assigned by the orchestrator.
Depends on: RFC 0050 (accepted; record shape in section 2, catalogue in section 4); RFC 0104 (accepted; assigns E0003 and its catalogue entry).
Changes: `spec/core/diagnostic.md` (Record and Codes sections) and `spec/card.md`. Adds one command, `glyphc explain`.

## Summary

A diagnostic record carries `code`, `span` and, when one edit repairs the code, `fix`. The words of a code (`message` and `meaning`) stay in the catalogue `spec/errors.json`. A reader gets them with `glyphc explain CODE`.

This RFC decides one thing: where a code's words are kept, and how a reader reaches them. It does not decide the spelling of codes (`E0006` stays), the exit status of a compile, or the trap line.

## Motivation

RFC 0050 is accepted. It removed `message`, `file`, `line` and `column` from records and made `severity` optional. The spec core and the card still describe the earlier record, so a model reading them expects keys that no record has. In the card's form a record with a fix costs 59 tokens and one without a fix costs 44. Under this RFC they cost 33 and 17 (Cost).

A model that repairs code needs the code, the span and the source bytes. The words are needed only to explain a code.

## Design

Normative. "Must" and "is" bind implementers.

D1. A record is one line on standard error, in compact JSON with no spaces. Its keys are `code`, `span` and `fix`, in that order. `fix` is optional. No other key is written. `severity`, `message`, `file`, `line` and `column` are never written.

D2. `code` is `E` and four digits, spelled as `spec/errors.json` spells it. This RFC does not change any code.

D3. `span` is `{"start":N,"end":N}`: byte offsets into the one file named on the command line. `end` is exclusive. `span` is required.

D4. `fix` is `{"span":{"start":N,"end":N},"replacement":S}`. Replacing the bytes at `fix.span` with the UTF-8 string `S`, which may be empty, makes the code valid without changing a meaning the author could not infer. It is present only when one edit does that.

D5. Records are written in order of `span.start`, then `code`. This is unchanged from RFC 0050 section 3.

D6. Each entry in `spec/errors.json` has `code`, `message` and `meaning`, as it does now. `message` is one sentence. Its checking rule is open question 1. `meaning` is one line. A retired entry carries `"retired":true`.

D7. `glyphc explain CODE` writes the entry for `CODE` to standard output as one line of compact JSON with the keys `code`, `message` and `meaning`, then `retired` when the entry has it. It exits with status 0. For a code with no entry it writes nothing to standard output and exits with status 1. It must work outside the repository: the compiler carries the catalogue in its build.

D8. `spec/card.md` is replaced by the text in K1. `spec/core/diagnostic.md` is rewritten from D1 to D7. Its Order, Tests and Runtime traps sections keep their meaning.

K1. The card text, in full:

```
# Glyph

Source: *.gl, compiler glyphc

# Card: diagnostics

Diagnostic: one line on stderr, compact JSON: `{"code":"E0006","span":{"start":N,"end":N}}`. `code` is `E` + 4 digits. `span` gives byte offsets into the file named on the command line, end exclusive. Optional `"fix":{"span":{"start":N,"end":N},"replacement":S}` when one edit repairs the code.

Message of a code: `glyphc explain E0006` prints its catalogue entry (`spec/errors.json`). Nothing else on stderr says what a code means.

No errors: no diagnostic lines, exit 0. Trap: exit 1 and `trap: <kind>` on stderr, no code.

Codes: E0001-E0099 lexical, E0100-E0199 syntax, E0200-E0299 types, E0300-E0399 names, E0400-E0499 effects, E0500-E0599 limits. Codes live in spec/errors.json and are never reused.
```

## Alternatives

- **Keep `message` in records.** Rejected. A repair needs the code and the bytes. The message costs 26 tokens on a record with a fix (Cost).
- **Keep `severity`.** Rejected. No warning is defined, and an absent key already means error.
- **Keep `file`, `line` and `column`.** Rejected. `file` is the argument on the command line, and line and column follow from `span.start` and the bytes.
- **Print the message on a second stderr line.** Rejected. Each error would take two records.
- **Print the message from a file the user opens.** Rejected. A user with only the command line has no path to a file.

## Cost

Counted with `sbx python3 -m tools.check.tokens` on scratch files holding the texts above.

- `spec/card.md`: 190 now; 223 under K1. Change +33. Cap 2,000.
- `spec/core/diagnostic.md`: 502 now; 525 for the draft text of its rewritten Record and Codes sections. Change +23. Cap 12,000.
- Growth in the spec: +56 tokens.
- A record with a fix, `E0006`: 59 in the form the card gives now; 33 under D1. Saving 26.
- A record without a fix, `E0003`: 44 now; 17 under D1. Saving 27.
- Against the record RFC 0050 already specifies, D1 changes no bytes. The saving is against the form models are told to expect today.
- A model that needs a message spends one `glyphc explain` call, not counted here.

## Test plan

Each `.test` file has a `--- meta` block with `id`, `rfc` (set by the orchestrator) and `kind`. Test ids are `diag/v7-<name>`. Offsets count bytes from the first byte of the program; "bytes a to b" means start a, end b, exclusive. Programs are in canonical layout (RFC 0104 rule 4).

Compile-error tests (expected records only, in JSON form):

- `diag/v7-fix-present`: program `main io{put 007}`. Expected `{"code":"E0006","span":{"start":12,"end":15},"fix":{"span":{"start":12,"end":15},"replacement":"7"}}`.
- `diag/v7-no-fix`: program `main io{let let=1}`. Expected `{"code":"E0003","span":{"start":12,"end":15}}`. `E0003` is the keyword where a name is required (RFC 0104 G3).
- `diag/v7-order`: program `main io{put 007 put 007}`. Expected: only the `E0006` record above, for bytes 12 to 15. The literal at bytes 20 to 23 gets no record, because a lexical error stops compilation.

Run test:

- `diag/v7-clean`: program `main io{put 7}`. Stdout `7` and LF; stderr empty.

Gate checks (not `.test` files; the implementing PR adds them):

- `diag/v7-keys`: every line on standard error in the three compile-error tests above has only the keys `code`, `span` and `fix`. `span` and `fix.span` have only `start` and `end`. No line has `severity`, `message`, `file`, `line` or `column`. This check, not the runner, is what shows a record has no `fix` when none is expected (open question 2).
- `diag/v7-catalogue`: `E0003` and `E0006` each appear once in `spec/errors.json`, carry `message` and `meaning`, lie in their blocks, and are not retired.
- `diag/v7-explain`: run from a directory outside the repository, `glyphc explain E0006` writes exactly `{"code":"E0006","message":"integer literal has a leading zero","meaning":"an integer literal starts with 0 and has more digits"}` and LF to standard output, and exits 0. `glyphc explain E0999` writes nothing to standard output and exits 1.

## Open questions

1. **Owner ruling of 2026-11-20.** The ruling requires `compiler/stage0/src/message.ts` to accept `source file does not end in .gl`. This RFC keeps `message` in the catalogue, so the checker's target is the catalogue entry. The owner should confirm that the ruling binds catalogue messages. If it binds record messages, this RFC conflicts with it and cannot be accepted as written.
2. **Runner, owner work.** `_matches` in `tools/check/conformance.py` accepts a record with a `fix` when the expected record has none. Making an absent `fix` exact is a change to `tools/`, which agents cannot write. Until it lands, `diag/v7-keys` is the check that covers it.
3. **Not decided here.** The exit status of a compile with records, and the trap line. RFC 0050 section 5 says a trap writes a JSON line and exits 3. The card and `spec/core/diagnostic.md` say `trap: <kind>` and exit 1. Those need their own RFC.
