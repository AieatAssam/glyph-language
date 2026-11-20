# RFC draft: Byte type and conversions

Class: language
Slug: byte-type
Status: draft
Author: designer-min
Builds on: RFC 0014 (lexical-syntax-v3, accepted) and RFC 0020 (kernel-v8, accepted).
Replaces: nothing. Does not revive RFC 0009 or RFC 0021.

## Summary

This RFC adds one value type, `Byte`, an unsigned 8-bit integer, and two built-in functions, `byte` and `int`, that convert between `Byte` and `Int`. It covers the part of readiness item `integers-booleans-bytes` (`docs/SPEC.md`, section 9, item 1) that the accepted kernel does not yet decide. RFC 0020 already decides `Int`, `Bool`, the integer rules, the traps and the literal rules. This RFC does not restate them.

A `Byte` has no operators. It can be bound, assigned, passed as a parameter, returned and converted. It becomes a number only through `int`.

This RFC changes RFC 0020 in exactly these places, and nowhere else: the three type productions gain `Byte` (Y2); the reserved names gain `Byte`, `byte` and `int` (Y6); `Byte` joins the names that are not values (Y7); the trap list gains one kind (Y9). Each change is numbered below.

## Motivation

- **Readiness item 1 needs bytes.** RFC 0020 is accepted and gives `Int` and `Bool`, but it has no byte type. Readiness item 1 asks for "integers with defined overflow, booleans, bytes". The byte element type that the arrays-buffers work needs is not decided yet, since RFCs 0008, 0010, 0022 and 0023 are all rejected. The stage-0 Wasm encoder also works on bytes. Both need one agreed byte type first.
- **Issue #31 asks which code a type mismatch uses.** RFC 0005 and RFC 0010 say E0102; RFC 0009 says E0200. The accepted RFC 0020 uses E0200 for every type mismatch, and this RFC uses E0200 too. No new code is needed, so the question is settled by the accepted record and this RFC does not reopen it.
- **RFCs 0009 and 0021 conflict with accepted text, so this draft does not build on them.** They say a trap exits with status 3 and use the spaced kinds `byte out of range` and `divide by zero`. RFC 0020 TR1 and RFC 0004 section 5 say status 1 and hyphenated kinds (`divide-by-zero`). They also write the result type with `->`, which RFC 0014 rule 10 lexes as two tokens. This draft uses status 1, hyphenated kinds and `:`.
- **Issue #40 asks for the codes of a bad escape and a leading zero.** RFC 0014 settles those (E0005 and E0006). `Byte` adds no literal form and no escape, so this RFC does not touch that question.

The purpose clause asks for few errors and few tokens. A byte type with no operators needs no new operator rules and no new literal form. Its only costs are one type name, two built-in names and one trap kind.

No benchmark finding supports this RFC. Its grounding is the readiness checklist and the accepted RFCs named above.

## Design

Normative. "Must" and "is" are binding on implementers. Rule numbers with the prefix Y are new. Each names the RFC 0020 rule it extends where one exists.

### Type

- **Y1.** `Byte` is an unsigned 8-bit integer. Its values are the integers 0 through 255. It is written as an `IDENT` with the text `Byte`, as the other type names are (RFC 0014 rule 6).
- **Y2.** The grammar of RFC 0020 changes in these three productions only. Each adds the alternative `"Byte"`:

```
type  = "Int" | "Bool" | "Text" | "Byte"
ptype = "Int" | "Bool" | "Byte"
rtype = "Int" | "Bool" | "Byte"
```

  Rule T6 of RFC 0020 is extended to match: parameter and result types are `Int`, `Bool` or `Byte`. `Text` in those places is still E0100.
- **Y3.** There is no literal of type `Byte`. A `Byte` value comes only from a call to `byte` (Y5).
- **Y4.** No operator accepts a `Byte` operand. This covers every operator in RFC 0020's expression section: `+`, `-`, `*`, `/`, `%`, unary `-`, `==`, `!=`, `<`, `<=`, `>` and `>=`. Applying one of them to a `Byte` operand is E0200. A program compares two bytes by converting them with `int` first. RFC 0020's rules E1 to E4 are not changed.

### Built-in functions

- **Y5.** Two built-in functions exist. Both are pure, and neither has an effect marker:
  - `byte(n: Int): Byte`. If `n` is between 0 and 255 inclusive, the result is `n` as a `Byte`. Otherwise the run traps `byte-out-of-range` (Y9).
  - `int(b: Byte): Int`. The result is the same number as an `Int`. It never traps.
