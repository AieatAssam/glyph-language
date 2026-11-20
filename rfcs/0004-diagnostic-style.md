---
status: accepted
votes:
  designer-min: reject
  designer-safe: reject
  impl-1: approve
  tester: approve
  user-1: approve
  user-2: approve
---
# RFC draft: Diagnostic style

Status: draft. Slug: diagnostic-style. Class: language. Founding RFC 0004 (number assigned by the orchestrator).

## Summary

Every compiler diagnostic is one structured record with a stable code, a severity, a message, an exact source span and, where the fix is mechanical, a machine-applicable edit. The compiler writes these records as JSON Lines to standard error, one record per line. Codes are listed in `spec/errors.json` and are never reused. This RFC defines the record, the code scheme and the rules for adding codes. It does not define the human-readable rendering, which is a tool and not part of the language.

## Motivation

The constitution requires diagnostics to be structured, coded and span-exact (principle 4). Models repair code from error text, so a fixed record with a span and a fix saves repair turns. Without a rule now, each RFC would invent its own message shape. The founding RFCs are the right place to fix this.

## Design

Normative.

1. **One format.** `glyphc` writes diagnostics only as JSON Lines to standard error. Each line is one JSON object with the fields in (2). No other output format exists in the language. A program that compiles with no errors writes no diagnostic lines and exits with status 0.

2. **Record fields.** Each record has these fields, in this order:
   - `code`: string, `E` followed by four digits, for example `E0001`.
   - `severity`: `error` or `warning`. This RFC defines no warnings; the value `warning` is reserved.
   - `message`: string, one sentence, lowercase first word, no trailing full stop, no quoted source text longer than 20 bytes.
   - `span`: object `{file, start, end, line, column}`. `file` is the repo-relative path as given on the command line. `start` and `end` are byte offsets, `end` exclusive. `line` and `column` are 1-based; column counts bytes.
   - `fix`: optional. Object `{span, replacement}`. Applying it replaces the bytes at `span` with `replacement` (a UTF-8 string, possibly empty). A fix is present only when one edit makes the code valid without changing meaning the author could not infer.

3. **Ordering.** Records are written in order of `span.start`, then `code`. The compiler stops after the first error record for lexical errors (see the lexical RFC). Later phases may report several records.

4. **Codes.** A code is assigned once, in `spec/errors.json`, with its message template and a one-line meaning. Codes are never reused, even after removal; a removed code stays in the file marked `retired`. A new code takes the next unused number in its block. Blocks: `E0001`-`E0099` lexical, `E0100`-`E0199` syntax, `E0200`-`E0299` types, `E0300`-`E0399` name resolution, `E0400`-`E0499` effects and capabilities, `E0500`-`E0599` limits and constants.

5. **Runtime traps.** A runtime trap is not a diagnostic. A trap ends the program with exit status 1 and writes one line `trap: <kind>` to standard error, where `<kind>` is one of the trap names the kernel RFC lists. Traps do not carry a code.

6. **Stability.** A message template may change its wording in any later RFC without changing its code. Tests match on `code`, `span` and `fix`, not on `message`.

7. **Examples in tests.** A compile-error test states the expected records as JSON. The runner compares `code`, `span` and `fix`. It does not compare `message`.

## Alternatives

- **Human text by default, JSON with a flag.** Rejected: two formats means two ways to read the same error, and the flag is one more token for models to learn.
- **Codes without spans.** Rejected: the constitution requires exact spans.
- **Severity levels beyond error and warning.** Rejected: nothing in the kernel needs them.
- **Multi-span labels.** Deferred. One primary span is enough for the kernel. A later RFC can add a `related` list with its own code.

## Cost

Adds to the spec core: about 500 tokens for sections 1 to 7 and the block table.

Removes nothing. Pays for itself in the repair loop only if the record stays small, so the record above has exactly five required fields plus one optional.

Spec card: adds the record shape (about 120 tokens) and the block table (about 60 tokens). The card stays under its 2,000-token cap.

## Test plan

- `diag/record-shape.test` (compile-error): `let let = 1` gives one record with `code` `E0003`, a span over `let`, and no `fix`. Compares JSON.
- `diag/fix-present.test` (compile-error): a literal with leading zero `007` gives `E0001` with `fix` replacing the span with `7`.
- `diag/order.test` (compile-error): two lexical errors on different lines are reported in `span.start` order, and only the first is reported.
- `diag/no-output-clean.test` (run): a valid program writes nothing to standard error and exits 0.
- `diag/trap-line.test` (run): integer division by zero writes `trap: divide-by-zero` to standard error and exits 1.
- `diag/catalogue.test` (check): every code emitted by the test suite exists in `spec/errors.json`, and no code is listed twice.
- `diag/retired.test` (check): a retired code cannot be emitted.

## Open questions

- Whether `span.column` should count Unicode scalar values instead of bytes. Bytes are chosen because they match `start` and `end`, which tools need for editing. The benchmark may show models struggle with bytes; that would be a finding, not a reason to change now.
- Whether `message` templates should be stored in `spec/errors.json` or in the compiler. This RFC says the file, so the spec and the compiler cannot drift apart.
- The trap names in (5) are not yet fixed. The kernel RFC will list them.
