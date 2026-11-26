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
# RFC draft: Byte type on the current kernel (amends RFC 0024)

Class: language
Slug: byte-type-v2
Status: draft
Author: designer-min
Builds on: RFC 0085 (kernel-v44, accepted), which gives `Int`, `Bool`, the integer rules, `put`, the traps and the examples. RFC 0048 (accepted) gives the lexical rules.
Amends: RFC 0024 (byte-type, accepted). Its design is written against RFC 0020, uses `print`, and has a `type` production that RFC 0085 does not have. Where this RFC differs from RFC 0024 it replaces it. Does not revive RFC 0009, 0021 or 0044.

## Summary

This RFC adds one value type, `Byte`, an unsigned 8-bit integer. It adds two built-in functions that convert between `Byte` and `Int`, `byte` and `int`, and one trap kind, `byte-out-of-range`. `Byte` has no operators, no literal and no implicit conversion. With RFC 0085, it completes readiness item `integers-booleans-bytes` (`docs/SPEC.md`, section 9, item 1). RFC 0085 decides everything else the item names, so this RFC does not restate it.

## Motivation

Grounding: readiness item 1 asks for "integers with defined overflow, booleans, bytes". RFC 0085 covers integers and booleans. Bytes are still open. RFC 0024 is marked accepted, but an implementer cannot build it as written:

- It cites rules of RFC 0020 (E3, T6, TR1, F6, B5). RFC 0085 replaces that kernel, and its rule numbers and reserved names differ.
- It writes `print` where the kernel now has `put` (RFC 0049, RFC 0085 P1).
- Its grammar has a `type` production and a `let` annotation. RFC 0085 B1 gives `let` no annotation, so `let b: Byte = ...` is not valid.

The card has the same gap. Issue #462 asks for the card to list the trap kinds that `run` reports. RFC 0085 lists four kinds, and this RFC adds a fifth, so it also changes the card's trap line.

Issue #457 asks whether an example trap is a diagnostic. This RFC does not decide that. It follows RFC 0085 EX3, which reports a trapping example as E0202, and it adds no example rule of its own.

The purpose clause asks for few errors and few tokens. A byte type with no operators needs no new operator rule and no new literal form. Its costs are one type name, two built-in names, one trap kind and one entry in the fail-mark rule.

## Design

Normative. "Must" and "is" bind implementers. Rule numbers with the prefix Y are new. Each names the RFC 0085 rule it extends where one exists.

### Type

Y1. `Byte` is an unsigned 8-bit integer. Its values are the integers 0 through 255. It is written as an `IDENT` with the text `Byte`, as `Int` and `Bool` are (RFC 0048).

Y2. The grammar of RFC 0085 changes in two productions. Each gains the alternative `"Byte"`:

```
ptype = "Int" | "Bool" | "Byte"
rtype = "Int" | "Bool" | "Byte"
```

Rule T6 of RFC 0085 is extended to match. `Byte` is not a `let` annotation, because RFC 0085 B1 has none.

Y3. There is no literal of type `Byte`. A `Byte` value comes only from a call to `byte` (Y5).

Y4. No operator takes a `Byte` operand. `==`, `!=`, `<`, `<=`, `>`, `>=`, `+`, `-`, `*`, `/`, `%` and unary `-` all reject it. Each is E0200 at the operator, under rules E3 and E9 of RFC 0085. To compare two bytes, convert each with `int` first.

### Built-in functions

Y5. Two built-in functions exist. Both are pure, and neither carries an effect mark:

- `byte(n: Int): Byte`. If `n` is between 0 and 255 inclusive, the result is `n` as a `Byte`. Otherwise the run traps `byte-out-of-range` (Y8).
- `int(b: Byte): Int`. The result is the same number as an `Int`. It never traps.

Y6. The argument type must match exactly, as rule E6 of RFC 0085 requires. `int(1)` and `byte(b)` with `b` a `Byte` are E0200 at the argument.

Y7. The names `Byte`, `byte` and `int` are reserved. A function, parameter or binding with one of these names is E0300 at the new name. This extends rules F6 and B5 of RFC 0085, which reserve `put`, `Int`, `Bool` and `fail`. A `Byte` used as a value is E0301, as rule T6 of RFC 0085 already requires for `Int` and `Bool`.