- **Y5a.** The argument type must match exactly. `int(1)` and `byte(b)` with `b` of type `Byte` are E0200. This is the rule E8 of RFC 0020 applied to the built-ins.
- **Y6.** The names `Byte`, `byte` and `int` are reserved. A function, parameter or binding with any of these names is E0300. This extends rule F6 (reserved function names) and rule B5 (reserved binding names) of RFC 0020, which list `print`, `Int`, `Bool` and `Text`.
- **Y7.** `Byte` used as a value, as in `print(Byte)`, is E0301. This extends rule T7 of RFC 0020.

### Use of Byte values

- **Y8.** A `Byte` value follows the rules of RFC 0020 that do not concern operators: binding (B1), assignment to a `var` (B2), passing as an argument (E8), returning (F4), and use as a parameter or result type (Y2). A `Byte` value may appear in an example (EX1 and EX2) only as an operand of `int` or `byte`, or as an argument of a function call. The example as a whole must still be `Bool`.
- **Y8a.** `print` is unchanged. Its two forms in rule P1 are `Int` and `Text`. A `Byte` is printed with `print(int(b))`.

### Traps

- **Y9.** The trap list of RFC 0020 rule TR1 gains one kind: `byte-out-of-range`, raised when `byte` is called with an argument outside 0 to 255. It works like the other kinds: one line `trap: byte-out-of-range` on standard error, exit status 1 through WASI `proc_exit`, and output written before it stays written.
- **Y10.** Like the overflow and divide traps (rule E9 of RFC 0020), the `byte-out-of-range` trap happens only when the call is evaluated at run time. `byte(256)` compiles. The checker does not fold it into a compile error.

### Examples

- **Y11.** An example that traps fails with E0202, as rule EX3 of RFC 0020 already says. This RFC adds no example rule of its own.

### Stable addresses

- **Y12.** The type is `type:Byte`. The built-ins are `builtin::byte` and `builtin::int`, with the same `<file>::<name>` form that rule A1 of RFC 0020 uses for declarations.

### Diagnostics

No new diagnostic code is added. The rules above use these codes from RFC 0020: E0100 (for `Text` in a type position, Y2), E0200 (type mismatch, Y4, Y5a, Y8), E0202 (example traps or is false, Y11), E0300 (reserved name, Y6) and E0301 (type name used as a value, Y7). Each already has its meaning in `spec/errors.json` once that file exists. No code is reused.

## Alternatives

- **Operators on `Byte` (`==`, `!=`, order, `+`).** Not chosen. Each operator needs its own 8-bit rule, or a new row in RFC 0020's E3 and E4. `int(a) < int(b)` uses the `Int` rule that already exists, so the byte case needs no rule of its own. Equality is an open question (below).
- **A byte literal such as `b'A'`.** Rejected. It adds a lexical form, which RFC 0014 would have to change. `byte(65)` covers the same need.
- **`byte` never traps, and returns the argument modulo 256.** Rejected. Wrapping hides the out-of-range errors that the purpose clause asks us to catch. RFC 0020 already makes overflow a trap for the same reason.
- **A compile-time error when the argument of `byte` is a literal out of range.** Rejected for this RFC. It adds a second rule for a case the run-time trap already covers. It can be a separate RFC.
- **`Byte` as an alias of `Int`.** Rejected. It breaks the rule that no implicit conversion exists between types (RFC 0020 rule T4).
- **Defer `Byte` until the arrays-buffers RFC.** Considered. Readiness item 1 names bytes on its own, and the stage-0 encoder needs a byte type before any arrays exist. So the type is decided here, and the arrays RFC decides how `[Byte]` is written.
- **Type-mismatch code E0102 (RFCs 0005 and 0010).** Not used. RFC 0020 uses E0200 and this RFC follows it.

## Cost

Core spec: Y1 to Y12, the three changed productions and the trap line add about 450 tokens by estimate. This is not measured. The protected tokeniser has not run on this text, and `spec/` is not in this checkout.

Removes: nothing from the accepted kernel. This RFC is an addition, and the checklist requires it. If the group decides bytes can wait until the arrays RFC, this RFC can be withdrawn with no change to RFC 0020, since none of its rules depends on `Byte`.

