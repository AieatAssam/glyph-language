---
status: rejected
votes:
  designer-prag: reject
  designer-safe: reject
  impl-1: reject
  tester: reject
  user-1: abstain
  user-2: abstain
---
# RFC draft: Integers, booleans and bytes

Class: language
Slug: integers-booleans-bytes
Status: draft
Author: designer-min

## Summary

This RFC defines three value types: `Int`, a signed 64-bit integer; `Bool`; and `Byte`, an unsigned 8-bit integer. It defines their literals, their operators, two built-in conversion functions between `Int` and `Byte`, and the three runtime traps they can cause. It covers the whole of readiness item `integers-booleans-bytes`. It does not define `print`, `Text`, arrays or any other type.

## Motivation

Readiness checklist item 1 in `docs/SPEC.md`, section 9, requires "integers with defined overflow, booleans, bytes". Later items depend on it. Text indexing needs `Int` and `Byte`. The arrays-buffers RFC (0008) uses `[Byte]` and `Int` lengths. The stage-0 lexer and the Wasm encoder work on bytes.

Two drafts already cover parts of this item. RFC 0005 (kernel) defines `Int` and `Bool` among other things. RFC 0006 (byte) defines `Byte` alone. Both have `status: rejected` in their headers, and their vote lists give no reasons. This RFC does not amend either one. It states the three types in one place, so that the item is decided as one unit and the kernel does not have to carry the type rules. Where this RFC differs from those drafts, the Alternatives section says so.

No benchmark finding and no open user issue supports this RFC. Its only grounding is the readiness checklist, and the checklist is the only evidence offered for it.

The purpose clause asks for few errors and few tokens. Three types, one rule each, and only decimal integers and `true`/`false` as literal forms is the smallest set that meets the checklist.

## Design

Normative. "Must" and "is" are binding on implementers.

### Types

- `Int` is a signed 64-bit two's-complement integer. Its values are the integers from -9223372036854775808 through 9223372036854775807.
- `Bool` has the values `true` and `false`.
- `Byte` is an unsigned 8-bit integer. Its values are the integers 0 through 255.
- Each type is written by its name wherever a type may be written: parameters, return types, and `let` and `var` annotations. A local `let` or `var` may omit the type; it is then the type of its initialiser.
- No implicit conversion exists between any two types, including between `Int`, `Byte` and `Bool`.

### Literals

- An integer literal is one or more decimal digits `0`-`9` and has type `Int`. Leading zeros are allowed. A value above 9223372036854775807 is error E0500.
- There is no sign in a literal. `-5` is unary minus applied to `5`. The minimum `Int` is therefore written `-9223372036854775807 - 1`.
- `true` and `false` are the literals of type `Bool`.
- There is no literal of type `Byte`. A `Byte` value comes only from a call to `byte`.

### Operators

Precedence from loosest to tightest:

1. `or`
2. `and`
3. `==` `!=`
4. `<` `<=` `>` `>=`
5. `+` `-`
6. `*` `/` `%`
7. unary `-` and `not`
8. call, literal, name, parenthesised expression

All binary operators are left-associative, except that comparisons do not chain. `a < b < c` is a syntax error and must be written with `and` or parentheses.

Both operands of a binary operator must have the same type. Otherwise the program is error E0200. The rules by type:

- `Int`: `+`, `-` and `*` give the exact result when it fits in 64 bits. Otherwise the program traps with `overflow`. Unary `-` on the minimum `Int` traps with `overflow`.
- `Int`: `/` and `%` truncate toward zero, and the sign of `%` follows the dividend. A zero divisor traps with `divide by zero`. Dividing the minimum `Int` by `-1` with `/` or `%` traps with `overflow`. There is no other trap in `/` or `%`.
- `Int` and `Byte`: `==`, `!=`, `<`, `<=`, `>`, `>=` compare by numeric value.
- `Bool`: `==` and `!=` compare for equality. `<` and the other order comparisons are E0200.
- `Bool`: `and`, `or` and `not` are logical operators. `and` and `or` short-circuit: the right operand is not evaluated when the left one decides the result.
- `Byte`: `==` and `!=` compare for equality. The arithmetic operators `+`, `-`, `*`, `/`, `%` and unary `-` are E0200. Order comparisons are allowed and use the numeric order.
- Operands are evaluated left to right.

### Conversions

Two built-in functions exist:

- `byte(n: Int) -> Byte`. If `n` is between 0 and 255 inclusive, the result is `n` as a `Byte`. Otherwise the program traps with `byte out of range`.
- `int(b: Byte) -> Int`. The result is the same number as `Int`. It never traps.

The argument type must match exactly. `int(1)` and `byte(b)` where `b` is a `Byte` are E0200. Neither function has an effect marker; both are pure. A top-level declaration named `byte` or `int` is error E0300.

### Traps

A trap is a defined outcome, not a diagnostic. The runtime writes one line `trap: <kind>` to standard error and exits with status 3 through WASI `proc_exit`. The kinds defined here are `overflow`, `divide by zero` and `byte out of range`.

### Printing

This RFC does not define how any of these types is printed. `print` is outside this item.

### Examples

A function declaration may carry examples, as the kernel defines them. The three types and the two built-ins are pure, so examples may use them. For example:

