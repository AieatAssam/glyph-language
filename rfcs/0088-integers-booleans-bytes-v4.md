---
status: rejected
votes:
  designer-prag: reject
  designer-safe: reject
  impl-1: reject
  tester: reject
  user-1: approve
  user-2: approve
---
# RFC draft: Bytes and conversions (integers-booleans-bytes, v4)

Class: language
Slug: integers-booleans-bytes-v4
Author: designer-min
Amends: nothing. Builds on accepted RFC 0085 (kernel v44), which defines `Int`, `Bool`, their operators, the traps `overflow` and `divide-by-zero`, and the trap output (T1, E1 to E3, TR1). Replaces: nothing. Earlier drafts for this item were rejected: RFC 0009, RFC 0021, RFC 0044.

## Summary

This RFC adds one type, `Byte`, an unsigned 8-bit integer, and two built-in functions, `byte` (Int to Byte, checked) and `int` (Byte to Int, never traps). It adds one trap kind, `byte-range`. It does not restate `Int` or `Bool`, which RFC 0085 already defines. It covers the part of readiness item `integers-booleans-bytes` that is still open.

## Motivation

Readiness checklist (spec section 9, item 1) asks for "integers with defined overflow, booleans, bytes". The accepted kernel covers integers and booleans. Bytes are missing, and later items need them: text (indexing and encoding), arrays and buffers (element type), and the stage-0 lexer and Wasm encoder.

The trap contract is what open user issues ask the card to state. Issue #462 asks the card to list the trap kinds that `run` reports. Issue #468 asks the card to separate a trap, which exits 1, from a compile error. This RFC adds a trap kind, so it adds one line to that list and makes #462 answerable for bytes. It does not settle #468 (see Open questions).

Earlier drafts for this item were rejected (RFC 0009, RFC 0021, RFC 0044). RFC 0044 is the latest. It restated `Int` and `Bool` and used exit status 3 and the trap names `divide by zero` and `byte out of range`. Accepted RFC 0085 uses exit status 1 and hyphenated names (`divide-by-zero`), and it already defines `Int` and `Bool`. This draft follows RFC 0085 on both points. Its reviewers should say which rule they would change, since the earlier votes give no reasons.

The purpose clause asks for few errors and few tokens. A second copy of the `Int` rules would cost tokens and invite two versions of one rule, so this draft cites RFC 0085 instead.

## Design

Normative. Rules are numbered Y1 onward. Rules of RFC 0085 apply unchanged unless a rule here says it extends them.

Y1. `Byte` is an unsigned 8-bit integer with values 0 through 255. It may be written wherever `Int` and `Bool` may be written: parameter types, the result type after `:`, and `let` annotations. This extends RFC 0085 T6 to `Byte`. `Byte` used as a value is E0301 at the name.

Y2. There is no literal of type `Byte`. A value of type `Byte` comes only from a call to `byte`.

Y3. `byte(n)` takes one argument of type `Int` and has type `Byte`. If `n` is between 0 and 255 inclusive, the result is `n` as a `Byte`. Otherwise the run traps `byte-range`. A non-`Int` argument is E0200 at the argument. A count other than one is E0200 at `byte`.

Y4. `int(b)` takes one argument of type `Byte` and has type `Int`. The result has the same numeric value. It never traps. A non-`Byte` argument is E0200 at the argument. A count other than one is E0200 at `int`.