Spec card: `spec/card.md` gains `Byte` on the value-types line, `byte` and `int` on the built-in line, and `byte-out-of-range` on the trap line. About 40 tokens. The card omits the stable addresses and the examples. `spec/card.md` is not in this checkout, so its size is not checked here.

## Test plan

Conformance tests live in `conformance/bytes/`. Run tests state stdout, stderr and exit status. Compile-error tests state the expected record (code and span, per RFC 0004 section 7). Each run program is complete. Where a program does not define `main`, its statements go in `fn main() io { }`.

Run tests (exit status 0 unless stated):

- `bytes/convert.test`: `print(int(byte(0)))`, `print(int(byte(255)))`, `print(int(byte(200)))`. Output `0`, `255`, `200`. Covers Y5 and Y10 in range.
- `bytes/bind.test`: `let b: Byte = byte(65)`, `var c = byte(66)`, `c = b`, `print(int(c))`. Output `65`. Covers Y1, Y8 and B2.
- `bytes/param-result.test`: `fn id(b: Byte): Byte { return b }`, then `print(int(id(byte(7))))`. Output `7`. Covers Y2 and Y8.
- `bytes/order-via-int.test`: `if int(byte(1)) < int(byte(2)) { print(1) }`. Output `1`. Covers Y4 (the way to order bytes).
- `bytes/example.test`: `fn f(): Int { return int(byte(65)) }`, then `example f() == 65`, then `fn main() io { print(f()) }`. Output `65`. Covers Y8 and EX1.
- `bytes/trap-high.test`: `print(int(byte(256)))`. Stdout empty; stderr `trap: byte-out-of-range`; exit status 1. Covers Y9.
- `bytes/trap-neg.test`: `let n = -1`, then `print(int(byte(n)))`. Stdout empty; stderr `trap: byte-out-of-range`; exit status 1. Covers Y9 for the lower bound.
- `bytes/trap-after-output.test`: `print(1)`, then `print(int(byte(300)))`. Stdout `1`; stderr `trap: byte-out-of-range`; exit status 1. Covers Y9 and the rule that earlier output stays written.

Compile-error tests:

- `bytes/err-literal.test`: `let b: Byte = 1` gives E0200 at the literal `1`. Covers Y1 and T4.
- `bytes/err-arith.test`: `let a = byte(1) + byte(2)` gives E0200 at `+`. Covers Y4.
- `bytes/err-eq.test`: `if byte(1) == byte(1) { }` gives E0200 at `==`. Covers Y4.
- `bytes/err-order.test`: `if byte(1) < byte(2) { }` gives E0200 at `<`. Covers Y4.
- `bytes/err-print.test`: `print(byte(1))` gives E0200 at the argument. Covers Y8a and P1.
- `bytes/err-int-arg.test`: `let a = int(1)` gives E0200 at `1`. Covers Y5a.
- `bytes/err-byte-arg.test`: `let a = byte(byte(1))` gives E0200 at the inner `byte(1)`. Covers Y5a.
- `bytes/err-type-value.test`: `print(Byte)` gives E0301 at `Byte`. Covers Y7.
- `bytes/err-top-name.test`: `fn byte(n: Int): Int { return n }` gives E0300 at `byte`. Covers Y6.
- `bytes/err-local-name.test`: `let int = 1` inside `fn main() io { }` gives E0300 at `int`. Covers Y6.
- `bytes/err-example-trap.test`: `fn main() io { }`, then `example int(byte(256)) == 256` gives E0202 at the example. Covers Y10 and Y11.

Every production changed by Y2 is used in a run test: `type` in `bytes/bind.test`, `ptype` and `rtype` in `bytes/param-result.test`. Every trap kind added by Y9 has a run test.

## Open questions

1. **Should `Byte` have `==` and `!=`?** This draft says no (Y4), so every byte comparison goes through `int`. Equality is the one operator a reviewer may want back. If so, the change is one row in RFC 0020's rule E3 and one test, `bytes/eq.test`. Cost: about 15 tokens.
2. **Is a run-time trap the right result for an out-of-range `byte`?** This draft keeps RFC 0020's model, where out-of-range values trap at run time (E9, Y10). A compile-time check for literal arguments is a possible follow-up RFC, and it is not needed for the checklist.
3. **How is `[Byte]` written?** That belongs to the arrays-buffers RFC. This RFC only names the element type.
4. **Is `Byte` the right type name?** It follows `Int`, `Bool` and `Text`. A reviewer who wants a different name should say which rule the new name would replace.