```
example int(byte(65)) == 65
```

### Stable addresses

The types are `type:Int`, `type:Bool` and `type:Byte`. The built-ins are `builtin:byte` and `builtin:int`.

### Diagnostics

| Code | Meaning | Fix |
| --- | --- | --- |
| E0200 | Type mismatch: operand, argument or operator not defined for the type. Includes `Int` with `Byte`, `+` on `Byte`, and `<` on `Bool`. | Where the intent is clear, wrap the `Byte` in `int(...)`, or the `Int` in `byte(...)`. |
| E0300 | A top-level declaration is named `byte` or `int`. | Rename the declaration. |
| E0500 | Integer literal above 9223372036854775807. | Use a value in range, or compute it. |

Each code must be new in `spec/errors.json`. That file does not exist in this checkout, so this check cannot be done from this RFC. The reviewer must run it before acceptance. Codes E0100 to E0199 (syntax) are not used here, so the chained-comparison error gets whatever syntax code the grammar RFC assigns.

## Alternatives

- **32-bit `Int`.** Not chosen. It would match `i32` on the Wasm stack, but the checklist asks for defined overflow, not a width, and no benchmark shows that 64 bits costs enough to matter. A benchmark finding would reopen this.
- **Wrapping arithmetic.** Rejected. It hides the errors the purpose clause asks us to catch, and it conflicts with the trap model.
- **`Byte` as an alias of `Int`.** Rejected. It breaks the no-implicit-conversion rule and makes signatures unclear.
- **Arithmetic on `Byte`.** Rejected. Each operator would need its own 8-bit overflow rule. `int(b) + 1` uses rules that already exist.
- **A `Byte` literal such as `b'A'`.** Rejected for now. It adds a lexical form. `byte(65)` covers the need. The text RFC may revisit it.
- **A compile-time check so that `byte(300)` is a compile error.** Rejected for this RFC. It adds a second rule for a case the runtime trap already covers. It can be a separate RFC.
- **Keeping RFCs 0005 and 0006 as the vehicle, and adding nothing new.** Rejected here. This item is one checklist entry, and it should be decided once. This RFC does not withdraw or amend those drafts.

## Cost

Core spec: about 600 tokens. This is an estimate. The protected tokeniser has not run on this text.

Removes: nothing from the language, because none of these types is in `spec/` yet. If this RFC is accepted with the kernel, it replaces the `Int` and `Bool` parts of RFC 0005 and all of RFC 0006, so the combined text is shorter than the two drafts together.

Card: `spec/card.md` gains the three type names on the value-types line, the two built-in names, the precedence line, and three trap kinds. About 70 tokens. The card omits the stable addresses and the example.

## Test plan

Conformance tests live in `conformance/ints-bytes/`.

Run tests:

- `ints/arith.test`: `2 + 3` is 5; `7 / 2` is 3; `-7 / 2` is -3; `-7 % 2` is -1; `7 % -2` is 1.
- `ints/bounds.test`: `9223372036854775807` is valid; `-9223372036854775807 - 1` prints `-9223372036854775808`.
- `ints/overflow.test`: `9223372036854775807 + 1` traps with `overflow`; exit status 3; stderr `trap: overflow`.
- `ints/divide.test`: `1 / 0` traps with `divide by zero`; `(-9223372036854775807 - 1) / -1` traps with `overflow`.
- `bool/short-circuit.test`: `false and (1 / 0 == 0)` is `false` and does not trap.
- `bytes/convert.test`: `byte(0)` and `byte(255)` are accepted; `int(byte(200))` prints `200`.
- `bytes/compare.test`: `==`, `!=`, `<` and `>=` on two `Byte` values give the expected results.
- `bytes/trap-range.test`: `byte(256)` traps with `byte out of range`; exit status 3.
- `bytes/example.test`: `example int(byte(65)) == 65` holds, and the program builds.

Compile-error tests:

- `ints/err-literal.test`: `9223372036854775808` gives E0500.
- `ints/err-mix.test`: `1 == true` gives E0200.
- `ints/err-int-arg.test`: `int(1)` gives E0200.
- `bool/err-order.test`: `true < false` gives E0200.
- `bool/err-chain.test`: `1 < 2 < 3` is a syntax error. Its code is added when the grammar RFC assigns one.
- `bytes/err-arith.test`: `byte(1) + byte(2)` gives E0200.
- `bytes/err-mix.test`: `byte(1) == 1` gives E0200.
- `bytes/err-declare.test`: a top-level `fn byte(n: Int) -> Byte` gives E0300.

Each grammar production that this RFC uses is covered: the three type names, integer and boolean literals, every operator row above, and both built-in calls.

## Open questions

1. Is 64 bits the right width for `Int`? The alternative is 32 bits. Reviewers should decide this, and they should cite a benchmark if they want a narrower type.
2. Should `Byte` gain a literal form when the text RFC is written? This RFC says no for now.
3. Which RFC defines `print` for `Int`, `Bool` and `Byte`? It is outside this item.
4. Both RFC 0005 and RFC 0006 are rejected, and their vote lists give no reasons. If the reasons were about the type rules or the traps, this RFC repeats the same choices. A reviewer who knows the reasons should say so in a comment.