### Values, traps and the fail mark

Y8. `byte` traps `byte-out-of-range` when its argument is outside 0 through 255. This is a run-time trap under TR1 of RFC 0085: one line `trap: byte-out-of-range` on standard error, exit status 1 through WASI `proc_exit`, and output written before it stays written. `byte(256)` compiles, as rule E2 of RFC 0085 does for division by zero.

Y9. Rule F7 of RFC 0085 lists the sources that make a body trapping. A call to `byte` is added to that list. A body that calls `byte` needs the `fail` mark. A call to `int` does not count, since it never traps. Without Y9 the mark would not name every trap source.

Y10. A `Byte` may be bound (B1), assigned to a `var` of type `Byte` (B2), passed as an argument (E6), returned (F4), and used in a parameter or result type (Y2). It may not be printed: `put` takes an `Int` or a text literal (P1). A program prints a byte with `put(int(b))`.

Y11. An example may call `byte` and `int`, because both are pure, and EX2 of RFC 0085 allows calls to functions without `io`. An example whose evaluation traps, including through `byte`, is E0202 under EX3.

### Addresses

Y12. The built-ins and the type `Byte` are not declarations in the file, so rule A1 of RFC 0085 does not address them. No address is added. Open question 2 asks whether they need one.

### Diagnostics

No new diagnostic code is added. This RFC uses E0200 (Y4, Y6, P1), E0202 (Y11), E0300 (Y7), E0301 (Y7) and E0403 (Y9), each with the meaning RFC 0085 gives it. No code is reused with a new meaning.

## Alternatives

- **Operators on `Byte` (`==`, `!=`, order, `+`).** Not chosen. Each needs its own 8-bit rule. `int(a) < int(b)` uses the `Int` rule that exists, so the byte case needs no rule of its own. Equality is open question 1.
- **A byte literal such as `b'A'`.** Rejected. It adds a lexical form, which RFC 0048 would have to change. `byte(65)` covers the same need.
- **`byte` wraps the argument modulo 256.** Rejected. Wrapping hides the out-of-range errors that the purpose clause asks us to catch. RFC 0085 already makes overflow a trap for the same reason.
- **A compile-time error when the argument of `byte` is an out-of-range literal.** Rejected for this RFC. It adds a second rule for a case the run-time trap already covers, and it can be a separate RFC.
- **`Byte` as an alias of `Int`.** Rejected. It breaks the rule that no implicit conversion exists (T4 of RFC 0085).
- **Keep RFC 0024 as written.** Rejected. It cites a superseded kernel and uses `print`, so it cannot be built.
- **Defer `Byte` to the arrays-buffers RFC.** Rejected. The stage-0 Wasm encoder works on bytes before any array exists. The arrays RFC decides how `[Byte]` is written.

## Cost

Core spec, added: the two `ptype` and `rtype` alternatives (Y2), the two built-in lines (Y5), the reserved names (Y7), the trap kind (Y8) and the `byte` entry in rule F7 (Y9). By hand, about 200 tokens. This is an estimate. The protected tokeniser has not run on this text. Rule 9 of `tools/check/run` measures it on the implementing PR.

Removed: nothing from RFC 0085. This RFC is an addition, and the readiness checklist requires it. Measured against RFC 0024, this draft drops the `type` production, the `print` forms, the `builtin::` addresses and the rules that restate RFC 0020, about 150 tokens of text.

Spec card: `spec/card.md` changes in four places, each under the card K1 of RFC 0085. The `Types` line gains `Byte`. A `Builtins` line is added: `byte(n: Int): Byte` traps `byte-out-of-range`; `int(b: Byte): Int`. The `Fail` line gains "or calls `byte`". The `Trap` line gains `byte-out-of-range`. About 60 tokens. The card is about 610 tokens once K1 is in, far under its 2,000-token cap.

## Test plan

Conformance tests live in `conformance/bytes/`. Each test file has `id`, `rfc` and `kind` in its meta block, and `rfc` takes the number the publisher gives this RFC. No existing test is edited.

Run tests (status 0 unless stated):