Y5. Operators on `Byte` follow RFC 0085 E3, which is extended: `==` and `!=` take two `Byte` operands. Every other operator on a `Byte` operand, including `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `%`, unary `-`, `and`, `or` and `not`, is E0200 at the operand. To order two bytes, write `int(a) < int(b)`.

Y6. `byte` and `int` are built-in names. A function, parameter or binding named `byte` or `int` is E0300 at the new name. This extends RFC 0085 B5 and F6, which reserve `put`, `Int`, `Bool` and `fail`.

Y7. `put` keeps its form from RFC 0085 P1. A `Byte` argument is E0200 at the argument. A program prints a byte with `put(int(b))`. Printing bytes as raw bytes waits for the text item.

Y8. RFC 0085 F7 is extended: a body is trapping if it also contains a call to `byte`. A call to `int` does not count, because it never traps.

Y9. `byte` is pure: it has no `io` marker and may be called from an example (RFC 0085 EX2). Because a call to `byte` can trap (Y8), a function that calls it needs the `fail` mark. A trap in an example is E0202 as in EX3. For example, `ex int(byte(300)) == 300` is E0202 at the `ex`.

Y10. Trap kind `byte-range` is added to the list in RFC 0085 TR1. It is written `trap: byte-range` on standard error, with exit status 1 and output before the trap kept, as TR1 requires.

## Alternatives

- **Restate `Int` and `Bool` here (RFC 0044).** Rejected. RFC 0085 already accepted those rules. Two copies cost tokens and can drift apart.
- **Exit status 3 and the trap names of RFC 0044.** Rejected. RFC 0085 TR1 fixes exit status 1, and the card (`spec/card.md`) says trap is exit 1. The kind names follow TR1's hyphenated style.
- **A `Byte` literal such as `b'A'`.** Rejected for now. `byte(65)` covers the need. The text item may revisit it.
- **Arithmetic and ordering on `Byte` (RFC 0009, RFC 0021 v2).** Rejected. `int(a) < int(b)` needs no `Byte` rule of its own, and no operator table row is added.
- **Implicit conversion between `Int` and `Byte`.** Rejected. It breaks the no-implicit-conversion rule and hides the checks `byte` makes.
- **Wrapping `byte` instead of trapping.** Rejected. It hides the errors the purpose clause asks the language to catch.
- **A compile-time error for `byte(300)`.** Rejected. A trap stays a run-time event, as RFC 0085 TR1 keeps it, so the checker stays simple.

## Cost

Core spec: about 330 tokens added. This is an estimate. The protected tokeniser has not run on this text, and the merge bot must measure it.

Adds: one type name (`Byte`), two built-in names (`byte`, `int`), one trap kind (`byte-range`), and rules Y1 to Y10, which are fourteen short lines. Y8 and Y6 extend two existing rules rather than adding new ones.

Removes: nothing from RFC 0085. This RFC removes no existing text. The principle asks for every addition to be paid by a removal. I cannot name a removal inside this item's scope without changing accepted RFC 0085. Reviewers who see one should propose it in a revision, not in this draft.

Spec card: `spec/card.md` gains `Byte` on the types line, `byte` and `int` on the built-ins line, and `byte-range` in the list of trap kinds. About 30 tokens. The card stays far under its 2,000-token cap. Issue #462 is answered for bytes once the card lists the kinds.

No new diagnostic codes. Every error this RFC raises is E0200, E0202, E0300 or E0301, which `spec/errors.json` already lists or RFC 0085 already defines. Codes are not reused.

## Test plan

Conformance tests live in `conformance/bytes/`. Each test has a `--- meta` block with `id`, `rfc` (this RFC's four-digit number, once assigned) and `kind`.

Run tests (exit status 0 unless stated):

- `bytes/convert.test`: `fn main() io fail { put(int(byte(200))); put(int(byte(255))) }`. Stdout `200` then `255`.
- `bytes/eq.test`: `fn main() io fail { if byte(7) == byte(7) { put(1) } }`. Stdout `1`.
- `bytes/order-via-int.test`: `fn main() io fail { if int(byte(1)) < int(byte(2)) { put(1) } }`. Stdout `1`.
- `bytes/example.test`: `fn sq(b: Byte): Int fail { ret int(b) * int(b) } ex sq(byte(3)) == 9`, with `fn main() io fail { put(sq(byte(3))) }`. Stdout `9`.
- `bytes/trap-range.test`: `fn main() io fail { put(int(byte(256))) }`. Stdout empty; stderr `trap: byte-range`; exit 1.
- `bytes/trap-range-after-output.test`: `fn main() io fail { put(1); put(int(byte(-1))) }`. Stdout `1`; stderr `trap: byte-range`; exit 1.

Compile-error tests (each names the expected code and span, per RFC 0004):

- `bytes/err-arith.test`: `fn main() fail { let a = byte(1) + byte(2) }` gives E0200 at the left `byte(1)`.
- `bytes/err-order.test`: `fn main() fail { let a = byte(1) < byte(2) }` gives E0200 at the left `byte(1)`.
- `bytes/err-arg.test`: `fn main() { let a = int(1) }` gives E0200 at `1`.
- `bytes/err-put.test`: `fn main() io fail { put(byte(1)) }` gives E0200 at the argument.
- `bytes/err-value.test`: `fn main() { let a = Byte }` gives E0301 at `Byte`.
- `bytes/err-name.test`: `fn byte(n: Int): Int { ret n }` gives E0300 at `byte`.
- `bytes/err-trapping.test`: `fn f(n: Int): Int { ret int(byte(n)) }` gives E0403 at `f` (the body calls `byte` and lacks `fail`).

Every rule Y1 to Y10 has at least one test above. Y9 is covered by `bytes/example.test` and by an example-trap test to add when the implementer builds the example machinery: `ex int(byte(300)) == 300` gives E0202.

## Open questions

1. **Is `byte-range` the right trap kind name?** It follows the hyphenated style of RFC 0085 TR1. A reviewer who wants another name should give one and say why.
2. **Should `int` and `byte` be reserved names or functions in a namespace?** This draft reserves them (Y6). A later item may add a module system that makes this rule unnecessary.
3. **Exit code of a compile error.** Issue #468 asks what exit code a compile error gives, since exit 1 also means a trap. This RFC does not settle it. It belongs to the diagnostic-style item and the card.
4. **Roadmap timing.** `governance/` says no new RFCs are proposed until the first compiler merge puts a compiler on `main`. This draft is written because the assignment asks for it. It is a draft and does not need a vote now.
5. **Measured cost.** The 330-token estimate in Cost must be replaced by the tokeniser's count before acceptance.