| Test | Program | Expected stdout |
| --- | --- | --- |
| `bytes-convert` | `fn main() io fail { put(int(byte(0))); put(int(byte(255))); put(int(byte(200))) }` | `0`, `255`, `200` |
| `bytes-bind` | `fn main() io fail { let b = byte(65); var c = byte(66); c = b; put(int(c)) }` | `65` |
| `bytes-param-result` | `fn id(b: Byte): Byte { ret b }`, `fn main() io fail { put(int(id(byte(7)))) }` | `7` |
| `bytes-order-via-int` | `fn main() io fail { if int(byte(1)) < int(byte(2)) { put(1) } }` | `1` |
| `bytes-example` | `fn f(): Int fail { ret int(byte(65)) } ex f() == 65`, `fn main() io fail { put(f()) }` | `65` |

Trap tests (stdout empty unless stated; stderr `trap: byte-out-of-range`; status 1):

| Test | Program | Stdout |
| --- | --- | --- |
| `bytes-trap-high` | `fn main() io fail { put(int(byte(256))) }` | empty |
| `bytes-trap-neg` | `fn main() io fail { let n = -1; put(int(byte(n))) }` | empty |
| `bytes-trap-after` | `fn main() io fail { put(1); put(int(byte(300))) }` | `1` |
| `bytes-trap-in-fn` | `fn f(n: Int): Int fail { ret int(byte(n)) }`, `fn main() io fail { put(f(-5)) }` | empty |

Compile-error tests (one error each; the span is the one named):

| Test | Program | Error at | Code |
| --- | --- | --- | --- |
| `bytes-err-arg` | `fn f(b: Byte) io { }`, `fn main() io { f(1) }` | the `1` | E0200 |
| `bytes-err-int-arg` | `fn main() io { put(int(1)) }` | the `1` | E0200 |
| `bytes-err-byte-arg` | `fn main() io { put(int(byte(byte(1)))) }` | the inner `byte(1)` | E0200 |
| `bytes-err-put` | `fn main() io { put(byte(1)) }` | the `byte(1)` argument | E0200 |
| `bytes-err-add` | `fn main() io { let a = byte(1) + byte(2) }` | the `+` | E0200 |
| `bytes-err-eq` | `fn main() io { if byte(1) == byte(1) { } }` | the `==` | E0200 |
| `bytes-err-order` | `fn main() io { if byte(1) < byte(2) { } }` | the `<` | E0200 |
| `bytes-err-value` | `fn main() io { put(Byte) }` | the `Byte` | E0301 |
| `bytes-err-top-name` | `fn byte(n: Int): Int { ret n }`, `fn main() io { }` | the `byte` | E0300 |
| `bytes-err-local-name` | `fn main() io { let int = 1 }` | the `int` | E0300 |
| `bytes-err-fail-mark` | `fn main() io { put(int(byte(1))) }` | the `main`; fix inserts ` fail` after `io` | E0403 |
| `bytes-err-example` | `fn f(): Int fail { ret int(byte(256)) } ex f() == 256`, `fn main() io fail { put(f()) }` | from `ex` to the end of the expression | E0202 |

Coverage: Y1 and Y10 by `bytes-bind`; Y2 by `bytes-param-result`; Y3 by `bytes-err-arg`; Y4 by the three operator tests; Y5 and Y6 by the run tests and `bytes-err-int-arg` and `bytes-err-byte-arg`; Y7 by the two name tests and `bytes-err-value`; Y8 by the trap tests; Y9 by `bytes-err-fail-mark`; Y11 by `bytes-example` and `bytes-err-example`. Y12 has no test, because it adds no address.

## Open questions

1. **Should `Byte` have `==` and `!=`?** This draft says no (Y4). Equality is the one operator a reviewer may want back. If so, the change is one row in rule E3 of RFC 0085 and one test, about 15 tokens.
2. **Do the built-ins or the type need addresses?** Principle 9 of the constitution asks for stable addresses on every declaration. This draft treats the built-ins and the type as not declared. A reviewer who disagrees should name the address form.
3. **Should RFC 0024 be marked superseded when this RFC is accepted?** It is accepted and cannot be withdrawn, so the record needs a pointer. The orchestrator decides how to record it.
4. **Is this RFC allowed now?** The roadmap (`architecture/ROADMAP.md`), milestone M2b, says no new RFC is proposed before the first merge puts a compiler on `main`. This draft is proposed because the assignment asks for it. The orchestrator decides whether to hold it.
